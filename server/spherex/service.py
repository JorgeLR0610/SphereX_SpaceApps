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


# Verified M101 coordinates and parameters
M101_RA = 210.80227
M101_DEC = 54.34895
M101_DEFAULT_FOV = 3.0
M101_SUPPORTED_FOV_MIN = 2.5
M101_SUPPORTED_FOV_MAX = 3.5
M101_DETECTOR = 2


class UnsupportedRegionError(Exception):
    """Raised when coordinates do not match any verified SPHEREx region."""
    def __init__(self, ra: float, dec: float):
        super().__init__(
            f"Region RA={ra:.5f}, Dec={dec:.5f} is not supported in the M2/M3 MVP. "
            f"Currently supported verified region: M101 (RA={M101_RA}, Dec={M101_DEC}, detector={M101_DETECTOR})."
        )
        self.ra = ra
        self.dec = dec


class UnsupportedFovError(Exception):
    """Raised when requested FOV does not correspond to the fixed cached dataset."""
    def __init__(self, fov: float):
        super().__init__(
            f"Requested FOV={fov:.2f} arcmin is not supported for the cached M101 dataset. "
            f"The verified M101 dataset is fixed at FOV=3.0 arcmin (supported range: [{M101_SUPPORTED_FOV_MIN}, {M101_SUPPORTED_FOV_MAX}] arcmin)."
        )
        self.fov = fov


class DataUnavailableError(Exception):
    """Raised when locally cached scientific products are not found or unusable on disk."""
    def __init__(self, path: Path, reason: Optional[str] = None):
        msg = f"Cached scientific products for M101 not usable at '{path}'"
        if reason:
            msg += f": {reason}"
        msg += f". Run `python -m spherex.prepare --output {path}` to prepare the validated dataset."
        super().__init__(msg)
        self.path = path
        self.reason = reason


def get_default_data_dir() -> Path:
    """Resolve data directory from SPHEREx environment variable or default server path."""
    env_dir = os.environ.get("SPHEREX_DATA_DIR")
    if env_dir:
        return Path(env_dir)
    # Default to outputs/m101 relative to server root
    server_root = Path(__file__).resolve().parent.parent
    return server_root / "outputs" / "m101"


def verify_dataset_usability(data_dir: Path) -> tuple[bool, str | None]:
    """Verify that cached aligned.fits and manifest.json exist and are scientifically usable."""
    data_dir = Path(data_dir)
    aligned_fits_path = data_dir / "aligned.fits"
    manifest_path = data_dir / "manifest.json"

    if not aligned_fits_path.exists() or not manifest_path.exists():
        return False, f"Missing required files in {data_dir}"

    try:
        manifest = json.loads(manifest_path.read_text())
        if manifest.get("status") != "visualization_pair_validated":
            return False, f"Manifest status is '{manifest.get('status')}', expected 'visualization_pair_validated'"
        comp = manifest.get("comparison")
        if not comp or "observations" not in comp or len(comp["observations"]) < 2:
            return False, "Manifest lacks comparison observations"
    except Exception as exc:
        return False, f"Invalid manifest.json: {exc}"

    try:
        with fits.open(aligned_fits_path, memmap=False) as hdus:
            for name in ("IMAGE1", "IMAGE2", "VALID"):
                if name not in hdus:
                    return False, f"aligned.fits missing required HDU: {name}"
            if hdus["IMAGE1"].shape != (30, 30) or hdus["IMAGE2"].shape != (30, 30) or hdus["VALID"].shape != (30, 30):
                return False, f"Unexpected HDU shapes in {aligned_fits_path}"
            if not np.isfinite(hdus["VALID"].data).all():
                return False, "Non-finite values in VALID HDU"
    except Exception as exc:
        return False, f"Invalid aligned.fits: {exc}"

    return True, None


def is_m101_region(ra: float, dec: float, tolerance_arcmin: float = 2.5) -> bool:
    """Check if requested coordinates match the verified M101 field within spatial tolerance."""
    coord = SkyCoord(ra, dec, unit="deg", frame="icrs")
    m101 = SkyCoord(M101_RA, M101_DEC, unit="deg", frame="icrs")
    sep_arcmin = coord.separation(m101).arcmin
    return sep_arcmin <= tolerance_arcmin


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

    is_usable, reason = verify_dataset_usability(data_dir)
    if not is_usable:
        raise DataUnavailableError(data_dir, reason=reason)

    manifest_path = data_dir / "manifest.json"
    aligned_fits_path = data_dir / "aligned.fits"

    manifest = json.loads(manifest_path.read_text())
    comp = manifest["comparison"]
    obs_a, obs_b = comp["observations"][:2]

    with fits.open(aligned_fits_path, memmap=False) as hdus:
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

    # Note: Rather than labeling entire observation as "clean", accurately indicate
    # contamination/masking status (cutout boundary filtering is active).
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
        flags=["contaminated_edge"],
        width=width,
        height=height,
        pixelData=clean_img1,
        stats=stats_1,
        validMask=valid_mask_flat,
        units="MJy / sr",
        provenance={
            "data_origin": "observed_spherex",
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
        flags=["contaminated_edge"],
        width=width,
        height=height,
        pixelData=clean_img2,
        stats=stats_2,
        validMask=valid_mask_flat,
        units="MJy / sr",
        provenance={
            "data_origin": "observed_spherex",
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
    if not is_m101_region(ra, dec):
        raise UnsupportedRegionError(ra, dec)

    if not (M101_SUPPORTED_FOV_MIN <= fov_arcmin <= M101_SUPPORTED_FOV_MAX):
        raise UnsupportedFovError(fov_arcmin)

    return load_m101_frames(target_name=target_name, data_dir=data_dir)
