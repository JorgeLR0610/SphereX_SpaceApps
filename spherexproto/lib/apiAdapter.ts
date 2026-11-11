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
    const resp = await fetch(`${this.baseUrl}/frames?${params.toString()}`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch SPHEREx cutouts: ${resp.statusText}`);
    }
    return resp.json();
  }

  async getSpectrum(q: Query, px: { x: number; y: number }): Promise<Spectrum> {
    const params = new URLSearchParams({
      ra: q.ra.toString(),
      dec: q.dec.toString(),
      fov: q.fov.toString(),
      x: px.x.toString(),
      y: px.y.toString(),
    });
    const resp = await fetch(`${this.baseUrl}/spectrum?${params.toString()}`);
    if (!resp.ok) {
      throw new Error(`Failed to fetch SPHEREx spectrum: ${resp.statusText}`);
    }
    return resp.json();
  }
}

// Use Mock API by default (can be toggled via env VITE_MOCK or NEXT_PUBLIC_USE_REAL_API)
export const api: SpherexAPI =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_USE_REAL_API === 'true'
    ? new RealSpherexAPI()
    : new MockSpherexAPI();

