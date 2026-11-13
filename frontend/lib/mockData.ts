import { 
  FramesResponse, 
  Frame, 
  WCS, 
  Spectrum, 
  SpectrumPoint, 
  CatalogMarker, 
  ContaminationFlag 
} from './types';
import { PRESET_TARGETS, SPHEREX_102_BANDS } from './constants';
import { celestialToPixel } from './wcs';

// Seeded pseudo-random generator for consistent astronomical fields
function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface SyntheticStar {
  ra: number;
  dec: number;
  baseFlux: number;
  sigma: number;
  hasSpikes?: boolean;
}

/**
 * Generates synthetic high-definition astronomical cutouts for SPHEREx (256x256)
 */
export function generateMockFrames(
  ra: number,
  dec: number,
  fovArcmin: number = 5.0,
  targetName?: string
): FramesResponse {
  const size = 256; // High definition 256x256 grid
  const crpix: [number, number] = [size / 2, size / 2];
  const cdeltDegPerPixel = (fovArcmin / 60.0) / size;

  const wcs: WCS = {
    crpix,
    crval: [ra, dec],
    cdelt: cdeltDegPerPixel,
    size: [size, size],
  };

  // Find matching preset target or default to general field
  const preset = PRESET_TARGETS.find(
    p => (p.name && targetName && p.name.toLowerCase() === targetName.toLowerCase()) ||
         (Math.abs(p.ra - ra) < 0.05 && Math.abs(p.dec - dec) < 0.05)
  );

  const pmRa = preset ? preset.pmRa || 0 : -2500;
  const pmDec = preset ? preset.pmDec || 0 : 4500;

  // 4 survey epochs (SPHEREx 2-year survey, ~0.5 year intervals: 2025.5, 2026.0, 2026.5, 2027.0)
  const epochs = [
    { epoch: 1, date: '2025-06-15T12:00:00Z', mjd: 60841.5 },
    { epoch: 2, date: '2025-12-14T18:30:00Z', mjd: 61023.7 },
    { epoch: 3, date: '2026-06-16T08:15:00Z', mjd: 61207.3 },
    { epoch: 4, date: '2026-12-15T22:45:00Z', mjd: 61389.9 },
  ];

  // Fixed background stars (deterministic by coordinate hash)
  const coordHash = Math.round(ra * 1000 + dec * 777);
  const rand = pseudoRandom(coordHash);

  const numBackgroundStars = 45;
  const backgroundStars: SyntheticStar[] = [];
  const arcminSpan = fovArcmin / 2.0;

  for (let i = 0; i < numBackgroundStars; i++) {
    const dRa = (rand() - 0.5) * (arcminSpan / 60.0) * 1.7;
    const dDec = (rand() - 0.5) * (arcminSpan / 60.0) * 1.7;
    // Don't place a bright background star right on top of center target
    const distToCenter = Math.hypot(dRa, dDec);
    if (distToCenter < 0.003) continue;

    const brightnessTier = rand();
    let baseFlux = 20.0;
    let sigma = 1.8;
    let hasSpikes = false;

    if (brightnessTier > 0.92) {
      // Very bright star with subtle diffraction spikes
      baseFlux = 280.0 + rand() * 200.0;
      sigma = 2.8;
      hasSpikes = true;
    } else if (brightnessTier > 0.7) {
      // Moderate star
      baseFlux = 80.0 + rand() * 120.0;
      sigma = 2.2;
    } else {
      // Faint background star
      baseFlux = 15.0 + rand() * 45.0;
      sigma = 1.6;
    }

    backgroundStars.push({
      ra: ra + dRa,
      dec: dec + dDec,
      baseFlux,
      sigma,
      hasSpikes,
    });
  }

  const frames: Frame[] = [];
  const arcsecPerPix = Math.abs(wcs.cdelt) * 3600.0;

  // Generate 4 epochs x 6 detectors = 24 frames total
  epochs.forEach((ep, epIdx) => {
    const elapsedYears = epIdx * 0.5;

    // Target displacement calculation
    const dRaArcsec = ((pmRa / 1000.0) * elapsedYears);
    const dDecArcsec = ((pmDec / 1000.0) * elapsedYears);

    // Moving target pixel coordinate for this epoch
    const targetPxX = crpix[0] - (dRaArcsec / arcsecPerPix);
    const targetPxY = crpix[1] - (dDecArcsec / arcsecPerPix);

    // Variable star flux multiplier (for RW Aur or R Dra)
    let varMultiplier = 1.0;
    if (preset?.id === 'r_dra') {
      // 245 day Mira pulsation
      varMultiplier = 0.15 + 0.85 * Math.pow(Math.sin(epIdx * 1.2 + 0.1), 2);
    } else if (preset?.id === 'rw_aur') {
      // Irregular dust occultation
      const drops = [1.0, 0.22, 0.78, 0.35];
      varMultiplier = drops[epIdx % drops.length];
    }

    for (let det = 1; det <= 6; det++) {
      const frameId = `SPHX_E${ep.epoch}_D${det}_${ep.mjd.toFixed(0)}`;
      const bandIdx = (det - 1) * 17 + 8; // representative central band for this detector
      const band = SPHEREX_102_BANDS[bandIdx];

      // Contamination flags
      const flags: ContaminationFlag[] = [];
      if (ep.epoch === 2 && det === 5) flags.push('cosmic_ray');
      if (ep.epoch === 4 && det === 1) flags.push('contaminated_edge');
      if (ep.epoch === 3 && det === 6) flags.push('stray_light');
      if (flags.length === 0) flags.push('clean');

      // Generate pixel grid
      const pixelData = new Float32Array(size * size);
      const detRand = pseudoRandom(coordHash + epIdx * 100 + det * 17);

      // Clean, low-noise deep space background (thermal + zodiacal emission)
      const baseSky = 3.5 + det * 0.5;
      const noiseSigma = 0.55 + det * 0.08;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = y * size + x;
          // Box-Muller normal distribution for subtle photon noise
          const u1 = Math.max(0.0001, detRand());
          const u2 = detRand();
          const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
          pixelData[idx] = Math.max(0, baseSky + z0 * noiseSigma);
        }
      }

      // Add fixed background stars
      backgroundStars.forEach(star => {
        const starPix = celestialToPixel(star.ra, star.dec, wcs);
        const sx = starPix.x;
        const sy = starPix.y;

        // Detector wavelength dependent flux (Rayleigh-Jeans optical/near-IR falloff)
        const lambdaFactor = Math.pow(1.6 / band.lambda_um, 0.6);
        const starFlux = star.baseFlux * lambdaFactor;

        addRealisticStar(pixelData, size, sx, sy, starFlux, star.sigma, star.hasSpikes);
      });

      // Add target object with distinct spectral and motion signature
      let targetFlux = 160.0;
      let targetSigma = 2.2;

      if (preset?.id === 'wise0855') {
        // Cold brown dwarf: VERY faint in Det 1-2 (0.75-1.6µm), extremely bright in Det 4-6 (2.4-5.0µm)
        const detGains = [0.03, 0.12, 0.45, 1.6, 3.2, 3.8];
        targetFlux = 140.0 * detGains[det - 1];
        targetSigma = 2.5;
      } else if (preset?.id === 'r_dra' || preset?.id === 'rw_aur') {
        targetFlux = 260.0 * varMultiplier;
        targetSigma = 2.6;
      } else if (preset?.id === 'barnard') {
        // M-dwarf: peak at 1.2-2.0 µm
        const mFactors = [0.9, 1.4, 1.3, 0.7, 0.5, 0.4];
        targetFlux = 210.0 * mFactors[det - 1];
        targetSigma = 2.4;
      } else if (preset?.id === 'eps_indi_b') {
        // T-dwarf: strong CH4 dips in det 2 and 4
        const tFactors = [0.2, 0.55, 0.95, 0.45, 1.9, 2.2];
        targetFlux = 150.0 * tFactors[det - 1];
        targetSigma = 2.3;
      }

      addRealisticStar(pixelData, size, targetPxX, targetPxY, targetFlux, targetSigma, false);

      // Add synthetic cosmic ray artifact if flagged
      if (flags.includes('cosmic_ray')) {
        const cx = 55;
        const cy = 68;
        for (let i = 0; i < 7; i++) {
          if (cy + i < size && cx + i < size) {
            pixelData[(cy + i) * size + (cx + i)] = 850.0;
          }
        }
      }

      // Compute statistics
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      for (let i = 0; i < pixelData.length; i++) {
        const v = pixelData[i];
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
      }
      const mean = sum / pixelData.length;

      frames.push({
        id: frameId,
        mjd: ep.mjd,
        date: ep.date,
        epochIndex: ep.epoch - 1,
        detector: det,
        band,
        flags,
        width: size,
        height: size,
        pixelData,
        movingTargetPixel: { x: targetPxX, y: targetPxY },
        variableFluxMultiplier: varMultiplier,
        stats: {
          min,
          max,
          mean,
          median: baseSky,
          std: noiseSigma,
        },
      });
    }
  });

  return {
    target: {
      ra,
      dec,
      name: preset?.name || targetName || `J${ra.toFixed(3)}${dec >= 0 ? '+' : ''}${dec.toFixed(3)}`,
      pmRa,
      pmDec,
      category: preset?.category || 'High Proper Motion',
      description: preset?.description,
    },
    wcs,
    fovArcmin,
    frames,
    epochs,
    detectiveTarget: preset?.detectiveMission || {
      name: `Target J${ra.toFixed(2)}${dec >= 0 ? '+' : ''}${dec.toFixed(2)}`,
      category: 'Objeto de Alto Movimiento Propio',
      expectedPmRaMasYr: pmRa,
      expectedPmDecMasYr: pmDec,
      initialCoords: { ra, dec },
      initialPixel: crpix,
      hints: [
        'Compara los fotogramas entre épocas usando el slider de tiempo.',
        'Activa el Modo Diferencia para resaltar el movimiento.',
      ],
      description: 'Encuentra el objeto móvil desplazándose a través del campo estelar.',
      foundTolerancePixels: 24,
    },
  };
}

