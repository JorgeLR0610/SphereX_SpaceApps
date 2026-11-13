# Project current state

**Snapshot date:** 2026-11-12  
**Source:** `el-raton-vaquero/pruebaSpaceApps`, default branch `Main`, inspected via GitHub source/tree.  
**Verification level:** source inspection only — **the application, live IRSA requests, npm build, tests and Python backend were not executed**.

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

## Behavior confirmed by reading source
- `NEXT_PUBLIC_USE_REAL_API=true` switches the adapter from mock to HTTP mode; without it, the frontend uses synthetic data.
- Real API client defaults to relative base `/api`, requesting `GET /api/frames?ra=...&dec=...&fov=...` and `GET /api/spectrum?ra=...&dec=...&fov=...&x=...&y=...`.
- Mock frames currently mimic **four epochs x six detectors** (24 frames), with fake observation dates (including future 2026-12), moving objects, wavelengths, flags, and noise. These are demonstration outputs, **not SPHEREx measurements**.
- `Frame.pixelData` is a browser `Float32Array`; raw JSON array conversion is required for a simple HTTP contract.
- The WCS TypeScript type is simplified (`crpix`, `crval`, scalar `cdelt`, `size`). Real FITS WCS may require rotation/projection and reprojection onto a common output grid.
- The frontend viewer supports sophisticated controls, but scientific validity and actual operation with real observations are **unverified**.

## Known gaps / integration risks
1. No validated live SPHEREx download and FITS parsing workflow.
2. No verified pair of images taken on different dates with sufficiently comparable footprint and wavelength for a meaningful side-by-side/blink.
3. No scientific API server or Next.js reverse proxy configured to route `/api/*` to Python.
4. No production-real `FramesResponse` compatible with current `lib/types.ts`.
5. No validated spectrum extraction. A plotted synthetic spectrum must not be presented as observed data.
6. Epoch count, detector count, spatial resolution and coverage cannot be hardcoded from the mock when using real products.
7. Scientific noise, masks/quality flags, FITS units, WCS transforms and alignment require explicit handling.
8. Real-data latency, offline fallback, file sizes and request failure states require UI treatment.
9. Standardized backend tests, reproducible scientific dataset fixture and deployed full-stack demo are not yet evidenced.

## Decisions agreed / proposed
- **Agreed in discussion:** move toward a monorepo; preserve existing Next.js frontend, add independent scientific backend.
- **Recommended (not yet implemented):** Python + FastAPI + Astropy + NumPy + PyVO/astroquery; fit testable IRSA fetching, FITS reading and reprojection into small modules.
- **Recommended:** real image acquisition and validation first, API and frontend integration second, real spectrum and automated detection only if time remains.
- **Non-goal:** suggesting Planet X has been found; showing simulated or catalog-predicted motion without a visible label.

## Current milestone
**M0: Frontend simulation prototype exists. M1: Real SPHEREx data feasibility not established.**

Next agent should pursue `docs/implementation-plan.md` M1 and update this status with objective evidence. When the repo changes, update this page with date, commit SHA, new milestones and exact tested commands. Avoid marking unverified tasks complete.
