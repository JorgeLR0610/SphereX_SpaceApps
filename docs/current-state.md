# Project current state

**Snapshot date:** 2026-11-13 UTC (session started with stated date 2026-11-12).

**Source:** local checkout of `el-raton-vaquero/pruebaSpaceApps`, baseline commit `c92b686`, plus the M1 changes accompanying this report.

**Verification level:** source inspection, installed/locked Python dependencies, offline tests, live IRSA queries/downloads, FITS inspection, rendered comparison, verified FastAPI endpoints (`/health` and `GET /frames`), Next.js `/api/*` rewrite proxy, Turbopack build/lint, and authentic headless Chromium E2E browser testing verifying real SPHEREx QR3 M101 observation playback and synthetic demo mode.

## Project goal
NASA Space Apps Challenge 2026, challenge *Planet X and SPHEREx*: help people explore SPHEREx infrared sky observations over time and visually identify interesting apparent changes/moving objects. The MVP should compare genuine SPHEREx observations in one sky region, on different dates, ideally using comparable spectral bands, with clear provenance. Discovery of a new planet is neither assumed nor required for the proposed engineering plan.

## Repository layout — observed
- `frontend/SPHEREx Time Machine (versión simplificada).html` — separate standalone simulated demo.
- `frontend/` — Next.js application (package lists `next@16.4.6`, React `19.3.0`, TypeScript).
- `frontend/app/page.tsx`, `components/*` — rich viewer, header/search, temporal controls, frame viewer, spectra, guided tour, map/context, etc.
- `frontend/store/useSpherexStore.ts` — UI state, frame fetch, spectrum fetch, modes, selection and playback.
- `frontend/lib/mockData.ts` — **synthetic** epochs/frames/pixel data and spectral values.
- `frontend/lib/apiAdapter.ts` — `MockSpherexAPI` (default) and `RealSpherexAPI` (HTTP client).
- `frontend/lib/types.ts` — shared frontend types and request/response structures.
- `frontend/lib/coneSearch.ts` — mocked local catalog and additional cone-search logic; review before claiming a real catalog result.
- `frontend/AGENTS.md` — existing Next.js generated agent rules. Preserve it.
- `frontend/README.md` — mostly create-next-app starter text.
- `server/` — scientific service package (`server/spherex/`) and FastAPI application (`spherex.api:app`).
- `server/spherex/` — modular packages for `archive`, `fits`, `alignment`, `models`, `service`, `prepare`, and `api`.
- `server/scripts/validate_irsa.py`, `server/tests/` — standalone CLI (delegating to `spherex.*`), 44 automated tests across `test_data_validation.py`, `test_modules.py`, and `test_api.py`.
- `docs/data-validation.md` — executed queries, real FITS provenance, accepted
  M101 pair, negative WISE-field result, method and limitations.
- `docs/assets/m1-m101-comparison.png` — small measured-data comparison; bulk FITS,
  downloaded caches and generated local outputs are ignored, not committed.

## Behavior confirmed by reading source
- `NEXT_PUBLIC_USE_REAL_API=true` switches the adapter from mock to HTTP mode; without it, the frontend uses synthetic data.
- Real API client defaults to relative base `/api`, requesting `GET /api/frames?ra=...&dec=...&fov=...` and `GET /api/spectrum?ra=...&dec=...&fov=...&x=...&y=...`.
- Mock frames currently mimic **four epochs x six detectors** (24 frames), with fake observation dates (including future 2026-12), moving objects, wavelengths, flags, and noise. These are demonstration outputs, **not SPHEREx measurements**.
- `Frame.pixelData` is a browser `Float32Array`; raw JSON array conversion is required for a simple HTTP contract.
- The WCS TypeScript type is simplified (`crpix`, `crval`, scalar `cdelt`, `size`). Real FITS WCS may require rotation/projection and reprojection onto a common output grid.
- The frontend viewer supports sophisticated controls, but scientific validity and actual operation with real observations are **unverified**.
- Cone search has a SIMBAD HTTP branch and automatic mock fallback; it is not
  SPHEREx observation discovery. Its live operation was not tested in this task.

## M1 behavior verified by execution
- Official current releases are DR1 + QR3. SIA2 discovery and IBE cutout downloads
  work; QR2 is superseded. Spectral wavelength varies within each detector.