/**
 * Renders a scientifically realistic star PSF:
 * Gaussian Core + Subtle Airy Halo + Diffraction Spikes for bright stars
 */
function addRealisticStar(
  data: Float32Array,
  size: number,
  cx: number,
  cy: number,
  peakFlux: number,
  sigma: number,
  hasSpikes: boolean = false
) {
  const radius = Math.ceil(sigma * 4.0);
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(size - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(size - 1, Math.ceil(cy + radius));

  const twoSigmaSq = 2.0 * sigma * sigma;

  for (let y = minY; y <= maxY; y++) {
    const dy = y - cy;
    const dySq = dy * dy;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const distSq = dx * dx + dySq;
      // Core Gaussian
      const core = peakFlux * Math.exp(-distSq / twoSigmaSq);
      // Soft outer halo
      const halo = (peakFlux * 0.08) * Math.exp(-distSq / (twoSigmaSq * 4.5));
      data[y * size + x] += core + halo;
    }
  }

  // 4-point telescope diffraction spikes for high flux stars
  if (hasSpikes && peakFlux > 150) {
    const spikeLen = Math.min(24, Math.floor(sigma * 6));
    const spikeFlux = peakFlux * 0.12;
    for (let d = 1; d <= spikeLen; d++) {
      const atten = (1.0 - d / spikeLen) * spikeFlux;
      if (atten <= 0.1) break;
      // Horizontal
      if (cx + d < size) data[Math.round(cy) * size + Math.round(cx + d)] += atten;
      if (cx - d >= 0) data[Math.round(cy) * size + Math.round(cx - d)] += atten;
      // Vertical
      if (cy + d < size) data[Math.round(cy + d) * size + Math.round(cx)] += atten;
      if (cy - d >= 0) data[Math.round(cy - d) * size + Math.round(cx)] += atten;
    }
  }
}

