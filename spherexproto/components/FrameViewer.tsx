'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';
import { getColormapLut, applyStretch } from '../lib/colormaps';
import { pixelToCelestial, computeProperMotionDisplacement } from '../lib/wcs';
import { getCatalogMarkers } from '../lib/mockData';
import { createAnimatedGif } from '../lib/gifEncoder';
import { 
  CrosshairIcon, 
  SparklesIcon, 
  EyeIcon, 
  DownloadIcon, 
  ActivityIcon,
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon
} from './Icons';

export function FrameViewer() {
  const {
    frames,
    epochs,
    currentEpoch,
    detectors,
    sumDetectors,
    mode,
    diffRef,
    colormap,
    stretch,
    overlays,
    blinkMode,
    detective,
    detectiveFound,
    detectiveTarget,
    selectedObjectCallout,
    wcs,
    fov,
    selectedPixel,
    hoverCoords,
    isLoading,
    playing,
    fps,
  } = useSpherexStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showDetectiveBanner, setShowDetectiveBanner] = useState(false);
  const [isExportingGif, setIsExportingGif] = useState(false);

  // Playback timer loop
  useEffect(() => {
    if (!playing) return;
    const intervalMs = Math.round(1000 / Math.max(1, fps));
    const timer = setInterval(() => {
      spherexStore.nextEpoch();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [playing, fps]);

  // Blink Mode: rapidly toggles between Epoch 1 (index 0) and Epoch 4 (index 3)
  useEffect(() => {
    if (!blinkMode) return;
    const interval = setInterval(() => {
      const curr = spherexStore.getState().currentEpoch;
      spherexStore.setCurrentEpoch(curr === 0 ? 3 : 0);
    }, 550); // ~1.8 Hz classic blink rate
    return () => clearInterval(interval);
  }, [blinkMode]);

  // Trigger celebratory banner animation when target is found in Detective Mode
  useEffect(() => {
    if (detectiveFound) {
      setShowDetectiveBanner(true);
      const timer = setTimeout(() => setShowDetectiveBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [detectiveFound]);

  // Compute processed image buffer for current settings (256x256)
  const computeDisplayBuffer = useCallback((targetEpoch?: number): Float32Array | null => {
    if (!frames || frames.length === 0) return null;

    const size = frames[0].width;
    const numPixels = size * size;
    const epIdx = targetEpoch !== undefined ? targetEpoch : currentEpoch;

    const activeDetIndices = detectors
      .map((active, idx) => (active ? idx + 1 : null))
      .filter((d): d is number => d !== null);

    if (activeDetIndices.length === 0) return null;

    if (mode === 'stack') {
      // Stack mode: average across all epochs and active detectors
      const stacked = new Float32Array(numPixels);
      let count = 0;

      frames.forEach(f => {
        if (activeDetIndices.includes(f.detector)) {
          for (let i = 0; i < numPixels; i++) {
            stacked[i] += f.pixelData[i];
          }
          count++;
        }
      });

      if (count > 0) {
        for (let i = 0; i < numPixels; i++) stacked[i] /= count;
      }
      return stacked;
    }

    if (mode === 'diff') {
      // Difference mode: targetEpoch frames - reference frames
      const currentEpochFrames = frames.filter(
        f => f.epochIndex === epIdx && activeDetIndices.includes(f.detector)
      );

      let refFrames: typeof frames = [];
      if (diffRef === 'first') {
        refFrames = frames.filter(f => f.epochIndex === 0 && activeDetIndices.includes(f.detector));
      } else if (diffRef === 'previous') {
        const prevIdx = Math.max(0, epIdx - 1);
        refFrames = frames.filter(f => f.epochIndex === prevIdx && activeDetIndices.includes(f.detector));
      } else {
        refFrames = frames.filter(f => f.epochIndex !== epIdx && activeDetIndices.includes(f.detector));
      }

      if (currentEpochFrames.length === 0 || refFrames.length === 0) return null;

      const currCombined = new Float32Array(numPixels);
      currentEpochFrames.forEach(f => {
        for (let i = 0; i < numPixels; i++) currCombined[i] += f.pixelData[i];
      });
      for (let i = 0; i < numPixels; i++) currCombined[i] /= currentEpochFrames.length;

      const refCombined = new Float32Array(numPixels);
      refFrames.forEach(f => {
        for (let i = 0; i < numPixels; i++) refCombined[i] += f.pixelData[i];
      });
      for (let i = 0; i < numPixels; i++) refCombined[i] /= refFrames.length;

      const diffBuffer = new Float32Array(numPixels);
      for (let i = 0; i < numPixels; i++) {
        diffBuffer[i] = currCombined[i] - refCombined[i];
      }
      return diffBuffer;
    }

    // Normal mode: combine active detectors at target epoch
    const currentEpochFrames = frames.filter(
      f => f.epochIndex === epIdx && activeDetIndices.includes(f.detector)
    );

    if (currentEpochFrames.length === 0) return null;

    const normalBuffer = new Float32Array(numPixels);
    currentEpochFrames.forEach(f => {
      for (let i = 0; i < numPixels; i++) normalBuffer[i] += f.pixelData[i];
    });

    if (!sumDetectors && currentEpochFrames.length > 1) {
      for (let i = 0; i < numPixels; i++) normalBuffer[i] /= currentEpochFrames.length;
    }

    return normalBuffer;
  }, [frames, currentEpoch, detectors, sumDetectors, mode, diffRef]);

  // Main canvas rendering effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const buffer = computeDisplayBuffer();
    if (!buffer || !frames || frames.length === 0) {
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const size = frames[0].width;
    canvas.width = size;
    canvas.height = size;

    const imgData = ctx.createImageData(size, size);
    const data32 = new Uint32Array(imgData.data.buffer);
    const lut = getColormapLut(colormap);

    if (mode === 'diff') {
      // Symmetrical difference stretch around 0
      const diffRange = Math.max(25, stretch.max * 0.45);
      for (let i = 0; i < buffer.length; i++) {
        const val = buffer[i];
        const norm = Math.max(0, Math.min(1, (val + diffRange) / (2 * diffRange)));
        const lutIdx = Math.floor(norm * 255);
        const color = lut[lutIdx] || lut[128];
        data32[i] = (255 << 24) | (color.b << 16) | (color.g << 8) | color.r;
      }
    } else {
      // Normal or Stack stretch
      for (let i = 0; i < buffer.length; i++) {
        const val = buffer[i];
        const stretched = applyStretch(val, stretch.min, stretch.max, stretch.fn);
        const lutIdx = Math.floor(Math.max(0, Math.min(1, stretched)) * 255);
        const color = lut[lutIdx] || lut[0];
        data32[i] = (255 << 24) | (color.b << 16) | (color.g << 8) | color.r;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [computeDisplayBuffer, colormap, mode, stretch, frames]);

  // Coordinate mouse inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !wcs) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const pxX = Math.floor((e.clientX - rect.left) * scaleX);
    const pxY = Math.floor((e.clientY - rect.top) * scaleY);

    if (pxX >= 0 && pxX < canvas.width && pxY >= 0 && pxY < canvas.height) {
      const cel = pixelToCelestial(pxX, pxY, wcs);
      const buffer = computeDisplayBuffer();
      const fluxVal = buffer ? buffer[pxY * canvas.width + pxX] : 0;

      spherexStore.setHoverCoords({
        x: pxX,
        y: pxY,
        ra: cel.ra,
        dec: cel.dec,
        flux: parseFloat(fluxVal.toFixed(2)),
      });
    }

    if (isDragging) {
      setPanOffset(prev => ({
        x: prev.x + (e.clientX - dragStart.x),
        y: prev.y + (e.clientY - dragStart.y),
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.shiftKey) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const pxX = Math.floor((e.clientX - rect.left) * scaleX);
    const pxY = Math.floor((e.clientY - rect.top) * scaleY);

    if (pxX >= 0 && pxX < canvas.width && pxY >= 0 && pxY < canvas.height) {
      if (detective) {
        const found = spherexStore.checkDetectiveTargetClick({ x: pxX, y: pxY });
        if (found) return;
      }
      spherexStore.setSelectedPixel({ x: pxX, y: pxY });
    }
  };

  // Export current frame snapshot as PNG
  const downloadSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `SPHEREx_${spherexStore.getState().target.name || 'cutout'}_Epoch${currentEpoch + 1}_${mode}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Export animated GIF of all 4 epochs in current mode
  const exportAnimatedGifAction = async () => {
    if (!frames || frames.length === 0 || isExportingGif) return;
    try {
      setIsExportingGif(true);
      const size = frames[0].width;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = size;
      offCanvas.height = size;
      const ctx = offCanvas.getContext('2d');
      if (!ctx) return;

      const lut = getColormapLut(colormap);
      const gifFrames: { imageData: ImageData; delayMs: number }[] = [];

      for (let ep = 0; ep < epochs.length; ep++) {
        const buf = computeDisplayBuffer(ep);
        if (!buf) continue;
        const imgData = ctx.createImageData(size, size);
        const d32 = new Uint32Array(imgData.data.buffer);

        if (mode === 'diff') {
          const diffRange = Math.max(25, stretch.max * 0.45);
          for (let i = 0; i < buf.length; i++) {
            const val = buf[i];
            const norm = Math.max(0, Math.min(1, (val + diffRange) / (2 * diffRange)));
            const c = lut[Math.floor(norm * 255)] || lut[128];
            d32[i] = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
          }
        } else {
          for (let i = 0; i < buf.length; i++) {
            const s = applyStretch(buf[i], stretch.min, stretch.max, stretch.fn);
            const c = lut[Math.floor(Math.max(0, Math.min(1, s)) * 255)] || lut[0];
            d32[i] = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
          }
        }

        ctx.putImageData(imgData, 0, 0);

        // Stamp epoch label
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`Época ${ep + 1} (${epochs[ep].date.substring(0, 10)})`, 10, 20);

        gifFrames.push({
          imageData: ctx.getImageData(0, 0, size, size),
          delayMs: Math.round(1000 / Math.max(1, fps)),
        });
      }

      const gifBlob = createAnimatedGif(gifFrames);
      const url = URL.createObjectURL(gifBlob);
      const link = document.createElement('a');
      link.download = `SPHEREx_TimeMachine_${spherexStore.getState().target.name || 'target'}_animated.gif`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingGif(false);
    }
  };

  // Trajectory vector calculations
  const pmRa = detectiveTarget?.expectedPmRaMasYr || 0;
  const pmDec = detectiveTarget?.expectedPmDecMasYr || 0;
  const initialPx = detectiveTarget?.initialPixel || [128, 128];

  const trajectoryPoints = [0, 0.5, 1.0, 1.5].map(years => {
    const disp = computeProperMotionDisplacement(pmRa, pmDec, years, wcs);
    return {
      x: initialPx[0] + disp.dxPixels,
      y: initialPx[1] + disp.dyPixels,
      years,
      yearLabel: (2025.5 + years).toFixed(1),
    };
  });

  const catalogMarkers = getCatalogMarkers(spherexStore.getState() as unknown as import('../lib/types').FramesResponse);

  // Dynamic Scale Bar calculations (1 arcminute)
  const arcminBarLength = 1.0;
  const scaleBarPixelWidth = (arcminBarLength / 60.0) / Math.abs(wcs.cdelt);

  const currentFrameObj = frames.find(f => f.epochIndex === currentEpoch && detectors[f.detector - 1]);
  const currentTargetPos = currentFrameObj?.movingTargetPixel || trajectoryPoints[currentEpoch] || { x: 128, y: 128 };

  return (
    <div 
      ref={containerRef}
      className="relative flex-1 flex flex-col bg-slate-950 overflow-hidden border border-slate-800 rounded-2xl select-none shadow-2xl"
    >
      {/* Top Banner explaining current visualization mode */}
      <div className={`px-4 py-2 border-b flex items-center justify-between text-xs font-mono transition-colors ${
        mode === 'diff' 
          ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          : mode === 'stack'
          ? 'bg-purple-950/40 border-purple-800/60 text-purple-300'
          : 'bg-slate-900/90 border-slate-800 text-slate-300'
      }`}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-bold">
            {mode === 'diff'
              ? 'FILTRO DE DIFERENCIA: Las estrellas fijas desaparecen. Los pares azul/rojo indican movimiento.'
              : mode === 'stack'
              ? 'APILADO TOTAL: 4 épocas sumadas para revelar objetos infrarrojos ultra tenues.'
              : 'CIELO NATURAL: Observa cómo el punto fucsia salta entre fechas mientras el fondo está quieto.'}
          </span>
        </div>

        {/* Quick Mode Indicator */}
        <div className="flex items-center gap-2">
          {mode === 'diff' && (
            <div className="flex items-center gap-2 text-[11px] bg-slate-950/70 px-2 py-0.5 rounded border border-rose-500/40 font-bold">
              <span className="text-cyan-400">🔵 Posición 2025</span>
              <span>➔</span>
              <span className="text-rose-400">🔴 Posición 2027</span>
            </div>
          )}
          <span className="text-slate-500">FOV: {fov}&apos;</span>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div 
        className="relative flex-1 flex items-center justify-center min-h-[460px] overflow-hidden bg-slate-950"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsDragging(false);
          spherexStore.setHoverCoords(undefined);
        }}
      >
        {/* Background celestial grid */}
        <div className="absolute inset-0 bg-cosmic-grid opacity-25 pointer-events-none" />

        {/* Detective Mode Alert Banner */}
        {showDetectiveBanner && (
          <div className="absolute top-5 z-50 flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 text-white font-bold shadow-2xl shadow-emerald-500/40 animate-bounce">
            <span className="text-3xl">🎉</span>
            <div>
              <div className="text-xs uppercase tracking-widest text-emerald-100">¡Identificación Exitosa!</div>
              <div className="text-base text-white">
                ¡Lo encontraste! <span className="underline decoration-white/40">{detectiveTarget?.name}</span> detectado con precisión.
              </div>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md">
            <div className="w-14 h-14 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-3 shadow-lg shadow-cyan-500/30" />
            <div className="text-sm font-mono text-cyan-300 tracking-wider">
              Sintetizando recortes SPHEREx a 256x256...
            </div>
          </div>
        )}

        {/* Interactive Object Callout Card */}
        {selectedObjectCallout && (
          <div className="absolute top-4 left-4 z-30 p-3.5 rounded-2xl bg-slate-900/95 border border-pink-500/50 shadow-2xl backdrop-blur-md max-w-sm">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <span className="font-extrabold text-pink-400 text-xs flex items-center gap-1.5">
                <span>🎯</span> {selectedObjectCallout.name}
              </span>
              <button 
                onClick={() => spherexStore.dismissCallout()}
                className="text-slate-400 hover:text-white text-xs px-1"
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-white font-bold mt-1.5">{selectedObjectCallout.type}</div>
            <div className="text-[11px] text-cyan-300 font-mono mt-0.5">
              Movimiento: {selectedObjectCallout.motion}
            </div>
            <p className="text-[11px] text-slate-300 mt-1 leading-snug">
              {selectedObjectCallout.description}
            </p>
            <div className="mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] text-pink-300 font-bold flex items-center gap-1">
              <span>👇</span>
              <span>Revisa el panel inferior para inspeccionar sus 102 bandas</span>
            </div>
          </div>
        )}

        {/* Canvas & SVG Overlay */}
        <div 
          className="relative cursor-crosshair transition-transform duration-75 my-auto"
          style={{
            transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
          }}
          onClick={handleClick}
        >
          <canvas
            ref={canvasRef}
            width={256}
            height={256}
            className="w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] rounded-xl shadow-2xl border-2 border-slate-800/90"
          />

          {/* SVG Vector Overlays */}
          <svg
            viewBox="0 0 256 256"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {/* Multi-Exposure Ghosting Mode */}
            {overlays.ghostingTrail && (
              <g>
                {trajectoryPoints.map((pt, idx) => {
                  const colors = ['#38bdf8', '#4ade80', '#facc15', '#ec4899'];
                  return (
                    <g key={idx}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="8"
                        fill="none"
                        stroke={colors[idx]}
                        strokeWidth="1.8"
                        strokeDasharray="2 1.5"
                      />
                      <rect
                        x={pt.x + 9}
                        y={pt.y - 7}
                        width="38"
                        height="13"
                        rx="2"
                        fill="rgba(15, 23, 42, 0.85)"
                        stroke={colors[idx]}
                        strokeWidth="0.8"
                      />
                      <text
                        x={pt.x + 12}
                        y={pt.y + 2}
                        fill={colors[idx]}
                        fontSize="6.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {pt.yearLabel}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            {/* Gaia DR3 & CatWISE Catalog Markers */}
            {overlays.gaia && catalogMarkers.filter(m => m.catalog === 'Gaia DR3').map(marker => (
              <g key={marker.id} className="text-cyan-400">
                <circle cx={marker.pixelX} cy={marker.pixelY} r="7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.5 1.5" />
                <line x1={marker.pixelX - 9} y1={marker.pixelY} x2={marker.pixelX + 9} y2={marker.pixelY} stroke="currentColor" strokeWidth="0.8" />
                <line x1={marker.pixelX} y1={marker.pixelY - 9} x2={marker.pixelX} y2={marker.pixelY + 9} stroke="currentColor" strokeWidth="0.8" />
                <text x={marker.pixelX + 10} y={marker.pixelY - 5} fill="currentColor" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
                  Gaia (2016)
                </text>
              </g>
            ))}

            {overlays.wise && catalogMarkers.filter(m => m.catalog === 'CatWISE2020').map(marker => (
              <g key={marker.id} className="text-amber-400">
                <circle cx={marker.pixelX} cy={marker.pixelY} r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <text x={marker.pixelX + 9} y={marker.pixelY + 8} fill="currentColor" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
                  WISE (2020)
                </text>
              </g>
            ))}

            {/* Trajectory vector */}
            {(overlays.trajectory || detective) && trajectoryPoints.length > 1 && (
              <g>
                <polyline
                  points={trajectoryPoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgba(244, 114, 182, 0.9)"
                  strokeWidth="1.6"
                  strokeDasharray="3 2"
                />

                {trajectoryPoints.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r={idx === currentEpoch ? "4.5" : "2.2"}
                    fill={idx === currentEpoch ? "#ec4899" : "rgba(244, 114, 182, 0.6)"}
                    stroke="#ffffff"
                    strokeWidth={idx === currentEpoch ? "1.2" : "0"}
                  />
                ))}

                {/* Directional Velocity Vector Arrow */}
                {(() => {
                  const currentPt = trajectoryPoints[currentEpoch] || trajectoryPoints[0];
                  const dx = (trajectoryPoints[3].x - trajectoryPoints[0].x);
                  const dy = (trajectoryPoints[3].y - trajectoryPoints[0].y);
                  const len = Math.hypot(dx, dy);
                  if (len > 0.1) {
                    const arrowLen = 16.0;
                    const endX = currentPt.x + (dx / len) * arrowLen;
                    const endY = currentPt.y + (dy / len) * arrowLen;

                    return (
                      <g className="text-pink-400 animate-pulse">
                        <line x1={currentPt.x} y1={currentPt.y} x2={endX} y2={endY} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                        <polygon
                          points={`${endX},${endY} ${endX - (dx / len) * 4.5 + (dy / len) * 2.8},${endY - (dy / len) * 4.5 - (dx / len) * 2.8} ${endX - (dx / len) * 4.5 - (dy / len) * 2.8},${endY - (dy / len) * 4.5 + (dx / len) * 2.8}`}
                          fill="currentColor"
                        />
                      </g>
                    );
                  }
                  return null;
                })()}
              </g>
            )}

            {/* Didactic Annotations Layer */}
            {overlays.annotations && (
              <g>
                {/* Highlight Target Object */}
                <g className="text-pink-400">
                  <circle cx={currentTargetPos.x} cy={currentTargetPos.y} r="13" fill="none" stroke="currentColor" strokeWidth="1.8" className="animate-ping" opacity="0.6" />
                  <circle cx={currentTargetPos.x} cy={currentTargetPos.y} r="10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5" />
                  <line x1={currentTargetPos.x + 11} y1={currentTargetPos.y - 11} x2={currentTargetPos.x + 28} y2={currentTargetPos.y - 24} stroke="currentColor" strokeWidth="1.2" />
                  <rect x={currentTargetPos.x + 26} y={currentTargetPos.y - 34} width="112" height="16" rx="3" fill="rgba(15, 23, 42, 0.92)" stroke="#ec4899" strokeWidth="1" />
                  <text x={currentTargetPos.x + 30} y={currentTargetPos.y - 23} fill="#f472b6" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
                    🎯 {detectiveTarget?.name || 'Objetivo Móvil'}
                  </text>
                </g>

                {/* Background Star */}
                <g className="text-slate-400">
                  <circle cx="65" cy="55" r="7" fill="none" stroke="#64748b" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
                  <line x1="65" y1="48" x2="65" y2="35" stroke="#64748b" strokeWidth="0.8" />
                  <rect x="25" y="22" width="85" height="13" rx="3" fill="rgba(15, 23, 42, 0.85)" stroke="#475569" strokeWidth="0.7" />
                  <text x="29" y="31" fill="#94a3b8" fontSize="6.5" fontFamily="monospace">
                    ⭐ Estrella fija (Inmóvil)
                  </text>
                </g>
              </g>
            )}

            {/* Crosshair */}
            {overlays.crosshair && (
              <g className="text-slate-600/40">
                <line x1="128" y1="0" x2="128" y2="256" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
                <line x1="0" y1="128" x2="256" y2="128" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
                <circle cx="128" cy="128" r="8" fill="none" stroke="currentColor" strokeWidth="0.6" />
              </g>
            )}

            {/* Selected Pixel */}
            {selectedPixel && (
              <g className="text-yellow-400">
                <rect x={selectedPixel.x - 3} y={selectedPixel.y - 3} width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <circle cx={selectedPixel.x} cy={selectedPixel.y} r="7" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" className="animate-spin" />
              </g>
            )}
          </svg>
        </div>

        {/* Floating Right Action Tools */}
        <div className="absolute top-4 right-4 z-30 flex flex-col gap-1.5 pointer-events-auto">
          <button onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))} title="Acercar Recorte" className="w-8 h-8 rounded-lg bg-slate-900/90 border border-slate-700 hover:bg-slate-800 text-slate-200 flex items-center justify-center font-bold text-sm shadow-md">
            +
          </button>
          <button onClick={() => setZoomLevel(prev => Math.max(1, prev - 0.25))} title="Alejar Recorte" className="w-8 h-8 rounded-lg bg-slate-900/90 border border-slate-700 hover:bg-slate-800 text-slate-200 flex items-center justify-center font-bold text-sm shadow-md">
            -
          </button>
          <button onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }} title="Restablecer Vista" className="w-8 h-8 rounded-lg bg-slate-900/90 border border-slate-700 hover:bg-slate-800 text-slate-300 text-[10px] font-mono flex items-center justify-center shadow-md">
            1x
          </button>
          <button onClick={() => spherexStore.toggleOverlay('annotations')} title={overlays.annotations ? 'Ocultar Etiquetas' : 'Mostrar Etiquetas'} className={`w-8 h-8 rounded-lg border flex items-center justify-center shadow-md transition-colors ${overlays.annotations ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400' : 'bg-slate-900/90 text-slate-400 border-slate-700 hover:text-white'}`}>
            <EyeIcon size={15} />
          </button>
          <button onClick={downloadSnapshot} title="Descargar Fotograma PNG" className="w-8 h-8 rounded-lg bg-slate-900/90 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center shadow-md">
            <DownloadIcon size={15} />
          </button>
          <button onClick={exportAnimatedGifAction} disabled={isExportingGif} title="Descargar GIF Animado" className="w-8 h-8 rounded-lg bg-pink-950/80 border border-pink-500/50 hover:bg-pink-900/80 text-pink-300 flex items-center justify-center shadow-md disabled:opacity-50">
            {isExportingGif ? <div className="w-3.5 h-3.5 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" /> : <span className="text-[10px] font-mono font-bold">GIF</span>}
          </button>
        </div>
      </div>

      {/* Integrated Timeline & Player Bar (Directly below the Canvas!) */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Main Playback Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => spherexStore.prevEpoch()}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Fotograma Anterior"
            >
              <SkipBackIcon size={16} />
            </button>

            <button
              onClick={() => spherexStore.setPlaying(!playing)}
              className={`px-4 py-2 rounded-xl font-extrabold flex items-center gap-2 transition-all shadow-lg text-xs uppercase tracking-wider ${
                playing
                  ? 'bg-amber-500 text-slate-950 shadow-amber-500/20'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20'
              }`}
            >
              {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
              <span>{playing ? 'Pausar' : 'Reproducir Movimiento'}</span>
            </button>

            <button
              onClick={() => spherexStore.nextEpoch()}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              title="Fotograma Siguiente"
            >
              <SkipForwardIcon size={16} />
            </button>
          </div>

          {/* Quick Comparison Mode Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => spherexStore.toggleBlinkMode()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                blinkMode
                  ? 'bg-pink-500 text-white border-pink-400 shadow-md shadow-pink-500/30 animate-pulse'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-pink-300 border-pink-500/40'
              }`}
            >
              <span>⚡</span>
              <span>{blinkMode ? 'Parpadeando (1 ↔ 4)' : 'Parpadeo 1 ↔ 4'}</span>
            </button>

            <button
              onClick={() => spherexStore.toggleGhostingTrail()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                overlays.ghostingTrail
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border-amber-500/40'
              }`}
              title="Muestra las 4 posiciones del astro a la vez como en una exposición múltiple"
            >
              <span>✨</span>
              <span>Rastro Multi-Época</span>
            </button>
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 text-xs font-mono">
            <span className="text-slate-400 text-[11px] mr-1">Velocidad:</span>
            {[1, 2, 4, 8].map((f) => (
              <button
                key={f}
                onClick={() => spherexStore.setFps(f)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  fps === f
                    ? 'bg-slate-700 text-cyan-300 font-bold border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
                }`}
              >
                {f}x
              </button>
            ))}
          </div>
        </div>

        {/* 4 Epoch Steps Interactive Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {epochs.map((ep, idx) => {
            const isSelected = idx === currentEpoch;
            return (
              <button
                key={ep.epoch}
                onClick={() => spherexStore.setCurrentEpoch(idx)}
                className={`p-2 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-md shadow-cyan-500/20 ring-1 ring-cyan-400/40'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono font-bold">
                  <span className={isSelected ? 'text-cyan-300' : 'text-slate-300'}>
                    Época {ep.epoch}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {idx === 0 ? 'Inicio' : `+${(idx * 0.5).toFixed(1)}a`}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-300 mt-0.5">
                  {ep.date.substring(0, 10)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
