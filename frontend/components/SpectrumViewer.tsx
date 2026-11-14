'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSpherexStore } from '../store/useSpherexStore';
import { SpectrumPoint, FramesResponse } from '../lib/types';

interface SpectrumViewerProps {
  ra: number;
  dec: number;
  fov: number;
  targetName: string;
  targetType: 'mov' | 'pair' | 'var';
  epochIndex: number;
  bandOn: boolean[];
  cachedFrames?: FramesResponse;
}

export function SpectrumViewer({
  ra, dec,
  targetName,
  targetType,
  epochIndex,
  bandOn,
}: SpectrumViewerProps) {
  const { spectrum, isLoading: loading } = useSpherexStore();
  const [hoveredPoint, setHoveredPoint] = useState<SpectrumPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Detector background ranges and colors
  const detectorRanges = useMemo(
    () => [
      { det: 1, min: 0.75, max: 1.11, color: '#6aa7ff', label: 'Det 1' },
      { det: 2, min: 1.11, max: 1.64, color: '#4fd1a5', label: 'Det 2' },
      { det: 3, min: 1.64, max: 2.42, color: '#ffd34f', label: 'Det 3' },
      { det: 4, min: 2.42, max: 3.82, color: '#ff9a3c', label: 'Det 4' },
      { det: 5, min: 3.82, max: 4.42, color: '#d44f6e', label: 'Det 5' },
      { det: 6, min: 4.42, max: 5.00, color: '#b07cff', label: 'Det 6' },
    ],
    []
  );

  // Download CSV
  const handleDownloadCsv = useCallback(() => {
    if (!spectrum || !spectrum.points.length) return;

    const rows = [
      '# SPHEREx 102-Band Spectroscopic Cutout Data',
      `# Objeto: ${targetName}`,
      `# RA: ${ra.toFixed(5)} deg, Dec: ${dec.toFixed(5)} deg`,
      '# Cobertura: 0.75 - 5.00 um (102 canales continuos)',
      'longitud_onda_um,flujo_relativo,error,detector,banda_idx',
    ];

    spectrum.points.forEach((p) => {
      rows.push(
        `${p.lambda_um.toFixed(4)},${p.flux.toFixed(3)},${p.err.toFixed(3)},${p.detector},${p.bandIndex}`
      );
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SPHEREx_102band_${targetName.replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [spectrum, targetName, ra, dec]);

  // Main Canvas drawing for spectrum
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const padLeft = 46;
    const padRight = 16;
    const padTop = 24;
    const padBottom = 32;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    ctx.clearRect(0, 0, w, h);

    // Deep background
    ctx.fillStyle = '#07090f';
    ctx.fillRect(0, 0, w, h);

    if (loading || !spectrum || !spectrum.points || spectrum.points.length === 0) {
      ctx.fillStyle = 'rgba(123, 120, 160, 0.7)';
      ctx.font = '500 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(loading ? 'Extrayendo 102 canales de SPHEREx…' : 'Sin datos espectrales', w / 2, h / 2);
      return;
    }

    const { points, features, epochSpectra } = spectrum;

    const minLambda = 0.75;
    const maxLambda = 5.0;

    // Calculate max flux for scale
    let maxFlux = 0;
    points.forEach((p) => {
      if (p.flux + p.err > maxFlux) maxFlux = p.flux + p.err;
    });
    if (epochSpectra) {
      epochSpectra.forEach((ep) => {
        ep.points.forEach((p) => {
          if (p.flux > maxFlux) maxFlux = p.flux;
        });
      });
    }
    maxFlux = Math.max(10, maxFlux * 1.15);

    const scaleX = (l: number) => padLeft + ((l - minLambda) / (maxLambda - minLambda)) * plotW;
    const scaleY = (f: number) => padTop + plotH - (f / maxFlux) * plotH;

    // 1. Draw 6 detector colored background zones
    detectorRanges.forEach((det, idx) => {
      const active = bandOn[idx];
      const xStart = scaleX(det.min);
      const xEnd = scaleX(det.max);
      const zoneW = xEnd - xStart;

      ctx.fillStyle = det.color + (active ? '1e' : '08');
      ctx.fillRect(xStart, padTop, zoneW, plotH);

      // Top separator lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xStart, padTop);
      ctx.lineTo(xStart, padTop + plotH);
      ctx.stroke();

      // Top detector name
      ctx.fillStyle = det.color + (active ? 'dd' : '44');
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(det.label, xStart + zoneW / 2, padTop - 8);
    });

    // 2. Grid lines (horizontal flux levels)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    const numYGrid = 4;
    for (let i = 0; i <= numYGrid; i++) {
      const fluxVal = (maxFlux / numYGrid) * i;
      const y = scaleY(fluxVal);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();

      // Y-axis flux label
      ctx.fillStyle = 'rgba(123, 120, 160, 0.7)';
      ctx.font = '500 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(fluxVal.toFixed(0), padLeft - 6, y + 3);
    }

    // 3. Draw absorption features markers (vertical dotted lines)
    if (features && features.length > 0) {
      features.forEach((feat) => {
        const fx = scaleX(feat.lambda_um);
        if (fx >= padLeft && fx <= padLeft + plotW) {
          ctx.strokeStyle = 'rgba(240, 122, 148, 0.55)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(fx, padTop);
          ctx.lineTo(fx, padTop + plotH);
          ctx.stroke();
          ctx.setLineDash([]);

          // Feature badge on top
          ctx.fillStyle = '#f07a94';
          ctx.font = 'bold 9px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(feat.label, fx, padTop + 14);
        }
      });
    }

    // 4. Multi-epoch curves for variable stars (R Dra / RW Aur)
    if (targetType === 'var' && epochSpectra && epochSpectra.length > 0) {
      epochSpectra.forEach((ep, epIdx) => {
        const isCurrent = epIdx === epochIndex;
        ctx.strokeStyle = isCurrent ? '#edeaf8' : `rgba(123, 120, 160, ${0.25 + epIdx * 0.12})`;
        ctx.lineWidth = isCurrent ? 2.5 : 1;
        ctx.beginPath();
        ep.points.forEach((p, idx) => {
          const x = scaleX(p.lambda_um);
          const y = scaleY(p.flux);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
    } else {
      // 5. Standard single target spectrum line with area gradient
      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
      grad.addColorStop(0, 'rgba(237, 234, 248, 0.22)');
      grad.addColorStop(1, 'rgba(237, 234, 248, 0.0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      points.forEach((p, idx) => {
        const x = scaleX(p.lambda_um);
        const y = scaleY(p.flux);
        if (idx === 0) {
          ctx.moveTo(x, padTop + plotH);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.lineTo(scaleX(points[points.length - 1].lambda_um), padTop + plotH);
      ctx.closePath();
      ctx.fill();

      // Main flux line
      ctx.strokeStyle = '#edeaf8';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      points.forEach((p, idx) => {
        const x = scaleX(p.lambda_um);
        const y = scaleY(p.flux);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Subtle error bars on every 4th point
      ctx.strokeStyle = 'rgba(237, 234, 248, 0.45)';
      ctx.lineWidth = 1;
      points.forEach((p, idx) => {
        if (idx % 3 === 0) {
          const x = scaleX(p.lambda_um);
          const y1 = scaleY(p.flux - p.err);
          const y2 = scaleY(p.flux + p.err);
          ctx.beginPath();
          ctx.moveTo(x, y1); ctx.lineTo(x, y2);
          ctx.moveTo(x - 2, y1); ctx.lineTo(x + 2, y1);
          ctx.moveTo(x - 2, y2); ctx.lineTo(x + 2, y2);
          ctx.stroke();
        }
      });
    }

    // 6. X-axis scale labels (wavelength in microns)
    ctx.fillStyle = 'rgba(123, 120, 160, 0.85)';
    ctx.font = '500 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';

    const wavelengthTicks = [0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
    wavelengthTicks.forEach((l) => {
      const x = scaleX(l);
      ctx.beginPath();
      ctx.moveTo(x, padTop + plotH);
      ctx.lineTo(x, padTop + plotH + 4);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.stroke();
      ctx.fillText(`${l.toFixed(1)} µm`, x, padTop + plotH + 16);
    });

    // Axis titles
    ctx.fillStyle = 'rgba(123, 120, 160, 0.6)';
    ctx.font = '500 9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Longitud de onda infrarroja (0,75 – 5,00 µm)', padLeft + plotW / 2, h - 2);

    // 7. Interactive Hover Cursor
    if (mousePos && hoveredPoint) {
      const hx = scaleX(hoveredPoint.lambda_um);
      const hy = scaleY(hoveredPoint.flux);

      // Vertical cursor line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point highlight dot
      ctx.fillStyle = '#ff5a7e';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }, [spectrum, loading, bandOn, targetType, epochIndex, detectorRanges, mousePos, hoveredPoint]);

  // Handle mouse move over canvas to inspect individual bands
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !spectrum || !spectrum.points.length) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleXFactor = canvas.width / rect.width;
    const pxX = x * scaleXFactor;
    const pxY = y * (canvas.height / rect.height);

    const padLeft = 46;
    const padRight = 16;
    const plotW = canvas.width - padLeft - padRight;

    const minLambda = 0.75;
    const maxLambda = 5.0;

    const hoverLambda = minLambda + ((pxX - padLeft) / plotW) * (maxLambda - minLambda);

    if (hoverLambda >= minLambda && hoverLambda <= maxLambda) {
      // Find closest band point
      let closest: SpectrumPoint = spectrum.points[0];
      let minDiff = Infinity;

      spectrum.points.forEach((p) => {
        const diff = Math.abs(p.lambda_um - hoverLambda);
        if (diff < minDiff) {
          minDiff = diff;
          closest = p;
        }
      });

      setHoveredPoint(closest);
      setMousePos({ x: pxX, y: pxY });
    } else {
      setHoveredPoint(null);
      setMousePos(null);
    }
  };

  const handleCanvasMouseLeave = () => {
    setHoveredPoint(null);
    setMousePos(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Top action row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', lineHeight: 1.4 }}>
          {targetType === 'var'
            ? 'Superposición de las 4 épocas: el cambio de flujo y pendiente espectral revela la pulsación estelar.'
            : '102 canales continuos: las caídas indican absorción atmosférica de moléculas (agua, metano, CO).'}
        </div>
        <button
          onClick={handleDownloadCsv}
          disabled={loading || !spectrum}
          className="btn-ghost"
          style={{ fontSize: 'var(--text-data)', padding: '4px 10px', flexShrink: 0 }}
          title="Descargar tabla de datos espectrales en CSV"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          CSV (102 bandas)
        </button>
      </div>

      {/* Main Canvas Viewport */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={500}
          height={210}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          className="sky-canvas"
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            cursor: 'crosshair',
          }}
          aria-label="Gráfica de espectro infrarrojo continuo de 102 bandas"
        />

        {/* Hover Tooltip Floating Pill */}
        {hoveredPoint && (
          <div
            style={{
              position: 'absolute',
              right: 14,
              top: 14,
              background: 'rgba(7, 9, 15, 0.88)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 'var(--text-data)',
              fontFamily: 'var(--font-body)',
              color: 'var(--ink)',
              pointerEvents: 'none',
              display: 'flex',
              gap: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            <span>
              <b style={{ color: '#ffd34f' }}>λ:</b> {hoveredPoint.lambda_um.toFixed(3)} µm
            </span>
            <span>
              <b style={{ color: '#4fd1a5' }}>Flujo:</b> {hoveredPoint.flux.toFixed(1)}
            </span>
            <span style={{ color: 'var(--mute)' }}>
              (Det {hoveredPoint.detector})
            </span>
          </div>
        )}
      </div>

      {/* Identified Molecular Features List */}
      {spectrum?.features && spectrum.features.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
          <div style={{ fontSize: 'var(--text-data)', fontWeight: 600, color: 'var(--mute)' }}>
            Líneas moleculares detectadas en este objeto:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6 }}>
            {spectrum.features.map((feat) => (
              <div
                key={feat.label}
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  background: 'rgba(240, 122, 148, 0.08)',
                  border: '1px solid rgba(240, 122, 148, 0.22)',
                  fontSize: 'var(--text-data)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <b style={{ color: '#f07a94' }}>{feat.label}</b>
                  <span className="coord">{feat.lambda_um.toFixed(2)} µm</span>
                </div>
                <div style={{ color: 'var(--mute)', fontSize: '0.68rem', marginTop: 2 }}>
                  {feat.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

