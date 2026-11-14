'use client';

import { useSyncExternalStore } from 'react';
import { 
  Target, 
  Frame, 
  WCS, 
  Spectrum, 
  DisplayMode, 
  StretchFunction, 
  ColormapType, 
  DiffReference,
  DetectiveTarget,
  FramesResponse
} from '../lib/types';
import { PRESET_TARGETS } from '../lib/constants';
import { api, isRealApiActive } from '../lib/apiAdapter';
import { sound } from '../lib/sound';

export interface SelectedObjectCallout {
  name: string;
  type: string;
  motion: string;
  temp?: string;
  description: string;
  pixel: { x: number; y: number };
}

export interface SpherexState {
  // Target coordinates
  target: Target;
  fov: number; // 1 to 30 arcmin
  
  // Detectors 1-6 active state
  detectors: boolean[]; // length 6: [true, true, ...]
  sumDetectors: boolean; // Σ mode
  
  // Display & Processing Modes
  mode: DisplayMode;
  diffRef: DiffReference;
  colormap: ColormapType;
  stretch: {
    min: number;
    max: number;
    fn: StretchFunction;
  };
  
  // Overlays & Annotations
  overlays: {
    gaia: boolean;
    wise: boolean;
    trajectory: boolean;
    crosshair: boolean;
    annotations: boolean; // Prominent visual guide labels
    ghostingTrail: boolean; // Multi-exposure ghosting showing all 4 positions at once
  };
  
  // Blinking Comparison Mode (Epoch 1 <-> Epoch 4)
  blinkMode: boolean;
  
  // Detective Game Mode
  detective: boolean;
  detectiveFound: boolean;
  detectiveScore: number;
  detectiveTarget?: DetectiveTarget;
  
  // Selected Object Callout on the Canvas
  selectedObjectCallout: SelectedObjectCallout | null;
  
  // Playback & Frames
  frames: Frame[];
  epochs: { epoch: number; date: string; mjd: number }[];
  currentEpoch: number; // 0, 1, 2, 3
  playing: boolean;
  fps: number;
  
  // Inspection
  selectedPixel?: { x: number; y: number };
  spectrum?: Spectrum;
  hoverCoords?: { ra: number; dec: number; x: number; y: number; flux: number };
  
  // WCS & Status
  wcs: WCS;
  isLoading: boolean;
  error: string | null;
  isEmbed: boolean;
  isAudioMuted: boolean;
  provenance?: Record<string, unknown>;
}

const isRealApiDefault = process.env.NEXT_PUBLIC_USE_REAL_API !== 'false';
const defaultPreset = isRealApiDefault
  ? (PRESET_TARGETS.find(p => p.id === 'm101') || PRESET_TARGETS[0])
  : (PRESET_TARGETS.find(p => p.id === 'wise0855') || PRESET_TARGETS[0]);

const isM101Default = defaultPreset.id === 'm101';

const initialState: SpherexState = {
  target: {
    ra: defaultPreset.ra,
    dec: defaultPreset.dec,
    name: defaultPreset.name,
    pmRa: defaultPreset.pmRa,
    pmDec: defaultPreset.pmDec,
    category: defaultPreset.category,
    description: defaultPreset.description,
  },
  fov: isM101Default ? 3.0 : 5.0,
  detectors: isM101Default ? [false, true, false, false, false, false] : [true, true, true, true, true, true],
  sumDetectors: false,
  mode: 'normal',
  diffRef: 'first',
  colormap: 'inferno',
  stretch: {
    min: isM101Default ? 1.0 : 0,
    max: isM101Default ? 2.5 : 140,
    fn: isM101Default ? 'linear' : 'asinh',
  },
  overlays: {
    gaia: false, // Keep clean by default
    wise: false,
    trajectory: !isM101Default,
    crosshair: false,
    annotations: !isM101Default,
    ghostingTrail: false,
  },
  blinkMode: false,
  detective: false,
  detectiveFound: false,
  detectiveScore: 0,
  detectiveTarget: defaultPreset.detectiveMission,
  selectedObjectCallout: isM101Default ? null : {
    name: defaultPreset.name || 'WISE 0855',
    type: 'Sub-enana marrón ultra fría (Y4)',
    motion: '8.1" por año (~83 km/s)',
    temp: '250 K (-23 °C)',
    description: 'Se mueve rápidamente frente a las estrellas lejanas. Pulsa "Play" o "Diferencia" para ver su movimiento.',
    pixel: { x: 128, y: 128 },
  },
  frames: [],
  epochs: [],
  currentEpoch: 0,
  playing: false,
  fps: 3,
  selectedPixel: isM101Default ? { x: 15, y: 15 } : { x: 128, y: 128 },
  wcs: {
    crpix: isM101Default ? [15, 15] : [128, 128],
    crval: [defaultPreset.ra, defaultPreset.dec],
    cdelt: isM101Default ? 0.0017088 : (5.0 / 60.0) / 256,
    size: isM101Default ? [30, 30] : [256, 256],
  },
  isLoading: false,
  error: null,
  isEmbed: false,
  isAudioMuted: false,
};