- WISE candidate field (RA 133.7951°, Dec −7.2451°): DR1 258 rows, QR3 zero,
  45 detector-6 candidates. A 24-product sample yielded a closely wavelength-
  matched 370.396-day pair, but only 78.667% common valid coverage after padded
  download/reprojection, below the unchanged 80% acceptance threshold.
- M101 (RA 210.80227°, Dec 54.34895°): DR1 249 rows, QR3 130, 84 detector-2
  candidates. A 24-product sample yielded QR3 observations `2026W20_2A_0464_3`
  and `2026W26_1A_0500_1`, **37.681 days apart**, at approximate local wavelengths
  **1.489543 / 1.489986 µm**. Their 30×30 common-grid comparison retained
  **85.444%** valid, wavelength-matched pixels and was visually inspected.
- `DATE-OBS`/`MJD-OBS` are checked against discovery metadata; `DATE` is HDU
  creation time. Celestial TAN-SIP WCS is preserved; spectral WCS uses its lookup
  table without SIP. Quality flags, variance, ZODI, ePSF and units were inspected.
- `uv sync --locked` passed; `uv run --locked pytest -q` passed **25 tests**, no warnings.
  M101 live execution and cached replay returned exit 0; WISE runs returned
  explicit negative status (exit 2). Transient cutout HTTP 503s were recorded and
  recovered on a later run. No synthetic archive fallback was used.
- A subsequent live request failed with `Network is unreachable`. Explicit
  `--offline` replay of saved responses/hash-verified real cutouts reproduced
  both results. This mode is labelled and never silently substitutes data.
  Completed-run manifests are retained alongside the latest result.
- This establishes a **visualization-level** real-data comparison, not precision
  spectral equivalence, photometry, object identification, motion or discovery.

## Known gaps / integration risks
1. Precision quantitative processing remains unvalidated: current wavelength
   matching uses approximate visualization WCS-WAVE, not calibrated CWAVE/CBAND.
2. No validated moving-object detection/showcase. M101 demonstrates a matched
   static field; the initial WISE field did not pass the chosen coverage threshold.
3. No scientific API server or Next.js reverse proxy configured to route `/api/*` to Python.
4. No production-real `FramesResponse` compatible with current `lib/types.ts`.
5. No validated spectrum extraction. A plotted synthetic spectrum must not be presented as observed data.
6. Epoch count, detector count, spatial resolution and coverage cannot be hardcoded from the mock when using real products.
7. Scientific noise, masks/quality flags, FITS units, WCS transforms and alignment require explicit handling.
8. Real-data latency, offline fallback, file sizes and request failure states require UI treatment.
9. Standardized backend tests, reproducible scientific dataset fixture and deployed full-stack demo are not yet evidenced.
10. A separate FITS-data redistribution license was not established; the official
    acknowledgement is documented. Do not assume the documentation site's BSD
    license applies to data. No bulk FITS data are included.

Installed locally for M1: Python 3.14.10 / uv 0.13.5, Astropy 8.0.2, NumPy 2.5.4,
Matplotlib 3.11.2, Reproject 0.21.0 and pytest 9.2.0 in `server/.venv`. Frontend
`node_modules` was absent at inspection and was not installed or modified.

## Decisions agreed / proposed
- **Agreed in discussion:** move toward a monorepo; preserve existing Next.js frontend, add independent scientific backend.
- **Partially implemented:** Python + Astropy + NumPy + Reproject feasibility
  script, using direct bounded SIA2 HTTP queries. FastAPI and service modules
  remain M2; PyVO/astroquery are not needed by the current spike.
- **Recommended:** real image acquisition and validation first, API and frontend integration second, real spectrum and automated detection only if time remains.
- **Non-goal:** suggesting Planet X has been found; showing simulated or catalog-predicted motion without a visible label.

## Current milestone
**M0: Frontend simulation prototype exists. M1: Real-data visualization feasibility
established for M101; WISE-field negative result documented. M2: Minimal scientific
API implemented and verified with FastAPI (`/health` and `GET /frames`). M3: Full Next.js ↔ FastAPI integration COMPLETED and VERIFIED. 47 backend tests pass; frontend lints cleanly; Next.js builds successfully; headless Chromium E2E browser tests pass with authentic screenshots captured.**

Next work is M4 (Scientific Polish & Honest Moving Target Demonstration) and M5 (Calibrated WCS/Wavelengths & Real Spectral Extraction).
See `docs/data-validation.md` and `server/README.md` for exact tested commands.
