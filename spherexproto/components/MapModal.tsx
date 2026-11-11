'use client';

import React, { useState } from 'react';
import { formatSexagesimal } from '../lib/wcs';

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: {
    n: string;
    ra: number;
    dec: number;
    pm: [number, number];
  };
  fov: number;
}

export function MapModal({ isOpen, onClose, target, fov }: MapModalProps) {
  const [showGaia, setShowGaia] = useState<boolean>(true);
  const [showWise, setShowWise] = useState<boolean>(true);

  if (!isOpen) return null;

  const { raStr, decStr } = formatSexagesimal(target.ra, target.dec);
  const aladinUrl = `https://aladin.cds.unistra.fr/AladinLite/?target=${target.ra.toFixed(4)}%20${target.dec.toFixed(4)}&fov=${(fov / 60.0).toFixed(3)}&survey=P%2FallWISE%2Fcolor`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-pop">
      <div className="relative w-full max-w-2xl bg-[#141733] border border-[#272a4f] rounded-3xl p-6 shadow-2xl text-[#f1eefb]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#272a4f]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🗺️</span>
            <div>
              <h3 className="text-lg font-extrabold text-white">¿Dónde está en el cielo?</h3>
              <p className="text-xs text-[#9a95b8]">
                Vista de contexto celeste y movimiento propio
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#0a0d1f] text-[#9a95b8] hover:text-white flex items-center justify-center font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Prompt question: ¿Quieres comparar con Gaia y WISE? */}
        <div className="mt-3 p-3 rounded-2xl bg-[#0a0d1f] border border-[#272a4f] flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-white">
            ¿Quieres comparar con Gaia y WISE?
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-[#38bdf8] cursor-pointer font-mono select-none">
              <input
                type="checkbox"
                checked={showGaia}
                onChange={(e) => setShowGaia(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#38bdf8] rounded cursor-pointer"
              />
              <span>Gaia (2016)</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#f59e0b] cursor-pointer font-mono select-none">
              <input
                type="checkbox"
                checked={showWise}
                onChange={(e) => setShowWise(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#f59e0b] rounded cursor-pointer"
              />
              <span>CatWISE (2020)</span>
            </label>
          </div>
        </div>

        {/* Sky View */}
        <div className="relative w-full h-[300px] bg-[#0a0d1f] rounded-2xl border border-[#272a4f] mt-3 flex items-center justify-center overflow-hidden">
          <svg viewBox="0 0 400 240" className="w-full h-full">
            {/* Celestial Grid Circles */}
            <circle cx="200" cy="120" r="90" fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
            <circle cx="200" cy="120" r="50" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
            <line x1="200" y1="20" x2="200" y2="220" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            <line x1="40" y1="120" x2="360" y2="120" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

            <text x="200" y="28" fill="#9a95b8" fontSize="10" textAnchor="middle" fontFamily="monospace">Norte (+Dec)</text>
            <text x="50" y="125" fill="#9a95b8" fontSize="10" textAnchor="middle" fontFamily="monospace">Este (+RA)</text>

            {/* Gaia DR3 marker (2016) */}
            {showGaia && (
              <g className="text-[#38bdf8]">
                <circle cx="160" cy="135" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
                <line x1="150" y1="135" x2="170" y2="135" stroke="currentColor" strokeWidth="1" />
                <line x1="160" y1="125" x2="160" y2="145" stroke="currentColor" strokeWidth="1" />
                <text x="160" y="156" fill="currentColor" fontSize="10" fontWeight="600" textAnchor="middle" fontFamily="monospace">
                  Gaia (2016)
                </text>
              </g>
            )}

            {/* CatWISE marker (2020) */}
            {showWise && (
              <g className="text-[#f59e0b]">
                <circle cx="178" cy="129" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <text x="178" y="115" fill="currentColor" fontSize="10" fontWeight="600" textAnchor="middle" fontFamily="monospace">
                  WISE (2020)
                </text>
              </g>
            )}

            {/* Trajectory arrow */}
            <line
              x1="160"
              y1="135"
              x2="215"
              y2="118"
              stroke="#ff5a7e"
              strokeWidth="2"
              strokeDasharray="4 3"
            />

            {/* SPHEREx Position (2026) */}
            <g className="text-[#ff5a7e]">
              <circle cx="215" cy="118" r="9" fill="none" stroke="currentColor" strokeWidth="2" className="animate-ping" />
              <circle cx="215" cy="118" r="4.5" fill="currentColor" />
              <text x="228" y="116" fill="currentColor" fontSize="11" fontWeight="800" fontFamily="monospace">
                SPHEREx (2026)
              </text>
            </g>
          </svg>

          {/* Coordinates overlay */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 bg-[#141733]/90 border border-[#272a4f] rounded-xl text-xs font-mono">
            <div>
              <span className="text-[#9a95b8]">J2000: </span>
              <span className="text-white font-bold">{raStr}</span>, <span className="text-white font-bold">{decStr}</span>
            </div>
            <a
              href={aladinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#38bdf8] hover:underline flex items-center gap-1 font-bold"
            >
              <span>Abrir en Aladin Lite CDS</span>
              <span>↗</span>
            </a>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-xs text-[#9a95b8] mt-4 leading-relaxed">
          Los círculos muestran cómo la posición de <strong>{target.n}</strong> registrada por el satélite Gaia (2016) y WISE (2020) difiere de la posición actual fotografiada por SPHEREx debido a su velocidad espacial.
        </p>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#ff5a7e] hover:bg-[#e8365d] text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
