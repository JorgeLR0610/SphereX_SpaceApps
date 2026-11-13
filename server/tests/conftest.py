"""Pytest fixtures for SPHEREx server tests, providing isolated synthetic datasets."""

import json
from pathlib import Path

from astropy.io import fits
import numpy as np
import pytest

from spherex.service import M101_DEC, M101_RA


@pytest.fixture
def synthetic_data_dir(tmp_path: Path) -> Path:
    """Create an isolated, valid synthetic M101 dataset directory for unit testing."""
    shape = (30, 30)
    img1 = np.full(shape, 1.5, dtype=np.float32)
    img2 = np.full(shape, 1.8, dtype=np.float32)
    valid = np.ones(shape, dtype=np.uint8)
    valid[-1, 0] = 0
    img1[-1, 0] = np.nan
    img2[-1, 0] = np.nan

    header = fits.Header()
    header["CRVAL1"] = M101_RA
    header["CRVAL2"] = M101_DEC
    header["CRPIX1"] = 15.5
    header["CRPIX2"] = 15.5
    header["CDELT1"] = -0.0017088
    header["CDELT2"] = 0.0017088
    header["CTYPE1"] = "RA---TAN"
    header["CTYPE2"] = "DEC--TAN"
    header["BUNIT"] = "MJy / sr"
    header["OBSID"] = "SYNTH_A"
    header["MJD-OBS"] = 61177.45
    header["DATE-OBS"] = "2026-05-17T10:58:00.000"

    hdus = [
        fits.PrimaryHDU(),
        fits.ImageHDU(img1, header=header, name="IMAGE1"),
        fits.ImageHDU(img2, header=header, name="IMAGE2"),
        fits.ImageHDU(valid, header=header, name="VALID"),
    ]
    fits.HDUList(hdus).writeto(tmp_path / "aligned.fits", overwrite=True)

    manifest = {
        "status": "visualization_pair_validated",
        "comparison": {
            "time_separation_days": 37.68,
            "spectrally_matched_fraction_of_grid": 0.8544,
            "pixel_scale_arcsec": 6.1518,
            "observations": [
                {
                    "obs_id": "SYNTH_A",
                    "detector": 2,
                    "collection": "spherex_qr3",
                    "date_obs_utc": "2026-05-17T10:58:00.000",
                    "mjd_obs": 61177.45,
                    "wavelength_um_approx": 1.4895,
                    "bandwidth_um_approx": 0.0365,
                    "units": "MJy / sr",
                    "valid_fraction": 0.95,
                },
                {
                    "obs_id": "SYNTH_B",
                    "detector": 2,
                    "collection": "spherex_qr3",
                    "date_obs_utc": "2026-06-24T03:19:00.000",
                    "mjd_obs": 61215.13,
                    "wavelength_um_approx": 1.4900,
                    "bandwidth_um_approx": 0.0365,
                    "units": "MJy / sr",
                    "valid_fraction": 0.98,
                },
            ],
        },
    }
    (tmp_path / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return tmp_path
