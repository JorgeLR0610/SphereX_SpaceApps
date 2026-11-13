import { formatSexagesimal } from './wcs';

export interface ConeResult {
  id: string;
  name: string;
  ra: number;
  dec: number;
  sepArcsec: number;       // Separation from search center in arcseconds
  pmArcsecPerYear: number; // Total proper motion in arcseconds per year
  pmRa: number;            // pmra * cos(dec) in mas/yr
  pmDec: number;           // pmdec in mas/yr
  kindLabel: string;       // Plain language: "Enana marrón", "Estrella que cambia de brillo", "Objeto veloz", "Estrella"
  kindCode: string;        // Technical code: 'BD*', 'V*', 'PM*', '*'
  distanceLy?: string;     // Estimated distance if available
  mag?: number;            // Brightness / magnitude if available
  number: number;          // 1-based index matching map marker
}

export type ConeFilterType = 'all' | 'fast' | 'browndwarf' | 'variable';

export interface ConeSearchParams {
  ra: number;
  dec: number;
  radiusArcmin: number; // 1 to 60
  filters?: ConeFilterType[];
  useReal?: boolean;
  signal?: AbortSignal;
}

export interface ConeSearchResponse {
  results: ConeResult[];
  source: 'simbad' | 'mock';
  centerRa: number;
  centerDec: number;
  radiusArcmin: number;
  notice?: string;
  totalInRadius: number;
}

/**
 * Computes angular separation in arcseconds between two celestial points using the Haversine formula.
 * Precise for both small and large angular distances.
 */
export function computeAngularSeparationArcsec(
  ra1Deg: number,
  dec1Deg: number,
  ra2Deg: number,
  dec2Deg: number
): number {
  const DEG2RAD = Math.PI / 180.0;
  const phi1 = dec1Deg * DEG2RAD;
  const phi2 = dec2Deg * DEG2RAD;
  const deltaPhi = (dec2Deg - dec1Deg) * DEG2RAD;
  const deltaLambda = (ra2Deg - ra1Deg) * DEG2RAD;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
  return c * (180.0 / Math.PI) * 3600.0;
}

/**
 * Converts milliarcseconds/yr to arcseconds/yr.
 * pmRa is assumed to already include cos(dec) as per standard Gaia/SIMBAD convention (pmra* = pmra * cos(dec)).
 */
export function computeTotalProperMotionArcsecYr(pmRaMasYr: number, pmDecMasYr: number): number {
  const totalMas = Math.hypot(pmRaMasYr, pmDecMasYr);
  return totalMas / 1000.0;
}

/**
 * Propagates celestial position from reference epoch (2016.0) to SPHEREx observation epoch (e.g. 2026.0).
 */
export function propagateEpoch(
  raDeg: number,
  decDeg: number,
  pmRaMasYr: number,
  pmDecMasYr: number,
  targetEpoch = 2026.0,
  baseEpoch = 2016.0
): { ra: number; dec: number } {
  const dtYears = targetEpoch - baseEpoch;
  const cosDec = Math.cos((decDeg * Math.PI) / 180.0);
  const safeCosDec = Math.abs(cosDec) > 1e-5 ? cosDec : 1e-5;

  const dRaDeg = (pmRaMasYr / safeCosDec) * dtYears / (3600.0 * 1000.0);
  const dDecDeg = pmDecMasYr * dtYears / (3600.0 * 1000.0);

  let newRa = (raDeg + dRaDeg) % 360.0;
  if (newRa < 0) newRa += 360.0;
  let newDec = decDeg + dDecDeg;
  if (newDec > 90) newDec = 90;
  if (newDec < -90) newDec = -90;

  return { ra: newRa, dec: newDec };
}

/**
 * Human-friendly mapping for SIMBAD otype codes without technical acronyms.
 */
export const OTYPE_DICTIONARY: Record<string, string> = {
  'BD*': 'Enana marrón',
  'BD?': 'Candidata a enana marrón',
  'BrownD*': 'Enana marrón',
  'PM*': 'Objeto de movimiento rápido',
  'HighPM*': 'Estrella de alta velocidad',
  'V*': 'Estrella que cambia de brillo',
  'Candidate_V*': 'Estrella variable candidata',
  'Mi*': 'Estrella pulsante gigante',
  'Or*': 'Estrella variable joven',
  'TTau*': 'Estrella joven en formación',
  'EB*': 'Estrellas binarias que se eclipsan',
  'PulsV*': 'Estrella con pulsos de brillo',
  'BY*': 'Estrella con manchas y rotación variable',
  'Flare*': 'Estrella con fulguraciones',
  '*': 'Estrella común',
  '**': 'Estrella doble',
  'Star': 'Estrella común',
  'D*': 'Estrella doble',
  'WD*': 'Enana blanca',
  'Planet?': 'Candidato a exoplaneta',
  'Pl': 'Exoplaneta confirmado',
  'IR': 'Fuente infrarroja profunda',
  'Radio': 'Emisor de radio',
  'X': 'Fuente de rayos X',
};

