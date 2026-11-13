# Agent instructions — SPHEREx Time Machine

## Mission
Build an accessible, scientifically honest time-domain viewer of NASA SPHEREx observations for NASA Space Apps Challenge 2026, challenge **Planet X and SPHEREx**. The critical deliverable is a demonstrable comparison of **real, appropriately matched SPHEREx observations at different times**, not a claim to have discovered Planet X.

Repository: https://github.com/el-raton-vaquero/pruebaSpaceApps

## Required onboarding (read in order)
1. `docs/current-state.md` — verified code status, gaps, and constraints.
2. `docs/implementation-plan.md` — prioritized tasks and acceptance criteria.
3. `docs/api-contract.md` — frontend/backend integration contract.
4. `docs/scientific-integrity.md` — mandatory data provenance and image-processing rules.
5. The relevant source files before making changes. Do not treat these notes as a substitute for code inspection.

These files describe a snapshot reviewed **2026-11-12**. At the start of each session, check the current tree, Git status, latest changes, installed dependencies, and whether documentation has become outdated. Update `docs/current-state.md` when behavior or milestones change.

## Architecture and ownership
- **Monorepo is the intended direction**, not an already completed migration.
- Existing Next.js application: `frontend/` (Next.js App Router / TypeScript).
- Intended scientific service: `server/` (Python / FastAPI / Astropy / NumPy / PyVO).
- Next.js is primarily responsible for UI, controls, visualization, and interaction. The Python service is responsible for observation discovery, FITS handling, WCS-aware processing, metadata and scientific outputs.
- Preserve the existing working mock/demo mode while adding real-data support. Never silently mix synthetic and real observations.
- `frontend/AGENTS.md` already exists and contains Next.js-version-specific instructions (including reading version-local docs in `node_modules/next/dist/docs/`). **Keep that file, and follow it for work under `frontend/`.** Do not replace or remove its generated rules.
- Do not refactor unrelated frontend features just to integrate the backend. Coordinate interface changes through `docs/api-contract.md` and minimize merge conflicts.

## Working principles
1. **Verify rather than assume**: inspect file contents, package versions, IRSA documentation, and actual data availability. Do not invent API parameters, collection names, data availability, observing dates, spectra, discoveries, citations, or test results.
2. **Scientific accuracy over spectacle**: real FITS metadata and WCS must drive displayed observation dates, coordinates, wavelengths and spatial alignment. Distinguish measured motion from catalog-predicted overlays.
3. **Small, testable vertical slices**: first fetch metadata, then one real FITS cutout, then two comparable time-separated observations, then the HTTP endpoint, then frontend integration. Favor a reliable showcase over ML or large-scale pipelines.
4. **Careful data handling**: bound spatial query sizes, number of returned frames and downloads, request timeouts, cache sizes, and memory usage. Do not commit large FITS datasets, generated caches, credentials, or private tokens.
5. **Explicit provenance**: every real-data response and demo should make its data source identifiable. A synthetic fallback must be visibly labeled as such; never substitute mock data on an IRSA error without informing the user.
6. **Engineering hygiene**: add tests for key transformations and contracts; run relevant checks; describe commands, results, limitations and outstanding questions in the final report. Do not claim success for unrun checks.
7. **Parallel work**: make focused commits/PRs, avoid editing teammate-owned UI unless required, and document any interface/proxy changes for the frontend contributor.

## First recommended action
Investigate NASA/IPAC IRSA SPHEREx archive data access and produce a reproducible Python spike that (a) queries a region, (b) downloads and reads a real FITS product/cutout, and (c) tests whether two observations exist that can be compared at separate times and compatible wavelengths. Record the actual archive query, source identifiers, dates, WCS, processing assumptions, and any blockers. **Do not implement `/api/frames` against invented data before that feasibility check.**

## Local commands (reviewed snapshot)
```bash
cd frontend
npm ci
npm run dev
npm run lint
npm run build
```
The scientific service commands do not exist yet. Document exact setup, run, and test commands in `server/`'s README; prefer a Python virtual environment and reproducible pinned dependencies via uv package manager (already initiated).

## When accepting a task
- Restate the requested outcome, affected paths, and how success will be tested in a short plan.
- Inspect existing code and `docs/` first; preserve backwards compatibility when practical.
- If changing JSON contract, coordinate frontend conversion of `pixelData` (the TypeScript `Float32Array` is not directly transmitted in ordinary JSON) and the simplified WCS shape.
- If an endpoint cannot return scientifically valid data, return a transparent error/unavailable status; do not fabricate a result.
- Record evidence: examples of archive queries, response samples, observation IDs, file headers, tests, and commands where feasible.

## Scope exclusions until core real-data demo works
No mandatory ML classification, blind Planet X detection, arbitrary all-sky search at scale, user accounts, database clusters, elaborate cloud infrastructure, or unverified claims of astronomical discovery.

## Primary references
- Challenge: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=details
- SPHEREx archive: https://irsa.ipac.caltech.edu/Missions/spherex.html
- Official SPHEREx data-access documentation: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/
- SPHEREx data-products documentation: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/
