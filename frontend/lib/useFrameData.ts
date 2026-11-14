"use client";
// Adapted from SphereXTM: store-backed facade, no parallel fetch/cache lifecycle.
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';
export function useFrameData() {const state=useSpherexStore();return {...state, retry: spherexStore.loadFrames};}
