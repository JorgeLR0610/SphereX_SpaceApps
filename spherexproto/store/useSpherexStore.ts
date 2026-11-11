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
import { api } from '../lib/apiAdapter';
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
}

const defaultPreset = PRESET_TARGETS[0]; // WISE 0855

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
  fov: 5.0,
  detectors: [true, true, true, true, true, true],
  sumDetectors: false,
  mode: 'normal',
  diffRef: 'first',
  colormap: 'inferno',
  stretch: {
    min: 0,
    max: 140,
    fn: 'asinh',
  },
  overlays: {
    gaia: false, // Keep clean by default
    wise: false,
    trajectory: true,
    crosshair: false,
    annotations: true,
    ghostingTrail: false,
  },
  blinkMode: false,
  detective: false,
  detectiveFound: false,
  detectiveScore: 0,
  detectiveTarget: defaultPreset.detectiveMission,
  selectedObjectCallout: {
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
  selectedPixel: { x: 128, y: 128 },
  wcs: {
    crpix: [128, 128],
    crval: [defaultPreset.ra, defaultPreset.dec],
    cdelt: (5.0 / 60.0) / 256,
    size: [256, 256],
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
  const p = new URLSearchParams();
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
    const ra = p.get('ra') ? parseFloat(p.get('ra')!) : state.target.ra;
    const dec = p.get('dec') ? parseFloat(p.get('dec')!) : state.target.dec;
    const fov = p.get('fov') ? parseFloat(p.get('fov')!) : state.fov;
    const mode = (p.get('mode') as DisplayMode) || state.mode;
    const detParam = p.get('det');
    const isEmbed = p.get('embed') === '1';
    const detective = p.get('detective') === '1';

    let detectors = state.detectors;
    if (detParam && detParam.length === 6) {
      detectors = detParam.split('').map(c => c === '1');
    }

    state = {
      ...state,
      target: { ...state.target, ra, dec },
      fov: isNaN(fov) ? 5.0 : Math.min(30, Math.max(1, fov)),
      mode: ['normal', 'diff', 'stack'].includes(mode) ? mode : 'normal',
      detectors,
      sumDetectors: p.get('sum') === '1',
      isEmbed,
      detective,
      overlays: {
        ...state.overlays,
        gaia: p.get('gaia') === '1',
        wise: p.get('wise') === '1',
      },
    };
    emitChange();
    spherexStore.loadFrames();
  },

  setTarget: async (target: Partial<Target>) => {
    const preset = PRESET_TARGETS.find(p => p.name === target.name);
    state = {
      ...state,
      target: { ...state.target, ...target },
      detectiveFound: false,
      selectedPixel: { x: 128, y: 128 },
      selectedObjectCallout: {
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
    state = { ...state, mode };
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
    };
    sound.playBlip(nextBlink ? 880 : 440);
    emitChange();
  },

  toggleGhostingTrail: () => {
    const next = !state.overlays.ghostingTrail;
    state = {
      ...state,
      overlays: { ...state.overlays, ghostingTrail: next },
    };
    sound.playBlip(750);
    emitChange();
  },

  setDetective: (detective: boolean) => {
    state = { ...state, detective, detectiveFound: false };
    sound.playBlip(detective ? 950 : 450);
    emitChange();
  },

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

      state = {
        ...state,
        frames: response.frames,
        epochs: response.epochs,
        wcs: response.wcs,
        detectiveTarget: response.detectiveTarget,
        isLoading: false,
      };

      if (response.frames.length > 0) {
        state.stretch.min = 0;
        state.stretch.max = 160;
      }

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
