import { formatSexagesimal } from './wcs';

// ============================================================================
// CONE SEARCH INTERFACES & TYPES (NASA Space Apps / SPHEREx Standard)
// ============================================================================

export interface ConeResult {
  id: string;
  name: string;
  ra: number;
  dec: number;
  sepArcsec: number;       // Separation from search center in arcseconds (Haversine)
  pmArcsecPerYear: number; // Total proper motion in arcseconds per year
  pmRa: number;            // pmra * cos(dec) in mas/yr
  pmDec: number;           // pmdec in mas/yr
  kindLabel: string;       // Plain language: "Enana marrón", "Candidata a objeto frío", "Estrella que cambia de brillo", "Objeto veloz", "Estrella"
  kindCode: string;        // Technical code: 'BD*', 'V*', 'PM*', 'COLD_CANDIDATE', '*'
  distanceLy?: string;     // Estimated distance if available
  mag?: number;            // Optical magnitude (Gaia G or V)
  w1Mag?: number;          // CatWISE W1 (3.4 µm)
  w2Mag?: number;          // CatWISE W2 (4.6 µm)
  w1MinusW2?: number;      // W1 - W2 color index (large positive value = cold brown dwarf)
  hasGaiaMatch: boolean;   // true if optical counterpart in Gaia within 3"
  isColdCandidate: boolean;// true if bright/moving in IR with NO Gaia match ("Lo que Gaia no ve")
  isCandidate: boolean;    // true if unconfirmed or candidate object
  interestScore: number;   // 0 to 100 ranking score
  interestReason: string;  // Plain Spanish sentence justifying interest
  number: number;          // 1-based index matching map marker
  source: 'simbad' | 'gaia' | 'wise' | 'crossmatch' | 'mock';
}

export type ConeFilterType = 'all' | 'fast' | 'browndwarf' | 'variable' | 'coldcandidate';

export interface CuratedTarget {
  name: string;
  ra: number;
  dec: number;
  description: string;
  defaultRadius: number;
}

export const CURATED_CONE_TARGETS: CuratedTarget[] = [
  {
    name: 'WISE 0855-0714',
    ra: 133.7951,
    dec: -7.2451,
    description: 'Enana marrón ultrafría (~250 K) invisible en Gaia pero brillantísima en SPHEREx/WISE (8,1″/año).',
    defaultRadius: 5,
  },
  {
    name: "Estrella de Barnard",
    ra: 269.4521,
    dec: 4.6933,
    description: 'El récord de movimiento propio del cielo nocturno (10,36″/año hacia el norte).',
    defaultRadius: 5,
  },
  {
    name: 'RW Aurigae',
    ra: 76.9564,
    dec: 30.4014,
    description: 'Estrella joven eruptiva T Tauri con oscurecimientos por perturbaciones de marea circumestelar.',
    defaultRadius: 10,
  },
  {
    name: 'Epsilon Indi B',
    ra: 331.0438,
    dec: -56.7828,
    description: 'Sistema binario cercano de enanas marrones frías (T1 + T6) con fuerte absorción de metano.',
    defaultRadius: 5,
  },
  {
    name: 'R Draconis',
    ra: 247.5583,
    dec: 66.7539,
    description: 'Estrella pulsante gigante tipo Mira con amplia variabilidad infrarroja en cada época.',
    defaultRadius: 10,
  },
  {
    name: 'Luhman 16',
    ra: 162.298,
    dec: -53.319,
    description: 'El par de enanas marrones más próximo a la Tierra (6,5 años luz), tipo espectral L/T.',
    defaultRadius: 5,
  },
  {
    name: 'TRAPPIST-1',
    ra: 346.622,
    dec: -5.043,
    description: 'Enana roja ultrafría M8V con 7 planetas rocosos de tamaño terrestre.',
    defaultRadius: 5,
  },
  {
    name: 'Estrella de Teegarden',
    ra: 43.253,
    dec: 16.881,
    description: 'Enana ultrafría muy cercana descubierta por su alto movimiento propio (5,06″/año).',
    defaultRadius: 5,
  },
];

export interface ConeSearchParams {
  ra: number;
  dec: number;
  radiusArcmin: number; // 1 to 60
  filters?: ConeFilterType[];
  useReal?: boolean;
  signal?: AbortSignal;
}

export interface ConeSearchMeta {
  totalFound: number;
  shown: number;
  source: 'federated' | 'simbad' | 'gaia' | 'mock';
  isTruncated: boolean;
  radiusArcmin: number;
  centerRa: number;
  centerDec: number;
  notice?: string;
  fromCache: boolean;
  queryDurationMs: number;
}

export interface ConeSearchResponse {
  results: ConeResult[];
  meta: ConeSearchMeta;
  // Convenience accessors for backward compatibility
  source: 'federated' | 'simbad' | 'gaia' | 'mock';
  centerRa: number;
  centerDec: number;
  radiusArcmin: number;
  notice?: string;
  totalInRadius: number;
}

// ============================================================================
// CELESTIAL MATHEMATICS (Haversine separation & Epoch Propagation)
// ============================================================================

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

/**
 * Computes angular separation in arcseconds between two celestial points using the Haversine formula.
 * Exact and stable near poles and for any angular distance.
 */
export function computeAngularSeparationArcsec(
  ra1Deg: number,
  dec1Deg: number,
  ra2Deg: number,
  dec2Deg: number
): number {
  const phi1 = dec1Deg * DEG2RAD;
  const phi2 = dec2Deg * DEG2RAD;
  const deltaPhi = (dec2Deg - dec1Deg) * DEG2RAD;
  const deltaLambda = (ra2Deg - ra1Deg) * DEG2RAD;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
  return c * RAD2DEG * 3600.0;
}

/**
 * Converts milliarcseconds/yr to arcseconds/yr.
 * pmRa is assumed to already include cos(dec) (standard pmra*).
 */
export function computeTotalProperMotionArcsecYr(pmRaMasYr: number, pmDecMasYr: number): number {
  const totalMas = Math.hypot(pmRaMasYr, pmDecMasYr);
  return totalMas / 1000.0;
}

