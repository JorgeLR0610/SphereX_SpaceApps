'use client';

import React from 'react';
import { useSpherexStore } from '../store/useSpherexStore';
import { SPHEREX_DETECTORS } from '../lib/constants';
import { InfoIcon, ShieldCheckIcon, AlertIcon } from './Icons';

export function MetadataPanel() {
  const { frames, currentEpoch, detectors, epochs, fov, target } = useSpherexStore();

  // Find active frame for this epoch
  const activeDetIdx = detectors.findIndex(d => d);
  const detNum = activeDetIdx >= 0 ? activeDetIdx + 1 : 1;
  const currentFrame = frames.find(f => f.epochIndex === currentEpoch && f.detector === detNum) || frames[0];
  const detConfig = SPHEREX_DETECTORS.find(d => d.id === detNum) || SPHEREX_DETECTORS[0];

  if (!currentFrame) {
    return null;
  }

  const { band, flags, id, stats } = currentFrame;

  return (
    <div className="w-full flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl text-xs font-mono text-slate-300">
      {/* 1. Frame ID & Date */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
          <InfoIcon size={14} />
          <span>{id}</span>
        </div>
        <div className="text-slate-400">
          <span>Fecha UTC: </span>
          <span className="text-slate-200">{currentFrame.date.replace('T', ' ').replace('Z', '')}</span>
        </div>
        <div className="text-slate-500 hidden sm:inline">
          <span>MJD: </span>
          <span className="text-slate-300">{currentFrame.mjd.toFixed(2)}</span>
        </div>
      </div>

      {/* 2. Detector & Band Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Detector:</span>
          <span 
            className="px-1.5 py-0.5 rounded font-bold text-[11px]"
            style={{ color: detConfig.color, backgroundColor: detConfig.hexBg }}
          >
            {detConfig.name} ({detConfig.range})
          </span>
        </div>

        <div className="flex items-center gap-1 text-slate-400">
          <span>λ Central:</span>
          <span className="text-yellow-400 font-bold">{band.lambda_um} µm</span>
          <span className="text-slate-500">(±{band.width_um} µm)</span>
        </div>
      </div>

      {/* 3. Contamination Flags & Flux Stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Flags:</span>
          {flags.map((flag, idx) => (
            <span
              key={idx}
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                flag === 'clean'
                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                  : 'bg-amber-950/40 text-amber-400 border border-amber-800/40 flex items-center gap-1'
              }`}
            >
              {flag === 'clean' ? 'Limpio (Calidad Óptima)' : flag}
            </span>
          ))}
        </div>

        <div className="text-slate-500 hidden md:inline">
          <span>Escala: </span>
          <span className="text-slate-300">6.2&quot;/px</span>
        </div>
      </div>
    </div>
  );
}

