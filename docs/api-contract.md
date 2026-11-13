# Frontend ↔ scientific API contract (draft)

This documents **current frontend expectations**, not an existing functioning backend. Validate types with source before editing. Source of truth: `frontend/lib/types.ts`, `lib/apiAdapter.ts`, `store/useSpherexStore.ts`.

## Transport and routing
Frontend currently uses `new RealSpherexAPI('/api')`, enabled by `NEXT_PUBLIC_USE_REAL_API=true`. A FastAPI server could expose `/frames` and `/spectrum`; Next.js must proxy `/api/*` to it, **or** change adapter base URL explicitly. No proxy was present in the reviewed tree.

### `GET /api/frames?ra=<deg>&dec=<deg>&fov=<arcmin>`
- `ra`: degrees, [0, 360); `dec`: degrees, [-90,90]; `fov`: requested field of view, arcminutes, currently UI range [1,30]. Backend must validate bounds and cap downloads/computation.
- Current response type: `FramesResponse`: `target`, `wcs`, `fovArcmin`, `frames[]`, `epochs[]`, optional `detectiveTarget`.
- Each `Frame` has `id`, `mjd`, `date`, `epochIndex`, `detector`, `band` `{lambda_um,width_um,detector,index}`, `flags[]`, `width`, `height`, `pixelData`, optional target/variability fields and `stats` `{min,max,median,mean,std}`.
- `WCS`: `{crpix:[x,y], crval:[ra,dec], cdelt:<deg/pixel>, size:[width,height]}`.
- **Important:** server JSON should send `pixelData` as flat row-major numeric array (length width*height). `RealSpherexAPI.getFrames()` must convert it to `Float32Array`. Large data volume may warrant a versioned binary transport later.
- **Important:** actual astronomical WCS may include rotated/projection terms incompatible with scalar `cdelt`. Either reproject all images onto an accurately documented common grid representable by this contract, or agree on a new richer WCS schema and update UI coordinate transforms together. Do not drop transforms and pretend unchanged sky geometry.
- `epochs` and `frames` must represent **actual available observations**. The fake four-epoch/six-detector distribution is not guaranteed.
- Do not emit `movingTargetPixel` or `detectiveTarget` as though measured when those are derived from guesses/catalog predictions; identify provenance in an agreed schema extension.

### Example **shape only** (numbers are illustrative, NOT observed SPHEREx data)
```json
{
  "target": {"ra": 133.7951, "dec": -7.2451, "name": "Example target"},
  "wcs": {"crpix": [1,1], "crval": [133.7951,-7.2451], "cdelt": -0.0001, "size": [2,2]},
  "fovArcmin": 1,
  "epochs": [{"epoch": 0, "date": "EXAMPLE_TIMESTAMP_REPLACE_WITH_REAL", "mjd": 0}],
  "frames": [{
    "id": "EXAMPLE_NOT_REAL", "mjd": 0, "date": "EXAMPLE_TIMESTAMP_REPLACE_WITH_REAL",
    "epochIndex": 0, "detector": 1,
    "band": {"lambda_um": 1, "width_um": 0.01, "detector": 1, "index": 0},
    "flags": ["clean"], "width": 2, "height": 2,
    "pixelData": [1,2,3,4],
    "stats": {"min": 1, "max": 4, "median": 2.5, "mean": 2.5, "std": 1.118}
  }]
}
```
**Never use this example as actual sky data.** Proposed future extension: `provenance` with archive, collection, product IDs, URLs, units, processing and real/synthetic status. Frontend types must be extended in tandem.

### `GET /api/spectrum?ra=...&dec=...&fov=...&x=...&y=...`
- The current frontend expects `Spectrum` containing `ra`, `dec`, `pixel:{x,y}`, `points[]` with `lambda_um`, `flux`, `err`, `detector`, `bandIndex`; optional epoch series/features/object identification.
- A real spectrum cannot be synthesized from a single arbitrary broadband image. Identify compatible SPHEREx calibrated spectral data and validity/uncertainty first. Until implemented, return explicit unavailable/error response and have frontend show 'Not available for real data', not mock spectrum.

## Errors and data safety
- Define stable 400/422 for invalid requests, 404/204 or a documented empty result when no observations, 502/503 for upstream errors, with structured diagnostics; align with frontend handling.
- Timeout external requests, cap number and dimensions of images, control FITS caching and avoid accidental multi-GB JSON payloads.
- Distinguish real, synthetic and catalog-derived data in responses/UI. Preserve archive provenance even for cached images.

## Contract integration checklist
- [ ] Backend and frontend agree on endpoint routing.
- [ ] `Float32Array` conversion tested.
- [ ] Shape/order/finite pixel values and NaN/null masking tested.
- [ ] WCS orientation and alignment tested with known coordinates.
- [ ] Variable epochs/bands supported.
- [ ] Response provenance and UI labeling tested.
- [ ] Spectrum unavailable behavior agreed.
