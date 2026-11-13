"""Artificial unit-test fixtures ONLY: none of these arrays are archive evidence."""

import json

import numpy as np
import pytest
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time

import validate_irsa as spike


@pytest.mark.parametrize("option,value", [
    ("--ra", "360"), ("--ra", "nan"), ("--dec", "91"),
    ("--size-arcmin", "11"), ("--max-downloads", "33"),
    ("--max-downloads", "0"), ("--min-days", "0"),
    ("--max-wave-offset", "0.9"), ("--timeout", "inf"),
    ("--min-coverage", "0"),
])
def test_reject_excessive_or_invalid_work(option, value):
    with pytest.raises(SystemExit):
        spike.arguments([option, value])


def test_cutout_units_and_host_validation():
    url = spike.cutout_url("https://irsa.ipac.caltech.edu/ibe/data/spherex/test.fits", 1, -2, 3)
    assert "size=0.05" in url
    assert "center=1%2C-2d" in url
    with pytest.raises(ValueError):
        spike.cutout_url("https://example.org/file.fits", 1, 2, 3)


@pytest.mark.parametrize("status", ["OVERFLOW", "ERROR"])
def test_incomplete_sia_is_not_an_empty_result(status):
    with pytest.raises(ValueError, match="incomplete"):
        spike.parse_sia(f'<VOTABLE><INFO name="QUERY_STATUS" value="{status}"/></VOTABLE>')


def test_empty_sia_with_verified_schema():
    fields = ''.join(f'<FIELD name="{name}"/>' for name in
                     ["obs_id", "access_url", "t_min", "energy_bandpassname"])
    assert spike.parse_sia(f'<VOTABLE><INFO name="QUERY_STATUS" value="OK"/>{fields}</VOTABLE>') == []


def test_source_flag_is_not_bad_but_unknown_bits_are():
    header = fits.Header({"MSKN0006": "NONFUNC", "MSKN0012": "FULLSAMPLE", "MSKN0021": "SOURCE"})
    flags = np.array([0, 1 << 21, 1 << 12, 1 << 6, 1 << 30, -1], dtype=np.int32)
    good, counts = spike.quality_mask(flags, header)
    assert good.tolist() == [True, True, True, False, False, False]
    assert counts["SOURCE"] == 2
    with pytest.raises(ValueError, match="definitions"):
        spike.quality_mask(flags, fits.Header())


def test_observation_time_not_file_creation_time():
    # Deliberately artificial times and ID, not an observed product.
    date = "2025-01-01T00:00:00"
    mjd = Time(date).mjd
    header = {"DATE-OBS": date, "MJD-OBS": mjd, "TIMESYS": "UTC",
              "DATE": "2026-01-01T00:00:00", "OBSID": "UNIT_TEST"}
    row = {"t_min": str(mjd), "obs_id": "UNIT_TEST"}
    assert spike.observation_mjd(header, row) == mjd
    with pytest.raises(ValueError, match="timestamps"):
        spike.observation_mjd(header | {"MJD-OBS": mjd + 1}, row)
    with pytest.raises(ValueError, match="discovery"):
        spike.observation_mjd(header, row | {"obs_id": "WRONG"})


def pair_metadata(**changes):
    return {"detector": 6, "obs_id": "UNIT_A", "mjd_obs": 60000,
            "wavelength_um_approx": 4.8, "bandwidth_um_approx": 0.04, **changes}


def test_same_detector_is_insufficient_for_comparison():
    a = pair_metadata()
    b = pair_metadata(obs_id="UNIT_B", mjd_obs=60100, wavelength_um_approx=4.9)
    assert spike.pair_score(a, b, 30, 0.25) is None
    b["wavelength_um_approx"] = 4.805
    assert spike.pair_score(a, b, 30, 0.25) is not None
    assert spike.pair_score(a, b | {"mjd_obs": 60001}, 30, 0.25) is None
    assert spike.pair_score(a, b | {"bandwidth_um_approx": 0.08}, 30, 0.25) is None
    assert spike.pair_score(a, b | {"detector": 5}, 30, 0.25) is None


def test_grid_origin_handedness_and_ra_wrap():
    coord = SkyCoord(359.9999, -7, unit="deg")
    wcs, shape = spike.common_grid(coord, 3, 6.15)
    x, y = wcs.world_to_pixel(coord)
    assert x == pytest.approx((shape[1] - 1) / 2)
    assert y == pytest.approx((shape[0] - 1) / 2)
    assert wcs.pixel_to_world(x + 1, y).ra.deg < coord.ra.deg
    assert wcs.pixel_to_world(x, y + 1).dec.deg > coord.dec.deg
    assert wcs.pixel_to_world(x, y).separation(coord).arcsec < 1e-6


