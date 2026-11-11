export interface Target {
  ra: number;
  dec: number;
  name?: string;
  pmRa?: number; // mas/yr
  pmDec?: number; // mas/yr
  description?: string;
  category?: 'Brown Dwarf' | 'High Proper Motion' | 'Variable Star' | 'Protostar' | 'Standard';
}

export interface WCS {
  crpix: [number, number];
  crval: [number, number];
  cdelt: number; // degrees per pixel
  size: [number, number];
}

export type ContaminationFlag = 
  | 'clean'
  | 'contaminated_edge'
  | 'stray_light'
  | 'cosmic_ray'
  | 'saturated'
  | 'zodiacal_high';

export interface BandInfo {
  lambda_um: number;
  width_um: number;
  detector: number;
  index: number;
}

export interface Frame {
  id: string;
  mjd: number;
  date: string;
  epochIndex: number;
  detector: number;
  band: BandInfo;
  flags: ContaminationFlag[];
  url?: string;
  width: number;
  height: number;
  pixelData: Float32Array;
  movingTargetPixel?: { x: number; y: number };
  variableFluxMultiplier?: number;
  stats: {
    min: number;
    max: number;
    median: number;
    mean: number;
    std: number;
  };
}

export interface DetectiveTarget {
  name: string;
  category: string;
  expectedPmRaMasYr: number;
  expectedPmDecMasYr: number;
  initialCoords: { ra: number; dec: number };
  initialPixel: [number, number];
  hints: string[];
  description: string;
  foundTolerancePixels: number;
}

export interface FramesResponse {
  target: Target;
  wcs: WCS;
  fovArcmin: number;
  frames: Frame[];
  epochs: { epoch: number; date: string; mjd: number }[];
  detectiveTarget?: DetectiveTarget;
}

export interface SpectrumPoint {
  lambda_um: number;
  flux: number;
  err: number;
  detector: number;
  bandIndex: number;
}

export interface SpectralFeature {
  label: string;
  lambda_um: number;
  type: 'absorption' | 'emission' | 'continuum';
  description: string;
}

export interface Spectrum {
  ra: number;
  dec: number;
  pixel: { x: number; y: number };
  points: SpectrumPoint[];
  epochSpectra?: {
    epoch: number;
    date: string;
    points: SpectrumPoint[];
  }[];
  features?: SpectralFeature[];
  objectIdentified?: string;
}

export interface CatalogMarker {
  id: string;
  catalog: 'Gaia DR3' | 'CatWISE2020' | 'SIMBAD';
  ra: number;
  dec: number;
  pixelX: number;
  pixelY: number;
  mag?: number;
  band?: string;
  pmRa?: number;
  pmDec?: number;
}

export interface Query {
  ra: number;
  dec: number;
  fov: number; // arcmin (1 to 30)
  targetName?: string;
  detectors?: boolean[];
}

export type DisplayMode = 'normal' | 'diff' | 'stack';
export type StretchFunction = 'linear' | 'log' | 'asinh';
export type ColormapType = 'inferno' | 'viridis' | 'greyscale' | 'coolwarm';
export type DiffReference = 'first' | 'median' | 'previous';

