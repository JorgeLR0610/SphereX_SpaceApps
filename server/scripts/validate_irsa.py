"""Bounded M1 experiment using observed SPHEREx spectral-image cutouts, not an API.

WCS-WAVE is the archive's approximate visualization wavelength solution. Outputs
are a feasibility comparison, not precision photometry or a motion detection.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
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


SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ("spherex_dr1", "spherex_qr3")
MAX_FILE_BYTES = 16 * 1024**2
MAX_CACHE_BYTES = 256 * 1024**2
MAX_QUERY_BYTES = 8 * 1024**2
# SOURCE and FULLSAMPLE are informational, NOT bad-pixel flags. All other
# set bits (including any unrecognized ones) are rejected conservatively.
INFORMATIONAL_FLAGS = {"SOURCE", "FULLSAMPLE"}


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")


def fetch_bytes(url, limit, timeout):
    """Two attempts, bounded response size and socket + elapsed read deadlines."""
    last_error = None
    for _ in range(2):
        try:
            started = time.monotonic()
            with urlopen(url, timeout=timeout) as response:
                length = response.headers.get("Content-Length")
                if length and int(length) > limit:
                    raise ValueError(f"Response exceeds {limit}-byte limit")
                chunks, size = [], 0
                while chunk := response.read(min(65536, limit + 1 - size)):
                    size += len(chunk)
                    if size > limit:
                        raise ValueError(f"Response exceeds {limit}-byte limit")
                    if time.monotonic() - started > timeout:
                        raise TimeoutError("Response exceeded elapsed read deadline")
                    chunks.append(chunk)
                return b"".join(chunks)
        except (URLError, TimeoutError, OSError) as exc:
            last_error = exc
    raise RuntimeError(f"Request failed after two attempts: {url}: {last_error}")


def parse_sia(data):
    root = ET.fromstring(data)
    statuses = [el.attrib.get("value") for el in root.findall(".//{*}INFO")
                if el.attrib.get("name") == "QUERY_STATUS"]
    if not statuses or any(status != "OK" for status in statuses):
        raise ValueError(f"SIA incomplete/error result: {statuses}; narrow query, do not infer absence")
    fields = [el.attrib["name"] for el in root.findall(".//{*}FIELD")]
    if not {"obs_id", "access_url", "t_min", "energy_bandpassname"} <= set(fields):
        raise ValueError("SIA result lacks required metadata")
    return [dict(zip(fields, [el.text for el in row], strict=True))
            for row in root.findall(".//{*}TR")]


def cutout_url(url, ra, dec, size_arcmin):
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.netloc != "irsa.ipac.caltech.edu"
            or not parts.path.startswith("/ibe/data/spherex/") or parts.query):
        raise ValueError("Not an expected on-premises IRSA SPHEREx product URL")
    return url + "?" + urlencode({"center": f"{ra},{dec}d", "size": size_arcmin / 60})


def download_cutout(url, output, timeout, offline=False):
    key = hashlib.sha256(url.encode()).hexdigest()[:20]
    path = output / f"{key}.fits"
    sidecar = path.with_suffix(".json")
    if path.exists() and sidecar.exists():
        metadata = json.loads(sidecar.read_text())
        data = path.read_bytes() if path.stat().st_size <= MAX_FILE_BYTES else b""
        if (metadata["url"] != url or not data
                or hashlib.sha256(data).hexdigest() != metadata["sha256"]):
            raise ValueError(f"Cache integrity check failed: {path}")
        return path, metadata | {"cached": True}
    if offline:
        raise ValueError(f"Offline replay requires a verified cached cutout: {path}")
    used = sum(p.stat().st_size for p in output.glob("*.fits"))
    if used + MAX_FILE_BYTES > MAX_CACHE_BYTES:
        raise ValueError("Cutout cache budget exhausted; use another output directory")
    data = fetch_bytes(url, MAX_FILE_BYTES, timeout)
    if not data.startswith(b"SIMPLE  ="):
        raise ValueError("Cutout response is not a FITS file")
    metadata = {"url": url, "retrieved_utc": utc_now(), "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest()}
    path.write_bytes(data)
    write_json(sidecar, metadata)
    return path, metadata | {"cached": False}


def quality_mask(flags, header):
    definitions = {int(k[4:]): header[k] for k in header if k.startswith("MSKN")}
    if not definitions:
        raise ValueError("Missing flag definitions; cannot assume pixels are clean")
    allowed = sum(1 << bit for bit, name in definitions.items() if name in INFORMATIONAL_FLAGS)
    flags = flags.astype(np.uint32)
    good = (flags & np.uint32(0xFFFFFFFF ^ allowed)) == 0
    counts = {name: int(np.count_nonzero(flags & (1 << bit)))
              for bit, name in definitions.items()}
    return good, counts


def observation_mjd(header, row):
    """DATE is HDU creation time, not the observation timestamp."""
    if header["TIMESYS"] != "UTC":
        raise ValueError("Only verified UTC timestamps are supported in this spike")
    mjd = float(header["MJD-OBS"])
    if not np.isfinite(mjd) or abs(Time(header["DATE-OBS"], scale="utc").mjd - mjd) > 1e-7:
        raise ValueError("FITS UTC/MJD timestamps disagree")
    if abs(float(row["t_min"]) - mjd) > 1e-5 or header["OBSID"] != row["obs_id"]:
        raise ValueError("FITS and discovery metadata disagree")
    return mjd


@dataclass
class Observation:
    metadata: dict
    wcs: WCS
    image: np.ndarray
    valid: np.ndarray
    wavelength: np.ndarray
    bandwidth: np.ndarray


def inspect_cutout(path, row, coord):
    with fits.open(path, memmap=False) as hdus:
        for name in ("IMAGE", "FLAGS", "VARIANCE", "ZODI", "EPSF", "WCS-WAVE"):
            if name not in hdus:
                raise ValueError(f"Missing required HDU: {name}")
        shape = hdus["IMAGE"].shape
        if len(shape) != 2 or max(shape) > 256:
            raise ValueError(f"Unexpected or oversized cutout shape: {shape}")
        for name in ("FLAGS", "VARIANCE", "ZODI"):
            if hdus[name].shape != shape:
                raise ValueError(f"Science and {name} shapes disagree")
        image = hdus["IMAGE"].data.astype(float)
        header = hdus["IMAGE"].header
        if u.Unit(header["BUNIT"]) != u.MJy / u.sr:
            raise ValueError("Unexpected science units")
        wcs = WCS(header)
        x, y = (float(v) for v in wcs.world_to_pixel(coord))
        if not (-0.5 <= x < image.shape[1] - 0.5 and -0.5 <= y < image.shape[0] - 0.5):
            raise ValueError("Requested position does not lie in this cutout")
        mjd = observation_mjd(header, row)
        detector = int(header["DETECTOR"])
        if row["energy_bandpassname"] != f"SPHEREx-D{detector}":
            raise ValueError("FITS and discovery detector disagree")
        # Keep celestial SIP. Only remove SIP from the alternate spectral WCS,
        # following IRSA's introduction/cutouts tutorials.
        spectral_header = header.copy()
        for key in list(spectral_header):
            if key.startswith(("A_", "B_", "AP_", "BP_")):
                del spectral_header[key]
        spectral = WCS(spectral_header, fobj=hdus, key="W")
        spectral.sip = None
        yy, xx = np.indices(image.shape)
        wave, width = spectral.pixel_to_world(xx, yy)
        center_wave, center_width = spectral.pixel_to_world(x, y)
        wave, width = wave.to_value(u.um), width.to_value(u.um)
        good, flag_counts = quality_mask(hdus["FLAGS"].data, hdus["FLAGS"].header)
        variance = hdus["VARIANCE"].data
        if good.shape != image.shape or variance.shape != image.shape:
            raise ValueError("Science, flags and variance shapes disagree")
        valid = (good & np.isfinite(image) & np.isfinite(variance) & (variance > 0)
                 & np.isfinite(wave) & np.isfinite(width) & (width > 0))
        rt = wcs.pixel_to_world(x, y).separation(coord).arcsec
        metadata = {
            "file": str(path), "obs_id": header["OBSID"], "detector": detector,
            "collection": row["obs_collection"], "access_url": row["access_url"],
            "date_obs_utc": header["DATE-OBS"], "mjd_obs": mjd,
            "date_end_utc": header["DATE-END"], "mjd_end": float(header["MJD-END"]),
            "creation_date_not_observation": header["DATE"],
            "pipeline_version": hdus[0].header.get("VERSION"), "units": header["BUNIT"],
            "shape_yx": list(image.shape), "target_pixel_xy_zero_based": [x, y],
            "target_roundtrip_error_arcsec": float(rt),
            "pixel_scale_arcsec": (proj_plane_pixel_scales(wcs) * 3600).tolist(),
            "celestial_wcs_header": wcs.to_header(relax=True).tostring(sep="\n", endcard=False, padding=False),
            "psf_fwhm_arcsec": float(header["PSF_FWHM"]),
            "wavelength_um_approx": float(center_wave.to_value(u.um)),
            "bandwidth_um_approx": float(center_width.to_value(u.um)),
            "wavelength_range_um_approx": [float(np.nanmin(wave)), float(np.nanmax(wave))],
            "valid_fraction": float(valid.mean()), "flag_counts": flag_counts,
            "science_median_mjy_sr": float(np.nanmedian(image)),
            "variance_median": float(np.nanmedian(variance)),
            "variance_units": hdus["VARIANCE"].header["BUNIT"],
            "zodi_median_mjy_sr": float(np.nanmedian(hdus["ZODI"].data)),
            "spectral_calibration_history": list(hdus["WCS-WAVE"].header.get("HISTORY", [])),
            "hdu_summary": [{"name": h.name, "type": type(h).__name__,
                             "shape": list(h.data.shape) if h.data is not None else None}
                            for h in hdus],
        }
        if not np.isfinite([metadata["wavelength_um_approx"], metadata["bandwidth_um_approx"]]).all():
            raise ValueError("Nonfinite target spectral coordinates")
        return Observation(metadata, wcs, image, valid, wave, width)


def pair_score(a, b, min_days, max_wave_offset):
    """Center-only preselection; full common-footprint spectral checks follow."""
    if a["detector"] != b["detector"] or a["obs_id"] == b["obs_id"]:
        return None
    days = abs(a["mjd_obs"] - b["mjd_obs"])
    bw = min(a["bandwidth_um_approx"], b["bandwidth_um_approx"])
    if bw <= 0 or days < min_days:
        return None
    offset = abs(a["wavelength_um_approx"] - b["wavelength_um_approx"]) / bw
    width_ratio = max(a["bandwidth_um_approx"], b["bandwidth_um_approx"]) / bw
    if offset > max_wave_offset or width_ratio > 1.2:
        return None
    return offset, -days


def common_grid(coord, size_arcmin, pixel_scale):
    size = int(np.ceil(size_arcmin * 60 / pixel_scale))
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [coord.ra.deg, coord.dec.deg]
    wcs.wcs.crpix = [(size + 1) / 2, (size + 1) / 2]
    wcs.wcs.cdelt = [-pixel_scale / 3600, pixel_scale / 3600]
    return wcs, (size, size)


def align_pair(a, b, coord, size_arcmin, max_wave_offset):
    # Do not oversample relative to the larger measured input pixel scale.
    scale = max(*a.metadata["pixel_scale_arcsec"], *b.metadata["pixel_scale_arcsec"])
    grid, shape = common_grid(coord, size_arcmin, scale)
    arrays, waves, widths, footprints = [], [], [], []
    for obs in (a, b):
        image = np.where(obs.valid, obs.image, np.nan)
        projected, footprint = reproject_interp((image, obs.wcs), grid, shape_out=shape)
        wave, _ = reproject_interp((obs.wavelength, obs.wcs), grid, shape_out=shape)
        width, _ = reproject_interp((obs.bandwidth, obs.wcs), grid, shape_out=shape)
        arrays.append(projected)
        footprints.append(footprint)
        waves.append(wave)
        widths.append(width)
    valid = (np.isfinite(arrays[0]) & np.isfinite(arrays[1])
             & (footprints[0] > 0) & (footprints[1] > 0))
    bw = np.minimum(*widths)
    offset = np.abs(waves[0] - waves[1]) / bw
    matched = (valid & np.isfinite(offset) & (offset <= max_wave_offset)
               & (np.maximum(*widths) / bw <= 1.2) & (bw > 0))
    metrics = {
        "shape_yx": list(shape), "pixel_scale_arcsec": scale,
        "common_valid_fraction": float(valid.mean()),
        "spectrally_matched_fraction_of_grid": float(matched.mean()),
        "matched_max_offset_in_bandwidths": float(offset[matched].max()) if matched.any() else None,
        "time_separation_days": abs(a.metadata["mjd_obs"] - b.metadata["mjd_obs"]),
        "output_wcs_header": grid.to_header().tostring(sep="\n", endcard=False, padding=False),
    }
    return grid, arrays, matched, metrics


def save_comparison(output, a, b, grid, arrays, matched):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    shown = [np.where(matched, array, np.nan) for array in arrays]
    limits = np.nanpercentile(np.concatenate([s[matched] for s in shown]), [2, 98])
    cmap = plt.colormaps["gray"].with_extremes(bad="#4477aa")
    fig = plt.figure(figsize=(11, 5), layout="constrained")
    for i, (obs, array) in enumerate(zip((a, b), shown, strict=True)):
        ax = fig.add_subplot(1, 2, i + 1, projection=grid)
        im = ax.imshow(array, origin="lower", interpolation="nearest", cmap=cmap,
                       vmin=limits[0], vmax=limits[1])
        ax.set_title(f"{obs.metadata['date_obs_utc'][:10]} UTC\n"
                     f"{obs.metadata['wavelength_um_approx']:.5f} µm (approx.)")
        ax.set_xlabel("RA (ICRS)")
        if i == 0:
            ax.set_ylabel("Dec (ICRS)")
        else:
            ax.coords[1].set_ticklabel_visible(False)
            ax.coords[1].set_axislabel("")
    fig.colorbar(im, ax=fig.axes, label="Surface brightness [MJy/sr]", shrink=0.7)
    fig.suptitle("Observed SPHEREx / IRSA — shared scale; no motion claim")
    fig.supxlabel("Blue = excluded pixels (quality, coverage or wavelength)", fontsize=10)
    fig.savefig(output / "comparison.png", dpi=160)
    plt.close(fig)
    hdus = [fits.PrimaryHDU()]
    for i, array in enumerate(shown, 1):
        header = grid.to_header()
        header["BUNIT"] = "MJy / sr"
        obs = (a, b)[i - 1].metadata
        header["OBSID"] = obs["obs_id"]
        header["MJD-OBS"] = obs["mjd_obs"]
        header["DATE-OBS"] = obs["date_obs_utc"]
        hdus.append(fits.ImageHDU(array.astype(np.float32), header=header, name=f"IMAGE{i}"))
    hdus.append(fits.ImageHDU(matched.astype(np.uint8), header=grid.to_header(), name="VALID"))
    fits.HDUList(hdus).writeto(output / "aligned.fits", overwrite=True)
    return {"shared_display_percentiles": [2, 98], "display_limits_mjy_sr": limits.tolist()}


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
            data = fetch_bytes(url, MAX_QUERY_BYTES, args.timeout)
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
            path, provenance = download_cutout(url, args.output, args.timeout, offline=args.offline)
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