/**
 * Resolves a friendly Spanish description based on SIMBAD otype and speed.
 */
export function getHumanKindLabel(otype: string, pmArcsecYr: number): { label: string; code: string } {
  const cleanCode = (otype || '').trim();

  // Known dictionary check
  if (OTYPE_DICTIONARY[cleanCode]) {
    return { label: OTYPE_DICTIONARY[cleanCode], code: cleanCode };
  }

  // Brown dwarf heuristics
  if (cleanCode.startsWith('BD') || cleanCode.startsWith('Brown') || cleanCode === 'Y*' || cleanCode === 'T*' || cleanCode === 'L*') {
    return { label: 'Enana marrón', code: 'BD*' };
  }

  // Variable star heuristics
  if (cleanCode.startsWith('V*') || cleanCode.startsWith('Mi') || cleanCode.startsWith('EB') || cleanCode.startsWith('Or') || cleanCode.includes('Var')) {
    return { label: 'Estrella que cambia de brillo', code: 'V*' };
  }

  // High speed heuristics
  if (pmArcsecYr >= 0.2 || cleanCode.includes('PM')) {
    return { label: 'Objeto de movimiento rápido', code: 'PM*' };
  }

  return { label: 'Estrella vecina', code: cleanCode || '*' };
}

/**
 * Formats angular separation in human units (arcsec or arcmin).
 */
export function formatSeparation(sepArcsec: number): string {
  if (sepArcsec < 60) {
    return `${Math.round(sepArcsec)}″`;
  }
  const arcmin = sepArcsec / 60.0;
  return `${arcmin.toFixed(1)}′`;
}

/**
 * Formats annual speed in human units (arcsec/year).
 */
export function formatMovementSpeed(pmArcsecYr: number): string {
  if (pmArcsecYr >= 1.0) {
    return `${pmArcsecYr.toFixed(1).replace('.', ',')}″ al año`;
  }
  if (pmArcsecYr >= 0.1) {
    return `${pmArcsecYr.toFixed(2).replace('.', ',')}″ al año`;
  }
  if (pmArcsecYr >= 0.01) {
    return `${pmArcsecYr.toFixed(2).replace('.', ',')}″ al año`;
  }
  return 'Casi inmóvil (<0,01″/año)';
}

// ============================================================================
// LOCAL MOCK CATALOGUE (Guarantees zero-network capability and exact matches)
// ============================================================================

interface MockSeedItem {
  id: string;
  name: string;
  ra: number;
  dec: number;
  pmRa: number; // mas/yr
  pmDec: number; // mas/yr
  otype: string;
  distanceLy?: string;
}

