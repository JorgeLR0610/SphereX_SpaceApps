'use client';
import { useSyncExternalStore } from 'react';
import { isRealApiActive } from '../lib/apiAdapter';
const subscribe = () => () => {};
const serverSnapshot = () => process.env.NEXT_PUBLIC_USE_REAL_API !== 'false';
// Match the prerendered snapshot during hydration, then read the URL override.
export function useDataMode() {
  return useSyncExternalStore(subscribe, isRealApiActive, serverSnapshot);
}