def test_reprojection_preserves_constant_surface_brightness_and_masks(tmp_path):
    coord = SkyCoord(100, 20, unit="deg")
    grid, shape = spike.common_grid(coord, 3, 6.15)
    image = np.full(shape, 10.0)  # Artificial constant field for a transformation test.
    good = np.ones(shape, dtype=bool)
    good[10:15, 10:15] = False
    def observation(mjd, identifier):
        return spike.Observation(pair_metadata(mjd_obs=mjd, obs_id=identifier,
                                 pixel_scale_arcsec=[6.15, 6.15],
                                 date_obs_utc="UNIT_TEST_NOT_A_DATE"), grid, image, good,
                                 np.full(shape, 4.8), np.full(shape, 0.04))
    a, b = observation(60000, "UNIT_A"), observation(60100, "UNIT_B")
    output_grid, arrays, matched, metrics = spike.align_pair(a, b, coord, 3, 0.25)
    assert metrics["spectrally_matched_fraction_of_grid"] > 0.8
    assert not matched[12, 12]
    np.testing.assert_allclose(arrays[0][matched], 10)
    assert metrics["time_separation_days"] == 100
    # Export a clearly labelled test-only visualization; never archive evidence.
    spike.save_comparison(tmp_path, a, b, output_grid, arrays, matched)
    assert (tmp_path / "comparison.png").exists()
    with fits.open(tmp_path / "aligned.fits") as hdus:
        np.testing.assert_allclose(hdus["IMAGE1"].data[matched], 10)
        assert np.isnan(hdus["IMAGE1"].data[12, 12])
        assert hdus["IMAGE1"].header["OBSID"] == "UNIT_A"


def test_download_rejects_corrupt_cached_file(tmp_path):
    url = "https://irsa.ipac.caltech.edu/ibe/data/spherex/test.fits"
    key = spike.hashlib.sha256(url.encode()).hexdigest()[:20]
    (tmp_path / f"{key}.fits").write_bytes(b"corrupt")
    (tmp_path / f"{key}.json").write_text(json.dumps({"url": url, "sha256": "wrong"}))
    with pytest.raises(ValueError, match="integrity"):
        spike.download_cutout(url, tmp_path, 1)


def test_download_limits_before_writing(tmp_path, monkeypatch):
    monkeypatch.setattr(spike, "fetch_bytes", lambda *args: b"Not a FITS: upstream error")
    with pytest.raises(ValueError, match="not a FITS"):
        spike.download_cutout("https://irsa.ipac.caltech.edu/test", tmp_path, 1)
    assert not list(tmp_path.iterdir())


def test_http_response_size_cap(monkeypatch):
    class Response:
        headers = {"Content-Length": "100"}

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    monkeypatch.setattr(spike, "urlopen", lambda *args, **kwargs: Response())
    with pytest.raises(ValueError, match="limit"):
        spike.fetch_bytes("https://example.invalid/unit-test", 10, 1)


def test_transient_errors_have_bounded_retries(monkeypatch):
    calls = []

    def unavailable(*args, **kwargs):
        calls.append(1)
        raise spike.URLError("Artificial offline test error")

    monkeypatch.setattr(spike, "urlopen", unavailable)
    with pytest.raises(RuntimeError, match="two attempts"):
        spike.fetch_bytes("https://example.invalid/unit-test", 10, 1)
    assert len(calls) == 2


def test_offline_missing_cutout_never_requests_network(tmp_path, monkeypatch):
    def no_network(*args, **kwargs):
        pytest.fail("Offline mode attempted a remote request")

    monkeypatch.setattr(spike, "fetch_bytes", no_network)
    with pytest.raises(ValueError, match="Offline replay requires"):
        spike.download_cutout("https://example.invalid/unit-test", tmp_path, 1, offline=True)


def test_offline_missing_discovery_is_a_transparent_blocker(tmp_path, monkeypatch):
    def no_network(*args, **kwargs):
        pytest.fail("Offline mode attempted a remote request")

    monkeypatch.setattr(spike, "fetch_bytes", no_network)
    assert spike.main(["--offline", "--output", str(tmp_path)]) == 2
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["status"] == "blocked"
    assert "Offline replay requires" in manifest["error"]
    assert len(list((tmp_path / "runs").glob("*.json"))) == 1
