# Implementation plan / prioritized backlog

Deadline context: NASA Space Apps Challenge 2026 weekend, November 14–15, as
recorded in the original planning notes (challenge page was not independently
retrievable during M1). Prioritize demonstrated science and stable integration.
M1 execution evidence was added 2026-11-13 UTC; later milestones remain proposed.

## M1 — IRSA data feasibility (highest priority)
- [x] Review the official archive's current datasets, query API, product types, licenses/citation and cutout method. Official acknowledgement recorded; separate FITS redistribution license not established.
- [x] Build a reproducible Python script/notebook that queries one small sky region (start from WISE 0855 coordinates RA 133.7951°, Dec −7.2451° only as a candidate, **not a guaranteed detectable target**).
- [x] Download at least one **real SPHEREx FITS** product/cutout and inspect image arrays, headers, units, WCS, time, wavelength, quality metadata.
- [x] Find a second time-separated observation of the *same sky footprint* in a comparable spectral band, or document that no suitable pair is available and test another field. WISE-field sample did not meet coverage threshold; M101 passed.
- [x] Produce an aligned, side-by-side or blink comparison **from measured data**. Verify orientation, footprint, background and whether movement is observable at actual angular resolution. M101 is a static-field visualization, not measured motion; approximate WCS-WAVE and PSF/background limitations remain explicit.
- [x] Record archive source URLs, product IDs, MJD/UTC dates, wavelengths, processing decisions, actual commands and limitations in `docs/data-validation.md`.

**Definition of done:** two traceable, real, compatible observations displayed and compared, or a reproducible negative result with next best candidate. No invented observation metadata.

**M1 result:** established at visualization level using M101 QR3 observations
37.681 days apart, 85.444% common valid/spectrally matched grid coverage; 25 offline
tests pass. See `docs/data-validation.md` for provenance, negative runs and the
derived comparison. Precision CWAVE/CBAND spectral validation, PSF matching,
photometry and motion detection are **not** completed by this milestone.

## M2 — Minimal scientific API
- [x] Add the minimal scientific service package under `server/` (the M1 venv,
      dependency lock, setup instructions and offline tests already exist).
- [x] Implement bounded, timeout-aware IRSA discovery/download service with local caching (`spherex.archive`).
- [x] Implement FITS parser and WCS-aware cutout/reprojection; don't silently flip astronomical axes (`spherex.fits`, `spherex.alignment`).
- [x] Implement `GET /frames` matching the documented frontend contract, returning a scientifically valid subset (2 frames is enough).
- [x] Include real source identity, dates, spectral descriptors, image dimensions, masks/quality where available, and errors for unsupported queries.
- [x] Test JSON schemas, WCS normalization, pixel matrix shape/order, parameter bounds, no-results and remote-errors cases.

**Definition of done:** `/frames` serves real measurements with reproducible metadata, responds safely to bad/empty requests and is tested.

**M2 result:** Completed. Modular scientific package under `server/spherex/` implemented with FastAPI application (`spherex.api:app`). Endpoints `/health` and `GET /frames` return the two verified M101 observations (`2026W20_2A_0464_3` and `2026W26_1A_0500_1`, 37.68 days apart) on a 30×30 ICRS TAN grid. Returned arrays have correct orientation matching `frontend/lib/wcs.ts` (row 0 = North), masked non-finite pixels are zeroed with an explicit binary `validMask` (769 valid pixels, 85.44%), and provenance is preserved. 44 automated tests pass in pytest (`test_api.py`, `test_modules.py`, and `test_data_validation.py`). Ready for M3 frontend integration.

## M3 — Connect Next.js
- [x] Add a documented reverse proxy/rewrite or configurable API URL for `/api/*`. Prefer relative same-origin calls to avoid CORS surprises.
- [x] Make `RealSpherexAPI` deserialize numeric `pixelData` into `Float32Array` (or agree on a binary alternative explicitly).
- [x] Verify loading/error/empty states; never fall back to synthetic frames without an explicit visible choice.
- [x] Handle variable actual number of epochs/bands (not fixed four epochs x six detectors).
- [x] Run Next.js lint/build and test browser with real backend. Inspect image orientation/scale and blink results.

