# SPHEREx Time Machine

Compare authentic infrared observations of M101 from two dates, or explore a
separate educational simulation. This application does not claim detection of
Planet X or confirmed moving objects.

- `frontend/`: Next.js / React, integrated SphereXTM visuals, blink, difference,
  curtain comparison, scientific provenance and educational tools.
- `server/`: authoritative Python / FastAPI / Astropy scientific service.
- `docs/`: API contract, scientific limitations and verification evidence.

Start the scientific service:

```sh
cd server
uv sync --locked
uv run --locked python -m spherex.prepare --output outputs/m101
uv run --locked uvicorn spherex.api:app --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```sh
cd frontend
npm ci
npm run build
npm run start
```

Visit http://localhost:3000/?api=real for authentic M101 data or
http://localhost:3000/?api=mock for simulation. Real mode is the default. FITS
products are prepared locally and are not included in Git. Offline replay needs
an existing verified cache; errors never silently substitute simulation.

[Integration report](docs/frontend-integration.md) contains exact source commit,
migration decisions, testing commands, screenshots and limitations.
[API contract](docs/api-contract.md) and [scientific rules](docs/scientific-integrity.md)
describe the measured data and interpretation limits.
