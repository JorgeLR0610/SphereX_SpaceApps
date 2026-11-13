"""Spatial reprojection, common-grid alignment, and pair comparison for SPHEREx observations."""

from __future__ import annotations

from pathlib import Path

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
from reproject import reproject_interp

from spherex.fits import Observation


def pair_score(a: dict, b: dict, min_days: float, max_wave_offset: float) -> tuple[float, float] | None:
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


def common_grid(coord: SkyCoord, size_arcmin: float, pixel_scale: float) -> tuple[WCS, tuple[int, int]]:
    """Build a north-up, east-left ICRS TAN output grid centered on coord."""
    size = int(np.ceil(size_arcmin * 60 / pixel_scale))
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [coord.ra.deg, coord.dec.deg]
    wcs.wcs.crpix = [(size + 1) / 2, (size + 1) / 2]
    wcs.wcs.cdelt = [-pixel_scale / 3600, pixel_scale / 3600]
    return wcs, (size, size)


def align_pair(
    a: Observation,
    b: Observation,
    coord: SkyCoord,
    size_arcmin: float,
    max_wave_offset: float,
) -> tuple[WCS, list[np.ndarray], np.ndarray, dict]:
    """Reproject two observations onto a common grid and compute spectral match metrics."""
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
        "shape_yx": list(shape),
        "pixel_scale_arcsec": scale,
        "common_valid_fraction": float(valid.mean()),
        "spectrally_matched_fraction_of_grid": float(matched.mean()),
        "matched_max_offset_in_bandwidths": float(offset[matched].max()) if matched.any() else None,
        "time_separation_days": abs(a.metadata["mjd_obs"] - b.metadata["mjd_obs"]),
        "output_wcs_header": grid.to_header().tostring(sep="\n", endcard=False, padding=False),
    }
    return grid, arrays, matched, metrics


def save_comparison(
    output: Path,
    a: Observation,
    b: Observation,
    grid: WCS,
    arrays: list[np.ndarray],
    matched: np.ndarray,
) -> dict:
    """Save aligned.fits (with standard FITS lower origin) and comparison.png."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    output = Path(output)
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
