"""FITS inspection, WCS calibration, and scientific masking for SPHEREx cutouts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
import numpy as np

from spherex.archive import INFORMATIONAL_FLAGS


def quality_mask(flags: np.ndarray, header: fits.Header) -> tuple[np.ndarray, dict[str, int]]:
    """Decode SPHEREx quality flag bitmap and conservatively reject non-informational bits."""
    definitions = {int(k[4:]): header[k] for k in header if k.startswith("MSKN")}
    if not definitions:
        raise ValueError("Missing flag definitions; cannot assume pixels are clean")
    allowed = sum(1 << bit for bit, name in definitions.items() if name in INFORMATIONAL_FLAGS)
    flags = flags.astype(np.uint32)
    good = (flags & np.uint32(0xFFFFFFFF ^ allowed)) == 0
    counts = {name: int(np.count_nonzero(flags & (1 << bit)))
              for bit, name in definitions.items()}
    return good, counts


def observation_mjd(header: fits.Header, row: dict[str, str]) -> float:
    """Verify UTC/MJD observation timestamps against discovery metadata.
    
    DATE is HDU creation time, NOT the observation timestamp.
    """
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
    """Inspected SPHEREx observation with parsed WCS, image, validity mask and wavelength arrays."""
    metadata: dict
    wcs: WCS
    image: np.ndarray
    valid: np.ndarray
    wavelength: np.ndarray
    bandwidth: np.ndarray


def inspect_cutout(path: Path | str, row: dict[str, str], coord: SkyCoord) -> Observation:
    """Read and validate a SPHEREx Level 2 spectral-image MEF cutout."""
    path = Path(path)
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
