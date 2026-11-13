'use client';

import React from 'react';
import { useSpherexStore } from '../store/useSpherexStore';
import { formatSexagesimal } from '../lib/wcs';

// Add Compass icon if needed or use custom SVG
function CompassSvg({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

export function SkyContext() {
  const { target, fov } = useSpherexStore();

  const { raStr, decStr } = formatSexagesimal(target.ra, target.dec);

  // Aladin Lite CDS URL
  const aladinUrl = `https://aladin.cds.unistra.fr/AladinLite/?target=${target.ra.toFixed(4)}%20${target.dec.toFixed(4)}&fov=${(fov / 60.0).toFixed(3)}&survey=P%2FallWISE%2Fcolor`;

  return (
    <div className="flex-1 flex flex-col p-3 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CompassSvg size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">
            Contexto Celeste y Catálogos
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <a
            href={aladinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 transition-colors border border-slate-700 font-mono text-[11px]"
            title="Abrir en CDS Aladin Lite"
          >
            <span>Aladin Lite</span>
            <span>↗</span>
          </a>
        </div>
      </div>

      {/* Mini Sky Display */}
      <div className="relative flex-1 min-h-[140px] bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-cosmic-grid opacity-20" />

        <svg viewBox="0 0 200 130" className="w-full h-full">
          {/* Celestial Grid Circles */}
          <circle cx="100" cy="65" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
          <circle cx="100" cy="65" r="25" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <line x1="100" y1="10" x2="100" y2="120" stroke="rgba(255,255,255,0.08)" strokeDasharray="2 2" />
          <line x1="20" y1="65" x2="180" y2="65" stroke="rgba(255,255,255,0.08)" strokeDasharray="2 2" />

          {/* Compass labels (N/E) */}
          <text x="100" y="16" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="monospace">N (+Dec)</text>
          <text x="25" y="68" fill="#94a3b8" fontSize="8" textAnchor="middle" fontFamily="monospace">E (+RA)</text>

          {/* Catalog Markers */}
          {/* Gaia DR3 (Cyan) */}
          <g className="text-cyan-400">
            <circle cx="82" cy="72" r="4" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
            <line x1="77" y1="72" x2="87" y2="72" stroke="currentColor" strokeWidth="0.8" />
            <line x1="82" y1="67" x2="82" y2="77" stroke="currentColor" strokeWidth="0.8" />
            <text x="82" y="83" fill="currentColor" fontSize="6.5" textAnchor="middle" fontFamily="monospace">
              Gaia (2016)
            </text>
          </g>

          {/* CatWISE (Amber) */}
          <g className="text-amber-400">
            <circle cx="91" cy="69" r="4" fill="none" stroke="currentColor" strokeWidth="1" />
            <text x="91" y="60" fill="currentColor" fontSize="6.5" textAnchor="middle" fontFamily="monospace">
              WISE (2020)
            </text>
          </g>

          {/* Proper motion shift arrow */}
          <line
            x1="82"
            y1="72"
            x2="108"
            y2="63"
            stroke="#ec4899"
            strokeWidth="1.2"
            strokeDasharray="2 2"
          />

          {/* Current SPHEREx position (Pulsing Red/Pink) */}
          <g className="text-pink-400">
            <circle cx="108" cy="63" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" className="animate-ping" />
            <circle cx="108" cy="63" r="2.5" fill="currentColor" />
            <text x="115" y="62" fill="currentColor" fontSize="7" fontWeight="bold" fontFamily="monospace">
              SPHEREx (2026)
            </text>
          </g>
        </svg>

        {/* Coordinates readout overlay */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-2 py-1 bg-slate-900/90 border border-slate-800 rounded text-[10px] font-mono text-slate-300">
          <div>
            <span className="text-slate-500">J2000: </span>
            <span className="text-cyan-400">{raStr}</span>, <span className="text-cyan-400">{decStr}</span>
          </div>
          <div className="text-pink-400">
            µ: {Math.hypot(target.pmRa || 0, target.pmDec || 0).toFixed(0)} mas/año
          </div>
        </div>
      </div>
    </div>
  );
}
