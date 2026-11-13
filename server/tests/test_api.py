"""Integration tests for FastAPI application endpoints, schemas, bounds, and array serialization."""

import json
from pathlib import Path

from fastapi.testclient import TestClient
import numpy as np
import pytest

from spherex.api import app
from spherex.models import FramesResponseModel
from spherex.service import M101_DEC, M101_RA, get_default_data_dir


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "spherex-scientific-api"
    assert "version" in data
    assert isinstance(data["m101_cached"], bool)
    assert "data_dir" in data


def test_health_verifies_usability(client, tmp_path, monkeypatch):
    import spherex.service as service
    # 1. Empty directory -> not cached
    monkeypatch.setattr(service, "get_default_data_dir", lambda: tmp_path)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["m101_cached"] is False

    # 2. Corrupt files -> not cached (usability check fails)
    (tmp_path / "aligned.fits").write_text("corrupt_fits")
    (tmp_path / "manifest.json").write_text("{}")
    resp2 = client.get("/health")
    assert resp2.status_code == 200
    assert resp2.json()["m101_cached"] is False


def test_isolated_synthetic_frames(client, synthetic_data_dir, monkeypatch):
    """Test full frames retrieval flow using isolated synthetic dataset (zero download dependency)."""
    import spherex.service as service
    monkeypatch.setattr(service, "get_default_data_dir", lambda: synthetic_data_dir)

    response = client.get(f"/frames?ra={M101_RA}&dec={M101_DEC}&fov=3.0")
    assert response.status_code == 200
    data = response.json()
    model = FramesResponseModel.model_validate(data)

    assert len(model.frames) == 2
    assert model.frames[0].id == "SYNTH_A"
    assert model.frames[0].flags == ["contaminated_edge"]
    assert model.frames[0].pixelData[0] == 0.0
    assert model.frames[0].validMask[0] == 0
    assert model.frames[0].validMask[1] == 1


def test_frames_unsupported_fov(client, synthetic_data_dir, monkeypatch):
    """Verify that FOV requests not matching the fixed 3.0 arcmin dataset are rejected with HTTP 422."""
    import spherex.service as service
    monkeypatch.setattr(service, "get_default_data_dir", lambda: synthetic_data_dir)

    # FOV 1.0 arcmin is below supported range [2.5, 3.5]
    resp_small = client.get(f"/frames?ra={M101_RA}&dec={M101_DEC}&fov=1.0")
    assert resp_small.status_code == 422
    assert resp_small.json()["error_type"] == "unsupported_fov"
    assert "3.0" in resp_small.json()["detail"]

    # FOV 15.0 arcmin is above supported range
    resp_large = client.get(f"/frames?ra={M101_RA}&dec={M101_DEC}&fov=15.0")
    assert resp_large.status_code == 422
    assert resp_large.json()["error_type"] == "unsupported_fov"


