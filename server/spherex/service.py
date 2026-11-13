"""Scientific data loading, region matching, and response building for SPHEREx API."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from astropy.coordinates import SkyCoord
from astropy.io import fits
import numpy as np

from spherex.models import (
    BandInfoModel,
    EpochModel,
    FrameModel,
    FramesResponseModel,
    FrameStatsModel,
    TargetModel,
    WCSModel,
)


# Verified M101 coordinates and default parameters
M101_RA = 210.80227
M101_DEC = 54.34895
M101_DEFAULT_FOV = 3.0
M101_DETECTOR = 2


class UnsupportedRegionError(Exception):
    """Raised when coordinates do not match any verified SPHEREx region."""
    def __init__(self, ra: float, dec: float):
        super().__init__(
            f"Region RA={ra:.5f}, Dec={dec:.5f} is not supported in the M2 MVP. "
            f"Currently supported verified region: M101 (RA={M101_RA}, Dec={M101_DEC}, detector={M101_DETECTOR})."
        )
        self.ra = ra
        self.dec = dec


class DataUnavailableError(Exception):
    """Raised when locally cached scientific products are not found on disk."""
    def __init__(self, path: Path):
        super().__init__(
            f"Cached scientific products for M101 not found at '{path}'. "
            f"Run `python -m spherex.prepare --output {path}` to prepare the validated dataset."
        )
        self.path = path


def get_default_data_dir() -> Path:
    """Resolve data directory from SPHEREx environment variable or default server path."""
    env_dir = os.environ.get("SPHEREX_DATA_DIR")
    if env_dir:
        return Path(env_dir)
    # Default to outputs/m101 relative to server root
    server_root = Path(__file__).resolve().parent.parent
    return server_root / "outputs" / "m101"


def is_m101_region(ra: float, dec: float, fov_arcmin: float) -> bool:
    """Check if requested coordinates match the verified M101 field within FOV tolerance."""
    coord = SkyCoord(ra, dec, unit="deg", frame="icrs")
    m101 = SkyCoord(M101_RA, M101_DEC, unit="deg", frame="icrs")
    sep_arcmin = coord.separation(m101).arcmin
    # Allow separation within half the comparison field of view or 2.5 arcmin
    tolerance = max(2.5, fov_arcmin / 2.0)
    return sep_arcmin <= tolerance


def compute_stats(data: np.ndarray, valid_mask: np.ndarray) -> FrameStatsModel:
    """Compute min, max, median, mean, std over valid pixels only."""
    valid_pixels = data[valid_mask == 1]
    if len(valid_pixels) == 0:
        return FrameStatsModel(min=0.0, max=0.0, median=0.0, mean=0.0, std=0.0)
    return FrameStatsModel(
        min=float(np.min(valid_pixels)),
        max=float(np.max(valid_pixels)),
        median=float(np.median(valid_pixels)),
        mean=float(np.mean(valid_pixels)),
        std=float(np.std(valid_pixels)),
    )


def load_m101_frames(
    target_name: Optional[str] = None,
    data_dir: Optional[Path] = None,
) -> FramesResponseModel:
    """Load validated M101 observation pair from cached aligned.fits and manifest.json."""
    if data_dir is None:
        data_dir = get_default_data_dir()

    aligned_fits_path = data_dir / "aligned.fits"
    manifest_path = data_dir / "manifest.json"

    if not aligned_fits_path.exists() or not manifest_path.exists():
        raise DataUnavailableError(data_dir)

    manifest = json.loads(manifest_path.read_text())
    comp = manifest.get("comparison")
    if not comp or "observations" not in comp or len(comp["observations"]) < 2:
        raise ValueError(f"Manifest at {manifest_path} lacks required comparison observations")

    obs_a, obs_b = comp["observations"][:2]

    with fits.open(aligned_fits_path, memmap=False) as hdus:
        if "IMAGE1" not in hdus or "IMAGE2" not in hdus or "VALID" not in hdus:
            raise ValueError(f"aligned.fits at {aligned_fits_path} lacks required HDUs")

        raw_img1 = hdus["IMAGE1"].data.astype(float)
        raw_img2 = hdus["IMAGE2"].data.astype(float)
        raw_valid = hdus["VALID"].data.astype(int)

        header = hdus["IMAGE1"].header
        crval = [float(header["CRVAL1"]), float(header["CRVAL2"])]
        cdelt = abs(float(header["CDELT2"]))  # Degrees per pixel scale

    # Align with screen canvas orientation:
    # In FITS, row 0 is South (CDELT2 > 0). In canvas screen coords, row 0 is North (top).
    # Flip vertically so screen row 0 corresponds to North (+Dec), matching frontend/lib/wcs.ts.
    img1_screen = np.flipud(raw_img1)
    img2_screen = np.flipud(raw_img2)
    valid_screen = np.flipud(raw_valid)

    shape = img1_screen.shape  # (height, width)
    height, width = shape[0], shape[1]

    # Calculate statistics over strictly valid pixels
    stats_1 = compute_stats(img1_screen, valid_screen)
    stats_2 = compute_stats(img2_screen, valid_screen)

    # In JSON, replace non-finite values (NaN) with 0.0; validMask explicitly identifies valid pixels
    clean_img1 = np.nan_to_num(img1_screen, nan=0.0).ravel().tolist()
    clean_img2 = np.nan_to_num(img2_screen, nan=0.0).ravel().tolist()
    valid_mask_flat = valid_screen.ravel().tolist()

    wcs_model = WCSModel(
        crpix=[width / 2.0, height / 2.0],  # Pixel center [15.0, 15.0]
        crval=crval,
        cdelt=cdelt,
        size=[width, height],
    )

    frame_1 = FrameModel(
        id=obs_a["obs_id"],
        mjd=float(obs_a["mjd_obs"]),
        date=obs_a["date_obs_utc"],
        epochIndex=0,
        detector=int(obs_a["detector"]),
        band=BandInfoModel(
            lambda_um=float(obs_a["wavelength_um_approx"]),
            width_um=float(obs_a["bandwidth_um_approx"]),
            detector=int(obs_a["detector"]),
            index=0,
        ),
        flags=["clean"],
        width=width,
        height=height,
        pixelData=clean_img1,
        stats=stats_1,
        validMask=valid_mask_flat,
        units="MJy / sr",
        provenance={
            "collection": obs_a.get("collection", "spherex_qr3"),
            "access_url": obs_a.get("access_url"),
            "valid_fraction": float(obs_a.get("valid_fraction", 0.0)),
        },
    )

    frame_2 = FrameModel(
        id=obs_b["obs_id"],
        mjd=float(obs_b["mjd_obs"]),
        date=obs_b["date_obs_utc"],
        epochIndex=1,
        detector=int(obs_b["detector"]),
        band=BandInfoModel(
            lambda_um=float(obs_b["wavelength_um_approx"]),
            width_um=float(obs_b["bandwidth_um_approx"]),
            detector=int(obs_b["detector"]),
            index=0,
        ),
        flags=["clean"],
        width=width,
        height=height,
        pixelData=clean_img2,
        stats=stats_2,
        validMask=valid_mask_flat,
        units="MJy / sr",
        provenance={
            "collection": obs_b.get("collection", "spherex_qr3"),
            "access_url": obs_b.get("access_url"),
            "valid_fraction": float(obs_b.get("valid_fraction", 0.0)),
        },
    )

    epochs = [
        EpochModel(epoch=1, date=obs_a["date_obs_utc"], mjd=float(obs_a["mjd_obs"])),
        EpochModel(epoch=2, date=obs_b["date_obs_utc"], mjd=float(obs_b["mjd_obs"])),
    ]

    provenance = {
        "data_origin": "observed_spherex",
        "archive": "NASA/IPAC Infrared Science Archive (IRSA)",
        "collections": ["spherex_dr1", "spherex_qr3"],
        "observation_ids": [obs_a["obs_id"], obs_b["obs_id"]],
        "access_urls": [obs_a.get("access_url"), obs_b.get("access_url")],
        "time_separation_days": float(comp.get("time_separation_days", 37.6812)),
        "spectrally_matched_fraction_of_grid": float(comp.get("spectrally_matched_fraction_of_grid", 0.8544)),
        "matched_max_offset_in_bandwidths": comp.get("matched_max_offset_in_bandwidths"),
        "pixel_scale_arcsec": float(comp.get("pixel_scale_arcsec", 6.1518)),
        "units": "MJy / sr",
        "citation": (
            "This publication makes use of data products from the Spectro-Photometer for the "
            "History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which "
            "is a joint project of the Jet Propulsion Laboratory and the California Institute "
            "of Technology, and is funded by the National Aeronautics and Space Administration."
        ),
        "limitations": [
            "Approximate WCS-WAVE visualization wavelength solution, not calibrated CWAVE/CBAND",
            "Static field comparison; no moving object detection or Planet X claim",
            "IMAGE includes zodiacal light; no background subtraction applied",
            "Common grid surface-brightness visualization; no PSF homogenization",
        ],
        "cached": True,
    }

    target = TargetModel(
        ra=crval[0],
        dec=crval[1],
        name=target_name or "M101 (Pinwheel Galaxy)",
        category="Standard",
        description="Verified SPHEREx QR3 observation pair separated by 37.68 days in Detector 2 (approx. 1.49 µm).",
    )

    return FramesResponseModel(
        target=target,
        wcs=wcs_model,
        fovArcmin=M101_DEFAULT_FOV,
        frames=[frame_1, frame_2],
        epochs=epochs,
        validMask=valid_mask_flat,
        provenance=provenance,
    )


def get_frames(
    ra: float,
    dec: float,
    fov_arcmin: float = M101_DEFAULT_FOV,
    target_name: Optional[str] = None,
    data_dir: Optional[Path] = None,
) -> FramesResponseModel:
    """Query frames for given coordinates, mapping to verified M101 observations if matched."""
    if not is_m101_region(ra, dec, fov_arcmin):
        raise UnsupportedRegionError(ra, dec)

    return load_m101_frames(target_name=target_name, data_dir=data_dir)