/**
 * Propagates celestial position from reference epoch (e.g. Gaia 2016.0 or WISE 2015.4)
 * to target observation epoch (SPHEREx ~2026.0).
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
  if (Math.abs(dtYears) < 1e-4) return { ra: raDeg, dec: decDeg };

  const cosDec = Math.cos(decDeg * DEG2RAD);
  const safeCosDec = Math.abs(cosDec) > 1e-5 ? cosDec : 1e-5;

  const dRaDeg = ((pmRaMasYr / safeCosDec) * dtYears) / (3600.0 * 1000.0);
  const dDecDeg = (pmDecMasYr * dtYears) / (3600.0 * 1000.0);

  let newRa = (raDeg + dRaDeg) % 360.0;
  if (newRa < 0) newRa += 360.0;
  let newDec = decDeg + dDecDeg;
  if (newDec > 90) newDec = 90;
  if (newDec < -90) newDec = -90;

  return { ra: newRa, dec: newDec };
}

// ============================================================================
// HUMAN LANGUAGE TRANSLATION & DICTIONARY
// ============================================================================

export const OTYPE_DICTIONARY: Record<string, string> = {
  'BD*': 'Enana marrón',
  'BD?': 'Candidata a enana marrón',
  'BrownD*': 'Enana marrón',
  'PM*': 'Objeto de movimiento rápido',
  'HighPM*': 'Estrella de alta velocidad',
  'V*': 'Estrella que cambia de brillo',
  'Candidate_V*': 'Estrella variable candidata',
  'Mi*': 'Estrella pulsante gigante (Mira)',
  'Or*': 'Estrella variable joven',
  'TTau*': 'Estrella joven en formación (T Tauri)',
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

export function getHumanKindLabel(otype: string, pmArcsecYr: number, isColdCandidate = false): { label: string; code: string } {
  if (isColdCandidate) {
    return { label: 'Candidata a objeto frío', code: 'COLD_CANDIDATE' };
  }

  const cleanCode = (otype || '').trim();

  if (OTYPE_DICTIONARY[cleanCode]) {
    return { label: OTYPE_DICTIONARY[cleanCode], code: cleanCode };
  }

  if (cleanCode.startsWith('BD') || cleanCode.startsWith('Brown') || cleanCode === 'Y*' || cleanCode === 'T*' || cleanCode === 'L*') {
    return { label: 'Enana marrón', code: 'BD*' };
  }

  if (cleanCode.startsWith('V*') || cleanCode.startsWith('Mi') || cleanCode.startsWith('EB') || cleanCode.startsWith('Or') || cleanCode.includes('Var')) {
    return { label: 'Estrella que cambia de brillo', code: 'V*' };
  }

  if (pmArcsecYr >= 0.2 || cleanCode.includes('PM')) {
    return { label: 'Objeto de movimiento rápido', code: 'PM*' };
  }

  return { label: 'Estrella vecina', code: cleanCode || '*' };
}

export function formatSeparation(sepArcsec: number): string {
  if (sepArcsec < 0.5) {
    return '0″';
  }
  if (sepArcsec < 60) {
    return `${Math.round(sepArcsec)}″`;
  }
  const arcmin = sepArcsec / 60.0;
  return `${arcmin.toFixed(1)}′`;
}

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

/**
 * Transforms catalog identifiers into human-friendly observatory names.
 */
export function cleanFriendlyName(rawId: string): string {
  let name = (rawId || '').trim();
  // Strip SIMBAD technical prefixes
  name = name.replace(/^NAME\s+/i, '');
  name = name.replace(/^V\*\s+/i, '');
  name = name.replace(/^\*\*\s+/i, '');
  name = name.replace(/^\*\s+/i, '');

  const lower = name.toLowerCase();
  if (lower === 'rw aur a') return 'RW Aurigae A';
  if (lower === 'rw aur b') return 'RW Aurigae B';
  if (lower === 'rw aur') return 'RW Aurigae';
  if (lower.includes('barnard')) return 'Estrella de Barnard';
  if (lower === 'eps ind a' || lower === 'eps indi a') return 'Epsilon Indi A';
  if (lower === 'eps ind b' || lower === 'eps indi b') return 'Epsilon Indi B';
  if (lower === 'eps ind ba' || lower === 'eps indi ba') return 'Epsilon Indi Ba';
  if (lower === 'eps ind bb' || lower === 'eps indi bb') return 'Epsilon Indi Bb';
  if (lower.includes('085510') || lower.includes('wise 0855')) return 'WISE 0855-0714';
  if (lower === 'r dra' || lower === 'r dra.') return 'R Draconis';

  return name;
}

/**
 * Checks whether an object is a candidate rather than a 100% confirmed standard star.
 */
export function isObjectCandidate(otype: string, kindCode: string, isColdCandidate: boolean): boolean {
  if (isColdCandidate) return true;
  const clean = (otype || '').toLowerCase();
  const code = (kindCode || '').toLowerCase();
  return (
    clean.includes('?') ||
    clean.includes('cand') ||
    clean.includes('candidate') ||
    code === 'cold_candidate' ||
    code.includes('?') ||
    code.startsWith('bd?')
  );
}

/**
 * Calculates scientific interest score (0 to 100) and a single-sentence justification in natural language.
 */