**Definition of done:** a user can select a proven sky region and compare real observations in the existing viewer, clearly labeled as real SPHEREx data.

**M3 result:** Completed and verified.
1. `next.config.ts` rewrite proxy forwards `/api/:path*` to `http://127.0.0.1:8000/:path*` seamlessly without CORS headers.
2. `RealSpherexAPI` in `frontend/lib/apiAdapter.ts` converts numeric array `pixelData` into `Float32Array` in place.
3. Supported dynamic epoch count (2 epochs for M101: `2026W20_2A_0464_3` and `2026W26_1A_0500_1`, separated by 37.68 days), dynamic blink mode (`1 ↔ 2`), and dynamic frame dimensions (30×30) with `[image-rendering:pixelated]`.
4. Quality mask (`validMask === 0`) rendered in muted slate blue `#2b3d5b` (RGB 43, 61, 91), preventing misleading dark/zero flux.
5. Inactive detectors (1, 3, 4, 5, 6) disabled and dimmed; only Detector 2 (1.49 µm) enabled.
6. Authentic metadata displayed (dates, MJD, wavelengths, detector, and IRSA provenance); unmeasured detective missions disabled on real data; single-band Level 2 status and M5 spectral cube deferral clearly explained.
7. Visual badge `🔭 DATOS REALES SPHEREx` dynamically distinguishes real observations from `🧪 MODO DEMO`.
8. 47 backend tests pass (`cd server && uv run --locked pytest -v`); Next.js dev and production build succeed with 0 errors; headless Chromium E2E browser tests pass and screenshots captured in `docs/assets/m3-e2e-m101-observatory.png` and `docs/assets/m3-e2e-synthetic-mode.png`.

## M3.5 — UX/UI simplification
- [x] Central viewer, concise Spanish explanation, dates/Blink/Difference primary.
- [x] Advanced tools collapsed; unsupported real tools hidden, simulation separate.
- [x] Real M101 default, URL modes and backend contract preserved.
- [x] Lint/build, 47 backend tests, real/synthetic Chromium desktop/mobile checks.

Evidence and limitations: `docs/ux-redesign.md`, `docs/assets/ux-*.png`.

## M4 — Post-Integration: Catalog Overlays & Time-Domain Analysis
*Based on official resource review in `docs/official-resources-review.md` (WiseView UX & Gaia DR3).*
- [ ] Implement Gaia DR3 / CatWISE2020 TAP cone search for real astrometric reference sources.
- [ ] Implement epoch-aware proper motion propagation: $\Delta t = t_{\text{SPHEREx}} - 2016.0$ to project catalog coordinates onto the observation epoch.
- [ ] Add WiseView-inspired blink animation controls (adjustable blink rate, epoch state badges `+`/`-`/`.`, loop restart indicator).
- [ ] Implement symmetrical difference image mode ($I(t_2) - I(t_1)$) with display stretch centered at zero.
- [ ] Ensure strict Category 2 labeling on all catalog overlays (`Gaia DR3 (J2016.0) → Predicted (t)`), never claiming detected SPHEREx tracks.

## M5 — Spectrophotometry & Calibrated Spectral Extraction
*Based on official SPHEREx Source Discovery Tool (SDT) workflows.*
- [ ] Implement local background annulus and zodiacal light subtraction based on the SDT method.
- [ ] Calibrated spectral extraction across available multi-detector channels ($0.75 - 5.0\,\mu\text{m}$) with photometric uncertainties.
- [ ] Disable or visibly label uncalibrated single-band mock spectra as "Not available for real data" until full spectral pipeline is ready.
- [ ] Guided tour targets, performance optimizations, and project submission documentation.

## Recommended agent work division
- **Science/data agent:** M1, WCS/metadata, reproducibility and scientific integrity.
- **API agent:** M2 service and tests, after validating data access.
- **UI agent:** M3 frontend adapter/proxy, error handling and accurate labels.
- **Reviewer/integration agent:** API contracts, tests, provenance, performance and demo verification.

Avoid parallel edits to `frontend/lib/apiAdapter.ts`, `lib/types.ts` and `store/useSpherexStore.ts` without an agreed owner. Have each contributor report paths touched and verified commands.
