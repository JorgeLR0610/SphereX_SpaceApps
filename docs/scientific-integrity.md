# Scientific integrity and data provenance

## Core rule
Never imply a scientific measurement, moving target, spectral feature or new discovery was observed by SPHEREx unless the data and method justify that claim. Demo realism does not equal scientific validity.

## Categories of data
1. **Observed SPHEREx:** actual IRSA product, with source/product identifiers, observation time, wavelength/band, units, WCS, quality and processing history.
2. **Catalog derived:** positions/proper motions from SIMBAD/Gaia/WISE or others; source and reference epoch must be recorded. A propagated position is **predicted**, not a SPHEREx detection.
3. **Synthetic/demo:** noise, fake stars, fabricated epochs, mock spectra, illustrative overlays and arbitrary motions; clearly labeled to audience and judges.

Do not silently swap the third category into a 'real' data request after external service failure. Prefer explicit error and a clearly selected offline demo mode.

## FITS and sky geometry
- Read FITS HDU types, science array, error/uncertainty arrays, masks, calibration and coordinate metadata before calculating flux or motion.
- Check coordinate frame, units, equinox/reference epoch, WCS projection, celestial axes, RA wrap, handedness, array origins, pixel centers, and missing values.
- For comparison, match real observation footprint and sufficiently comparable wavelength. Reproject both to one grid; align sky and instrument response, taking quality masks, noise and resolution differences into account.
- A naive pixel subtraction of dissimilar images is not an astrophysical motion detection.
- Use real UTC/MJD and documented wavelength, and do not equate 'detector' with an arbitrary identical band across dates without validation.
- If actual angular resolution or cadence prevents visible displacement, say so. A catalog-predicted trajectory may be shown as an overlay with a label.

## Spectra
- Do not fake spectral curves from image brightness.
- Require suitable calibrated data and uncertainty; make clear when a curve is sampled/estimated/stacked versus an extracted spectrum.
- Distinguish flux units and transformations; label wavelengths in micrometers only when verified.

## Reproducible demo evidence
For each showcased region provide:
- archive and collection name, product IDs or URLs, retrieval time;
- actual RA/Dec, footprint/FOV, observation dates and spectral bands;
- FITS science HDUs/units and WCS handling;
- cutout, reprojection, masking and normalization steps;
- what user sees, what is inferred, and what remains unverified.

## External references
- SPHEREx archive: https://irsa.ipac.caltech.edu/Missions/spherex.html
- Data access: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/
- Products: https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/

The official challenge page should be consulted directly to verify precise scoring/deliverable requirements; do not infer rubric details from repository or this plan.
