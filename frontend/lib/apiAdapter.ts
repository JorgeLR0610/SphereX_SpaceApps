import { Query, FramesResponse, Spectrum } from './types';
import { generateMockFrames, generateMockSpectrum } from './mockData';

export interface SpherexAPI {
  getFrames(q: Query): Promise<FramesResponse>;
  getSpectrum(q: Query, px: { x: number; y: number }, cachedFrames?: FramesResponse): Promise<Spectrum>;
}

// In-memory LRU-like cache for instant query responsiveness
const framesCache = new Map<string, FramesResponse>();

class MockSpherexAPI implements SpherexAPI {
  async getFrames(q: Query): Promise<FramesResponse> {
    const cacheKey = `${q.ra.toFixed(4)}_${q.dec.toFixed(4)}_${q.fov.toFixed(1)}_${q.targetName || ''}`;
    
    if (framesCache.has(cacheKey)) {
      return framesCache.get(cacheKey)!;
    }

    // Simulate light network latency (50ms - 150ms) for realistic UX feel
    await new Promise(res => setTimeout(res, 80));

    const response = generateMockFrames(q.ra, q.dec, q.fov, q.targetName);
    framesCache.set(cacheKey, response);
    return response;
  }

  async getSpectrum(
    q: Query,
    px: { x: number; y: number },
    cachedFrames?: FramesResponse
  ): Promise<Spectrum> {
    const frames = cachedFrames || (await this.getFrames(q));
    return generateMockSpectrum(q.ra, q.dec, px, frames.wcs, frames);
  }
}

class RealSpherexAPI implements SpherexAPI {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  async getFrames(q: Query): Promise<FramesResponse> {
    const params = new URLSearchParams({
      ra: q.ra.toString(),
      dec: q.dec.toString(),
      fov: q.fov.toString(),
    });
    if (q.targetName) {
      params.append('targetName', q.targetName);
    }
    const resp = await fetch(`${this.baseUrl}/frames?${params.toString()}`);
    if (!resp.ok) {
      let detailMsg = `HTTP ${resp.status} ${resp.statusText}`;
      try {
        const errJson = await resp.json();
        if (errJson && errJson.detail) {
          detailMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {
        // Fallback to HTTP status text
      }
      throw new Error(`Error en API SPHEREx: ${detailMsg}`);
    }
    const json: FramesResponse = await resp.json();
    // Convert numeric array to Float32Array for high performance Canvas manipulation
    if (json.frames && Array.isArray(json.frames)) {
      for (const frame of json.frames) {
        if (Array.isArray(frame.pixelData) || !(frame.pixelData instanceof Float32Array)) {
          frame.pixelData = new Float32Array(frame.pixelData);
        }
      }
    }
    return json;
  }

  async getSpectrum(q: Query, px: { x: number; y: number }): Promise<Spectrum> {
    // Level 2 single-band images do not contain 102-band spectral cubes.
    // Full spectra extraction over real data is scheduled for M5.
    return {
      ra: q.ra,
      dec: q.dec,
      pixel: px,
      points: [],
      features: [],
      objectIdentified: 'Observación monobanda Nivel 2 (cubo espectral de 102 bandas en M5)',
    };
  }
}

const realApi = new RealSpherexAPI();
const mockApi = new MockSpherexAPI();

export const isRealApiActive = (): boolean => {
  if (typeof window !== 'undefined') {
    const p = new URLSearchParams(window.location.search);
    if (p.get('api') === 'real') return true;
    if (p.get('api') === 'mock') return false;
  }
  return process.env.NEXT_PUBLIC_USE_REAL_API === 'true';
};

// Dispatcher API dynamically routes to Real or Mock depending on environment or URL parameter
export const api: SpherexAPI = {
  getFrames: (q: Query): Promise<FramesResponse> => {
    return isRealApiActive() ? realApi.getFrames(q) : mockApi.getFrames(q);
  },
  getSpectrum: (q: Query, px: { x: number; y: number }, cachedFrames?: FramesResponse): Promise<Spectrum> => {
    return isRealApiActive()
      ? realApi.getSpectrum(q, px)
      : mockApi.getSpectrum(q, px, cachedFrames);
  },
};