const PRESET_ANCHORS: MockSeedItem[] = [
  // 1. WISE 0855 anchor and surrounding field
  {
    id: 'wise0855',
    name: 'WISE J085510.83-071442.5',
    ra: 133.7951,
    dec: -7.2451,
    pmRa: -8150.0,
    pmDec: 540.0,
    otype: 'BD*',
    distanceLy: '7,3 años luz',
  },
  {
    id: 'wise0855-f1',
    name: 'WISEA J085514.2-071612',
    ra: 133.8090,
    dec: -7.2700,
    pmRa: -350.0,
    pmDec: 210.0,
    otype: 'BD*',
    distanceLy: '18 años luz',
  },
  {
    id: 'wise0855-f2',
    name: 'LP 666-38',
    ra: 133.7200,
    dec: -7.1950,
    pmRa: 520.0,
    pmDec: -390.0,
    otype: 'PM*',
    distanceLy: '34 años luz',
  },
  {
    id: 'wise0855-f3',
    name: 'V* V412 Hya',
    ra: 133.8800,
    dec: -7.2100,
    pmRa: -25.0,
    pmDec: -15.0,
    otype: 'V*',
    distanceLy: '320 años luz',
  },
  {
    id: 'wise0855-f4',
    name: 'Gaia DR3 568392104928',
    ra: 133.7400,
    dec: -7.2900,
    pmRa: 12.0,
    pmDec: -8.0,
    otype: '*',
    distanceLy: '680 años luz',
  },
  {
    id: 'wise0855-f5',
    name: '2MASS J08553210-072210',
    ra: 133.8837,
    dec: -7.3694,
    pmRa: -280.0,
    pmDec: 140.0,
    otype: 'BD*',
    distanceLy: '25 años luz',
  },
  {
    id: 'wise0855-f6',
    name: 'V* V415 Hya',
    ra: 133.9500,
    dec: -7.1200,
    pmRa: -10.0,
    pmDec: 8.0,
    otype: 'V*',
    distanceLy: '450 años luz',
  },

  // 2. Barnard's Star anchor and surrounding field
  {
    id: 'barnard',
    name: 'Estrella de Barnard',
    ra: 269.4521,
    dec: 4.6933,
    pmRa: -802.8,
    pmDec: 10362.5,
    otype: 'PM*',
    distanceLy: '6,0 años luz',
  },
  {
    id: 'barnard-f1',
    name: 'LSPM J1757+0444',
    ra: 269.4100,
    dec: 4.7400,
    pmRa: 420.0,
    pmDec: -310.0,
    otype: 'PM*',
    distanceLy: '28 años luz',
  },
  {
    id: 'barnard-f2',
    name: 'V* V2500 Oph',
    ra: 269.5100,
    dec: 4.6400,
    pmRa: -18.0,
    pmDec: 32.0,
    otype: 'V*',
    distanceLy: '240 años luz',
  },
  {
    id: 'barnard-f3',
    name: 'Gaia DR3 447582093819',
    ra: 269.4800,
    dec: 4.7300,
    pmRa: 5.0,
    pmDec: -12.0,
    otype: '*',
    distanceLy: '850 años luz',
  },
  {
    id: 'barnard-f4',
    name: 'WISEA J175752+043912',
    ra: 269.3600,
    dec: 4.6100,
    pmRa: -260.0,
    pmDec: 210.0,
    otype: 'BD*',
    distanceLy: '42 años luz',
  },

  // 3. Epsilon Indi B anchor and field
  {
    id: 'epsindi-b',
    name: 'Epsilon Indi Ba',
    ra: 331.0438,
    dec: -56.7828,
    pmRa: 3961.0,
    pmDec: -2539.0,
    otype: 'BD*',
    distanceLy: '12 años luz',
  },
  {
    id: 'epsindi-c',
    name: 'Epsilon Indi Bb',
    ra: 331.0442,
    dec: -56.7831,
    pmRa: 3955.0,
    pmDec: -2530.0,
    otype: 'BD*',
    distanceLy: '12 años luz',
  },
  {
    id: 'epsindi-a',
    name: 'Epsilon Indi A',
    ra: 331.0600,
    dec: -56.7600,
    pmRa: 3960.0,
    pmDec: -2538.0,
    otype: '*',
    distanceLy: '11,8 años luz',
  },
  {
    id: 'epsindi-f1',
    name: 'V* VInd 12',
    ra: 330.9500,
    dec: -56.8400,
    pmRa: 40.0,
    pmDec: -25.0,
    otype: 'V*',
    distanceLy: '310 años luz',
  },

  // 4. RW Aurigae anchor and field
  {
    id: 'rwaur',
    name: 'RW Aurigae A',
    ra: 76.9564,
    dec: 30.4014,
    pmRa: 1.2,
    pmDec: -22.4,
    otype: 'V*',
    distanceLy: '450 años luz',
  },
  {
    id: 'rwaur-b',
    name: 'RW Aurigae B',
    ra: 76.9568,
    dec: 30.4016,
    pmRa: 1.0,
    pmDec: -22.0,
    otype: 'V*',
    distanceLy: '450 años luz',
  },
  {
    id: 'rwaur-f1',
    name: 'V* V583 Aur',
    ra: 77.0200,
    dec: 30.4400,
    pmRa: 3.0,
    pmDec: -18.0,
    otype: 'V*',
    distanceLy: '490 años luz',
  },
  {
    id: 'rwaur-f2',
    name: '2MASS J05075421+302611',
    ra: 76.8900,
    dec: 30.3600,
    pmRa: -180.0,
    pmDec: -120.0,
    otype: 'BD*',
    distanceLy: '85 años luz',
  },

  // 5. R Draconis anchor and field
  {
    id: 'rdra',
    name: 'R Draconis',
    ra: 248.1676,
    dec: 66.7551,
    pmRa: -14.8,
    pmDec: 12.3,
    otype: 'Mi*',
    distanceLy: '1 000 años luz',
  },
  {
    id: 'rdra-f1',
    name: 'V* SV Dra',
    ra: 248.2800,
    dec: 66.8100,
    pmRa: -22.0,
    pmDec: 8.0,
    otype: 'V*',
    distanceLy: '1 200 años luz',
  },
  {
    id: 'rdra-f2',
    name: 'LSPM J1632+6640',
    ra: 248.0500,
    dec: 66.6900,
    pmRa: -310.0,
    pmDec: 220.0,
    otype: 'PM*',
    distanceLy: '52 años luz',
  },
];

