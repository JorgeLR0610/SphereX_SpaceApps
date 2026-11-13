"""Pydantic schemas for the SPHEREx scientific API, matching frontend/lib/types.ts."""

from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class TargetModel(BaseModel):
    ra: float
    dec: float
    name: Optional[str] = None
    pmRa: Optional[float] = None
    pmDec: Optional[float] = None
    description: Optional[str] = None
    category: Optional[Literal[
        'Brown Dwarf',
        'High Proper Motion',
        'Variable Star',
        'Protostar',
        'Standard'
    ]] = None


class WCSModel(BaseModel):
    crpix: list[float] = Field(..., min_length=2, max_length=2, description="[x, y] reference pixel coordinates")
    crval: list[float] = Field(..., min_length=2, max_length=2, description="[ra, dec] reference celestial coordinates in degrees")
    cdelt: float = Field(..., description="Scale in degrees per pixel")
    size: list[int] = Field(..., min_length=2, max_length=2, description="[width, height] grid dimensions")


class BandInfoModel(BaseModel):
    lambda_um: float = Field(..., description="Central wavelength in micrometers")
    width_um: float = Field(..., description="Spectral band width in micrometers")
    detector: int = Field(..., description="SPHEREx detector index (1 to 6)")
    index: int = Field(..., description="Band index within detector")


class FrameStatsModel(BaseModel):
    min: float
    max: float
    median: float
    mean: float
    std: float


class FrameModel(BaseModel):
    id: str
    mjd: float
    date: str
    epochIndex: int
    detector: int
    band: BandInfoModel
    flags: list[str] = Field(default_factory=list)
    url: Optional[str] = None
    width: int
    height: int
    pixelData: list[float] = Field(..., description="Row-major 1D array of surface brightness values")
    movingTargetPixel: Optional[dict[str, float]] = None
    variableFluxMultiplier: Optional[float] = None
    stats: FrameStatsModel
    # Scientific integrity extensions
    validMask: Optional[list[int]] = Field(None, description="1 for valid science pixel, 0 for excluded/masked")
    units: Optional[str] = Field("MJy / sr", description="Calibrated surface brightness units")
    provenance: Optional[dict[str, Any]] = None


class EpochModel(BaseModel):
    epoch: int
    date: str
    mjd: float


class FramesResponseModel(BaseModel):
    target: TargetModel
    wcs: WCSModel
    fovArcmin: float
    frames: list[FrameModel]
    epochs: list[EpochModel]
    detectiveTarget: Optional[dict[str, Any]] = None
    # Scientific integrity extensions
    validMask: Optional[list[int]] = Field(None, description="Shared grid validity mask (1 = valid, 0 = masked)")
    provenance: Optional[dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    m101_cached: bool
    data_dir: str
