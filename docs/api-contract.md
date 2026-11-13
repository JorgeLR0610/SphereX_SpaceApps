# Frontend ↔ scientific API contract

This documents the scientific API contract implemented in Milestone M2 (`server/spherex/api.py`). Source of truth: `frontend/lib/types.ts`, `server/spherex/models.py`.

## Transport and routing
- FastAPI service runs locally on port 8000: `uv run --locked uvicorn spherex.api:app --port 8000`.
- Frontend uses `RealSpherexAPI` when `NEXT_PUBLIC_USE_REAL_API=true`.
- Endpoints:
  - `GET /health`: Health status, version, and confirmation of cached dataset.
  - `GET /frames?ra=<deg>&dec=<deg>&fov=<arcmin>`: Returns real, WCS-aligned observations.
  - `GET /spectrum` (M4): Not implemented yet. Returns 404/unavailable for real data.

### `GET /frames?ra=<deg>&dec=<deg>&fov=<arcmin>`
- `ra`: degrees, [0, 360); `dec`: degrees, [-90,90]; `fov`: requested field of view in arcminutes, range [1, 30].
- **Response Type:** `FramesResponse` compatible with `frontend/lib/types.ts`:
  - `target`: `Target` `{ra, dec, name, category, description}`
  - `wcs`: `WCS` `{crpix: [15, 15], crval: [210.80227, 54.34895], cdelt: 0.0017088, size: [30, 30]}`
  - `fovArcmin`: number (e.g. 3.0)
  - `epochs`: list of `{epoch, date, mjd}`
  - `frames`: list of `Frame`:
    - `id`: observation ID (e.g. `2026W20_2A_0464_3`)
    - `mjd`, `date`: UTC observation timestamps (from `MJD-OBS`/`DATE-OBS`)
    - `epochIndex`: integer (0, 1, ...)
    - `detector`: integer (1 to 6; M101 uses Detector 2)
    - `band`: `{lambda_um, width_um, detector, index}`
    - `flags`: `["clean"]`
    - `width`, `height`: 30, 30
    - `pixelData`: row-major numeric array (length 900) of surface brightness in `MJy / sr`. Invalid pixels are serialized as `0.0` (never `NaN` or `null`).
    - `validMask`: row-major binary array (length 900) where `1` = scientifically valid, `0` = excluded/masked.
    - `stats`: `{min, max, median, mean, std}` computed strictly over valid pixels.
    - `units`: `"MJy / sr"`
    - `provenance`: observation metadata and archive collection.
  - `validMask`: shared grid validity mask (769 valid pixels, 85.44%).
  - `provenance`: mission citation, observation IDs, time separation (37.68 days), matched spectral metrics, and scientific limitations.

### Orientation and Coordinates
- In astronomical FITS files (`aligned.fits`), row 0 is South (`CDELT2 > 0`, `origin='lower'`).
- In API JSON (`pixelData`), rows are serialized North-up (`np.flipud(fits_array)`), matching web canvas coordinates and `frontend/lib/wcs.ts` tangent projection (`y = 0` corresponds to North, `x = 0` corresponds to East).

### Errors and Data Safety
- HTTP 422: Parameter validation error (out-of-bounds coordinates, non-numeric values).
- HTTP 404: Region not supported in MVP (only verified M101 region is supported).
- HTTP 503: Data unavailable on server (e.g. cached FITS products not prepared on disk).

## Contract integration checklist
- [x] Backend implemented with FastAPI (`server/spherex/api.py`).
- [x] Shape/order/finite pixel values and NaN-free masking tested.
- [x] WCS orientation and alignment verified with known coordinates (row 0 = North).
- [x] Variable epochs supported (2 verified epochs for M101).
- [x] Response provenance, units, and validity masks included in schema.
- [ ] M3: Reverse proxy or CORS routing configured between Next.js and FastAPI.
- [ ] M3: Frontend adapter converts numeric array into `Float32Array`.
- [ ] M4: Spectrum unavailable behavior agreed / implemented.