export function calculateInterestScoreAndReason(item: {
  id: string;
  name: string;
  sepArcsec: number;
  pmArcsecPerYear: number;
  otype: string;
  kindCode: string;
  kindLabel: string;
  hasGaiaMatch: boolean;
  isColdCandidate: boolean;
  distanceLy?: string;
}): { score: number; reason: string; isCandidate: boolean } {
  let score = 10;
  const isCandidate = isObjectCandidate(item.otype, item.kindCode, item.isColdCandidate);

  // 1. Center Object: Always top priority
  if (item.sepArcsec === 0) {
    return {
      score: 100,
      reason: `Objeto central de búsqueda (${item.name}) fijado como referencia del vecindario.`,
      isCandidate,
    };
  }

  // 2. High proper motion: >1"/yr (+40 pts); >0.2"/yr (+20 pts); >0.05"/yr (+10 pts)
  if (item.pmArcsecPerYear >= 1.0) {
    score += 40;
  } else if (item.pmArcsecPerYear >= 0.20) {
    score += 20;
  } else if (item.pmArcsecPerYear >= 0.05) {
    score += 10;
  }

  // 3. "Lo que Gaia no ve" (WISE source with PM or brown dwarf and NO Gaia match): +40 pts
  if (!item.hasGaiaMatch && (item.isColdCandidate || item.pmArcsecPerYear >= 0.1 || item.kindCode.startsWith('BD'))) {
    score += 40;
  }

  // 4. Known or candidate brown dwarf (L, T, Y): +30 pts
  if (item.kindCode.startsWith('BD') || item.isColdCandidate || item.otype.includes('BD')) {
    score += 30;
  }

  // 5. Confirmed variability (Mira, T Tauri, eruptive): +25 pts
  if (item.kindCode.startsWith('V') || item.kindCode.startsWith('Mi') || item.otype.startsWith('TT') || item.otype.startsWith('Or')) {
    score += 25;
  }

  // 6. Proximity (<20 ly: +20 pts; <50 ly: +10 pts)
  if (item.distanceLy) {
    const numLyMatch = item.distanceLy.match(/([0-9.,]+)/);
    if (numLyMatch) {
      const ly = parseFloat(numLyMatch[1].replace(',', '.'));
      if (ly < 20) {
        score += 20;
      } else if (ly < 50) {
        score += 10;
      } else if (ly < 100) {
        score += 5;
      }
    }
  }

  score = Math.min(100, Math.max(10, score));

  // Natural language sentence justification answering "¿Por qué debería importarme?"
  let reason = 'Estrella vecina común que sirve como referencia fija en este parche de cielo.';

  if (item.isColdCandidate || (!item.hasGaiaMatch && item.kindCode.startsWith('BD'))) {
    reason = 'No emite casi luz visible, pero en el infrarrojo de SPHEREx la verás cruzar el cielo.';
  } else if (item.pmArcsecPerYear >= 5.0) {
    reason = `Se mueve a ${formatMovementSpeed(item.pmArcsecPerYear)}: es el récord de velocidad propia y en pocos años cambiará visiblemente de posición.`;
  } else if (item.pmArcsecPerYear >= 1.0) {
    reason = `Gran velocidad propia (${formatMovementSpeed(item.pmArcsecPerYear)}): es un objeto muy cercano a nuestro sistema solar.`;
  } else if (item.otype.startsWith('TT') || item.name.toLowerCase().includes('rw aur')) {
    reason = 'Estrella joven rodeada de polvo protoplanetario: su brillo cambia porque su disco la eclipsa.';
  } else if (item.otype.startsWith('Mi') || item.name.toLowerCase().includes('r dra')) {
    reason = 'Gigante roja pulsante Mira: en su ciclo pasa de brillar intensamente a casi apagarse en el infrarrojo.';
  } else if (item.kindCode.startsWith('BD')) {
    reason = 'Enana marrón confirmada: estrella fallida que no inició fusión y emite tenue calor residual en 0,75–5 µm.';
  } else if (item.kindCode.startsWith('V')) {
    reason = 'Estrella variable con oscilaciones térmicas periódicas medibles entre épocas de SPHEREx.';
  } else if (item.pmArcsecPerYear >= 0.20) {
    reason = `Movimiento propio rápido (${formatMovementSpeed(item.pmArcsecPerYear)}), apreciable en la línea temporal.`;
  }

  return { score, reason, isCandidate };
}

// ============================================================================
// CACHE LAYER (In-Memory + SessionStorage)
// ============================================================================

const memoryCache = new Map<string, ConeSearchResponse>();

function getCacheKey(ra: number, dec: number, radiusArcmin: number, filters: ConeFilterType[]): string {
  const fKey = [...filters].sort().join(',');
  return `cone_${ra.toFixed(3)}_${dec.toFixed(3)}_${radiusArcmin}_${fKey}`;
}

function getFromCache(key: string): ConeSearchResponse | null {
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const item = window.sessionStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item) as ConeSearchResponse;
        memoryCache.set(key, parsed);
        return parsed;
      }
    } catch {
      // Storage quota or private browsing
    }
  }
  return null;
}

function saveToCache(key: string, data: ConeSearchResponse): void {
  memoryCache.set(key, data);
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(data));
    } catch {
      // Ignore sessionStorage errors
    }
  }
}

// ============================================================================
// FEDERATED TAP QUERY ENGINES
// ============================================================================

export const SIMBAD_TAP_ENDPOINTS = [
  'https://simbad.harvard.edu/simbad/sim-tap/sync',
  'https://simbad.cds.unistra.fr/simbad/sim-tap/sync',
];

export const GAIA_TAP_ENDPOINTS = [
  'https://gaia.ari.uni-heidelberg.de/tap/sync',
  'https://gea.esac.esa.int/tap-server/tap/sync',
];

export const IRSA_TAP_ENDPOINT = 'https://irsa.ipac.caltech.edu/TAP/sync';

interface SimbadRow {
  mainId: string;
  ra: number;
  dec: number;
  pmRa: number;
  pmDec: number;
  plx: number | null;
  otype: string;
  distDeg: number;
}

interface GaiaRow {
  sourceId: string;
  ra: number;
  dec: number;
  pmRa: number;
  pmDec: number;
  parallax: number | null;
  photGMeanMag: number | null;
}

interface WiseRow {
  designation: string;
  ra: number;
  dec: number;
  pmRa: number;
  pmDec: number;
  w1Mag: number | null;
  w2Mag: number | null;
}

/**
 * 1. SIMBAD TAP Query: Canonical names, spectral types, variability
 */
async function fetchSimbadTap(
  ra: number,
  dec: number,
  radiusDeg: number,
  limit = 200,
  signal?: AbortSignal
): Promise<SimbadRow[]> {
  const adql = `
    SELECT TOP ${limit} main_id, ra, dec, pmra, pmdec, plx_value, otype,
      DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', ${ra.toFixed(5)}, ${dec.toFixed(5)})) AS dist_deg
    FROM basic
    WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra.toFixed(5)}, ${dec.toFixed(5)}, ${radiusDeg.toFixed(5)}))
    ORDER BY dist_deg ASC
  `.trim().replace(/\s+/g, ' ');

  let lastError: Error | null = null;

  for (const endpoint of SIMBAD_TAP_ENDPOINTS) {
    try {
      const body = new URLSearchParams({
        request: 'doQuery',
        lang: 'ADQL',
        format: 'json',
        query: adql,
      });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
        signal,
      });

      if (!res.ok) {
        throw new Error(`SIMBAD HTTP ${res.status}`);
      }

      const json = await res.json();
      const rawRows: Array<[string, number, number, number | null, number | null, number | null, string, number]> = json.data || [];

      return rawRows.map((r) => ({
        mainId: String(r[0]).trim(),
        ra: r[1],
        dec: r[2],
        pmRa: r[3] != null ? r[3] : 0,
        pmDec: r[4] != null ? r[4] : 0,
        plx: r[5],
        otype: String(r[6] || '*').trim(),
        distDeg: r[7] != null ? r[7] : 0,
      }));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('No se pudo conectar a los servidores SIMBAD TAP');
}