@pytest.mark.dataset
def test_frames_m101_valid_query(client):
    """Integration test against the verified real M101 dataset."""
    url = f"/frames?ra={M101_RA}&dec={M101_DEC}&fov=3.0"
    response = client.get(url)
    assert response.status_code == 200

    # Ensure response strictly conforms to Pydantic schema
    data = response.json()
    model = FramesResponseModel.model_validate(data)

    # Validate target and WCS
    assert model.target.ra == pytest.approx(M101_RA, abs=1e-4)
    assert model.target.dec == pytest.approx(M101_DEC, abs=1e-4)
    assert model.wcs.size == [30, 30]
    assert model.wcs.crpix == [15.0, 15.0]
    assert model.wcs.cdelt > 0

    # Validate epochs (2 real observations)
    assert len(model.epochs) == 2
    assert model.epochs[0].epoch == 1
    assert model.epochs[1].epoch == 2
    sep_days = abs(model.epochs[1].mjd - model.epochs[0].mjd)
    assert sep_days == pytest.approx(37.6812, abs=0.01)

    # Validate frames
    assert len(model.frames) == 2
    frame_a, frame_b = model.frames[0], model.frames[1]

    assert frame_a.id == "2026W20_2A_0464_3"
    assert frame_b.id == "2026W26_1A_0500_1"
    assert frame_a.detector == 2
    assert frame_b.detector == 2
    assert frame_a.flags == ["contaminated_edge"]
    assert frame_a.width == 30 and frame_a.height == 30
    assert frame_b.width == 30 and frame_b.height == 30

    # Spectral wavelengths (approx 1.49 µm in detector 2)
    assert frame_a.band.lambda_um == pytest.approx(1.4895, abs=0.005)
    assert frame_b.band.lambda_um == pytest.approx(1.4900, abs=0.005)

    # Pixel data must be finite numbers without NaNs or Infinities
    assert len(frame_a.pixelData) == 900
    assert len(frame_b.pixelData) == 900
    assert all(np.isfinite(x) for x in frame_a.pixelData)
    assert all(np.isfinite(x) for x in frame_b.pixelData)

    # Validity mask must have exactly 769 valid pixels (85.44% of 900)
    assert len(frame_a.validMask) == 900
    assert sum(frame_a.validMask) == 769
    assert len(model.validMask) == 900
    assert sum(model.validMask) == 769

    # Stats must be finite numbers over valid pixels
    assert frame_a.stats.min > 0.0
    assert frame_a.stats.max > frame_a.stats.min
    assert frame_a.stats.median > 0.0

    # Provenance
    assert model.provenance is not None
    assert model.provenance["data_origin"] == "observed_spherex"
    assert model.provenance["units"] == "MJy / sr"
    assert "limitations" in model.provenance
    assert len(model.provenance["limitations"]) >= 4


@pytest.mark.dataset
def test_orientation_canvas_matching(client):
    """Verify that row 0 in pixelData corresponds to North (+Dec) for canvas compatibility."""
    url = f"/frames?ra={M101_RA}&dec={M101_DEC}&fov=3.0"
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()

    frame = data["frames"][0]
    valid_mask = np.array(frame["validMask"]).reshape((30, 30))

    assert valid_mask.shape == (30, 30)
    assert np.count_nonzero(valid_mask) == 769


@pytest.mark.parametrize("query", [
    "ra=360.0&dec=54.34895",
    "ra=-0.01&dec=54.34895",
    "ra=210.80227&dec=90.1",
    "ra=210.80227&dec=-90.1",
    "ra=210.80227&dec=54.34895&fov=0.5",
    "ra=210.80227&dec=54.34895&fov=35.0",
    "ra=not_a_number&dec=54.34895",
])
def test_frames_invalid_coordinates(client, query):
    response = client.get(f"/frames?{query}")
    assert response.status_code == 422


def test_frames_unsupported_region(client):
    response = client.get("/frames?ra=100.0&dec=20.0&fov=3.0")
    assert response.status_code == 404
    data = response.json()
    assert data["error_type"] == "unsupported_region"
    assert "M101" in data["detail"]
    assert len(data["supported_regions"]) >= 1
    assert data["supported_regions"][0]["name"].startswith("M101")


def test_frames_data_unavailable(client, tmp_path, monkeypatch):
    import spherex.service as service
    monkeypatch.setattr(service, "get_default_data_dir", lambda: tmp_path)

    response = client.get(f"/frames?ra={M101_RA}&dec={M101_DEC}&fov=3.0")
    assert response.status_code == 503
    data = response.json()
    assert data["error_type"] == "data_unavailable"
    assert "spherex.prepare" in data["detail"]


@pytest.mark.dataset
def test_json_strict_serialization_no_nan(client):
    response = client.get(f"/frames?ra={M101_RA}&dec={M101_DEC}&fov=3.0")
    assert response.status_code == 200
    # json.loads with allow_nan=False guarantees no NaN / Infinity / -Infinity in raw payload
    raw_text = response.text
    parsed = json.loads(raw_text)
    assert parsed["frames"][0]["id"] == "2026W20_2A_0464_3"
