# SPHEREx Scientific Service & Archive Tools

This package provides the scientific processing and minimal HTTP API (Milestone M2) for the SPHEREx Time Machine project (NASA Space Apps Challenge 2026, *Planet X and SPHEREx*).

It serves real, WCS-aligned Level 2 SPHEREx spectral-image observations from NASA/IPAC IRSA, preserving astronomical units, detector information, observation dates, validity quality masks, and provenance. It never substitutes synthetic data for real requests.

---

## Quickstart

From the `server/` directory, using [uv](https://docs.astral.sh/uv/) and Python ≥3.14:

```bash
cd server
uv sync --locked
uv run --locked pytest -v
```

### 1. Start the Scientific API (FastAPI)

```bash
uv run --locked uvicorn spherex.api:app --host 0.0.0.0 --port 8000
```

With auto-reload for local development:

```bash
uv run --locked uvicorn spherex.api:app --reload --port 8000
```

### 2. Endpoints

- **`GET /health`**: Service status, version, and confirmation of cached scientific products.
  ```bash
  curl -s http://127.0.0.1:8000/health
  ```
- **`GET /frames?ra=<deg>&dec=<deg>&fov=<arcmin>`**: Retrieve WCS-aligned real observation frames.
  ```bash
  # Query verified M101 observation pair (Detector 2, ~1.49 µm, 37.68 days apart)
  curl -s "http://127.0.0.1:8000/frames?ra=210.80227&dec=54.34895&fov=3.0"
  ```

---

## Package Architecture (`spherex/`)

- **`spherex.archive`**: SIA2 discovery queries, IBE cutout URL formulation, bounded HTTP retrieval with socket/read timeouts, and SHA-256 verified caching.
- **`spherex.fits`**: FITS header inspection, quality flag bitmap decoding (`MSKN*`), UTC/MJD timestamp verification (`DATE-OBS` vs `DATE` HDU creation), and `Observation` dataclass.
- **`spherex.alignment`**: WCS TAN-SIP handling, common-grid reprojection (`reproject_interp`), approximate wavelength matching (WCS-WAVE), validity mask intersections, and FITS/PNG export.
- **`spherex.models`**: Pydantic schemas corresponding to `frontend/lib/types.ts` (`FramesResponseModel`, `FrameModel`, `WCSModel`, `BandInfoModel`, `FrameStatsModel`, `TargetModel`).
- **`spherex.service`**: Region proximity matching, data loading from cached `aligned.fits` and `manifest.json`, coordinate orientation transformation (`np.flipud`), and error handling (`UnsupportedRegionError`, `DataUnavailableError`).
- **`spherex.api`**: FastAPI application with CORS middleware, structured error responses, and endpoints.
- **`spherex.prepare`**: Reproducible data preparation CLI.
- **`scripts/validate_irsa.py`**: Standalone M1 validation CLI, refactored to delegate to `spherex.*` while maintaining 100% backward compatibility for existing scripts and tests.

---

## Reproducible Data Preparation

To prepare or verify the validated M101 observation dataset:

```bash
# Verify existing cache (or prepare from scratch)
uv run --locked python -m spherex.prepare --output outputs/m101

# Replay offline without network access using verified local cutouts & discovery XML
uv run --locked python -m spherex.prepare --output outputs/m101 --offline

# Force re-running pipeline
uv run --locked python -m spherex.prepare --output outputs/m101 --force
```

Alternatively, invoke the standalone CLI:

```bash
uv run --locked python scripts/validate_irsa.py \
  --ra 210.80227 --dec 54.34895 --detector 2 --output outputs/m101
```

---

## Testing

Run all unit tests and integration tests:

```bash
uv run --locked pytest -v
```

The test suite covers:
- `tests/test_api.py`: FastAPI endpoints (`/health`, `/frames`), Pydantic validation, 422 on invalid coordinates, 404 on unsupported regions, 503 on missing data, array serialization, and canvas orientation.
- `tests/test_modules.py`: Unit tests for `archive`, `fits`, and `alignment` functions.
- `tests/test_data_validation.py`: The original 25 M1 verification tests for bounds, quality bitmasks, timestamps, WCS geometry, and reprojection.

---

## Orientation & Serialization

- **On disk (`aligned.fits`)**: Follows standard astronomical FITS conventions (row 0 is South, `CDELT2 > 0`, `origin='lower'`).
- **In API JSON (`pixelData`)**: Formatted for web canvas and `frontend/lib/wcs.ts` (row 0 is North/top, column 0 is East/left, `np.flipud(fits_array)`). Non-finite values (`NaN`) are set to `0.0` with a matching `1`/`0` binary `validMask` so standard JSON parsers and browser `Float32Array` buffers operate without errors.
- **Display units**: Calibrated surface brightness in `MJy / sr`.

---

## Scientific Limitations

1. **WCS-WAVE Solution**: Uses the archive's approximate visualization wavelength solution, not precision CWAVE/CBAND calibration.
2. **Static Field Visualization**: The M101 demonstration showcases two spectrally compatible, time-separated epochs of an extended galaxy; it is not a claim of moving-object detection, variability discovery, or Planet X.
3. **Background & Noise**: Science images include zodiacal light; no background model subtraction or PSF homogenization is performed.
