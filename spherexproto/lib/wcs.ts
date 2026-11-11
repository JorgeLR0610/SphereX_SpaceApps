import { WCS } from './types';

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

/**
 * Projects celestial coordinates (RA, Dec in degrees) to image pixel [x, y]
 * using a standard TAN (gnomonic) tangent plane projection.
 */
export function celestialToPixel(
  ra: number,
  dec: number,
  wcs: WCS
): { x: number; y: number } {
  const ra0 = wcs.crval[0] * DEG2RAD;
  const dec0 = wcs.crval[1] * DEG2RAD;
  const raRad = ra * DEG2RAD;
  const decRad = dec * DEG2RAD;

  const deltaRa = raRad - ra0;

  const cosC = Math.sin(dec0) * Math.sin(decRad) +
               Math.cos(dec0) * Math.cos(decRad) * Math.cos(deltaRa);

  if (cosC <= 0) {
    // Behind tangent point
    return { x: -999, y: -999 };
  }

  // Standard TAN coordinates in radians
  const xi = (Math.cos(decRad) * Math.sin(deltaRa)) / cosC;
  const eta = (Math.sin(decRad) * Math.cos(dec0) -
               Math.cos(decRad) * Math.sin(dec0) * Math.cos(deltaRa)) / cosC;

  // cdelt is in degrees per pixel
  const cdeltRad = Math.abs(wcs.cdelt) * DEG2RAD;

  // In astronomical convention: RA increases to the left (-x), Dec increases up (+y)
  const x = wcs.crpix[0] - (xi / cdeltRad);
  const y = wcs.crpix[1] - (eta / cdeltRad);

  return { x, y };
}

/**
 * Inverse projection: Pixel [x, y] to celestial coordinates (RA, Dec in degrees)
 */
export function pixelToCelestial(
  x: number,
  y: number,
  wcs: WCS
): { ra: number; dec: number } {
  const ra0 = wcs.crval[0] * DEG2RAD;
  const dec0 = wcs.crval[1] * DEG2RAD;
  const cdeltRad = Math.abs(wcs.cdelt) * DEG2RAD;

  const xi = -(x - wcs.crpix[0]) * cdeltRad;
  const eta = -(y - wcs.crpix[1]) * cdeltRad;

  const rho = Math.sqrt(xi * xi + eta * eta);
  if (rho === 0) {
    return { ra: wcs.crval[0], dec: wcs.crval[1] };
  }

  const c = Math.atan(rho);
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);

  const decRad = Math.asin(cosC * Math.sin(dec0) + (eta * sinC * Math.cos(dec0)) / rho);
  const raRad = ra0 + Math.atan2(
    xi * sinC,
    rho * Math.cos(dec0) * cosC - eta * Math.sin(dec0) * sinC
  );

  let ra = raRad * RAD2DEG;
  if (ra < 0) ra += 360;
  if (ra >= 360) ra -= 360;

  const dec = decRad * RAD2DEG;

  return { ra, dec };
}

/**
 * Computes predicted displacement from proper motion over elapsed years.
 * pmRaMasYr is d(RA)*cos(dec) in milliarcseconds/yr
 * pmDecMasYr is d(Dec) in milliarcseconds/yr
 */
export function computeProperMotionDisplacement(
  pmRaMasYr: number,
  pmDecMasYr: number,
  elapsedYears: number,
  wcs: WCS
): { dxPixels: number; dyPixels: number; totalArcsec: number } {
  // Total arcseconds
  const dAlphaArcsec = (pmRaMasYr / 1000.0) * elapsedYears;
  const dDeltaArcsec = (pmDecMasYr / 1000.0) * elapsedYears;
  const totalArcsec = Math.sqrt(dAlphaArcsec * dAlphaArcsec + dDeltaArcsec * dDeltaArcsec);

  // Degrees per pixel
  const arcsecPerPixel = Math.abs(wcs.cdelt) * 3600.0;

  // RA increases to the left (-x), Dec increases up (+y)
  const dxPixels = -(dAlphaArcsec / arcsecPerPixel);
  const dyPixels = -(dDeltaArcsec / arcsecPerPixel);

  return { dxPixels, dyPixels, totalArcsec };
}

/**
 * Formats decimal degrees into Sexagesimal strings (HH:MM:SS.s, +DD:MM:SS)
 */
export function formatSexagesimal(ra: number, dec: number): { raStr: string; decStr: string } {
  // RA: degrees to hours
  const raHoursTotal = (ra % 360) / 15.0;
  const raH = Math.floor(raHoursTotal);
  const raMTotal = (raHoursTotal - raH) * 60;
  const raM = Math.floor(raMTotal);
  const raS = (raMTotal - raM) * 60;
  const raStr = `${raH.toString().padStart(2, '0')}h ${raM.toString().padStart(2, '0')}m ${raS.toFixed(2).padStart(5, '0')}s`;

  // Dec: degrees
  const sign = dec >= 0 ? '+' : '-';
  const decAbs = Math.abs(dec);
  const decD = Math.floor(decAbs);
  const decMTotal = (decAbs - decD) * 60;
  const decM = Math.floor(decMTotal);
  const decS = (decMTotal - decM) * 60;
  const decStr = `${sign}${decD.toString().padStart(2, '0')}° ${decM.toString().padStart(2, '0')}' ${decS.toFixed(1).padStart(4, '0')}"`;

  return { raStr, decStr };
}

/**
 * Robust parser for user coordinate inputs:
 * Accepts:
 * - "133.795, -7.245"
 * - "133.795 -7.245"
 * - "08h 55m 10.8s, -07d 14m 42s"
 * - "08:55:10.8 -07:14:42"
 */
export function parseCoordinates(input: string): { ra: number; dec: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try decimal pair first: "133.795, -7.245" or "133.795 -7.245"
  const decPairMatch = trimmed.match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
  if (decPairMatch) {
    const ra = parseFloat(decPairMatch[1]);
    const dec = parseFloat(decPairMatch[2]);
    if (!isNaN(ra) && !isNaN(dec) && ra >= 0 && ra <= 360 && dec >= -90 && dec <= 90) {
      return { ra, dec };
    }
  }

  // Try Sexagesimal: "08h 55m 10.8s -07d 14m 42s" or "08:55:10.8 -07:14:42"
  const sexaRegex = /([0-9]+)[:h\s]+([0-9]+)[:m\s]+([0-9.]+)[s\s]*,?\s*([+-]?[0-9]+)[:d°\s]+([0-9]+)[:m'\s]+([0-9.]+)/i;
  const match = trimmed.match(sexaRegex);
  if (match) {
    const h = parseFloat(match[1]);
    const m = parseFloat(match[2]);
    const s = parseFloat(match[3]);
    const sign = match[4].startsWith('-') ? -1 : 1;
    const d = Math.abs(parseFloat(match[4]));
    const dm = parseFloat(match[5]);
    const ds = parseFloat(match[6]);

    const ra = (h + m / 60 + s / 3600) * 15;
    const dec = sign * (d + dm / 60 + ds / 3600);

    if (!isNaN(ra) && !isNaN(dec) && ra >= 0 && ra <= 360 && dec >= -90 && dec <= 90) {
      return { ra, dec };
    }
  }

  return null;
}

