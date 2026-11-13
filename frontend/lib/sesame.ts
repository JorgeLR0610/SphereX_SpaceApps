import { PRESET_TARGETS } from './constants';
import { parseCoordinates } from './wcs';

export interface ResolvedTarget {
  name: string;
  ra: number;
  dec: number;
  source: 'Local Cache' | 'CDS Sesame' | 'Coordinate Parser';
  type?: string;
  pmRa?: number;
  pmDec?: number;
  description?: string;
}

// Built-in offline catalogue for instant demo response
const KNOWN_OBJECTS: Record<string, { ra: number; dec: number; type: string; pmRa?: number; pmDec?: number; desc: string }> = {
  "barnard": { ra: 269.4521, dec: 4.6933, type: "High Proper Motion Star", pmRa: -802.8, pmDec: 10362.5, desc: "Barnard's Star (Ofiuco)" },
  "barnard's star": { ra: 269.4521, dec: 4.6933, type: "High Proper Motion Star", pmRa: -802.8, pmDec: 10362.5, desc: "Barnard's Star" },
  "estrella de barnard": { ra: 269.4521, dec: 4.6933, type: "High Proper Motion Star", pmRa: -802.8, pmDec: 10362.5, desc: "Estrella de Barnard" },
  "wise 0855": { ra: 133.7951, dec: -7.2451, type: "Sub-Brown Dwarf", pmRa: -8150.0, pmDec: 540.0, desc: "WISE J085510.83-071442.5" },
  "wise0855": { ra: 133.7951, dec: -7.2451, type: "Sub-Brown Dwarf", pmRa: -8150.0, pmDec: 540.0, desc: "WISE 0855-0714" },
  "epsilon indi b": { ra: 331.0438, dec: -56.7828, type: "Binary Brown Dwarf", pmRa: 3961.0, pmDec: -2539.0, desc: "Epsilon Indi Ba/Bb" },
  "eps ind b": { ra: 331.0438, dec: -56.7828, type: "Binary Brown Dwarf", pmRa: 3961.0, pmDec: -2539.0, desc: "Epsilon Indi B" },
  "rw aur": { ra: 76.9564, dec: 30.4014, type: "T Tauri Variable Star", pmRa: 1.2, pmDec: -22.4, desc: "RW Aurigae" },
  "rw aurigae": { ra: 76.9564, dec: 30.4014, type: "T Tauri Variable Star", pmRa: 1.2, pmDec: -22.4, desc: "RW Aurigae" },
  "r dra": { ra: 248.1676, dec: 66.7551, type: "Mira Variable Star", pmRa: -14.8, pmDec: 12.3, desc: "R Draconis" },
  "r draconis": { ra: 248.1676, dec: 66.7551, type: "Mira Variable Star", pmRa: -14.8, pmDec: 12.3, desc: "R Draconis" },
  "proxima centauri": { ra: 217.4289, dec: -62.6795, type: "Red Dwarf / Flare Star", pmRa: -3775.7, pmDec: 765.5, desc: "Estrella más cercana al Sol (4.24 ly)" },
  "luhman 16": { ra: 162.3288, dec: -53.3195, type: "Binary Brown Dwarf", pmRa: -2759.0, pmDec: 357.0, desc: "Par de enanas marrones más cercano a la Tierra (6.5 ly)" },
  "teegarden": { ra: 43.2536, dec: 16.8997, type: "Ultra-cool M dwarf", pmRa: 5046.0, pmDec: -3791.0, desc: "Estrella de Teegarden con exoplanetas" },
  "trappist-1": { ra: 346.6224, dec: -5.0414, type: "Ultra-cool dwarf", pmRa: 930.9, pmDec: -491.5, desc: "Sistema de 7 exoplanetas terrestres" },
  "sirius": { ra: 101.2871, dec: -16.7161, type: "A1V + DA2 Star", pmRa: -546.0, pmDec: -1223.1, desc: "Sirio (Alpha Canis Majoris)" },
  "betelgeuse": { ra: 88.7929, dec: 7.4071, type: "Red Supergiant Variable", pmRa: 27.5, pmDec: 11.3, desc: "Supergigante roja en Orión" },
};

export async function resolveTargetName(query: string): Promise<ResolvedTarget | null> {
  const qClean = query.trim();
  if (!qClean) return null;

  // 1. Check if user typed coordinates directly
  const coords = parseCoordinates(qClean);
  if (coords) {
    return {
      name: `J${coords.ra.toFixed(3)}${coords.dec >= 0 ? '+' : ''}${coords.dec.toFixed(3)}`,
      ra: coords.ra,
      dec: coords.dec,
      source: 'Coordinate Parser',
      type: 'User Specified Coordinates',
    };
  }

  // 2. Check local catalog
  const key = qClean.toLowerCase();
  if (KNOWN_OBJECTS[key]) {
    const obj = KNOWN_OBJECTS[key];
    return {
      name: qClean,
      ra: obj.ra,
      dec: obj.dec,
      source: 'Local Cache',
      type: obj.type,
      pmRa: obj.pmRa,
      pmDec: obj.pmDec,
      description: obj.desc,
    };
  }

  // Check preset list
  const preset = PRESET_TARGETS.find(p => 
    (p.name && p.name.toLowerCase().includes(key)) || p.id.toLowerCase().includes(key)
  );
  if (preset) {
    return {
      name: preset.name || preset.id,
      ra: preset.ra,
      dec: preset.dec,
      source: 'Local Cache',
      type: preset.category,
      pmRa: preset.pmRa,
      pmDec: preset.pmDec,
      description: preset.description,
    };
  }

  // 3. Query CDS Sesame service (if browser is online)
  if (typeof window !== 'undefined' && navigator.onLine) {
    try {
      const url = `https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?${encodeURIComponent(qClean)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const text = await resp.text();
        // Parse XML response from Sesame
        const jradegMatch = text.match(/<jradeg>([0-9.]+)<\/jradeg>/);
        const jdedegMatch = text.match(/<jdedeg>([+-]?[0-9.]+)<\/jdedeg>/);
        const otypeMatch = text.match(/<otype>([^<]+)<\/otype>/);

        if (jradegMatch && jdedegMatch) {
          const ra = parseFloat(jradegMatch[1]);
          const dec = parseFloat(jdedegMatch[1]);
          const otype = otypeMatch ? otypeMatch[1].trim() : 'Astronomical Object';

          return {
            name: qClean,
            ra,
            dec,
            source: 'CDS Sesame',
            type: otype,
            description: `Objeto resuelto en SIMBAD/Sesame (${otype})`,
          };
        }
      }
    } catch {
      // Network blocked or timeout, continue to fallback
    }
  }

  // Partial match fallback in known objects
  for (const [k, obj] of Object.entries(KNOWN_OBJECTS)) {
    if (k.includes(key) || key.includes(k)) {
      return {
        name: obj.desc,
        ra: obj.ra,
        dec: obj.dec,
        source: 'Local Cache',
        type: obj.type,
        pmRa: obj.pmRa,
        pmDec: obj.pmDec,
        description: obj.desc,
      };
    }
  }

  return null;
}
