'use client';

import React, { useMemo, useState, useRef } from 'react';
import { ConeResult } from '../lib/coneSearch';

interface CelestialConeChartProps {
  centerRa: number;
  centerDec: number;
  radiusArcmin: number;
  results: ConeResult[];
  hoveredId: string | null;
  onHoverId: (id: string | null) => void;
  onSelectResult: (result: ConeResult) => void;
  onSelectNewCenter?: (coords: { ra: number; dec: number }) => void;
}

export function CelestialConeChart({
  centerRa,
  centerDec,
  radiusArcmin,
  results,
  hoveredId,
  onHoverId,
  onSelectResult,
  onSelectNewCenter,
}: CelestialConeChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverCursor, setHoverCursor] = useState<{ px: number; py: number; ra: number; dec: number } | null>(null);

  // Chart dimensions
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const rPx = 110; // Pixel radius for search boundary

  // Scale: pixels per arcmin
  const scale = rPx / Math.max(1, radiusArcmin);
  const cosDec = Math.cos((centerDec * Math.PI) / 180.0);

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const px = (mouseX / rect.width) * size;
    const py = (mouseY / rect.height) * size;
    const dist = Math.hypot(px - cx, py - cy);

    if (dist <= rPx) {
      setHoverCursor((prev) => {
        if (prev && Math.hypot(prev.px - px, prev.py - py) < 2) {
          return prev;
        }
        const dRaArcmin = (px - cx) / scale;
        const dDecArcmin = (cy - py) / scale;
        const dRaDeg = dRaArcmin / (60.0 * Math.max(0.01, cosDec));
        const dDecDeg = dDecArcmin / 60.0;
        const cursorRa = centerRa - dRaDeg;
        const cursorDec = centerDec + dDecDeg;
        return { px, py, ra: cursorRa, dec: cursorDec };
      });
    } else {
      setHoverCursor((prev) => (prev !== null ? null : prev));
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!hoverCursor || !onSelectNewCenter) return;
    const target = e.target as SVGElement;
    if (target.getAttribute('data-point') === 'true') return;
    onSelectNewCenter({ ra: hoverCursor.ra, dec: hoverCursor.dec });
  };

  // Compute 2D projected pixel positions (East on left: -x, North up: +y)
  const mappedPoints = useMemo(() => {
    return results.map((item) => {
      // Angular separation in arcminutes relative to center (East on left)
      const dRaArcmin = (centerRa - item.ra) * cosDec * 60.0;
      const dDecArcmin = (item.dec - centerDec) * 60.0;

      const px = cx + dRaArcmin * scale;
      const py = cy - dDecArcmin * scale;

      // Color scheme: alert color ONLY for motion / cold candidates
      let color = 'var(--mute)';
      if (item.isColdCandidate || item.pmArcsecPerYear >= 0.20 || item.kindCode.startsWith('PM') || item.kindCode.startsWith('BD')) {
        color = 'var(--alert)';
      } else if (item.kindCode.startsWith('V') || item.kindCode.startsWith('Mi') || item.kindCode.startsWith('TT')) {
        color = '#eab308'; // Amber for variables
      }

      // Proper motion vector displacement in pixels
      let pmVector: { vx: number; vy: number; len: number } | null = null;
      if (item.pmArcsecPerYear >= 0.04 && item.sepArcsec > 0) {
        const pmRaArcmin = (item.pmRa / 1000.0 / 60.0) * 12.0;
        const pmDecArcmin = (item.pmDec / 1000.0 / 60.0) * 12.0;
        const vx = -pmRaArcmin * scale;
        const vy = -pmDecArcmin * scale;
        const len = Math.hypot(vx, vy);
        if (len > 3) {
          const clampedLen = Math.min(26, Math.max(8, len));
          const norm = clampedLen / len;
          pmVector = { vx: vx * norm, vy: vy * norm, len: clampedLen };
        }
      }

      return {
        ...item,
        px,
        py,
        color,
        pmVector,
        isCenter: item.sepArcsec === 0,
      };
    });
  }, [results, centerRa, centerDec, cosDec, scale, cx, cy]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg, 8px)',
        padding: '12px 10px',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 'var(--text-data)',
          color: 'var(--mute)',
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
          Carta Celeste ({radiusArcmin}′)
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          Norte ↑ · Este ←
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={() => setHoverCursor((prev) => (prev !== null ? null : prev))}
        onClick={handleSvgClick}
        style={{
          width: '100%',
          maxWidth: 260,
          height: 'auto',
          aspectRatio: '1 / 1',
          overflow: 'visible',
          cursor: 'crosshair',
        }}
      >
        <defs>
          <marker
            id="pm-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--alert)" opacity="0.9" />
          </marker>
        </defs>

        {/* 1. Coordinate Grid & Concentric Range Rings */}
        {/* Outer Cone Boundary */}
        <circle
          cx={cx}
          cy={cy}
          r={rPx}
          fill="var(--sky)"
          stroke="var(--line)"
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />

        {/* 2/3 Radius Ring */}
        <circle
          cx={cx}
          cy={cy}
          r={rPx * 0.666}
          fill="none"
          stroke="var(--line)"
          strokeWidth="0.8"
          strokeDasharray="2 2"
          opacity="0.7"
        />

        {/* 1/3 Radius Ring */}
        <circle
          cx={cx}
          cy={cy}
          r={rPx * 0.333}
          fill="none"
          stroke="var(--line)"
          strokeWidth="0.8"
          opacity="0.7"
        />

        {/* Crosshair Axes (N-S and E-W) */}
        <line x1={cx} y1={cy - rPx} x2={cx} y2={cy + rPx} stroke="var(--line)" strokeWidth="0.8" />
        <line x1={cx - rPx} y1={cy} x2={cx + rPx} y2={cy} stroke="var(--line)" strokeWidth="0.8" />

        {/* Astronomical Compass Directions */}
        <text x={cx} y={15} fill="var(--mute)" fontSize="9" fontWeight="600" textAnchor="middle">
          N
        </text>
        <text x={14} y={cy + 3} fill="var(--mute)" fontSize="9" fontWeight="600" textAnchor="middle">
          E
        </text>
        <text x={cx} y={size - 5} fill="var(--mute)" fontSize="9" textAnchor="middle">
          S
        </text>
        <text x={size - 12} y={cy + 3} fill="var(--mute)" fontSize="9" textAnchor="middle">
          O
        </text>

        {/* Distance label on ring */}
        <text
          x={cx + rPx * 0.666 - 2}
          y={cy - 4}
          fill="var(--mute)"
          fontSize="7"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {(radiusArcmin * 0.666).toFixed(0)}′
        </text>

        {/* Center Reticle Pin (Target marker) */}
        <circle cx={cx} cy={cy} r={3} fill="var(--ink)" />
        <circle cx={cx} cy={cy} r={7} fill="none" stroke="var(--ink)" strokeWidth="0.8" opacity="0.5" />

        {/* 2. Proper Motion Vector Arrows */}
        {mappedPoints.map((item) => {
          if (!item.pmVector) return null;
          return (
            <line
              key={`pm-${item.id}`}
              x1={item.px}
              y1={item.py}
              x2={item.px + item.pmVector.vx}
              y2={item.py + item.pmVector.vy}
              stroke="var(--alert)"
              strokeWidth="1.3"
              markerEnd="url(#pm-arrow)"
              opacity={hoveredId === item.id ? 1 : 0.7}
            />
          );
        })}

        {/* 3. Catalog Star / Object Points */}
        {mappedPoints.map((item) => {
          const isHovered = hoveredId === item.id;
          const radius = item.isCenter ? 4.5 : Math.max(3, Math.min(5.5, 2.5 + item.interestScore / 30));

          return (
            <g
              key={item.id}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverId(item.id)}
              onMouseLeave={() => onHoverId(null)}
              role="button" tabIndex={0} aria-label={`Seleccionar ${item.name}`} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelectResult(item);}}} onClick={() => onSelectResult(item)}
            >
              {/* Highlight Ring on Hover */}
              {isHovered && (
                <circle
                  cx={item.px}
                  cy={item.py}
                  r={radius + 4}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="1.2"
                />
              )}

              {/* Point Body */}
              <circle
                data-point="true"
                cx={item.px}
                cy={item.py}
                r={radius}
                fill={item.color}
                stroke="var(--panel)"
                strokeWidth={isHovered ? 1.5 : 0.8}
              />

              {/* Index Number Label */}
              <text
                x={item.px + (item.px > cx ? -6 : 6)}
                y={item.py - 4}
                fill={isHovered ? 'var(--ink)' : 'var(--mute)'}
                fontSize="8"
                fontWeight={isHovered ? '700' : '500'}
                textAnchor={item.px > cx ? 'end' : 'start'}
                style={{ pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}
              >
                {item.number}
              </text>
            </g>
          );
        })}

        {/* 4. Crosshair Reticle on Empty Space Hover ("Buscar aquí") */}
        {hoverCursor && !hoveredId && (
          <g style={{ pointerEvents: 'none' }}>
            <line
              x1={hoverCursor.px - 6}
              y1={hoverCursor.py}
              x2={hoverCursor.px + 6}
              y2={hoverCursor.py}
              stroke="var(--alert)"
              strokeWidth="1"
            />
            <line
              x1={hoverCursor.px}
              y1={hoverCursor.py - 6}
              x2={hoverCursor.px}
              y2={hoverCursor.py + 6}
              stroke="var(--alert)"
              strokeWidth="1"
            />
            <circle
              cx={hoverCursor.px}
              cy={hoverCursor.py}
              r={4}
              fill="none"
              stroke="var(--alert)"
              strokeWidth="0.8"
              strokeDasharray="2 2"
            />
            <rect
              x={hoverCursor.px - 30}
              y={hoverCursor.py + 7}
              width={60}
              height={14}
              rx={2}
              fill="var(--panel)"
              stroke="var(--line)"
              strokeWidth="0.8"
            />
            <text
              x={hoverCursor.px}
              y={hoverCursor.py + 17}
              fill="var(--alert)"
              fontSize="7.5"
              fontWeight="600"
              textAnchor="middle"
            >
              Buscar aquí
            </text>
          </g>
        )}
      </svg>

      {/* Interactive tip */}
      <p style={{ fontSize: 'var(--text-data)', color: 'var(--mute)', margin: '6px 0 2px', textAlign: 'center' }}>
        Clic en un punto vacío para recentrar la búsqueda
      </p>

      {/* Chart Legend */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          marginTop: 6,
          fontSize: 'var(--text-data)',
          color: 'var(--mute)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--alert)' }} />
          Se mueve / Frío
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#eab308' }} />
          Variable
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mute)' }} />
          Estrella fija
        </span>
      </div>
    </div>
  );
}
