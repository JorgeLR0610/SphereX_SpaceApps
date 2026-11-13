"""FastAPI application for the SPHEREx Time Machine Scientific API."""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from spherex import __version__, service
from spherex.models import FramesResponseModel, HealthResponse
from spherex.service import (
    DataUnavailableError,
    M101_DEC,
    M101_DEFAULT_FOV,
    M101_DETECTOR,
    M101_RA,
    M101_SUPPORTED_FOV_MAX,
    M101_SUPPORTED_FOV_MIN,
    UnsupportedFovError,
    UnsupportedRegionError,
)


app = FastAPI(
    title="SPHEREx Time Machine Scientific API",
    version=__version__,
    description=(
        "Minimal scientific API serving real, WCS-aligned NASA SPHEREx Level 2 observations "
        "for the NASA Space Apps Challenge 2026."
    ),
)

# Allow local frontend development without CORS issues
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(UnsupportedRegionError)
async def handle_unsupported_region(_request: Request, exc: UnsupportedRegionError):
    return JSONResponse(
        status_code=404,
        content={
            "detail": str(exc),
            "error_type": "unsupported_region",
            "requested": {"ra": exc.ra, "dec": exc.dec},
            "supported_regions": [
                {
                    "name": "M101 (Pinwheel Galaxy)",
                    "ra": M101_RA,
                    "dec": M101_DEC,
                    "detector": M101_DETECTOR,
                    "fov_arcmin": M101_DEFAULT_FOV,
                }
            ],
        },
    )


@app.exception_handler(UnsupportedFovError)
async def handle_unsupported_fov(_request: Request, exc: UnsupportedFovError):
    return JSONResponse(
        status_code=422,
        content={
            "detail": str(exc),
            "error_type": "unsupported_fov",
            "requested_fov": exc.fov,
            "supported_fov_range": [M101_SUPPORTED_FOV_MIN, M101_SUPPORTED_FOV_MAX],
        },
    )


@app.exception_handler(DataUnavailableError)
async def handle_data_unavailable(_request: Request, exc: DataUnavailableError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": str(exc),
            "error_type": "data_unavailable",
            "path": str(exc.path),
            "reason": exc.reason,
        },
    )


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return health status and whether M101 cached products are verified usable."""
    data_dir = service.get_default_data_dir()
    is_usable, _ = service.verify_dataset_usability(data_dir)
    return HealthResponse(
        status="ok",
        service="spherex-scientific-api",
        version=__version__,
        m101_cached=is_usable,
        data_dir=str(data_dir),
    )


@app.get("/frames", response_model=FramesResponseModel)
async def get_frames_endpoint(
    ra: float = Query(..., ge=0.0, lt=360.0, description="Right ascension in degrees [0, 360)"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="Declination in degrees [-90, 90]"),
    fov: float = Query(3.0, ge=1.0, le=30.0, description="Requested field of view in arcminutes [1, 30]"),
    targetName: Optional[str] = Query(None, description="Optional target or preset name"),
) -> FramesResponseModel:
    """Retrieve WCS-aligned SPHEREx observation frames and validity masks."""
    return service.get_frames(
        ra=ra,
        dec=dec,
        fov_arcmin=fov,
        target_name=targetName,
    )