/**
 * 2. Gaia DR3 TAP Query: High-precision proper motion, parallax, G magnitude
 */
async function fetchGaiaTap(
  ra: number,
  dec: number,
  radiusDeg: number,
  limit = 200,
  signal?: AbortSignal
): Promise<GaiaRow[]> {
  const adql = `
    SELECT TOP ${limit} source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag
    FROM gaiadr3.gaia_source
    WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra.toFixed(5)}, ${dec.toFixed(5)}, ${radiusDeg.toFixed(5)}))
  `.trim().replace(/\s+/g, ' ');

  for (const endpoint of GAIA_TAP_ENDPOINTS) {
    try {
      const body = new URLSearchParams({
        REQUEST: 'doQuery',
        LANG: 'ADQL',
        FORMAT: 'json',
        QUERY: adql,
      });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
        signal,
      });

      if (!res.ok) continue;

      const json = await res.json();
      const rawData = json.data || [];

      return rawData.map((row: number[] | {source_id:string;ra:number;dec:number;pmra:number;pmdec:number;parallax:number;phot_g_mean_mag:number}) => {
        if (Array.isArray(row)) {
          return {
            sourceId: String(row[0]),
            ra: row[1],
            dec: row[2],
            pmRa: row[3] || 0,
            pmDec: row[4] || 0,
            parallax: row[5],
            photGMeanMag: row[6],
          };
        }
        return {
          sourceId: String(row.source_id),
          ra: row.ra,
          dec: row.dec,
          pmRa: row.pmra || 0,
          pmDec: row.pmdec || 0,
          parallax: row.parallax,
          photGMeanMag: row.phot_g_mean_mag,
        };
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      // Continue to next mirror
    }
  }

  return []; // Non-blocking: continue if Gaia times out or rate limits
}

/**
 * 3. CatWISE / AllWISE Query: Infrared W1/W2 magnitudes and infrared proper motion
 */
