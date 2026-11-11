'use client';

import React from 'react';
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';
import { SparklesIcon, PlayIcon } from './Icons';

export function ConceptHero() {
  const { mode, blinkMode, detective, overlays } = useSpherexStore();

  return (
    <div className="w-full flex flex-col gap-3">
      {/* 1. Main Headline Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-cyan-500/30 p-5 shadow-2xl">
        {/* Subtle background cosmic flare */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-widest uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                Misión NASA SPHEREx · 2025 – 2027
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-pink-300 font-medium flex items-center gap-1">
                <SparklesIcon size={12} className="text-pink-400" />
                Detector de Enanas Marrones y Asteroides
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
              Mira cómo el cielo cambia con el tiempo:{' '}
              <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-pink-400 bg-clip-text text-transparent">
                Descubre objetos en movimiento
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed max-w-4xl">
              El telescopio espacial SPHEREx fotografiará todo el cielo 4 veces consecutivas. En cada imagen, las estrellas lejanas están congeladas, pero las <strong className="text-white">enanas marrones cercanas</strong> y los <strong className="text-white">asteroides</strong> avanzan a gran velocidad. Usa los 3 modos interactivos para cazarlos.
            </p>
          </div>

          {/* Quick Concept Explainer Mini-Card */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 shrink-0 text-xs font-mono">
            <div className="text-2xl">💡</div>
            <div className="flex flex-col">
              <span className="text-slate-400 text-[11px]">Principio astronómico:</span>
              <span className="text-cyan-300 font-bold">Fondo inmóvil + Objeto que salta</span>
              <span className="text-slate-500 text-[10px]">= Nuevo descubrimiento</span>
            </div>
          </div>
        </div>

        {/* 2. Interactive 3 Big Exploration Tabs */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Tab 1: Normal Playback */}
          <button
            onClick={() => {
              spherexStore.setMode('normal');
              spherexStore.setDetective(false);
            }}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              mode === 'normal' && !detective
                ? 'bg-cyan-950/50 border-cyan-400 text-white shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/40'
                : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-bold shrink-0">
              ▶
            </div>
            <div>
              <div className="text-xs font-bold text-white">1. Ver el Movimiento</div>
              <div className="text-[11px] text-slate-400">
                Reproduce el paso de los años (2025–2027)
              </div>
            </div>
          </button>

          {/* Tab 2: Difference Filter */}
          <button
            onClick={() => {
              spherexStore.setMode('diff');
              spherexStore.setDetective(false);
            }}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              mode === 'diff' && !detective
                ? 'bg-rose-950/50 border-rose-400 text-white shadow-lg shadow-rose-500/20 ring-1 ring-rose-400/40'
                : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 font-bold shrink-0">
              🔴🔵
            </div>
            <div>
              <div className="text-xs font-bold text-white">2. Modo Diferencia</div>
              <div className="text-[11px] text-slate-400">
                Resta el cielo fijo: solo brilla el objeto móvil
              </div>
            </div>
          </button>

          {/* Tab 3: Detective Game */}
          <button
            onClick={() => {
              spherexStore.setDetective(true);
            }}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              detective
                ? 'bg-pink-950/50 border-pink-400 text-white shadow-lg shadow-pink-500/20 ring-1 ring-pink-400/40'
                : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-300 font-bold shrink-0">
              🕵️
            </div>
            <div>
              <div className="text-xs font-bold text-white">3. Modo Detective</div>
              <div className="text-[11px] text-slate-400">
                Encuentra el astro móvil y gana puntos
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

