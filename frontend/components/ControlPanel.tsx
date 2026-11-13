'use client';

import React from 'react';
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';
import { SPHEREX_DETECTORS } from '../lib/constants';
import { DisplayMode, StretchFunction, ColormapType, DiffReference } from '../lib/types';
import { 
  LayersIcon, 
  CrosshairIcon 
} from './Icons';

export function ControlPanel() {
  const {
    frames,
    fov,
    detectors,
    sumDetectors,
    mode,
    diffRef,
    colormap,
    stretch,
    overlays,
    detective,
    detectiveFound,
    detectiveTarget,
    provenance,
  } = useSpherexStore();

  const isRealData = Boolean(
    provenance?.data_origin === 'observed_spherex' ||
    (frames && frames.length > 0 && (
      frames[0].provenance?.data_origin === 'observed_spherex' ||
      (typeof frames[0].provenance?.collection === 'string' && frames[0].provenance.collection.includes('spherex'))
    ))
  );
  const presentDetectors = new Set(frames?.map(f => f.detector));

  return (
    <div className="w-full lg:w-80 flex flex-col gap-4 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl p-4 overflow-y-auto">
      {/* 1. Header with title */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <LayersIcon size={16} className="text-cyan-400" />
          <span>Panel de Capas y Control</span>
        </div>
        <span className="text-[11px] font-mono text-cyan-400/80 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40">
          SPHEREx
        </span>
      </div>

      {/* 2. Campo de Visión (FOV Slider) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Campo de Visión (FOV)</span>
          <span className="font-mono text-cyan-400 font-bold">{fov.toFixed(1)}&apos; (arcmin)</span>
        </div>
        <input
          type="range"
          min="1.0"
          max="30.0"
          step="0.5"
          value={fov}
          onChange={(e) => spherexStore.setFov(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>1&apos; (Detalle rápido)</span>
          <span>15&apos;</span>
          <span>30&apos; (Gran angular)</span>
        </div>
      </div>

      {/* 3. Selector de Detectores (1 a 6 + Sum [Σ]) */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/70">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Detectores Infrarrojos</span>
          <button
            onClick={() => spherexStore.setSumDetectors(!sumDetectors)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
              sumDetectors 
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30' 
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
            title="Sumar todos los detectores para maximizar relación señal/ruido"
          >
            Σ Sumar
          </button>
        </div>

        {/* 6 detector pills */}
        <div className="grid grid-cols-3 gap-1.5">
          {SPHEREX_DETECTORS.map((det, idx) => {
            const isActive = detectors[idx];
            const isAvailable = presentDetectors.size === 0 || presentDetectors.has(det.id);
            return (
              <button
                key={det.id}
                disabled={!isAvailable}
                onClick={() => isAvailable && spherexStore.toggleDetector(det.id)}
                style={{
                  borderColor: !isAvailable ? 'rgba(51, 65, 85, 0.3)' : isActive ? det.color : 'rgba(51, 65, 85, 0.5)',
                  backgroundColor: !isAvailable ? 'rgba(15, 23, 42, 0.3)' : isActive ? det.hexBg : 'rgba(15, 23, 42, 0.6)',
                }}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-center transition-all ${
                  !isAvailable
                    ? 'opacity-30 cursor-not-allowed'
                    : isActive
                    ? 'shadow-sm'
                    : 'opacity-50 hover:opacity-80'
                }`}
                title={!isAvailable ? `Detector ${det.id} no disponible en esta observación` : `${det.name}: ${det.range} (${det.desc})`}
              >
                <div className="flex items-center gap-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: det.color }}
                  />
                  <span className="text-xs font-mono font-bold text-slate-200">
                    {det.name}
                  </span>
                </div>
                <span className="text-[9px] text-slate-400 truncate max-w-full">
                  {det.range.replace(' – ', '-')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Modo de Procesamiento: Normal | Diferencia | Apilado */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/70">
        <div className="text-xs text-slate-400 font-medium">Modo de Visualización</div>
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/60 rounded-lg border border-slate-800">
          {(['normal', 'diff', 'stack'] as DisplayMode[]).map((m) => (
            <button
              key={m}
              onClick={() => spherexStore.setMode(m)}
              className={`py-1.5 text-xs font-medium rounded-md capitalize transition-all ${
                mode === m
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'normal' ? 'Normal' : m === 'diff' ? 'Diferencia' : 'Apilado'}
            </button>
          ))}
        </div>

        {/* Sub-selector for Difference reference */}
        {mode === 'diff' && (
          <div className="flex items-center justify-between text-xs px-2 py-1.5 bg-rose-950/20 border border-rose-900/40 rounded-lg text-rose-300">
            <span>Referencia:</span>
            <div className="flex gap-1 font-mono text-[11px]">
              {(['first', 'previous', 'median'] as DiffReference[]).map((ref) => (
                <button
                  key={ref}
                  onClick={() => spherexStore.setDiffRef(ref)}
                  className={`px-1.5 py-0.5 rounded ${
                    diffRef === ref ? 'bg-rose-500 text-white font-bold' : 'hover:bg-rose-900/40 text-rose-400'
                  }`}
                >
                  {ref === 'first' ? 'Época 1' : ref === 'previous' ? 'Previa' : 'Mediana'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. Escala y Estiramiento (Stretch & Colormap) */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/70">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Estiramiento (Stretch)</span>
          <div className="flex gap-1 text-[11px] font-mono">
            {(['asinh', 'log', 'linear'] as StretchFunction[]).map((fn) => (
              <button
                key={fn}
                onClick={() => spherexStore.setStretch({ fn })}
                className={`px-1.5 py-0.5 rounded uppercase ${
                  stretch.fn === fn
                    ? 'bg-slate-700 text-cyan-300 font-bold border border-cyan-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {fn}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders for min / max flux stretch */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Máximo Flujo</span>
            <span className="text-cyan-400 font-bold">{stretch.max.toFixed(0)}</span>
          </div>
          <input
            type="range"
            min="20"
            max="300"
            step="5"
            value={stretch.max}
            onChange={(e) => spherexStore.setStretch({ max: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>

        {/* Colormap picker */}
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-slate-400 font-medium">Paleta:</span>
          <div className="flex gap-1 text-[11px] font-mono">
            {(['inferno', 'viridis', 'greyscale', 'coolwarm'] as ColormapType[]).map((c) => (
              <button
                key={c}
                onClick={() => spherexStore.setColormap(c)}
                className={`px-1.5 py-0.5 rounded capitalize ${
                  colormap === c
                    ? 'bg-slate-700 text-cyan-300 font-bold border border-cyan-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {c === 'coolwarm' ? 'Bipolar' : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Overlays (Gaia, WISE, Trajectory, Reticle, Didactic Annotations) */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/70">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Capas y Catálogos</span>
          <span className="text-[10px] text-slate-500 font-mono">Overlays</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={overlays.annotations}
              onChange={() => spherexStore.toggleOverlay('annotations')}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span className="flex items-center gap-1 font-bold text-cyan-300">
              🏷️ Guías / Nombres
            </span>
          </label>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={overlays.trajectory}
              onChange={() => spherexStore.toggleOverlay('trajectory')}
              className="rounded bg-slate-800 border-slate-700 text-pink-500 focus:ring-0"
            />
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-pink-400 inline-block" />
              Trayectoria
            </span>
          </label>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={overlays.gaia}
              onChange={() => spherexStore.toggleOverlay('gaia')}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
              Gaia DR3
            </span>
          </label>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={overlays.wise}
              onChange={() => spherexStore.toggleOverlay('wise')}
              className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
            />
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              CatWISE
            </span>
          </label>

          <label className="flex items-center gap-2 text-slate-300 cursor-pointer hover:text-white col-span-2">
            <input
              type="checkbox"
              checked={overlays.crosshair}
              onChange={() => spherexStore.toggleOverlay('crosshair')}
              className="rounded bg-slate-800 border-slate-700 text-slate-400 focus:ring-0"
            />
            <span className="flex items-center gap-1">
              <CrosshairIcon size={12} className="text-slate-400" />
              Retícula central de coordenadas
            </span>
          </label>
        </div>
      </div>

      {/* 7. El Gancho: Modo Detective 🕵️ */}
      <div className={`p-3 rounded-xl border transition-all ${
        isRealData
          ? 'bg-slate-950/40 border-slate-800 text-slate-500'
          : detective 
          ? 'bg-gradient-to-b from-pink-950/40 to-slate-900 border-pink-500/50 shadow-lg shadow-pink-500/10' 
          : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🕵️</span>
            <div>
              <div className="text-xs font-bold text-slate-100">Modo Detective</div>
              <div className="text-[10px] text-slate-400">
                {isRealData ? 'Desactivado en datos reales' : 'Juego educativo de detección'}
              </div>
            </div>
          </div>
          <button
            disabled={isRealData}
            onClick={() => !isRealData && spherexStore.setDetective(!detective)}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
              isRealData
                ? 'bg-slate-800/40 text-slate-500 cursor-not-allowed border border-slate-800'
                : detective
                ? 'bg-pink-500 text-white shadow-md shadow-pink-500/30'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
          >
            {isRealData ? 'N/A' : detective ? 'Activado' : 'Activar'}
          </button>
        </div>

        {isRealData ? (
          <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800">
            El modo interactivo detective está diseñado para objetivos con movimiento orbital simulado. El campo M101 contiene estrellas y estructura galáctica estática.
          </p>
        ) : detective && detectiveTarget ? (
          <div className="flex flex-col gap-2 pt-2 border-t border-pink-900/40 text-xs">
            <div className="text-slate-300 leading-snug">
              <span className="text-pink-400 font-semibold">Misión: </span>
              {detectiveTarget.description}
            </div>

            <div className="flex flex-col gap-1 p-2 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
              <div className="font-semibold text-slate-300">Pistas astronómicas:</div>
              {detectiveTarget.hints.map((hint, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="text-pink-400">•</span>
                  <span>{hint}</span>
                </div>
              ))}
            </div>

            {/* Status indicator */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">Estado:</span>
              {detectiveFound ? (
                <span className="flex items-center gap-1 font-bold text-emerald-400 font-mono text-xs">
                  <span>✅</span> ¡DETECTADO! (+100 pts)
                </span>
              ) : (
                <span className="text-pink-400 font-mono text-xs animate-pulse">
                  Buscando... haz clic en el objeto
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