/**
 * Generates an authentic 102-band spectrum (0.75 - 5.0 µm) for a selected pixel or object
 */
export function generateMockSpectrum(
  ra: number,
  dec: number,
  pixel: { x: number; y: number },
  wcs: WCS,
  framesResponse: FramesResponse
): Spectrum {
  const { detectiveTarget } = framesResponse;
  const initialPx = detectiveTarget?.initialPixel || [128, 128];
  const distToTarget = Math.hypot(pixel.x - initialPx[0], pixel.y - initialPx[1]);

  const isTargetObject = distToTarget <= 22;
  const targetId = PRESET_TARGETS.find(p => p.name === framesResponse.target.name)?.id || 'generic';

  const points: SpectrumPoint[] = [];

  SPHEREX_102_BANDS.forEach((b, idx) => {
    const lambda = b.lambda_um;
    let baseFlux = 1.5; // faint zodiacal sky background

    if (isTargetObject) {
      if (targetId === 'wise0855') {
        // Cold brown dwarf model (250K Planck blackbody shifted + intense CH4 and H2O absorption)
        // Peak is far into the mid-IR ~ 4.5 µm
        const bb = 140.0 * Math.pow(lambda / 4.5, 3.2) / (Math.exp(3.5 / lambda) - 1.0);
        baseFlux = bb;

        // Water absorption dip at 1.4 µm, 1.9 µm, and 2.7 µm
        if (Math.abs(lambda - 1.4) < 0.15) baseFlux *= 0.28;
        if (Math.abs(lambda - 1.9) < 0.2) baseFlux *= 0.22;
        if (Math.abs(lambda - 2.7) < 0.3) baseFlux *= 0.32;

        // Methane (CH4) absorption dip at 1.66 µm and 3.3 µm
        if (Math.abs(lambda - 1.66) < 0.12) baseFlux *= 0.38;
        if (Math.abs(lambda - 3.3) < 0.25) baseFlux *= 0.18;
      } else if (targetId === 'r_dra') {
        // Mira variable: cool red giant with molecular TiO / CO / H2O bands
        baseFlux = 95.0 * Math.pow(1.6 / lambda, 1.8) + 35.0;
        if (Math.abs(lambda - 1.4) < 0.18) baseFlux *= 0.5;
        if (Math.abs(lambda - 2.3) < 0.15) baseFlux *= 0.6; // CO band head
        if (Math.abs(lambda - 4.3) < 0.2) baseFlux *= 0.4; // CO2 / dust
      } else if (targetId === 'rw_aur') {
        // T Tauri star with infrared excess from circumstellar dust disk
        const stellar = 85.0 * Math.pow(1.0 / lambda, 1.5);
        const diskExcess = 50.0 * Math.pow(lambda / 3.0, 1.8);
        baseFlux = stellar + diskExcess;
      } else if (targetId === 'barnard') {
        // M-dwarf: peak around 1.1 - 1.6 µm
        baseFlux = 160.0 * Math.exp(-Math.pow(lambda - 1.3, 2) / 1.2) + 25.0;
        if (Math.abs(lambda - 1.4) < 0.1) baseFlux *= 0.65; // H2O
      } else {
        // General star
        baseFlux = 75.0 * Math.pow(1.2 / lambda, 1.2) + 12.0;
      }
    } else {
      // Background star or sky
      baseFlux = 3.5 + (Math.sin(lambda * 5.0) * 0.8);
    }

    // Add measurement noise
    const noise = (Math.random() - 0.5) * (baseFlux * 0.03 + 0.25);
    const flux = Math.max(0.1, parseFloat((baseFlux + noise).toFixed(2)));
    const err = parseFloat((flux * 0.04 + 0.18).toFixed(2));

    points.push({
      lambda_um: lambda,
      flux,
      err,
      detector: b.detector,
      bandIndex: idx,
    });
  });

  // Epoch comparisons for variable stars
  const epochSpectra = isTargetObject && (targetId === 'r_dra' || targetId === 'rw_aur')
    ? [
        { epoch: 1, date: '2025-06-15', points: points.map(p => ({ ...p, flux: parseFloat((p.flux * 1.0).toFixed(2)) })) },
        { epoch: 2, date: '2025-12-14', points: points.map(p => ({ ...p, flux: parseFloat((p.flux * (targetId === 'r_dra' ? 0.35 : 0.4)).toFixed(2)) })) },
        { epoch: 3, date: '2026-06-16', points: points.map(p => ({ ...p, flux: parseFloat((p.flux * (targetId === 'r_dra' ? 0.85 : 0.75)).toFixed(2)) })) },
        { epoch: 4, date: '2026-12-15', points: points.map(p => ({ ...p, flux: parseFloat((p.flux * (targetId === 'r_dra' ? 0.2 : 0.5)).toFixed(2)) })) },
      ]
    : undefined;

  const features = isTargetObject
    ? [
        { label: 'H2O Vapor', lambda_um: 1.4, type: 'absorption' as const, description: 'Banda vibracional de vapor de agua en atmósfera fría' },
        { label: 'CH4 (Metano)', lambda_um: 1.66, type: 'absorption' as const, description: 'Metano atmosférico característico de enanas T e Y' },
        { label: 'H2O Hielo', lambda_um: 3.0, type: 'absorption' as const, description: 'Banda fundamental de hielo de agua' },
        { label: 'CH4 ν3', lambda_um: 3.3, type: 'absorption' as const, description: 'Modo de estiramiento del metano' },
        { label: 'CO2 / CO', lambda_um: 4.26, type: 'absorption' as const, description: 'Banda de dióxido y monóxido de carbono' },
      ]
    : undefined;

  return {
    ra,
    dec,
    pixel,
    points,
    epochSpectra,
    features,
    objectIdentified: isTargetObject ? framesResponse.target.name : 'Píxel de fondo / Campo Estelar',
  };
}

