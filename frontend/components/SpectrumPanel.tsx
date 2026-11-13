'use client';

import React, { useState } from 'react';
import { useSpherexStore } from '../store/useSpherexStore';
import { SPHEREX_DETECTORS } from '../lib/constants';
import { ActivityIcon } from './Icons';

export function SpectrumPanel() {
  const { spectrum, selectedPixel, currentEpoch, frames, provenance } = useSpherexStore();
  const [hoveredPoint, setHoveredPoint] = useState<import('../lib/types').SpectrumPoint | null>(null);

  const isRealData = Boolean(
    provenance?.data_origin === 'observed_spherex' ||
    (frames && frames.length > 0 && (
      frames[0].provenance?.data_origin === 'observed_spherex' ||
      (typeof frames[0].provenance?.collection === 'string' && frames[0].provenance.collection.includes('spherex'))
    ))
  );

  if (!spectrum || !spectrum.points || spectrum.points.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl text-center">
        <ActivityIcon size={32} className={isRealData ? 'text-cyan-500/70 mb-2' : 'text-slate-600 mb-2'} />
        <div className="text-sm font-semibold text-slate-300">
          {isRealData ? 'Observación Monobanda SPHEREx (Nivel 2)' : 'Espectro al Vuelo (102 Bandas)'}
        </div>
        <div className="text-xs text-slate-400 max-w-md mt-1.5 leading-relaxed">
          {isRealData
            ? 'Los datos actuales corresponden a imágenes individuales de Nivel 2 en el Detector 2 (~1.49 µm). La extracción y calibración de cubos espectrales completos de 102 bandas sobre observaciones reales está programada para el hito M5.'
            : 'Haz clic en cualquier píxel o en el objeto en movimiento en el visor para extraer su espectro infrarrojo continuo de 0.75 µm a 5.0 µm.'}
        </div>
        {isRealData && (
          <div className="mt-3 px-3 py-1 rounded bg-slate-800/80 border border-slate-700 text-[11px] font-mono text-cyan-300">
            Píxel seleccionado: [{selectedPixel?.x}, {selectedPixel?.y}] · Longitud de onda: ~1.49 µm
          </div>
        )}
      </div>
    );
  }

  const { points, epochSpectra, features, objectIdentified } = spectrum;

  // Chart dimensions & scaling
  const width = 560;
  const height = 210;
  const padding = { top: 25, right: 25, bottom: 35, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minLambda = 0.75;
  const maxLambda = 5.0;

  // Compute flux domain
  let maxFlux = 0;
  points.forEach(p => {
    if (p.flux > maxFlux) maxFlux = p.flux;
  });
  if (epochSpectra) {
    epochSpectra.forEach(ep => {
      ep.points.forEach(p => {
        if (p.flux > maxFlux) maxFlux = p.flux;
      });
    });
  }
  maxFlux = Math.max(10, maxFlux * 1.15);

  const scaleX = (lambda: number) => padding.left + ((lambda - minLambda) / (maxLambda - minLambda)) * chartW;
  const scaleY = (flux: number) => padding.top + chartH - (flux / maxFlux) * chartH;

  // Main spectrum path
  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${scaleX(p.lambda_um).toFixed(1)},${scaleY(p.flux).toFixed(1)}`)
    .join(' ');

  // Color palette for multi-epoch curves
  const epochColors = ['#38bdf8', '#f59e0b', '#ec4899', '#a855f7'];

  return (
    <div className="flex-1 flex flex-col p-3 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl">
      {/* Title & Identified Target Info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ActivityIcon size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">
            Espectro Infrarrojo al Vuelo (102 Canales SPHEREx)
          </span>
          <span className="text-xs font-mono text-cyan-400/90 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-800/40">
            Píxel [{selectedPixel?.x}, {selectedPixel?.y}]
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs font-mono text-cyan-300 font-semibold truncate max-w-[180px]">
            {objectIdentified}
          </div>
          <button
            onClick={() => {
              if (!spectrum || !spectrum.points) return;
              const header = 'lambda_um,flux_mJy,uncertainty_mJy,detector_channel,band_index\n';
              const rows = spectrum.points.map(p => `${p.lambda_um},${p.flux},${p.err},${p.detector},${p.bandIndex}`).join('\n');
              const blob = new Blob([header + rows], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.download = `SPHEREx_Spectrum_${(objectIdentified || 'spectrum').replace(/\s+/g, '_')}_px${selectedPixel?.x}_${selectedPixel?.y}.csv`;
              a.href = url;
              a.click();
              URL.revokeObjectURL(url);
            }}
            title="Exportar datos del espectro a archivo CSV"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-mono border border-slate-700 transition-colors"
          >
            <span>📥</span>
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* SVG Spectrum Chart */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
        >
          {/* Background Detector Bands (6 linear variable filter regions) */}
          {SPHEREX_DETECTORS.map((det) => {
            const ranges: Record<number, [number, number]> = {
              1: [0.75, 1.11],
              2: [1.11, 1.64],
              3: [1.64, 2.42],
              4: [2.42, 3.82],
              5: [3.82, 4.42],
              6: [4.42, 5.00],
            };
            const [minL, maxL] = ranges[det.id];
            const x1 = scaleX(minL);
            const x2 = scaleX(maxL);
            return (
              <g key={det.id}>
                <rect
                  x={x1}
                  y={padding.top}
                  width={x2 - x1}
                  height={chartH}
                  fill={det.color}
                  fillOpacity="0.04"
                />
                <line
                  x1={x2}
                  y1={padding.top}
                  x2={x2}
                  y2={padding.top + chartH}
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray="2 2"
                />
                <text
                  x={x1 + (x2 - x1) / 2}
                  y={padding.top + 12}
                  fill={det.color}
                  fillOpacity="0.7"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  Det {det.id}
                </text>
              </g>
            );
          })}

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((t) => {
            const y = padding.top + chartH * (1 - t);
            const fluxLabel = (maxFlux * t).toFixed(0);
            return (
              <g key={t}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + chartW}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  fill="#64748b"
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {fluxLabel}
                </text>
              </g>
            );
          })}

          {/* Wavelength X-Axis ticks */}
          {[1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0].map((lambda) => {
            const x = scaleX(lambda);
            return (
              <g key={lambda}>
                <line
                  x1={x}
                  y1={padding.top + chartH}
                  x2={x}
                  y2={padding.top + chartH + 4}
                  stroke="#475569"
                />
                <text
                  x={x}
                  y={padding.top + chartH + 15}
                  fill="#64748b"
                  fontSize="8"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {lambda.toFixed(1)} µm
                </text>
              </g>
            );
          })}

          {/* Multi-epoch spectra (for variable stars like R Dra / RW Aur) */}
          {epochSpectra && epochSpectra.map((ep, idx) => {
            const epPath = ep.points
              .map((p, pIdx) => `${pIdx === 0 ? 'M' : 'L'} ${scaleX(p.lambda_um).toFixed(1)},${scaleY(p.flux).toFixed(1)}`)
              .join(' ');

            return (
              <path
                key={ep.epoch}
                d={epPath}
                fill="none"
                stroke={epochColors[idx % epochColors.length]}
                strokeWidth={idx === currentEpoch ? "2.2" : "1.1"}
                strokeOpacity={idx === currentEpoch ? "1.0" : "0.45"}
              />
            );
          })}

          {/* Single Epoch Spectrum curve (if not comparing epochs) */}
          {!epochSpectra && (
            <path
              d={linePath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.2"
              className="drop-shadow-sm"
            />
          )}

          {/* Spectral Feature Absorption Labels (H2O, CH4, CO2) */}
          {features && features.map((feat, idx) => {
            const fx = scaleX(feat.lambda_um);
            return (
              <g key={idx}>
                <line
                  x1={fx}
                  y1={padding.top + 20}
                  x2={fx}
                  y2={padding.top + chartH - 5}
                  stroke="#ec4899"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                  strokeOpacity="0.6"
                />
                <text
                  x={fx}
                  y={padding.top + 28}
                  fill="#f472b6"
                  fontSize="7.5"
                  fontFamily="monospace"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {feat.label}
                </text>
              </g>
            );
          })}

          {/* Interactive Hover Point & Cursor */}
          {hoveredPoint && (
            <g>
              <line
                x1={scaleX(hoveredPoint.lambda_um)}
                y1={padding.top}
                x2={scaleX(hoveredPoint.lambda_um)}
                y2={padding.top + chartH}
                stroke="#facc15"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={scaleX(hoveredPoint.lambda_um)}
                cy={scaleY(hoveredPoint.flux)}
                r="4"
                fill="#facc15"
                stroke="#0f172a"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* Transparent hit overlay to capture hover events */}
          {points.map((p) => {
            const px = scaleX(p.lambda_um);
            const wBand = (chartW / points.length);
            return (
              <rect
                key={p.bandIndex}
                x={px - wBand / 2}
                y={padding.top}
                width={wBand}
                height={chartH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            );
          })}
        </svg>
      </div>

      {/* Chart Footer: Hover Readout & Epoch Legend */}
      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono pt-1 text-slate-400">
        <div>
          {hoveredPoint ? (
            <span className="text-yellow-400">
              λ = {hoveredPoint.lambda_um.toFixed(3)} µm | Flujo: {hoveredPoint.flux} ± {hoveredPoint.err} (Det {hoveredPoint.detector})
            </span>
          ) : (
            <span className="text-slate-500">
              Pasa el cursor sobre la curva para inspeccionar canales
            </span>
          )}
        </div>

        {/* Legend for Multi-Epoch Spectrum */}
        {epochSpectra && (
          <div className="flex items-center gap-2">
            {epochSpectra.map((ep, idx) => (
              <div key={ep.epoch} className="flex items-center gap-1">
                <span
                  className="w-2.5 h-1 rounded"
                  style={{ backgroundColor: epochColors[idx % epochColors.length] }}
                />
                <span className={idx === currentEpoch ? 'text-white font-bold' : 'text-slate-500'}>
                  Ép {ep.epoch}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

