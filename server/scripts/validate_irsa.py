"""Bounded M1 experiment using observed SPHEREx spectral-image cutouts, not an API.

WCS-WAVE is the archive's approximate visualization wavelength solution. Outputs
are a feasibility comparison, not precision photometry or a motion detection.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure server root is on sys.path when script is invoked directly
_server_root = str(Path(__file__).resolve().parent.parent)
if _server_root not in sys.path:
    sys.path.insert(0, _server_root)

import argparse
from datetime import datetime, timezone
import hashlib
import itertools
import json
from pathlib import Path
import sys
import time
from urllib.error import URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import urlopen
import xml.etree.ElementTree as ET

import astropy
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
import numpy as np
import reproject
from reproject import reproject_interp

# Re-export reusable core from spherex package
import spherex.archive as archive
from spherex.archive import (
    COLLECTIONS,
    INFORMATIONAL_FLAGS,
    MAX_CACHE_BYTES,
    MAX_FILE_BYTES,
    MAX_QUERY_BYTES,
    SIA_URL,
    cutout_url,
    parse_sia,
    utc_now,
    write_json,
)
from spherex.fits import (
    Observation,
    inspect_cutout,
    observation_mjd,
    quality_mask,
)
from spherex.alignment import (
    align_pair,
    common_grid,
    pair_score,
    save_comparison,
)


def fetch_bytes(url: str, limit: int, timeout: float) -> bytes:
    """Wrapper that resolves urlopen dynamically from this module namespace."""
    current_module = sys.modules[__name__]
    current_urlopen = getattr(current_module, "urlopen", urlopen)
    return archive.fetch_bytes(url, limit, timeout, urlopen_fn=current_urlopen)


def download_cutout(url: str, output: Path, timeout: float, offline: bool = False) -> tuple[Path, dict]:
    """Wrapper that resolves fetch_bytes dynamically from this module namespace."""
    current_module = sys.modules[__name__]
    current_fetch = getattr(current_module, "fetch_bytes", fetch_bytes)
    return archive.download_cutout(url, output, timeout, offline=offline, fetch_fn=current_fetch)


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ra", type=float, default=133.7951)
    parser.add_argument("--dec", type=float, default=-7.2451)
    parser.add_argument("--size-arcmin", type=float, default=3)
    parser.add_argument("--download-padding", type=int, choices=(1, 2), default=2,
                        help="Cutout side / comparison side; 1 reproduces the tight-cutout diagnostic")
    parser.add_argument("--detector", type=int, choices=range(1, 7), default=6)
    parser.add_argument("--max-downloads", type=int, default=24)
    parser.add_argument("--min-days", type=float, default=30)
    parser.add_argument("--max-wave-offset", type=float, default=0.25)
    parser.add_argument("--min-coverage", type=float, default=0.8)
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--offline", action="store_true",
                        help="Explicit replay of saved discovery XML and verified real cutouts; no network")
    parser.add_argument("--output", type=Path, default=Path("outputs/wise0855"))
    args = parser.parse_args(argv)
    if not (0 <= args.ra < 360 and -90 <= args.dec <= 90
            and 1 <= args.size_arcmin <= 10 and 1 <= args.max_downloads <= 32
            and 0 < args.min_days <= 1000 and 0 < args.max_wave_offset <= 0.5
            and 0.5 <= args.min_coverage <= 1 and 1 <= args.timeout <= 180):
        parser.error("Invalid or excessive query/download/comparison bounds")
    return args


def run(args, manifest):
    coord = SkyCoord(args.ra, args.dec, unit="deg", frame="icrs")
    candidates = []
    current_module = sys.modules[__name__]
    current_fetch = getattr(current_module, "fetch_bytes", fetch_bytes)
    current_download = getattr(current_module, "download_cutout", download_cutout)

    for collection in COLLECTIONS:
        # Small overlap search, not an assertion that the exact center is covered.
        url = SIA_URL + "?" + urlencode({"COLLECTION": collection,
            "POS": f"CIRCLE {args.ra} {args.dec} 0.01", "MAXREC": 1000})
        path = args.output / f"{collection}.xml"
        sidecar = path.with_suffix(".json")
        if args.offline:
            if not path.exists() or path.stat().st_size > MAX_QUERY_BYTES:
                raise ValueError(f"Offline replay requires a bounded saved discovery response: {path}")
            data = path.read_bytes()
            record = {"url": None, "expected_url_from_parameters": url,
                      "retrieved_utc": None, "file": str(path),
                      "sha256": hashlib.sha256(data).hexdigest()}
            if sidecar.exists():
                original = json.loads(sidecar.read_text())
                if original["url"] != url or original["sha256"] != record["sha256"]:
                    raise ValueError("Saved discovery response failed provenance check")
                record = original
            # Earlier spike runs did not have discovery sidecars. In that case
            # preserve unknown query URL/time as null, never fabricate them.
            record = record | {"offline_replay": True, "loaded_utc": utc_now()}
        else:
            data = current_fetch(url, MAX_QUERY_BYTES, args.timeout)
            path.write_bytes(data)
            record = {"url": url, "retrieved_utc": utc_now(), "file": str(path),
                      "sha256": hashlib.sha256(data).hexdigest()}
            write_json(sidecar, record)
        manifest["queries"].append(record)
        rows = parse_sia(data)
        record["rows"] = len(rows)
        record["status"] = "OK"
        candidates.extend(r for r in rows if r["energy_bandpassname"] == f"SPHEREx-D{args.detector}")
    candidates = sorted({r["access_url"]: r for r in candidates}.values(), key=lambda r: float(r["t_min"]))
    manifest["candidate_count_for_detector"] = len(candidates)
    if not candidates:
        raise ValueError("No discovery candidates; test another field")
    # Deterministic sampling across the entire time range, not the first N rows.
    indices = np.unique(np.linspace(0, len(candidates) - 1,
                                  min(args.max_downloads, len(candidates)), dtype=int))
    observations = []
    for index in indices:
        row = candidates[index]
        record = {"obs_id": row["obs_id"], "access_url": row["access_url"]}
        manifest["downloads"].append(record)
        try:
            # Native detector-aligned squares rotate on the north-up grid.
            # Fetch a padded region, then compare only the requested inner FOV;
            # otherwise corner clipping can falsely fail the coverage threshold.
            download_size = args.download_padding * args.size_arcmin
            url = cutout_url(row["access_url"], args.ra, args.dec, download_size)
            record["download_size_arcmin"] = download_size
            path, provenance = current_download(url, args.output, args.timeout, offline=args.offline)
            record.update(provenance)
            observation = inspect_cutout(path, row, coord)
            record["observation"] = observation.metadata
            observations.append(observation)
            print(f"{row['obs_id']}: MJD={observation.metadata['mjd_obs']:.6f}, "
                  f"λ={observation.metadata['wavelength_um_approx']:.6f} µm, "
                  f"valid={observation.metadata['valid_fraction']:.1%}", flush=True)
        except (OSError, RuntimeError, ValueError, KeyError) as exc:
            record["error"] = f"{type(exc).__name__}: {exc}"
            print(f"Rejected {row['obs_id']}: {exc}", flush=True)
        write_json(args.output / "manifest.json", manifest)
    pairs = []
    for a, b in itertools.combinations(observations, 2):
        score = pair_score(a.metadata, b.metadata, args.min_days, args.max_wave_offset)
        if score is not None:
            pairs.append((score, a, b))
    manifest["center_compatible_pairs"] = len(pairs)
    manifest["pair_attempts"] = []
    for _, a, b in sorted(pairs, key=lambda item: item[0]):
        grid, arrays, matched, metrics = align_pair(a, b, coord, args.size_arcmin, args.max_wave_offset)
        manifest["pair_attempts"].append({"obs_ids": [a.metadata["obs_id"], b.metadata["obs_id"]], **metrics})
        if metrics["spectrally_matched_fraction_of_grid"] >= args.min_coverage:
            display = save_comparison(args.output, a, b, grid, arrays, matched)
            manifest["comparison"] = {"observations": [a.metadata, b.metadata], **metrics, **display}
            manifest["status"] = "visualization_pair_validated"
            return
    manifest["status"] = "no_suitable_pair_in_bounded_sample"
    manifest["next_candidate"] = {"name": "M101 (official IRSA cutout tutorial field)",
                                   "ra": 210.80227, "dec": 54.34895, "detector": 2}


def main(argv=None):
    args = arguments(argv)
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = {
        "started_utc": utc_now(), "status": "in_progress", "data_kind": "observed_spherex",
        "command": [sys.executable, *sys.argv],
        "parameters": {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()},
        "versions": {"python": sys.version, "astropy": astropy.__version__,
                     "numpy": np.__version__, "reproject": reproject.__version__},
        "queries": [], "downloads": [],
        "limitations": ["Approximate WCS-WAVE, not CWAVE/CBAND precision calibration",
                         "Bounded temporal sample; no exhaustive absence claim",
                         "IMAGE includes zodiacal light; no background subtraction",
                         "Bilinear surface-brightness visualization, not variance propagation",
                         "No PSF matching, photometry, motion measurement, or target detection"],
    }
    try:
        run(args, manifest)
    except (OSError, RuntimeError, ValueError, KeyError, ET.ParseError) as exc:
        manifest["status"] = "blocked"
        manifest["error"] = f"{type(exc).__name__}: {exc}"
    manifest["finished_utc"] = utc_now()
    write_json(args.output / "manifest.json", manifest)
    # Preserve completed runs when a later live query fails. Intermediate
    # progress still goes to manifest.json, but never erases this run history.
    history = args.output / "runs"
    history.mkdir(exist_ok=True)
    run_id = manifest["started_utc"].replace(":", "-")
    write_json(history / f"{run_id}.json", manifest)
    print(f"Result: {manifest['status']}; evidence: {args.output / 'manifest.json'}")
    return 0 if manifest["status"] == "visualization_pair_validated" else 2


if __name__ == "__main__":
    raise SystemExit(main())
