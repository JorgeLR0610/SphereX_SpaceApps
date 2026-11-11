'use client';

import React, { useEffect, useRef } from 'react';
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';
import { 
  PlayIcon, 
  PauseIcon, 
  SkipBackIcon, 
  SkipForwardIcon, 
  AlertIcon 
} from './Icons';
import { ContaminationFlag } from '../lib/types';

export function Timeline() {
  const {
    epochs,
    currentEpoch,
    playing,
    fps,
    frames,
    detectors,
  } = useSpherexStore();

  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Animation playback loop
  useEffect(() => {
    if (playing) {
      const intervalMs = Math.round(1000 / fps);
      playTimerRef.current = setInterval(() => {
        spherexStore.nextEpoch();
      }, intervalMs);
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
    }

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [playing, fps]);

  const numEpochs = epochs.length || 4;

  const getContaminationBadge = (flags: ContaminationFlag[]) => {
    if (!flags || flags.includes('clean') || flags.length === 0) {
      return (
        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Limpio
        </span>
      );
    }

    const firstFlag = flags.find(f => f !== 'clean') || flags[0];
    const labels: Record<string, { text: string; color: string }> = {
      cosmic_ray: { text: 'Rayo Cósmico', color: 'text-amber-400 bg-amber-950/40 border-amber-800/40' },
      contaminated_edge: { text: 'Borde', color: 'text-orange-400 bg-orange-950/40 border-orange-800/40' },
      stray_light: { text: 'Luz Difusa', color: 'text-purple-400 bg-purple-950/40 border-purple-800/40' },
      saturated: { text: 'Saturado', color: 'text-rose-400 bg-rose-950/40 border-rose-800/40' },
    };

    const cfg = labels[firstFlag] || { text: firstFlag, color: 'text-yellow-400' };

    return (
      <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border ${cfg.color}`}>
        <AlertIcon size={10} />
        <span>{cfg.text}</span>
      </span>
    );
  };

  return (
    <div className="w-full flex flex-col gap-3 p-3 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl">
      {/* 1. Main Timeline Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Playback Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => spherexStore.prevEpoch()}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/80"
            title="Fotograma Anterior (←)"
          >
            <SkipBackIcon size={16} />
          </button>

          <button
            onClick={() => spherexStore.setPlaying(!playing)}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-md ${
              playing
                ? 'bg-amber-500 text-slate-950 shadow-amber-500/20'
                : 'bg-cyan-500 text-slate-950 shadow-cyan-500/20 hover:bg-cyan-400'
            }`}
            title="Reproducir / Pausa (Espacio)"
          >
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            <span className="text-xs uppercase tracking-wider">
              {playing ? 'Pausar' : 'Play'}
            </span>
          </button>

          <button
            onClick={() => spherexStore.nextEpoch()}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/80"
            title="Fotograma Siguiente (→)"
          >
            <SkipForwardIcon size={16} />
          </button>
        </div>

        {/* Speed / FPS Selector */}
        <div className="flex items-center gap-1 text-xs font-mono">
          <span className="text-slate-400 text-[11px] mr-1">Velocidad:</span>
          {[1, 2, 4, 8].map((f) => (
            <button
              key={f}
              onClick={() => spherexStore.setFps(f)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                fps === f
                  ? 'bg-slate-700 text-cyan-300 font-bold border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
              }`}
            >
              {f}x
            </button>
          ))}
        </div>

        {/* Temporal Slider */}
        <div className="flex-1 min-w-[200px] flex items-center gap-3">
          <input
            type="range"
            min="0"
            max={numEpochs - 1}
            step="1"
            value={currentEpoch}
            onChange={(e) => spherexStore.setCurrentEpoch(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="text-xs font-mono font-bold text-cyan-300 whitespace-nowrap min-w-[65px] text-right">
            Época {currentEpoch + 1} / {numEpochs}
          </div>
        </div>
      </div>

      {/* 2. Miniaturas (Filmstrip) with contamination flags and dates */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60">
        {epochs.map((ep, idx) => {
          const isSelected = idx === currentEpoch;
          // Find representative frame for this epoch to extract contamination flags
          const repFrame = frames.find(f => f.epochIndex === idx && detectors[f.detector - 1]);
          const flags = repFrame?.flags || ['clean'];

          return (
            <button
              key={ep.epoch}
              onClick={() => spherexStore.setCurrentEpoch(idx)}
              className={`flex flex-col p-2 rounded-lg border text-left transition-all ${
                isSelected
                  ? 'bg-cyan-950/40 border-cyan-400/80 shadow-md shadow-cyan-500/10 ring-1 ring-cyan-400/50'
                  : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-mono font-bold ${isSelected ? 'text-cyan-300' : 'text-slate-300'}`}>
                  Época {ep.epoch}
                </span>
                {getContaminationBadge(flags)}
              </div>

              <div className="text-[11px] font-mono text-slate-400">
                {ep.date.substring(0, 10)}
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                MJD {ep.mjd.toFixed(1)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