/**
 * Returns Gaia DR3 and CatWISE catalog cross-identification positions
 */
export function getCatalogMarkers(
  framesResponse: FramesResponse
): CatalogMarker[] {
  const { target, wcs } = framesResponse;
  const markers: CatalogMarker[] = [];

  // Gaia DR3 marker (Epoch 2016.0 reference)
  const gaiaElapsedYears = 2016.0 - 2025.5; // -9.5 years offset
  const dRaGaiaArcsec = ((target.pmRa || 0) / 1000.0) * gaiaElapsedYears;
  const dDecGaiaArcsec = ((target.pmDec || 0) / 1000.0) * gaiaElapsedYears;
  const arcsecPerPix = Math.abs(wcs.cdelt) * 3600.0;

  markers.push({
    id: `Gaia DR3 ${Math.round(target.ra * 100)}`,
    catalog: 'Gaia DR3',
    ra: target.ra,
    dec: target.dec,
    pixelX: wcs.crpix[0] - (dRaGaiaArcsec / arcsecPerPix),
    pixelY: wcs.crpix[1] - (dDecGaiaArcsec / arcsecPerPix),
    mag: 13.5,
    band: 'G',
    pmRa: target.pmRa,
    pmDec: target.pmDec,
  });

  // CatWISE2020 marker (Epoch 2020.0 reference)
  const wiseElapsedYears = 2020.0 - 2025.5; // -5.5 years offset
  const dRaWiseArcsec = ((target.pmRa || 0) / 1000.0) * wiseElapsedYears;
  const dDecWiseArcsec = ((target.pmDec || 0) / 1000.0) * wiseElapsedYears;

  markers.push({
    id: `CatWISE2020 J${target.ra.toFixed(2)}`,
    catalog: 'CatWISE2020',
    ra: target.ra,
    dec: target.dec,
    pixelX: wcs.crpix[0] - (dRaWiseArcsec / arcsecPerPix),
    pixelY: wcs.crpix[1] - (dDecWiseArcsec / arcsecPerPix),
    mag: 11.2,
    band: 'W1/W2',
    pmRa: target.pmRa,
    pmDec: target.pmDec,
  });

  return markers;
}
