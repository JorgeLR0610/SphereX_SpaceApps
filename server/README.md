# SPHEREx M1 — IRSA feasibility experiment

This is a small command-line science spike, **not a FastAPI backend**. It queries
IRSA for real DR1/QR3 spectral images, downloads bounded cutouts, inspects their
metadata, and attempts a wavelength-compatible, time-separated comparison.
It never substitutes synthetic data on an archive error. No frontend changes
or `/frames` endpoint are included.

## Reproduce

From the repository root, with [uv](https://docs.astral.sh/uv/) and Python 3.14:

```bash
cd server
uv sync --locked
uv run --locked pytest -q
uv run --locked python scripts/validate_irsa.py \
  --ra 210.80227 --dec 54.34895 --detector 2 --output outputs/m101
```

The existing project's Python ≥3.14 requirement is retained. `uv.lock` records
the resolved dependencies; use `--locked` to avoid an implicit lockfile update.
Internet access is needed for installation and the live experiment, not unit tests.

Defaults: ICRS RA 133.7951°, Dec −7.2451° (candidate field near WISE 0855, **not a
verified detection**), detector 6, 3 arcmin comparison grid, minimum 30 days
between observations. Full options:

```bash
uv run --locked python scripts/validate_irsa.py --help
```

After a successful online run has saved discovery responses and real cutouts,
explicitly replay them without network access:

```bash
uv run --locked python scripts/validate_irsa.py \
  --ra 210.80227 --dec 54.34895 --detector 2 --offline --output outputs/m101
```

Offline mode never makes requests and never fabricates missing data. It checks
cutout hashes and discovery sidecars when present. For responses saved by the
initial spike before discovery sidecars existed, actual query URL and retrieval
time are recorded as unknown (`null`), not guessed. The expected query from the
current parameters is separate; the original run's report retains its provenance.

If the bounded sample does not yield a suitable pair, test the official tutorial
field M101, rather than declaring that the archive has no comparable images.
The command above uses this **verified positive** field. To repeat the original
WISE-field negative experiment:

```bash
uv run --locked python scripts/validate_irsa.py --output outputs/wise0855-padded
```

## Outputs and interpretation

- `manifest.json`: actual command, environment, query URLs/statuses, retrieval
  times, hashes, rejected downloads, metadata, pair-selection attempts, limitations.
- `runs/*.json`: completed run history, retained even if a later request fails.
- `spherex_dr1.xml`, `spherex_qr3.xml`: raw discovery responses.
- `<URL-hash>.fits` and `.json`: original cutouts and provenance sidecars.
- On success, `aligned.fits`: two common-grid science images plus shared validity
  mask; `comparison.png`: measured images with a shared percentile display scale.

Exit **0** means a visualization pair passed the stated checks. Exit **2** means
either `no_suitable_pair_in_bounded_sample` or `blocked`; inspect the manifest.
A negative sampled result is **not** proof that no pair exists. Query overflow is
an error, not an empty result. No stale comparison files should be interpreted as
a new result: always check the current manifest status, or use a fresh directory.

Cutouts are cached only in the selected output directory, verified by SHA-256,
with original retrieval time retained. Subsequent runs requery discovery. Use a
new output directory for a fresh remote download. `--offline` instead explicitly
reads saved discovery responses and requires existing cutouts. Generated files are ignored;
do not commit bulk FITS/cache files. See [`docs/data-validation.md`](../docs/data-validation.md)
for checked-in evidence and the actual run results.

## Bounds and scientific method

- Exactly two wide-survey SIA2 collections, a 0.01° overlap-search radius,
  at most 1,000 records / 8 MiB per response. Deep collections are not searched.
- Deterministic, evenly spaced temporal sample of at most 24 cutouts by default
  (hard maximum 32), 16 MiB per cutout, 256 MiB FITS budget per output directory.
- 120-second socket/read deadline per attempt by default, two attempts.
  Read deadline is checked between chunks; a blocking read may add one socket
  timeout. This is not a strict whole-run wall-clock limit.
- Comparison field is 1–10 arcmin. Downloads default to **2× spatial padding** because
  cutouts follow detector axes, not north-up sky axes. Science arrays are capped
  at 256 pixels per dimension before processing.
  `--download-padding 1` reproduces the initial tight-cutout geometry diagnostic.
- Verify FITS observation ID, detector, `MJD-OBS`, `DATE-OBS`, UTC, units, shapes,
  target containment, WCS round trip, quality flags and positive finite variance.
  `DATE` is file creation time and is **not** used as observation time.
- Preserve celestial TAN-SIP distortion. Read alternate spectral WCS with its
  lookup HDU, without celestial SIP, following IRSA's official tutorial.
- Center preselection requires wavelength offset ≤0.25 of the smaller local
  bandwidth and bandwidth ratio ≤1.2. Repeat these tests across the common grid;
  at least 80% of all grid pixels must be covered, valid, and spectrally matched.
  These are explicit **engineering visualization thresholds**, not a claim of
  identical instrumental responses or certified scientific equivalence.
- Conservatively reject every set quality bit except `SOURCE` and `FULLSAMPLE`,
  including unknown bits. Reject nonfinite science or nonpositive/nonfinite
  variance. Mask before bilinear reprojection so interpolation does not fill
  known bad samples. This also rejects neighboring interpolated pixels.
- Reproject surface brightness to a common north-up, east-left ICRS TAN grid at
  the larger input nominal pixel scale. No arbitrary flips or oversampling.
  Display only the common valid, wavelength-matched region with the same stretch.

**Limitations:** WCS-WAVE is the archive's approximate visualization solution, not
the precision CWAVE/CBAND calibration. No PSF homogenization, variance propagation,
zodiacal/background subtraction, flux extraction, motion measurement, or object
identification is performed. No synthetic fixture is used in live outputs. Unit
tests use clearly labelled artificial arrays solely to test transformations.

The display is **not evidence of Planet X, WISE 0855 detection, or measured motion**.