/**
 * Deterministic pseudo-random number generator for synthesizing field stars around arbitrary coordinates.
 */
function seededRng(seed: number) {
  let s = Math.abs(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Executes a Cone Search using the robust local mock catalog with synthesized stars if needed.
 */
export function mockConeSearch(params: ConeSearchParams): ConeResult[] {
  const { ra, dec, radiusArcmin, filters = ['all'] } = params;
  const radiusArcsec = radiusArcmin * 60.0;

  // 1. Gather all candidates from known anchors
  const candidates: MockSeedItem[] = [...PRESET_ANCHORS];

  // 2. Synthesize 12 field stars around (ra, dec) deterministically if needed
  const seed = Math.round(ra * 1000) * 100 + Math.round((dec + 90) * 100);
  const rnd = seededRng(seed);

  const cosDec = Math.cos((dec * Math.PI) / 180.0);
  const safeCosDec = Math.abs(cosDec) > 0.05 ? cosDec : 0.05;

  for (let i = 1; i <= 14; i++) {
    const distArcmin = 0.5 + rnd() * (radiusArcmin * 1.15);
    const angleRad = rnd() * 2 * Math.PI;

    const offsetRaDeg = ((distArcmin / 60.0) * Math.sin(angleRad)) / safeCosDec;
    const offsetDecDeg = (distArcmin / 60.0) * Math.cos(angleRad);

    const typeRoll = rnd();
    let otype = '*';
    let pmRa = (rnd() - 0.5) * 40;
    let pmDec = (rnd() - 0.5) * 40;

    if (typeRoll < 0.20) {
      otype = 'BD*';
      pmRa = (rnd() - 0.5) * 700;
      pmDec = (rnd() - 0.5) * 700;
    } else if (typeRoll < 0.40) {
      otype = 'V*';
      pmRa = (rnd() - 0.5) * 60;
      pmDec = (rnd() - 0.5) * 60;
    } else if (typeRoll < 0.55) {
      otype = 'PM*';
      pmRa = (rnd() - 0.5) * 1200;
      pmDec = (rnd() - 0.5) * 1200;
    }

    const { raStr } = formatSexagesimal((ra + offsetRaDeg + 360) % 360, dec + offsetDecDeg);
    const shortId = raStr.replace(/[^0-9]/g, '').slice(0, 6);

    candidates.push({
      id: `syn-${seed}-${i}`,
      name: `Gaia DR3 410${shortId}`,
      ra: (ra + offsetRaDeg + 360) % 360,
      dec: Math.max(-90, Math.min(90, dec + offsetDecDeg)),
      pmRa,
      pmDec,
      otype,
      distanceLy: `${Math.round(40 + rnd() * 600)} años luz`,
    });
  }

  // 3. Compute exact Haversine separations & total proper motion
  const matched: ConeResult[] = [];

  candidates.forEach((c) => {
    const sepArcsec = computeAngularSeparationArcsec(ra, dec, c.ra, c.dec);
    if (sepArcsec <= radiusArcsec) {
      const pmArcsecYr = computeTotalProperMotionArcsecYr(c.pmRa, c.pmDec);
      const { label, code } = getHumanKindLabel(c.otype, pmArcsecYr);

      matched.push({
        id: c.id,
        name: c.name,
        ra: c.ra,
        dec: c.dec,
        sepArcsec,
        pmArcsecPerYear: pmArcsecYr,
        pmRa: c.pmRa,
        pmDec: c.pmDec,
        kindLabel: label,
        kindCode: code,
        distanceLy: c.distanceLy,
        number: 0,
      });
    }
  });

  // 4. Apply Filters
  const filtered = matched.filter((item) => {
    if (filters.includes('all') || filters.length === 0) return true;

    return filters.some((f) => {
      if (f === 'fast') {
        // Fast movers: proper motion >= 200 mas/yr (0.2"/yr)
        return item.pmArcsecPerYear >= 0.20;
      }
      if (f === 'browndwarf') {
        return (
          item.kindCode.startsWith('BD') ||
          item.kindLabel.toLowerCase().includes('marrón')
        );
      }
      if (f === 'variable') {
        return (
          item.kindCode.startsWith('V') ||
          item.kindCode.startsWith('Mi') ||
          item.kindLabel.toLowerCase().includes('cambia de brillo') ||
          item.kindLabel.toLowerCase().includes('variable')
        );
      }
      return true;
    });
  });

  // 5. Sort by distance to center ascending (closest first)
  filtered.sort((a, b) => a.sepArcsec - b.sepArcsec);

  // 6. Assign sequential numbers for map markers
  const topResults = filtered.slice(0, 50).map((item, idx) => ({
    ...item,
    number: idx + 1,
  }));

  return topResults;
}

// ============================================================================
// SIMBAD TAP REAL ADAPTER (CDS sync query)
// ============================================================================

export async function realConeSearch(params: ConeSearchParams): Promise<ConeResult[]> {
  const { ra, dec, radiusArcmin, filters = ['all'], signal } = params;
  const radiusDeg = radiusArcmin / 60.0;

  // Build ADQL query
  let whereFilters = '';
  if (filters.includes('fast') && !filters.includes('all')) {
    whereFilters += ' AND SQRT(pmra*pmra + pmdec*pmdec) > 200';
  }

  const adql = `
    SELECT TOP 50 main_id, ra, dec, pmra, pmdec, plx_value, otype
    FROM basic
    WHERE CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra.toFixed(5)}, ${dec.toFixed(5)}, ${radiusDeg.toFixed(5)})) = 1
    ${whereFilters}
    ORDER BY SQRT(POWER(ra - ${ra.toFixed(5)}, 2) + POWER(dec - ${dec.toFixed(5)}, 2))
  `.trim().replace(/\s+/g, ' ');

  const endpoint = 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync';
  const body = new URLSearchParams({
    request: 'doQuery',
    lang: 'ADQL',
    format: 'json',
    query: adql,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
    signal,
  });

  if (!response.ok) {
    throw new Error(`SIMBAD TAP responded with HTTP ${response.status}`);
  }

  const json = await response.json();
  const rows: Array<[string, number, number, number | null, number | null, number | null, string]> = json.data || [];

  const parsed: ConeResult[] = rows.map((row) => {
    const [mainId, rRa, rDec, pmRa, pmDec, , otype] = row;
    const cleanPmRa = pmRa != null ? pmRa : 0;
    const cleanPmDec = pmDec != null ? pmDec : 0;
    const sepArcsec = computeAngularSeparationArcsec(ra, dec, rRa, rDec);
    const pmArcsecYr = computeTotalProperMotionArcsecYr(cleanPmRa, cleanPmDec);
    const { label, code } = getHumanKindLabel(otype || '*', pmArcsecYr);

    return {
      id: String(mainId),
      name: String(mainId).trim(),
      ra: rRa,
      dec: rDec,
      sepArcsec,
      pmArcsecPerYear: pmArcsecYr,
      pmRa: cleanPmRa,
      pmDec: cleanPmDec,
      kindLabel: label,
      kindCode: code,
      number: 0,
    };
  });

  // Client-side filter reinforcement
  const filtered = parsed.filter((item) => {
    if (filters.includes('all') || filters.length === 0) return true;
    return filters.some((f) => {
      if (f === 'fast') return item.pmArcsecPerYear >= 0.20;
      if (f === 'browndwarf') return item.kindCode.startsWith('BD') || item.kindLabel.toLowerCase().includes('marrón');
      if (f === 'variable') return item.kindCode.startsWith('V') || item.kindLabel.toLowerCase().includes('cambia');
      return true;
    });
  });

  filtered.sort((a, b) => a.sepArcsec - b.sepArcsec);

  return filtered.slice(0, 50).map((item, idx) => ({
    ...item,
    number: idx + 1,
  }));
}

// ============================================================================
// MAIN CONE SEARCH FUNCTION (Unified interface with automatic fallback)
// ============================================================================

export async function searchCone(params: ConeSearchParams): Promise<ConeSearchResponse> {
  const { ra, dec, radiusArcmin, useReal = true } = params;

  if (useReal && typeof window !== 'undefined' && navigator.onLine) {
    try {
      const results = await realConeSearch(params);
      if (results && results.length > 0) {
        return {
          results,
          source: 'simbad',
          centerRa: ra,
          centerDec: dec,
          radiusArcmin,
          totalInRadius: results.length,
        };
      }
    } catch {
      // Graceful fallback to mock on network failure or CORS/404 issue
    }
  }

  // Use reliable mock catalogue with local synthesis
  const mockResults = mockConeSearch(params);
  return {
    results: mockResults,
    source: 'mock',
    centerRa: ra,
    centerDec: dec,
    radiusArcmin,
    notice: 'Mostrando catálogo local (modo sin conexión)',
    totalInRadius: mockResults.length,
  };
}

