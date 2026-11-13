"""CLI preparation utility to download and align the verified M101 SPHEREx dataset."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from spherex import __version__
from spherex.service import (
    M101_DEC,
    M101_DEFAULT_FOV,
    M101_DETECTOR,
    M101_RA,
    get_default_data_dir,
    verify_dataset_usability,
)
import scripts.validate_irsa as validate_irsa


def prepare_m101(
    output: Path,
    offline: bool = False,
    force: bool = False,
    timeout: float = 120.0,
) -> int:
    """Download and process verified M101 observations into output directory."""
    output = Path(output)
    aligned_fits = output / "aligned.fits"
    manifest_path = output / "manifest.json"

    usable, reason = verify_dataset_usability(output)
    if usable and not force:
        print(f"[spherex.prepare] Verified cached M101 products confirmed usable in '{output}'.")
        print("[spherex.prepare] Use --force to re-run discovery and processing.")
        return 0

    if not usable and (aligned_fits.exists() or manifest_path.exists()) and not force:
        print(f"[spherex.prepare] Cached products present but failed usability verification: {reason}. Re-preparing...")

    print(f"[spherex.prepare] Preparing verified M101 dataset in '{output}' (offline={offline})...")
    output.mkdir(parents=True, exist_ok=True)

    args = validate_irsa.arguments([
        "--ra", str(M101_RA),
        "--dec", str(M101_DEC),
        "--detector", str(M101_DETECTOR),
        "--size-arcmin", str(M101_DEFAULT_FOV),
        "--download-padding", "2",
        "--max-downloads", "24",
        "--min-days", "30",
        "--max-wave-offset", "0.25",
        "--min-coverage", "0.8",
        "--timeout", str(timeout),
        "--output", str(output),
        *(["--offline"] if offline else []),
    ])

    return validate_irsa.main([
        "--ra", str(args.ra),
        "--dec", str(args.dec),
        "--detector", str(args.detector),
        "--size-arcmin", str(args.size_arcmin),
        "--download-padding", str(args.download_padding),
        "--max-downloads", str(args.max_downloads),
        "--min-days", str(args.min_days),
        "--max-wave-offset", str(args.max_wave_offset),
        "--min-coverage", str(args.min_coverage),
        "--timeout", str(args.timeout),
        "--output", str(args.output),
        *(["--offline"] if args.offline else []),
    ])


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=f"SPHEREx Time Machine Data Preparation CLI v{__version__}"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=get_default_data_dir(),
        help="Target output directory for cached products (default: outputs/m101)",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Replay saved discovery XML and verified real cutouts without network calls",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-processing even if aligned.fits exists",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="Per-request socket/download timeout in seconds",
    )
    args = parser.parse_args(argv)
    return prepare_m101(args.output, offline=args.offline, force=args.force, timeout=args.timeout)


if __name__ == "__main__":
    raise SystemExit(main())
