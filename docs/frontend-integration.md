# SphereXTM frontend integration

## Source and strategy

Integrated selectively from `https://github.com/el-raton-vaquero/SphereXTM`,
commit **1c8b3486d8893c7438ffaa3545b4f60a018735c3** (Main).
Local source: `/home/jorge/spaceApps/pruebaSpaceApps/spherexproto`. Its origin
still names `el-raton-vaquero/pruebaSpaceApps`; `git ls-remote` verified that the
requested SphereXTM HEAD has the same hash. Primary baseline:
`f6d120466010a11a45929319efcfcf4788c64945` on **merge-repos**, the existing branch
explicitly chosen by the user instead of nonexistent `merge-repo`.

Both trees were clean. Common ancestor found in both histories:
`5c6dd090f9939f3b23de19feb3de16710e84a869`. Selective migration avoids conflicting
`spherexproto` → `frontend` renames and incompatible data-loading implementations.
No branch rewriting, destructive Git operations, remote changes or whole-tree
replacement. Source attribution is retained here and in adapted core modules.

## Final architecture

One Next.js app in `frontend/`, one scientific FastAPI app in `server/`.
`useSpherexStore` owns query, frames, spectrum and temporal state.
`useFrameData` is a store facade rather than a second fetch/cache owner.
`apiAdapter` chooses explicit URL origin (or environment/default real), validates
real payloads and converts pixels to Float32Array. One eight-entry dataset cache
uses origin, endpoint and unrounded query values. AbortController plus request
sequence numbers prevent stale frame results; spectra have separate sequence
protection. A new query clears old images before loading; failures never become
synthetic frames.

`renderEngine` adapts the teammate's averaging/difference code into a shared
rectangular-buffer processor, validity mask, median reference and color renderer.
The viewer and GIF exporter use this pipeline. The intersection of input masks
remains excluded; WCS coordinates and North-up API orientation are preserved.
Cortina uses first/last *available* epochs with their actual dates. Scientific
pixels are never interpolated between dates. Existing zoom and inspection remain.

## Adopted and adapted

- Teammate graphite/orange palette, serif headings and animated educational landing.
- `CelestialConeChart` and expanded cone panel: filtering, chart, hover, selection,
  nearby presets and recentering; source catalog code is carried over separately
  from SPHEREx data. Explicit simulated catalog checkbox, separate cache keys,
  no silent fallback. The external services are **not verified live** by this task.
- `SpectrumViewer`: interactive generated spectra/CSV in synthetic mode, reading
  store-owned spectra rather than doing a competing request. Real mode has no
  fabricated spectrum or 102-band extraction.
- `renderEngine`: dynamic dimensions, actual epochs, data-based intensity bounds,
  masks and median reference added; synthetic scale constants rejected.
- `exportUtils`: shared masked GIF processing and comparison card. Cards preserve
  aspect ratio and distinguish authentic comparison from educational simulation.
  Raw PNG/GIF filenames identify observed/simulation origin.
- `i18n`: source dictionary plus corrected scientific wording, Spanish default,
  language switch, English purpose, origin, primary modes and limitations.
- Curtain slider accessible by keyboard. Educational hunter annotates known
  generated positions; it is explicitly **not automatic source detection**.
- M3.5 hierarchy, inline guide, origin switch, large image, primary date/blink/diff,
  advanced disclosure, provenance, focus management and existing proxy retained.

The former second canvas/time state in page.tsx was removed. Educational targets
now enter the same store/viewer as real mode. Legacy target hashes/aliases map to
explicit synthetic targets; embed and query modes remain supported.

## Intentionally not migrated as scientific capabilities

The static manifest is target-description data, not acquired observations.
The source ingest script only writes target metadata and claims an IRSA origin;
it was not added as a scientific ingestion tool. Existing presets remain the
educational target source. No second `spherexproto` app was added.

Fixed four-epoch labels, assumed 256² buffers, synthetic intensity constants,
center-pixel spectrum requests and discovery claims were replaced. The source
`dev/cone-tests` page is not exposed as a production route. Existing unused legacy
components remain as source compatibility artifacts, not independent app routes.

## API and science

No backend code, FITS pipeline, dependency lock or HTTP schema changed. Next.js
still rewrites `/api/*` to `http://127.0.0.1:8000/*`.

Direct and proxied `/health` both reported `m101_cached: true`. Direct and proxied
`/frames?ra=210.80227&dec=54.34895&fov=3` returned:

- `2026W20_2A_0464_3`, 30×30, Detector 2.
- `2026W26_1A_0500_1`, 30×30, Detector 2.

These are the authentic May 17 / June 24 2026 observations, about 37.68 days apart
at approximately 1.49 µm. Comparison does not establish motion, variability or
Planet X; no background/PSF recalibration was introduced.

## Reproduction

From repository root, in separate terminals:

```sh
cd server
uv sync --locked
uv run --locked python -m spherex.prepare --output outputs/m101 --offline
uv run --locked uvicorn spherex.api:app --host 127.0.0.1 --port 8000
```

Offline preparation requires existing hash-verified original cutouts and archive
responses. On a fresh clone, omit `--offline` to acquire data using the bounded
scientific pipeline; network failure remains explicit. Large FITS data are not
committed. Consult `server/README.md` for preparation details.

```sh
cd frontend
npm ci
npm run build
npm run start
```

Open `http://localhost:3000/?api=real` or `?api=mock`; append `&lang=en` for English
primary controls. `npm run dev` is available for development; do not run a build
concurrently against the same `.next` directory.

## Verification executed

- `npm ci`: successful, 364 packages installed.
- `uv sync --locked`: successful; scientific suite: **47 passed**, one existing
  Starlette/httpx deprecation warning. Includes unavailable-data 503 tests.
- `npx tsc --noEmit`: successful.
- `npm run lint`: no errors; existing custom-font warning.
- `npm run build`: successful production build and types.
- `node frontend/scripts/test-integration.cjs`: rectangular buffers, difference
  sign, median, mask, curtain endpoint, exact query cache keys, malformed payload,
  cancellation, out-of-order frame results and real/mock isolation pass.
- `cd server && uv run --locked python scripts/test_frontend_integration.py` with
  production Next.js and FastAPI running: authentic M101, synthetic mode, blink,
  pause, difference, masks, curtain, synthetic spectrum, cone chart using explicit
  simulation, PNG/GIF downloads, help/Escape, unsupported real region and synthetic
  embed. Checks runtime errors and console.error before expected error scenario.
- Browser at 1440×900 and 390×844: no horizontal overflow. Captures:
  `assets/integration-{real,mock}-{desktop,mobile}.png`.

Initial lint found inherited source typing/effect errors; these were corrected.
The sandbox build could not parse TypeScript child output; the approved build
outside the sandbox succeeded. A final browser run passed its checks but hit a Chromium-profile cleanup race;
the harness was updated to terminate its isolated browser process group.
No successful live catalog verification is claimed.

## Remaining limitations

Advanced tools and some contextual labels remain Spanish in English mode; the
language switch covers primary workflow and educational landing. No formal
screen-reader audit or first-visitor usability study was performed. Real catalog
endpoints may be unavailable due to CORS/network restrictions; this does not
change SPHEREx frame origin. The hunter is a generated-position teaching aid,
not new source analysis. Mobile controls require scrolling. Calibrated real
spectra, measured motion, arbitrary real fields and precision photometry remain
out of scope.