async function fetchWiseTap(
  ra: number,
  dec: number,
  radiusDeg: number,
  limit = 100,
  signal?: AbortSignal
): Promise<WiseRow[]> {
  const adql = `
    SELECT TOP ${limit} designation, ra, dec, w1mpro, w2mpro
    FROM allwise_p3as_psd
    WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra.toFixed(5)}, ${dec.toFixed(5)}, ${radiusDeg.toFixed(5)}))
  `.trim().replace(/\s+/g, ' ');

  try {
    const body = new URLSearchParams({
      REQUEST: 'doQuery',
      LANG: 'ADQL',
      FORMAT: 'json',
      QUERY: adql,
    });

    const res = await fetch(IRSA_TAP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
      signal,
    });

    if (!res.ok) return [];

    const json = await res.json();
    const rows = json?.VOTABLE?.RESOURCE?.TABLE?.DATA?.TABLEDATA?.TR || [];

    return rows.map((tr: (string | {$:string})[]) => {
      const vals = tr.map((td) => (typeof td === 'object' && td !== null ? td.$ : td));
      return {
        designation: String(vals[0] || '').trim(),
        ra: parseFloat(vals[1]) || 0,
        dec: parseFloat(vals[2]) || 0,
        pmRa: 0,
        pmDec: 0,
        w1Mag: vals[3] != null ? parseFloat(vals[3]) : null,
        w2Mag: vals[4] != null ? parseFloat(vals[4]) : null,
      };
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    return []; // Non-blocking: continue if IRSA times out
  }
}

// ============================================================================
// CROSS-MATCHING ENGINE WITH EPOCH PROPAGATION ("Lo que Gaia no ve")
// ============================================================================

export function crossMatchCatalogs(
  searchCenterRa: number,
  searchCenterDec: number,
  radiusArcsec: number,
  simbadRows: SimbadRow[],
  gaiaRows: GaiaRow[],
  wiseRows: WiseRow[],
  targetEpoch = 2026.0
): ConeResult[] {
  // 1. Propagate all Gaia sources from Gaia DR3 epoch (2016.0) to SPHEREx epoch (2026.0)
  const gaiaPropagated = gaiaRows.map((g) => {
    const prop = propagateEpoch(g.ra, g.dec, g.pmRa, g.pmDec, targetEpoch, 2016.0);
    return {
      ...g,
      propRa: prop.ra,
      propDec: prop.dec,
    };
  });

  const results: ConeResult[] = [];

  // 2. Process SIMBAD rows and cross-match with Gaia
  simbadRows.forEach((s) => {
    // Propagate SIMBAD coordinates to target epoch if proper motion is known
    const prop = propagateEpoch(s.ra, s.dec, s.pmRa, s.pmDec, targetEpoch, 2016.0);
    let sepArcsec = computeAngularSeparationArcsec(searchCenterRa, searchCenterDec, s.ra, s.dec);

    // If within 0.8 arcsec of center, lock to 0″
    if (sepArcsec < 0.8 || s.distDeg * 3600 < 0.8) {
      sepArcsec = 0;
    }

    // Match with closest Gaia source within 3.0" at target epoch
    let matchedGaia: (typeof gaiaPropagated)[0] | null = null;
    let minGaiaSep = 9999;

    for (const g of gaiaPropagated) {
      const gSep = computeAngularSeparationArcsec(prop.ra, prop.dec, g.propRa, g.propDec);
      if (gSep < 3.0 && gSep < minGaiaSep) {
        minGaiaSep = gSep;
        matchedGaia = g;
      }
    }

    const pmRa = matchedGaia ? matchedGaia.pmRa : s.pmRa;
    const pmDec = matchedGaia ? matchedGaia.pmDec : s.pmDec;
    const plx = matchedGaia && matchedGaia.parallax != null ? matchedGaia.parallax : s.plx;
    const pmArcsecYr = computeTotalProperMotionArcsecYr(pmRa, pmDec);

    // Distance in light years from parallax
    let distanceLy: string | undefined = undefined;
    if (plx && plx > 0.5) {
      const parsecs = 1000.0 / plx;
      const ly = parsecs * 3.26156;
      distanceLy = ly < 100 ? `${ly.toFixed(1).replace('.', ',')} años luz` : `${Math.round(ly)} años luz`;
    }

    const hasGaiaMatch = matchedGaia !== null;
    const isColdCandidate = !hasGaiaMatch && (s.otype.startsWith('BD') || s.otype.startsWith('IR') || pmArcsecYr >= 0.3);
    const { label, code } = getHumanKindLabel(s.otype, pmArcsecYr, isColdCandidate);
    const friendlyName = cleanFriendlyName(s.mainId);

    const { score, reason, isCandidate } = calculateInterestScoreAndReason({
      id: s.mainId,
      name: friendlyName,
      sepArcsec,
      pmArcsecPerYear: pmArcsecYr,
      otype: s.otype,
      kindCode: code,
      kindLabel: label,
      hasGaiaMatch,
      isColdCandidate,
      distanceLy,
    });

    results.push({
      id: s.mainId,
      name: friendlyName,
      ra: s.ra,
      dec: s.dec,
      sepArcsec,
      pmArcsecPerYear: pmArcsecYr,
      pmRa,
      pmDec,
      kindLabel: label,
      kindCode: code,
      distanceLy,
      mag: matchedGaia?.photGMeanMag ?? undefined,
      hasGaiaMatch,
      isColdCandidate,
      isCandidate,
      interestScore: score,
      interestReason: reason,
      number: 0,
      source: matchedGaia ? 'crossmatch' : 'simbad',
    });
  });

  // 3. Detect infrared sources in WISE with NO Gaia counterpart ("Lo que Gaia no ve")
  wiseRows.forEach((w) => {
    // Check if this WISE source is already matched to a SIMBAD result
    const alreadyMatched = results.some(
      (r) => computeAngularSeparationArcsec(w.ra, w.dec, r.ra, r.dec) < 3.0
    );
    if (alreadyMatched) return;

    // Cross-match with Gaia
    const hasGaia = gaiaPropagated.some(
      (g) => computeAngularSeparationArcsec(w.ra, w.dec, g.propRa, g.propDec) < 3.0
    );

    if (!hasGaia) {
      const sepArcsec = computeAngularSeparationArcsec(searchCenterRa, searchCenterDec, w.ra, w.dec);
      if (sepArcsec <= radiusArcsec) {
        const colorDiff = w.w1Mag != null && w.w2Mag != null ? w.w1Mag - w.w2Mag : 0;
        const shortName = `WISEA J${w.designation.slice(0, 8) || 'Cand'}`;

        const { score, reason, isCandidate } = calculateInterestScoreAndReason({
          id: `wise_${w.designation}`,
          name: shortName,
          sepArcsec,
          pmArcsecPerYear: 0.1,
          otype: 'BD?',
          kindCode: 'COLD_CANDIDATE',
          kindLabel: 'Candidata a objeto frío',
          hasGaiaMatch: false,
          isColdCandidate: true,
        });

        results.push({
          id: `wise_${w.designation}`,
          name: shortName,
          ra: w.ra,
          dec: w.dec,
          sepArcsec,
          pmArcsecPerYear: 0.1,
          pmRa: 0,
          pmDec: 0,
          kindLabel: 'Candidata a objeto frío',
          kindCode: 'COLD_CANDIDATE',
          w1Mag: w.w1Mag ?? undefined,
          w2Mag: w.w2Mag ?? undefined,
          w1MinusW2: colorDiff,
          hasGaiaMatch: false,
          isColdCandidate: true,
          isCandidate,
          interestScore: score,
          interestReason: reason,
          number: 0,
          source: 'wise',
        });
      }
    }
  });

  return results;
}

// ============================================================================
// COMPREHENSIVE LOCAL MOCK CATALOGUE (>= 44 realistic seeds for offline demo)
// ============================================================================

export interface MockSeedItem {
  id: string;
  name: string;
  ra: number;
  dec: number;
  pmRa: number; // mas/yr
  pmDec: number; // mas/yr
  otype: string;
  distanceLy?: string;
  mag?: number;
  hasGaiaMatch: boolean;
  isColdCandidate: boolean;
  interestReason?: string;
}

export const PRESET_ANCHORS: MockSeedItem[] = [
  // 1. WISE 0855 anchor and surrounding field (9 realistic objects)
  {
    id: 'wise0855',
    name: 'WISE J085510.83-071442.5',
    ra: 133.7951,
    dec: -7.2451,
    pmRa: -8150.0,
    pmDec: 540.0,
    otype: 'BD*',
    distanceLy: '7,3 años luz',
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'La enana marrón sub-estelar más fría conocida (~250 K). Sin emisión óptica en Gaia: brilla intensamente en SPHEREx.',
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
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Candidata a enana marrón compañera detectada en CatWISE sin contraparte óptica.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Enana roja de alta velocidad propia que cruza rápidamente el campo de visión.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Estrella variable pulsante con variaciones de brillo periódicas en infrarrojo.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Enana marrón tipo T confirmada en el catálogo 2MASS.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'wise0855-f7',
    name: 'Gaia DR3 568392994012',
    ra: 133.8300,
    dec: -7.2200,
    pmRa: 8.0,
    pmDec: -4.0,
    otype: '*',
    distanceLy: '820 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'wise0855-f8',
    name: 'WISEA J085501.4-071158',
    ra: 133.7550,
    dec: -7.1990,
    pmRa: -190.0,
    pmDec: 110.0,
    otype: 'BD?',
    distanceLy: '45 años luz',
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Objeto infrarrojo frío candidato descubierto por coincidencia cromática W1-W2.',
  },

  // 2. Barnard's Star anchor and surrounding field (9 realistic objects)
  {
    id: 'barnard',
    name: 'Estrella de Barnard',
    ra: 269.4521,
    dec: 4.6933,
    pmRa: -802.8,
    pmDec: 10362.5,
    otype: 'PM*',
    distanceLy: '5,96 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'El mayor movimiento propio del cielo nocturno (10,36″/año). Estrella vecina récord.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Estrella de alta velocidad propia del catálogo LSPM en Ofiuco.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Estrella variable eruptiva tipo BY Draconis con manchas superficiales.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
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
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Enana marrón fría detectada en el plano de Ofiuco sin emisión visible en Gaia.',
  },
  {
    id: 'barnard-f5',
    name: 'TYC 425-1029-1',
    ra: 269.5300,
    dec: 4.7800,
    pmRa: -24.0,
    pmDec: -48.0,
    otype: '*',
    distanceLy: '190 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'barnard-f6',
    name: '2MASS J17573890+044812',
    ra: 269.4120,
    dec: 4.8033,
    pmRa: 110.0,
    pmDec: -85.0,
    otype: 'BD*',
    distanceLy: '55 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'barnard-f7',
    name: 'Gaia DR3 447581900124',
    ra: 269.3900,
    dec: 4.6700,
    pmRa: 4.0,
    pmDec: -7.0,
    otype: '*',
    distanceLy: '1 200 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'barnard-f8',
    name: 'WISEA J175805+044310',
    ra: 269.5210,
    dec: 4.7190,
    pmRa: -180.0,
    pmDec: 140.0,
    otype: 'BD?',
    distanceLy: '38 años luz',
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Candidata a enana marrón fría detectada en infrarrojo sin detección óptica.',
  },

  // 3. Epsilon Indi B anchor and field (9 realistic objects)
  {
    id: 'epsindi-b',
    name: 'Epsilon Indi Ba',
    ra: 331.0438,
    dec: -56.7828,
    pmRa: 3961.0,
    pmDec: -2539.0,
    otype: 'BD*',
    distanceLy: '11,8 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Enana marrón tipo T1 en sistema binario cercano. Espectro dominado por metano.',
  },
  {
    id: 'epsindi-c',
    name: 'Epsilon Indi Bb',
    ra: 331.0442,
    dec: -56.7831,
    pmRa: 3955.0,
    pmDec: -2530.0,
    otype: 'BD*',
    distanceLy: '11,8 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Compañera binaria ultrafría tipo T6 orbitando a solo 2,6 UA.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Estrella primaria enana naranja tipo K5V con alto movimiento propio.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'epsindi-f2',
    name: 'WISEA J220412-564510',
    ra: 331.0510,
    dec: -56.7530,
    pmRa: -310.0,
    pmDec: 190.0,
    otype: 'BD?',
    distanceLy: '30 años luz',
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Candidata a enana marrón aislada en Indus sin contraparte óptica en Gaia.',
  },
  {
    id: 'epsindi-f3',
    name: 'Gaia DR3 642910394012',
    ra: 331.1200,
    dec: -56.8100,
    pmRa: 15.0,
    pmDec: -8.0,
    otype: '*',
    distanceLy: '480 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'epsindi-f4',
    name: '2MASS J22040510-564920',
    ra: 331.0210,
    dec: -56.8220,
    pmRa: 210.0,
    pmDec: -150.0,
    otype: 'PM*',
    distanceLy: '65 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'epsindi-f5',
    name: 'Gaia DR3 642910884920',
    ra: 330.9800,
    dec: -56.7200,
    pmRa: 9.0,
    pmDec: -14.0,
    otype: '*',
    distanceLy: '920 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'epsindi-f6',
    name: 'WISEA J220420-564100',
    ra: 331.0850,
    dec: -56.6830,
    pmRa: -220.0,
    pmDec: 130.0,
    otype: 'BD*',
    distanceLy: '40 años luz',
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Fuente infrarroja de gran color térmico W1-W2 sin emisión óptica visible.',
  },

  // 4. RW Aurigae anchor and field (9 realistic objects)
  {
    id: 'rwaur',
    name: 'RW Aurigae A',
    ra: 76.9564,
    dec: 30.4014,
    pmRa: 1.2,
    pmDec: -22.4,
    otype: 'V*',
    distanceLy: '450 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Estrella variable joven tipo T Tauri con eclipses térmicos producidos por discos de polvo.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Compañera binaria cerrada de RW Aurigae a solo 1,4″ con puente de marea de gas.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Estrella variable de la nube molecular de Tauro-Auriga.',
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
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Enana marrón fría de primer plano sin contraparte óptica en Gaia DR3.',
  },
  {
    id: 'rwaur-f3',
    name: '1RXS J050746.3+302419',
    ra: 76.9429,
    dec: 30.4054,
    pmRa: 2.5,
    pmDec: -21.0,
    otype: 'X',
    distanceLy: '460 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Fuente de rayos X asociada a corona estelar activa de estrella joven.',
  },
  {
    id: 'rwaur-f4',
    name: '1RXS J050754.4+302214',
    ra: 76.9767,
    dec: 30.3706,
    pmRa: 0.8,
    pmDec: -23.5,
    otype: 'X',
    distanceLy: '450 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'rwaur-f5',
    name: 'Gaia DR3 156338321403778940',
    ra: 76.7698,
    dec: 30.3594,
    pmRa: 0.9,
    pmDec: -3.6,
    otype: '*',
    distanceLy: '1 400 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'rwaur-f6',
    name: 'WISEA J050750.1+302715',
    ra: 76.9580,
    dec: 30.4540,
    pmRa: -95.0,
    pmDec: 60.0,
    otype: 'BD?',
    distanceLy: '70 años luz',
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Candidata a enana marrón infrarroja sin emisión óptica detectable.',
  },
  {
    id: 'rwaur-f7',
    name: 'TYC 2404-118-1',
    ra: 77.0120,
    dec: 30.3340,
    pmRa: 2.1,
    pmDec: -19.4,
    otype: '*',
    distanceLy: '420 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },

  // 5. R Draconis anchor and field (8 realistic objects)
  {
    id: 'rdra',
    name: 'R Draconis',
    ra: 248.1676,
    dec: 66.7551,
    pmRa: -14.8,
    pmDec: 12.3,
    otype: 'Mi*',
    distanceLy: '1 000 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Gigante roja pulsante Mira con periodo de 245 días y oscilaciones térmicas gigantescas.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Estrella variable semirregular con oscilaciones térmicas moleculares.',
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
    hasGaiaMatch: true,
    isColdCandidate: false,
    interestReason: 'Estrella de alta velocidad propia del catálogo LSPM en el polo norte celeste.',
  },
  {
    id: 'rdra-f3',
    name: 'WISEA J163240+664910',
    ra: 248.1700,
    dec: 66.8200,
    pmRa: -150.0,
    pmDec: 110.0,
    otype: 'BD*',
    distanceLy: '65 años luz',
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Enana marrón fría polar detectada en CatWISE sin contraparte óptica en Gaia.',
  },
  {
    id: 'rdra-f4',
    name: 'Gaia DR3 162940192840',
    ra: 248.3100,
    dec: 66.7100,
    pmRa: -8.0,
    pmDec: 5.0,
    otype: '*',
    distanceLy: '1 400 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'rdra-f5',
    name: 'Gaia DR3 162940552109',
    ra: 248.0200,
    dec: 66.7800,
    pmRa: 14.0,
    pmDec: -11.0,
    otype: '*',
    distanceLy: '890 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
  {
    id: 'rdra-f6',
    name: 'WISEA J163212+664100',
    ra: 248.0500,
    dec: 66.6830,
    pmRa: -190.0,
    pmDec: 140.0,
    otype: 'BD?',
    distanceLy: '58 años luz',
    hasGaiaMatch: false,
    isColdCandidate: true,
    interestReason: 'Fuente infrarroja profunda con alto índice térmico sin contraparte visible.',
  },
  {
    id: 'rdra-f7',
    name: 'TYC 4198-442-1',
    ra: 248.2400,
    dec: 66.7900,
    pmRa: -6.0,
    pmDec: 9.0,
    otype: '*',
    distanceLy: '750 años luz',
    hasGaiaMatch: true,
    isColdCandidate: false,
  },
];

/**
 * Deterministic pseudo-random number generator for field synthesis
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
 * Offline / Mock Cone Search implementation
 */
export function mockConeSearch(params: ConeSearchParams): ConeResult[] {
  const { ra, dec, radiusArcmin, filters = ['all'] } = params;
  const radiusArcsec = radiusArcmin * 60.0;

  const candidates: MockSeedItem[] = [...PRESET_ANCHORS];

  // Synthesize realistic stars deterministically if custom coordinates are requested
  const seed = Math.round(ra * 1000) * 100 + Math.round((dec + 90) * 100);
  const rnd = seededRng(seed);

  const cosDec = Math.cos(dec * DEG2RAD);
  const safeCosDec = Math.abs(cosDec) > 0.05 ? cosDec : 0.05;

  for (let i = 1; i <= 16; i++) {
    const distArcmin = 0.5 + rnd() * (radiusArcmin * 1.1);
    const angleRad = rnd() * 2 * Math.PI;

    const offsetRaDeg = ((distArcmin / 60.0) * Math.sin(angleRad)) / safeCosDec;
    const offsetDecDeg = (distArcmin / 60.0) * Math.cos(angleRad);

    const typeRoll = rnd();
    let otype = '*';
    let pmRa = (rnd() - 0.5) * 40;
    let pmDec = (rnd() - 0.5) * 40;
    let hasGaia = true;
    let isCold = false;

    if (typeRoll < 0.15) {
      otype = 'BD*';
      pmRa = (rnd() - 0.5) * 700;
      pmDec = (rnd() - 0.5) * 700;
      hasGaia = false; // "Lo que Gaia no ve"
      isCold = true;
    } else if (typeRoll < 0.35) {
      otype = 'V*';
      pmRa = (rnd() - 0.5) * 60;
      pmDec = (rnd() - 0.5) * 60;
    } else if (typeRoll < 0.50) {
      otype = 'PM*';
      pmRa = (rnd() - 0.5) * 1200;
      pmDec = (rnd() - 0.5) * 1200;
    }

    const { raStr } = formatSexagesimal((ra + offsetRaDeg + 360) % 360, dec + offsetDecDeg);
    const shortId = raStr.replace(/[^0-9]/g, '').slice(0, 6);

    candidates.push({
      id: `syn-${seed}-${i}`,
      name: isCold ? `WISEA J${shortId}` : `Gaia DR3 410${shortId}`,
      ra: (ra + offsetRaDeg + 360) % 360,
      dec: Math.max(-90, Math.min(90, dec + offsetDecDeg)),
      pmRa,
      pmDec,
      otype,
      distanceLy: `${Math.round(30 + rnd() * 600)} años luz`,
      hasGaiaMatch: hasGaia,
      isColdCandidate: isCold,
    });
  }

  const matched: ConeResult[] = [];

  candidates.forEach((c) => {
    let sepArcsec = computeAngularSeparationArcsec(ra, dec, c.ra, c.dec);

    if (sepArcsec <= radiusArcsec) {
      // If within 2.5 arcsec of known center preset, clamp to 0″
      if (sepArcsec < 2.5 && (c.id === 'rwaur' || c.id === 'wise0855' || c.id === 'barnard' || c.id === 'epsindi-b' || c.id === 'rdra')) {
        sepArcsec = 0;
      } else if (sepArcsec < 0.8) {
        sepArcsec = 0;
      }

      const pmArcsecYr = computeTotalProperMotionArcsecYr(c.pmRa, c.pmDec);
      const { label, code } = getHumanKindLabel(c.otype, pmArcsecYr, c.isColdCandidate);
      const friendlyName = cleanFriendlyName(c.name);

      const { score, reason, isCandidate } = calculateInterestScoreAndReason({
        id: c.id,
        name: friendlyName,
        sepArcsec,
        pmArcsecPerYear: pmArcsecYr,
        otype: c.otype,
        kindCode: code,
        kindLabel: label,
        hasGaiaMatch: c.hasGaiaMatch,
        isColdCandidate: c.isColdCandidate,
        distanceLy: c.distanceLy,
      });

      matched.push({
        id: c.id,
        name: friendlyName,
        ra: c.ra,
        dec: c.dec,
        sepArcsec,
        pmArcsecPerYear: pmArcsecYr,
        pmRa: c.pmRa,
        pmDec: c.pmDec,
        kindLabel: label,
        kindCode: code,
        distanceLy: c.distanceLy,
        hasGaiaMatch: c.hasGaiaMatch,
        isColdCandidate: c.isColdCandidate,
        isCandidate,
        interestScore: score,
        interestReason: c.interestReason || reason,
        number: 0,
        source: 'mock',
      });
    }
  });

  // Client-side filter application
  const filtered = matched.filter((item) => {
    if (filters.includes('all') || filters.length === 0) return true;

    return filters.some((f) => {
      if (f === 'fast') return item.pmArcsecPerYear >= 0.20;
      if (f === 'browndwarf') return item.kindCode.startsWith('BD') || item.kindLabel.toLowerCase().includes('marrón');
      if (f === 'variable') return item.kindCode.startsWith('V') || item.kindCode.startsWith('Mi') || item.kindLabel.toLowerCase().includes('cambia');
      if (f === 'coldcandidate') return item.isColdCandidate || (!item.hasGaiaMatch && item.kindCode.startsWith('BD'));
      return true;
    });
  });

  filtered.sort((a, b) => {
    if (a.sepArcsec === 0 && b.sepArcsec !== 0) return -1;
    if (b.sepArcsec === 0 && a.sepArcsec !== 0) return 1;
    if (b.interestScore !== a.interestScore) return b.interestScore - a.interestScore;
    return a.sepArcsec - b.sepArcsec;
  });

  return filtered.slice(0, 200).map((item, idx) => ({
    ...item,
    number: idx + 1,
  }));
}

// ============================================================================
// FEDERATED CONE SEARCH (SIMBAD + Gaia DR3 + CatWISE with Automatic Fallback)
// ============================================================================

export async function realConeSearch(params: ConeSearchParams): Promise<{ results: ConeResult[]; source: 'federated' | 'simbad' | 'gaia'; notice?: string }> {
  const { ra, dec, radiusArcmin, filters = ['all'], signal } = params;
  const radiusDeg = radiusArcmin / 60.0;
  const radiusArcsec = radiusArcmin * 60.0;

  // 1. Query SIMBAD and Gaia DR3 in parallel
  const [simbadResult, gaiaResult, wiseResult] = await Promise.allSettled([
    fetchSimbadTap(ra, dec, radiusDeg, 200, signal),
    fetchGaiaTap(ra, dec, radiusDeg, 200, signal),
    fetchWiseTap(ra, dec, radiusDeg, 100, signal),
  ]);

  const simbadRows = simbadResult.status === 'fulfilled' ? simbadResult.value : [];
  const gaiaRows = gaiaResult.status === 'fulfilled' ? gaiaResult.value : [];
  const wiseRows = wiseResult.status === 'fulfilled' ? wiseResult.value : [];

  if (simbadRows.length === 0 && gaiaRows.length === 0) {
    throw new Error('Los servidores de SIMBAD y Gaia no respondieron a tiempo.');
  }

  // Cross-match SIMBAD, Gaia and WISE with epoch propagation to 2026.0
  const crossMatched = crossMatchCatalogs(ra, dec, radiusArcsec, simbadRows, gaiaRows, wiseRows, 2026.0);

  // Filter application
  const filtered = crossMatched.filter((item) => {
    if (filters.includes('all') || filters.length === 0) return true;

    return filters.some((f) => {
      if (f === 'fast') return item.pmArcsecPerYear >= 0.20;
      if (f === 'browndwarf') return item.kindCode.startsWith('BD') || item.kindLabel.toLowerCase().includes('marrón');
      if (f === 'variable') return item.kindCode.startsWith('V') || item.kindCode.startsWith('Mi') || item.kindLabel.toLowerCase().includes('cambia');
      if (f === 'coldcandidate') return item.isColdCandidate || (!item.hasGaiaMatch && item.kindCode.startsWith('BD'));
      return true;
    });
  });

  // Sort by separation from search center ascending
  filtered.sort((a, b) => a.sepArcsec - b.sepArcsec);

  const topResults = filtered.slice(0, 200).map((item, idx) => ({
    ...item,
    number: idx + 1,
  }));

  let source: 'federated' | 'simbad' | 'gaia' = 'federated';
  let notice: string | undefined = undefined;

  if (gaiaRows.length === 0 && simbadRows.length > 0) {
    source = 'simbad';
    notice = 'Datos de movimiento propio y paralaje de Gaia DR3 temporalmente limitados; mostrando SIMBAD.';
  } else if (simbadRows.length === 0 && gaiaRows.length > 0) {
    source = 'gaia';
    notice = 'Mostrando catálogo astrométrico Gaia DR3.';
  }

  return { results: topResults, source, notice };
}

// ============================================================================
// MAIN UNIFIED CONE SEARCH INTERFACE
// ============================================================================

export async function searchCone(params: ConeSearchParams): Promise<ConeSearchResponse> {
  const { ra, dec, radiusArcmin, filters = ['all'], useReal = true } = params;
  const startTime = Date.now();

  // 1. Check Session/Memory Cache first
  const cacheKey = `${useReal?'catalog':'synthetic'}:${getCacheKey(ra, dec, radiusArcmin, filters)}`;
  const cached = getFromCache(cacheKey);
  if (cached) {
    return {
      ...cached,
      meta: {
        ...cached.meta,
        fromCache: true,
      },
    };
  }

  // 2. Attempt Real Federated Query
  if (useReal && typeof window !== 'undefined' && navigator.onLine) {
    try {
      const { results, source, notice } = await realConeSearch(params);
      const queryDurationMs = Date.now() - startTime;
      const isTruncated = results.length >= 200;

      const meta: ConeSearchMeta = {
        totalFound: results.length,
        shown: Math.min(results.length, 200),
        source,
        isTruncated,
        radiusArcmin,
        centerRa: ra,
        centerDec: dec,
        notice: isTruncated ? 'Zona de alta densidad estelar: mostrando los 200 objetos más cercanos' : notice,
        fromCache: false,
        queryDurationMs,
      };

      const response: ConeSearchResponse = {
        results,
        meta,
        source,
        centerRa: ra,
        centerDec: dec,
        radiusArcmin,
        notice: meta.notice,
        totalInRadius: results.length,
      };

      saveToCache(cacheKey, response);
      return response;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      throw new Error('Catálogos externos no disponibles. Selecciona explícitamente el catálogo simulado para continuar.');
    }
  }

  if(useReal)throw new Error('Catálogos externos no disponibles sin conexión.');
  // 3. Explicit synthetic catalogue
  const mockResults = mockConeSearch(params);
  const queryDurationMs = Date.now() - startTime;
  const isTruncated = mockResults.length >= 200;

  const meta: ConeSearchMeta = {
    totalFound: mockResults.length,
    shown: Math.min(mockResults.length, 200),
    source: 'mock',
    isTruncated,
    radiusArcmin,
    centerRa: ra,
    centerDec: dec,
    notice: 'Mostrando catálogo local de respaldo',
    fromCache: false,
    queryDurationMs,
  };

  const response: ConeSearchResponse = {
    results: mockResults,
    meta,
    source: 'mock',
    centerRa: ra,
    centerDec: dec,
    radiusArcmin,
    notice: meta.notice,
    totalInRadius: mockResults.length,
  };

  saveToCache(cacheKey, response);
  return response;
}
