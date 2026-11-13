import { ColormapType } from './types';

// Precomputed 256-entry RGB Lookup Tables for maximum Canvas 2D performance
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

function interpolateRgb(c1: RGBColor, c2: RGBColor, t: number): RGBColor {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
  };
}

function createLut(stops: { pos: number; color: RGBColor }[]): RGBColor[] {
  const lut: RGBColor[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s0 = stops[0];
    let s1 = stops[stops.length - 1];

    for (let j = 0; j < stops.length - 1; j++) {
      if (t >= stops[j].pos && t <= stops[j + 1].pos) {
        s0 = stops[j];
        s1 = stops[j + 1];
        break;
      }
    }

    const localT = (t - s0.pos) / Math.max(0.0001, (s1.pos - s0.pos));
    lut[i] = interpolateRgb(s0.color, s1.color, Math.min(1, Math.max(0, localT)));
  }
  return lut;
}

// 1. Inferno colormap (astronomical standard)
export const INFERNO_LUT = createLut([
  { pos: 0.0, color: { r: 0, g: 0, b: 4 } },
  { pos: 0.2, color: { r: 40, g: 11, b: 84 } },
  { pos: 0.4, color: { r: 101, g: 21, b: 110 } },
  { pos: 0.6, color: { r: 186, g: 54, b: 85 } },
  { pos: 0.8, color: { r: 249, g: 140, b: 10 } },
  { pos: 0.95, color: { r: 252, g: 226, b: 56 } },
  { pos: 1.0, color: { r: 255, g: 255, b: 255 } },
]);

// 2. Viridis colormap
export const VIRIDIS_LUT = createLut([
  { pos: 0.0, color: { r: 68, g: 1, b: 84 } },
  { pos: 0.25, color: { r: 59, g: 82, b: 139 } },
  { pos: 0.5, color: { r: 33, g: 145, b: 140 } },
  { pos: 0.75, color: { r: 94, g: 201, b: 98 } },
  { pos: 1.0, color: { r: 253, g: 231, b: 37 } },
]);

// 3. Greyscale colormap (Linear Black to White)
export const GREYSCALE_LUT = createLut([
  { pos: 0.0, color: { r: 0, g: 0, b: 0 } },
  { pos: 1.0, color: { r: 255, g: 255, b: 255 } },
]);

// 4. Coolwarm / Difference Dipole colormap (Divergent for Frame Differencing)
// Negative = Blue/Cyan, Zero = Deep Slate, Positive = Orange/Red
export const COOLWARM_LUT = createLut([
  { pos: 0.0, color: { r: 30, g: 144, b: 255 } }, // Deep Dodger Blue (negative dip)
  { pos: 0.35, color: { r: 0, g: 210, b: 255 } }, // Cyan
  { pos: 0.5, color: { r: 15, g: 23, b: 42 } },   // Neutral dark background
  { pos: 0.65, color: { r: 255, g: 140, b: 0 } }, // Orange
  { pos: 1.0, color: { r: 255, g: 40, b: 40 } },  // Intense Red (positive peak)
]);

export function getColormapLut(type: ColormapType): RGBColor[] {
  switch (type) {
    case 'inferno':
      return INFERNO_LUT;
    case 'viridis':
      return VIRIDIS_LUT;
    case 'greyscale':
      return GREYSCALE_LUT;
    case 'coolwarm':
      return COOLWARM_LUT;
    default:
      return INFERNO_LUT;
  }
}

// Astronomical stretch transformations
export function applyStretch(
  value: number,
  min: number,
  max: number,
  fn: 'linear' | 'log' | 'asinh'
): number {
  if (max <= min) return 0.5;
  const clamped = Math.max(min, Math.min(max, value));
  const norm = (clamped - min) / (max - min);

  switch (fn) {
    case 'linear':
      return norm;
    case 'log':
      return Math.log10(1 + 9 * norm);
    case 'asinh':
      // Astronomical asinh stretch preserves low flux details while compressing high peaks
      const beta = 3.0;
      return Math.asinh(norm * beta) / Math.asinh(beta);
    default:
      return norm;
  }
}

