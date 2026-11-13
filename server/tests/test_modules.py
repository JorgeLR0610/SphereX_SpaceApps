"""Unit tests for spherex scientific modules (archive, fits, alignment)."""

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
import numpy as np
import pytest

from spherex.alignment import align_pair, common_grid, pair_score
from spherex.archive import cutout_url, parse_sia
from spherex.fits import Observation, observation_mjd, quality_mask


def test_cutout_url_validation():
    valid = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/cutout.fits"
    url = cutout_url(valid, 210.8, 54.3, 3.0)
    assert "center=210.8%2C54.3d" in url
    assert "size=0.05" in url

    with pytest.raises(ValueError, match="Not an expected"):
        cutout_url("https://external-archive.org/data.fits", 0, 0, 1.0)


def test_parse_sia_error_and_empty():
    with pytest.raises(ValueError, match="incomplete/error"):
        parse_sia('<VOTABLE><INFO name="QUERY_STATUS" value="OVERFLOW"/></VOTABLE>')

    fields = "".join(f'<FIELD name="{name}"/>' for name in ["obs_id", "access_url", "t_min", "energy_bandpassname"])
    empty_xml = f'<VOTABLE><INFO name="QUERY_STATUS" value="OK"/>{fields}</VOTABLE>'
    assert parse_sia(empty_xml) == []


def test_quality_mask_rules():
    header = fits.Header({"MSKN0001": "NONFUNC", "MSKN0012": "FULLSAMPLE", "MSKN0021": "SOURCE"})
    flags = np.array([0, 1 << 21, 1 << 12, 1 << 1, 1 << 29], dtype=np.int32)
    good, counts = quality_mask(flags, header)
    assert good.tolist() == [True, True, True, False, False]
    assert counts["SOURCE"] == 1
    assert counts["NONFUNC"] == 1


def test_observation_mjd_verification():
    date = "2026-05-17T10:58:00"
    mjd = Time(date, scale="utc").mjd
    header = fits.Header({
        "DATE-OBS": date,
        "MJD-OBS": mjd,
        "TIMESYS": "UTC",
        "OBSID": "TEST_OBS",
        "DATE": "2026-06-01T00:00:00",
    })
    row = {"t_min": str(mjd), "obs_id": "TEST_OBS"}
    assert observation_mjd(header, row) == pytest.approx(mjd)

    with pytest.raises(ValueError, match="UTC timestamps"):
        h_tai = header.copy()
        h_tai["TIMESYS"] = "TAI"
        observation_mjd(h_tai, row)

    with pytest.raises(ValueError, match="timestamps disagree"):
        h_bad_mjd = header.copy()
        h_bad_mjd["MJD-OBS"] = mjd + 0.1
        observation_mjd(h_bad_mjd, row)


def test_pair_score_rules():
    obs_a = {
        "obs_id": "OBS_A", "detector": 2, "mjd_obs": 61000.0,
        "wavelength_um_approx": 1.489, "bandwidth_um_approx": 0.036,
    }
    obs_b = {
        "obs_id": "OBS_B", "detector": 2, "mjd_obs": 61040.0,
        "wavelength_um_approx": 1.490, "bandwidth_um_approx": 0.036,
    }
    score = pair_score(obs_a, obs_b, min_days=30, max_wave_offset=0.25)
    assert score is not None
    offset, neg_days = score
    assert offset < 0.25
    assert neg_days == -40.0

    # Different detectors must not pair
    assert pair_score(obs_a, obs_b | {"detector": 3}, 30, 0.25) is None
    # Less than min_days must not pair
    assert pair_score(obs_a, obs_b | {"mjd_obs": 61010.0}, 30, 0.25) is None


def test_common_grid_geometry():
    coord = SkyCoord(210.80227, 54.34895, unit="deg", frame="icrs")
    wcs, shape = common_grid(coord, size_arcmin=3.0, pixel_scale=6.1518)
    assert shape == (30, 30)

    # Center pixel should map to coord
    center = wcs.pixel_to_world(14.5, 14.5)
    assert center.separation(coord).arcsec < 0.01

    # North (+Dec) has higher y in FITS convention
    assert wcs.pixel_to_world(14.5, 29).dec.deg > center.dec.deg
    assert wcs.pixel_to_world(14.5, 0).dec.deg < center.dec.deg