let state: SpherexState = { ...initialState };
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach(listener => listener());
  syncUrl();
}

// Bidirectional URL sync
function syncUrl() {
  if (typeof window === 'undefined') return;
  const currentParams = new URLSearchParams(window.location.search);
  const p = new URLSearchParams();
  p.set('view', 'observatory');
  if (currentParams.has('api')) {
    p.set('api', currentParams.get('api')!);
  }
  p.set('ra', state.target.ra.toFixed(4));
  p.set('dec', state.target.dec.toFixed(4));
  p.set('fov', state.fov.toString());
  p.set('mode', state.mode);
  p.set('det', state.detectors.map(d => (d ? '1' : '0')).join(''));
  if (state.sumDetectors) p.set('sum', '1');
  p.set('ep', state.currentEpoch.toString());
  if (state.overlays.gaia) p.set('gaia', '1');
  if (state.overlays.wise) p.set('wise', '1');
  if (state.detective) p.set('detective', '1');
  if (state.isEmbed) p.set('embed', '1');

  const newUrl = `${window.location.pathname}?${p.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

export const spherexStore = {
  getState: () => state,

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  initFromUrl: () => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const activeIsReal = isRealApiActive();

    let targetPreset = PRESET_TARGETS.find(pr => pr.id === p.get('target'));
    if (!targetPreset && !p.has('ra')) {
      targetPreset = activeIsReal
        ? PRESET_TARGETS.find(pr => pr.id === 'm101')
        : PRESET_TARGETS.find(pr => pr.id === 'wise0855');
    }

    const baseTarget = targetPreset || (activeIsReal ? (PRESET_TARGETS.find(pr => pr.id === 'm101') || state.target) : (PRESET_TARGETS.find(pr => pr.id === 'wise0855') || state.target));
    const ra = p.get('ra') ? parseFloat(p.get('ra')!) : baseTarget.ra;
    const dec = p.get('dec') ? parseFloat(p.get('dec')!) : baseTarget.dec;
    const isM101 = activeIsReal && Math.abs(ra - 210.80227) < 0.01 && Math.abs(dec - 54.34895) < 0.01;
    const fov = p.get('fov') ? parseFloat(p.get('fov')!) : (isM101 ? 3.0 : (targetPreset?.id === 'wise0855' ? 5.0 : state.fov));
    const mode = (p.get('mode') as DisplayMode) || state.mode;
    const detParam = p.get('det');
    const isEmbed = p.get('embed') === '1';
    const detective = p.get('detective') === '1';

    let detectors = state.detectors;
    if (detParam && detParam.length === 6) {
      detectors = detParam.split('').map(c => c === '1');
    } else if (isM101) {
      detectors = [false, true, false, false, false, false];
    } else if (!activeIsReal) {
      detectors = [true, true, true, true, true, true];
    }

    state = {
      ...state,
      target: {
        ...state.target,
        ra,
        dec,
        name: baseTarget.name || state.target.name,
        pmRa: baseTarget.pmRa,
        pmDec: baseTarget.pmDec,
        category: baseTarget.category,
        description: baseTarget.description,
      },
      fov: isNaN(fov) ? 5.0 : Math.min(30, Math.max(1, fov)),
      currentEpoch: Math.max(0, Number.parseInt(p.get('ep') || '0', 10) || 0),
      mode: ['normal', 'diff', 'stack'].includes(mode) ? mode : 'normal',
      detectors,
      sumDetectors: p.get('sum') === '1',
      isEmbed,
      detective: activeIsReal ? false : detective,
      selectedPixel: isM101 ? undefined : state.selectedPixel,
      selectedObjectCallout: isM101 ? null : state.selectedObjectCallout,
      overlays: {
        ...state.overlays,
        gaia: !activeIsReal && p.get('gaia') === '1',
        wise: !activeIsReal && p.get('wise') === '1',
      },
    };
    emitChange();
    spherexStore.loadFrames();
  },

  setTarget: async (target: Partial<Target>) => {
    const preset = PRESET_TARGETS.find(p => p.name === target.name || p.id === (target as { id?: string }).id);
    const targetFov = preset?.id === 'm101' ? 3.0 : (preset ? 5.0 : state.fov);
    const isM101 = preset?.id === 'm101';
    state = {
      ...state,
      target: { ...state.target, ...target },
      fov: targetFov,
      detectiveFound: false,
      selectedPixel: isM101 ? { x: 15, y: 15 } : { x: 128, y: 128 },
      selectedObjectCallout: isM101 ? null : {
        name: target.name || 'Objetivo',
        type: target.category || 'Astro Infrarrojo',
        motion: `${Math.hypot(target.pmRa || 0, target.pmDec || 0).toFixed(0)} mas/año`,
        temp: preset?.tagline || 'Estelar',
        description: target.description || 'Haz clic para explorar el espectro infrarrojo.',
        pixel: { x: 128, y: 128 },
      },
    };
    emitChange();
    await spherexStore.loadFrames();
  },

  setFov: async (fov: number) => {
    state = { ...state, fov: Math.max(1, Math.min(30, fov)) };
    emitChange();
    await spherexStore.loadFrames();
  },

  toggleDetector: (detNum: number) => {
    if (isRealApiActive()) return;
    const idx = detNum - 1;
    const nextDets = [...state.detectors];
    nextDets[idx] = !nextDets[idx];
    if (!nextDets.some(Boolean)) {
      nextDets[idx] = true;
    }
    state = { ...state, detectors: nextDets };
    sound.playBlip(720);
    emitChange();
  },

  setSumDetectors: (sum: boolean) => {
    state = { ...state, sumDetectors: sum };
    sound.playBlip(680);
    emitChange();
  },

  setMode: (mode: DisplayMode) => {
    state = { ...state, mode, playing: false, blinkMode: false, currentEpoch: mode === 'diff' && state.currentEpoch === 0 && state.epochs.length > 1 ? 1 : state.currentEpoch };
    if (mode === 'diff') {
      state.colormap = 'coolwarm';
    } else if (state.colormap === 'coolwarm') {
      state.colormap = 'inferno';
    }
    sound.playBlip(820);
    emitChange();
  },

  setDiffRef: (ref: DiffReference) => {
    state = { ...state, diffRef: ref };
    emitChange();
  },

  setColormap: (colormap: ColormapType) => {
    state = { ...state, colormap };
    emitChange();
  },

  setStretch: (stretch: Partial<SpherexState['stretch']>) => {
    state = { ...state, stretch: { ...state.stretch, ...stretch } };
    emitChange();
  },

  toggleOverlay: (name: keyof SpherexState['overlays']) => {
    if (isRealApiActive() && ['gaia', 'wise', 'trajectory', 'annotations', 'ghostingTrail'].includes(name)) return;
    state = {
      ...state,
      overlays: { ...state.overlays, [name]: !state.overlays[name] },
    };
    sound.playBlip(600);
    emitChange();
  },

  toggleBlinkMode: () => {
    const nextBlink = !state.blinkMode;
    state = {
      ...state,
      blinkMode: nextBlink,
      playing: false,
      mode: nextBlink ? 'normal' : state.mode,
      currentEpoch: nextBlink ? 0 : state.currentEpoch,
    };
    sound.playBlip(nextBlink ? 880 : 440);
    emitChange();
  },

  toggleGhostingTrail: () => {
    if (isRealApiActive()) return;
    const next = !state.overlays.ghostingTrail;
    state = {
      ...state,
      overlays: { ...state.overlays, ghostingTrail: next },
    };
    sound.playBlip(750);
    emitChange();
  },

  setDetective: (detective: boolean) => {
    if (isRealApiActive()) return;
    state = { ...state, detective, detectiveFound: false };
    sound.playBlip(detective ? 950 : 450);
    emitChange();
  },

  stopPlayback: () => { state = { ...state, playing: false, blinkMode: false }; emitChange(); },

  setCurrentEpoch: (epoch: number) => {
    const numEpochs = state.epochs.length || 4;
    const nextEp = ((epoch % numEpochs) + numEpochs) % numEpochs;
    state = { ...state, currentEpoch: nextEp };
    sound.playBlip(480 + nextEp * 70);
    emitChange();
  },

  nextEpoch: () => {
    spherexStore.setCurrentEpoch(state.currentEpoch + 1);
  },

  prevEpoch: () => {
    spherexStore.setCurrentEpoch(state.currentEpoch - 1);
  },

  setPlaying: (playing: boolean) => {
    state = { ...state, playing, blinkMode: false };
    emitChange();
  },

  setFps: (fps: number) => {
    state = { ...state, fps: Math.max(1, Math.min(20, fps)) };
    emitChange();
  },

  setSelectedPixel: async (pixel: { x: number; y: number }) => {
    // Check if clicked near target
    const currentFrame = state.frames.find(
      f => f.epochIndex === state.currentEpoch && state.detectors[f.detector - 1]
    );
    const targetPx = currentFrame?.movingTargetPixel || { x: 128, y: 128 };
    const distToTarget = Math.hypot(pixel.x - targetPx.x, pixel.y - targetPx.y);

    let callout: SelectedObjectCallout | null = null;
    if (distToTarget <= 25) {
      callout = {
        name: state.target.name || 'Objetivo',
        type: state.target.category || 'Objeto en movimiento',
        motion: `${Math.hypot(state.target.pmRa || 0, state.target.pmDec || 0).toFixed(0)} mas/año`,
        description: state.target.description || 'Haz clic para ver el espectro infrarrojo.',
        pixel: targetPx,
      };
    }

    state = { ...state, selectedPixel: pixel, selectedObjectCallout: callout };
    emitChange();
    await spherexStore.loadSpectrum(pixel);
  },

  dismissCallout: () => {
    state = { ...state, selectedObjectCallout: null };
    emitChange();
  },

  setHoverCoords: (coords?: SpherexState['hoverCoords']) => {
    state = { ...state, hoverCoords: coords };
    listeners.forEach(l => l());
  },

  checkDetectiveTargetClick: (pixel: { x: number; y: number }): boolean => {
    if (!state.detective || state.detectiveFound || !state.detectiveTarget) return false;

    const currentFrame = state.frames.find(
      f => f.epochIndex === state.currentEpoch && state.detectors[f.detector - 1]
    );

    const targetPx = currentFrame?.movingTargetPixel || state.detectiveTarget.initialPixel;
    const targetX = Array.isArray(targetPx) ? targetPx[0] : targetPx.x;
    const targetY = Array.isArray(targetPx) ? targetPx[1] : targetPx.y;

    const dist = Math.hypot(pixel.x - targetX, pixel.y - targetY);

    if (dist <= state.detectiveTarget.foundTolerancePixels) {
      state = {
        ...state,
        detectiveFound: true,
        detectiveScore: state.detectiveScore + 100,
        selectedObjectCallout: {
          name: state.detectiveTarget.name,
          type: state.detectiveTarget.category,
          motion: '¡Encontrado con éxito!',
          description: '¡Acertaste la predicción astrométrica de la trayectoria orbital!',
          pixel: { x: targetX, y: targetY },
        },
      };
      sound.playDetectiveFound();
      emitChange();
      return true;
    }
    return false;
  },

  toggleAudioMute: () => {
    const muted = sound.toggleMute();
    state = { ...state, isAudioMuted: !muted };
    emitChange();
  },

  loadFrames: async () => {
    try {
      state = { ...state, isLoading: true, error: null };
      emitChange();

      const response: FramesResponse = await api.getFrames({
        ra: state.target.ra,
        dec: state.target.dec,
        fov: state.fov,
        targetName: state.target.name,
      });

      if (!response.frames.length || !response.epochs.length) throw new Error('No hay observaciones disponibles para comparar.');

      // Detect if real observed SPHEREx data was returned
      const isRealData = response.frames.length > 0 && (
        response.provenance?.data_origin === 'observed_spherex' ||
        response.frames[0]?.provenance?.data_origin === 'observed_spherex' ||
        (typeof response.frames[0]?.provenance?.collection === 'string' &&
          response.frames[0]?.provenance?.collection.includes('spherex'))
      );

      // Adapt detectors if real data is served
      let nextDetectors = state.detectors;
      if (isRealData) {
        const presentDetectors = new Set(response.frames.map(f => f.detector));
        nextDetectors = [1, 2, 3, 4, 5, 6].map(d => presentDetectors.has(d));
      }

      // Bound currentEpoch to actual returned epochs (e.g. 2 for M101 instead of 4)
      const maxEpochIndex = Math.max(0, response.epochs.length - 1);
      const boundedEpoch = Math.min(state.currentEpoch, maxEpochIndex);

      // Compute dynamic stretch bounds based on real stats
      let dynamicMin = 0;
      let dynamicMax = 160;
      if (response.frames.length > 0) {
        let globalMin = Infinity;
        let globalMax = -Infinity;
        for (const f of response.frames) {
          if (f.stats) {
            if (isFinite(f.stats.min) && f.stats.min < globalMin) globalMin = f.stats.min;
            if (isFinite(f.stats.max) && f.stats.max > globalMax) globalMax = f.stats.max;
          }
        }
        if (globalMin < globalMax && isFinite(globalMin) && isFinite(globalMax)) {
          dynamicMin = Math.max(0, Math.floor(globalMin * 0.95 * 100) / 100);
          dynamicMax = Math.ceil(globalMax * 1.05 * 100) / 100;
        }
      }

      state = {
        ...state,
        frames: response.frames,
        epochs: response.epochs,
        wcs: response.wcs,
        provenance: response.provenance,
        fov: response.fovArcmin,
        detectiveTarget: response.detectiveTarget,
        detective: isRealData ? false : state.detective,
        detectiveFound: isRealData ? false : state.detectiveFound,
        detectors: nextDetectors,
        currentEpoch: boundedEpoch,
        stretch: {
          ...state.stretch,
          min: dynamicMin,
          max: dynamicMax,
          fn: isRealData ? 'linear' : state.stretch.fn,
        },
        isLoading: false,
      };

      emitChange();

      if (state.selectedPixel) {
        spherexStore.loadSpectrum(state.selectedPixel, response);
      }
    } catch (err) {
      state = {
        ...state,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Error desconocido al cargar fotogramas.',
      };
      emitChange();
    }
  },

  loadSpectrum: async (
    pixel: { x: number; y: number },
    cachedFrames?: FramesResponse
  ) => {
    try {
      const spectrum = await api.getSpectrum(
        { ra: state.target.ra, dec: state.target.dec, fov: state.fov },
        pixel,
        cachedFrames
      );
      state = { ...state, spectrum };
      emitChange();
    } catch (err) {
      console.error('Failed to load spectrum:', err);
    }
  },
};

export function useSpherexStore(): SpherexState {
  return useSyncExternalStore(
    spherexStore.subscribe,
    spherexStore.getState,
    spherexStore.getState
  );
}
