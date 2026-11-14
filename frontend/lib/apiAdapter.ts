import { Query, FramesResponse, Spectrum } from './types';
import { generateMockFrames, generateMockSpectrum } from './mockData';

export interface SpherexAPI {
  getFrames(q: Query, signal?: AbortSignal): Promise<FramesResponse>;
  getSpectrum(q: Query, px: { x: number; y: number }, cachedFrames?: FramesResponse): Promise<Spectrum>;
}

class MockSpherexAPI implements SpherexAPI {
  async getFrames(q: Query, signal?: AbortSignal): Promise<FramesResponse> {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    // Simulate light network latency (50ms - 150ms) for realistic UX feel
    await new Promise(res => setTimeout(res, 80));

    const response = generateMockFrames(q.ra, q.dec, q.fov, q.targetName);
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

  async getFrames(q: Query, signal?: AbortSignal): Promise<FramesResponse> {
    const params = new URLSearchParams({
      ra: q.ra.toString(),
      dec: q.dec.toString(),
      fov: q.fov.toString(),
    });
    if (q.targetName) {
      params.append('targetName', q.targetName);
    }
    const resp = await fetch(`${this.baseUrl}/frames?${params.toString()}`, { signal });
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
    if (!Array.isArray(json.epochs) || !json.frames?.length) throw new Error('No hay observaciones disponibles');
    for (const f of json.frames) {
      if (!Number.isInteger(f.width) || !Number.isInteger(f.height) || f.width < 1 || f.height < 1 || f.pixelData.length !== f.width*f.height || !f.pixelData.every(Number.isFinite) || (f.validMask && (f.validMask.length !== f.pixelData.length || !f.validMask.every(v=>v===0||v===1))) || !json.epochs[f.epochIndex]) throw new Error('Respuesta científica incompatible');
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
  return process.env.NEXT_PUBLIC_USE_REAL_API !== 'false';
};

// Bounded cache and request identity include data origin and full query.
const datasets = new Map<string, FramesResponse>();
export const api: SpherexAPI = {
 async getFrames(q: Query, signal?: AbortSignal) {
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const origin=isRealApiActive()?'real':'mock';
  const key=JSON.stringify([origin,'/api/frames',q.ra,q.dec,q.fov,q.targetName]);
  if(datasets.has(key)) { const value=datasets.get(key)!;datasets.delete(key);datasets.set(key,value);return value; }
  const result=await (origin==='real'?realApi:mockApi).getFrames(q,signal);
  if(signal?.aborted) throw new DOMException('Cancelled','AbortError');
  datasets.set(key,result); if(datasets.size>8)datasets.delete(datasets.keys().next().value!);
  return result;
 },
 getSpectrum:(q,px,cached)=>isRealApiActive()?realApi.getSpectrum(q,px):mockApi.getSpectrum(q,px,cached),
};
