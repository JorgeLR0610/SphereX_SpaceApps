'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { spherexStore } from '../store/useSpherexStore';
import { useLocale } from './useLocale';
import { useDataMode } from './useDataMode';
import { computeProcessedBuffer, renderImage } from '../lib/renderEngine';
import { exportTimelapseGif, exportComparisonCard } from '../lib/exportUtils';
import { useFrameData } from '../lib/useFrameData';
import { pixelToCelestial, computeProperMotionDisplacement } from '../lib/wcs';
import { getCatalogMarkers } from '../lib/mockData';

export function FrameViewer() {
  const realMode = useDataMode();
  const {text}=useLocale();
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
    selectedPixel,
    isLoading,
    error,
    target,
    playing,
    fps,
    provenance,
  } = useFrameData();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [curtain, setCurtain] = useState(false);
  const [split, setSplit] = useState(.5);
  const [hunter, setHunter] = useState(false);
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

  // Blink Mode: rapidly toggles between first and last epoch (Epoch 1 <-> Epoch N)
  useEffect(() => {
    if (!blinkMode) return;
    const interval = setInterval(() => {
      const state = spherexStore.getState();
      const curr = state.currentEpoch;
      const numEpochs = state.epochs.length || 2;
      const maxEp = Math.max(1, numEpochs - 1);
      spherexStore.setCurrentEpoch(curr === 0 ? maxEp : 0);
    }, Math.max(125, Math.round(1000 / fps))); // ~1.8 Hz classic blink rate
    return () => clearInterval(interval);
  }, [blinkMode, fps]);

  // Trigger celebratory banner animation when target is found in Detective Mode
  useEffect(() => {
    if (detectiveFound) {
      const showTimer = setTimeout(() => setShowDetectiveBanner(true), 0);
      const hideTimer = setTimeout(() => setShowDetectiveBanner(false), 5000);
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    } else {
      const resetTimer = setTimeout(() => setShowDetectiveBanner(false), 0);
      return () => clearTimeout(resetTimer);
    }
  }, [detectiveFound]);

  const computeDisplayBuffer = useCallback((epoch = currentEpoch) => computeProcessedBuffer(frames,epoch,detectors,mode,diffRef,sumDetectors)?.buffer || null, [frames,currentEpoch,detectors,mode,diffRef,sumDetectors]);
  useEffect(() => {
    const canvas=canvasRef.current;const ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
    const image=renderImage(frames,currentEpoch,detectors,mode,diffRef,stretch,colormap,sumDetectors,curtain?split:undefined);
    if(!image){ctx.clearRect(0,0,canvas.width,canvas.height);return;}
    canvas.width=image.width;canvas.height=image.height;ctx.putImageData(image,0,0);
  },[frames,currentEpoch,detectors,mode,diffRef,stretch,colormap,sumDetectors,curtain,split]);

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
      const epIdx = currentEpoch;
      const currentFrameObj = frames.find(f => f.epochIndex === epIdx && detectors[f.detector - 1]) || frames[0];
      const validMask = currentFrameObj?.validMask;
      const pixelIdx = pxY * canvas.width + pxX;
      const isValid = !validMask || validMask[pixelIdx] === 1;
      const fluxVal = buffer ? buffer[pixelIdx] : 0;

      spherexStore.setHoverCoords({
        x: pxX,
        y: pxY,
        ra: cel.ra,
        dec: cel.dec,
        flux: isValid ? parseFloat(fluxVal.toFixed(3)) : NaN,
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
    link.download = `SPHEREx_${realMode?"observed":"simulation"}_${spherexStore.getState().target.name || 'cutout'}_Epoch${currentEpoch + 1}_${mode}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Export animated GIF of all 4 epochs in current mode
  const exportAnimatedGifAction = async () => {
    if (!frames || frames.length === 0 || isExportingGif) return;
    try {
      setIsExportingGif(true);
      exportTimelapseGif(frames,detectors,mode,diffRef,stretch,colormap,fps,sumDetectors);
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

  const isRealData = Boolean(
    provenance?.data_origin === 'observed_spherex' ||
    (frames && frames.length > 0 && (
      frames[0].provenance?.data_origin === 'observed_spherex' ||
      (typeof frames[0].provenance?.collection === 'string' && frames[0].provenance.collection.includes('spherex'))
    ))
  );
  const frameSize = frames && frames[0] ? frames[0].width : 256;
  const svgScale = frameSize / 256;

  const currentFrameObj = frames.find(f => f.epochIndex === currentEpoch && detectors[f.detector - 1]);
  const currentTargetPos = currentFrameObj?.movingTargetPixel || trajectoryPoints[currentEpoch] || { x: frameSize / 2, y: frameSize / 2 };

  return (
    <div 
      ref={containerRef}
      className="reference-viewer"
    >
      <div className="viewer-caption">{realMode ? 'SPHEREx QR3 · ' : 'Simulación · '}{epochs.map(e => e.date.slice(0,10)).join(' / ')} · UTC</div>
      {/* Main Viewport Container */}
      <div 
        className="relative flex-1 flex items-center justify-center viewer-viewport min-h-[300px] overflow-hidden bg-slate-950"
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
        {!isRealData && showDetectiveBanner && (
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
              {isRealData || target.name?.includes('M101') ? 'Cargando observaciones reales SPHEREx...' : 'Sintetizando recortes SPHEREx a 256x256...'}
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-950 border border-rose-500/60 flex items-center justify-center text-rose-400 text-xl mb-3 shadow-lg shadow-rose-500/20">
              ⚠️
            </div>
            <div className="text-sm font-bold text-rose-300 mb-1">
              Error al consultar datos SPHEREx
            </div>
            <div className="text-xs text-slate-300 max-w-md font-mono mb-4 px-3 py-2 rounded bg-slate-900 border border-slate-800">
              {error}
            </div>
            <button
              onClick={() => spherexStore.loadFrames()}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono transition-colors"
            >
              Reintentar Consulta
            </button>
          </div>
        )}

        {/* Interactive Object Callout Card */}
        {!isRealData && selectedObjectCallout && (
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

        {/* Quality Mask Legend for Real Data */}
        {isRealData && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-300 backdrop-blur-sm pointer-events-none">
            <span className="w-2.5 h-2.5 rounded bg-[#2b3d5b] border border-slate-600 inline-block"></span>
            <span>Píxeles excluidos (máscara de calidad)</span>
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
          {isRealData && (
            <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-slate-950/80 border border-slate-700/80 text-[10px] font-mono text-cyan-300 pointer-events-none">
              Norte ↑ / Este ← (WCS)
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={frameSize}
            height={frames[0]?.height || frameSize}
            style={{aspectRatio:`${frameSize}/${frames[0]?.height||frameSize}`}}
            className="w-[360px] h-[360px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] rounded-xl shadow-2xl border-2 border-slate-800/90 [image-rendering:pixelated]"
          />

          {curtain&&<div className="curtain-divider" style={{left:`${split*100}%`}}><button aria-label="Mover cortina" onClick={e=>e.stopPropagation()} onPointerDown={e=>{e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const rect=e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();if(rect)setSplit(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)));}} onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();setSplit(v=>Math.max(0,Math.min(1,v+(e.key==='ArrowRight'?.02:-.02))));}}}>↔</button></div>}
          {/* SVG Vector Overlays */}
          <svg
            viewBox={`0 0 ${frameSize} ${frames[0]?.height || frameSize}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {hunter && !realMode && frames.find(f=>f.epochIndex===currentEpoch)?.movingTargetPixel && <circle cx={frames.find(f=>f.epochIndex===currentEpoch)!.movingTargetPixel!.x} cy={frames.find(f=>f.epochIndex===currentEpoch)!.movingTargetPixel!.y} r={12} fill="none" stroke="#ff9a6c" strokeWidth={1} strokeDasharray="3 2"/>}
            {/* Multi-Exposure Ghosting Mode */}
            {!isRealData && overlays.ghostingTrail && (
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
            {!isRealData && overlays.gaia && catalogMarkers.filter(m => m.catalog === 'Gaia DR3').map(marker => (
              <g key={marker.id} className="text-cyan-400">
                <circle cx={marker.pixelX} cy={marker.pixelY} r="7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.5 1.5" />
                <line x1={marker.pixelX - 9} y1={marker.pixelY} x2={marker.pixelX + 9} y2={marker.pixelY} stroke="currentColor" strokeWidth="0.8" />
                <line x1={marker.pixelX} y1={marker.pixelY - 9} x2={marker.pixelX} y2={marker.pixelY + 9} stroke="currentColor" strokeWidth="0.8" />
                <text x={marker.pixelX + 10} y={marker.pixelY - 5} fill="currentColor" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
                  Gaia (2016)
                </text>
              </g>
            ))}

            {!isRealData && overlays.wise && catalogMarkers.filter(m => m.catalog === 'CatWISE2020').map(marker => (
              <g key={marker.id} className="text-amber-400">
                <circle cx={marker.pixelX} cy={marker.pixelY} r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <text x={marker.pixelX + 9} y={marker.pixelY + 8} fill="currentColor" fontSize="7.5" fontWeight="bold" fontFamily="monospace">
                  WISE (2020)
                </text>
              </g>
            ))}

            {/* Trajectory vector */}
            {!isRealData && (overlays.trajectory || detective) && trajectoryPoints.length > 1 && (
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
            {!isRealData && overlays.annotations && (
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

            {isRealData && overlays.annotations && (
              <g className="text-cyan-400">
                <circle cx={frameSize / 2} cy={frameSize / 2} r={10 * svgScale} fill="none" stroke="#38bdf8" strokeWidth={1.2 * svgScale} strokeDasharray={`${2 * svgScale} ${1.5 * svgScale}`} />
                <text x={frameSize / 2 + 12 * svgScale} y={frameSize / 2 - 4 * svgScale} fill="#38bdf8" fontSize={7 * svgScale} fontWeight="bold" fontFamily="monospace">
                  Centro WCS (M101)
                </text>
              </g>
            )}

            {/* Crosshair */}
            {overlays.crosshair && (
              <g className="text-slate-600/60">
                <line x1={frameSize / 2} y1={0} x2={frameSize / 2} y2={frameSize} stroke="currentColor" strokeWidth={0.5 * svgScale} strokeDasharray={`${4 * svgScale} ${4 * svgScale}`} />
                <line x1={0} y1={frameSize / 2} x2={frameSize} y2={frameSize / 2} stroke="currentColor" strokeWidth={0.5 * svgScale} strokeDasharray={`${4 * svgScale} ${4 * svgScale}`} />
                <circle cx={frameSize / 2} cy={frameSize / 2} r={8 * svgScale} fill="none" stroke="currentColor" strokeWidth={0.6 * svgScale} />
              </g>
            )}

            {/* Selected Pixel */}
            {selectedPixel && (
              <g className="text-yellow-400">
                <rect x={selectedPixel.x - 3 * svgScale} y={selectedPixel.y - 3 * svgScale} width={6 * svgScale} height={6 * svgScale} fill="none" stroke="currentColor" strokeWidth={1.2 * svgScale} />
                <circle cx={selectedPixel.x} cy={selectedPixel.y} r={7 * svgScale} fill="none" stroke="currentColor" strokeWidth={0.8 * svgScale} strokeDasharray={`${2 * svgScale} ${2 * svgScale}`} className="animate-spin" />
              </g>
            )}

            {/* Detective Found Celebration Burst */}
            {!isRealData && detectiveFound && (
              <g className="pointer-events-none">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, idx) => {
                  const rad = (angle * Math.PI) / 180;
                  const x1 = currentTargetPos.x + Math.cos(rad) * 10;
                  const y1 = currentTargetPos.y + Math.sin(rad) * 10;
                  const x2 = currentTargetPos.x + Math.cos(rad) * 26;
                  const y2 = currentTargetPos.y + Math.sin(rad) * 26;
                  return (
                    <line
                      key={idx}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={idx % 2 === 0 ? '#38bdf8' : '#ec4899'}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  );
                })}
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
        </div>
      </div>

      {curtain && <p className="viewer-caption">Cortina: {epochs[0]?.date.slice(0,10)} UTC (izquierda) / {epochs[epochs.length-1]?.date.slice(0,10)} UTC (derecha)</p>}
      {hunter && !realMode && <p className="viewer-caption">Cazador educativo: posición generada {frames.find(f=>f.epochIndex===currentEpoch)?.movingTargetPixel?.x.toFixed(1)}, {frames.find(f=>f.epochIndex===currentEpoch)?.movingTargetPixel?.y.toFixed(1)} px. No es detección automática.</p>}
      <div className="comparison-rail"><div className="viewer-segmented-control" role="group" aria-label="Comparación temporal">
       <button aria-pressed={blinkMode} disabled={epochs.length<2||!!error} onClick={()=>{setCurtain(false);spherexStore.toggleBlinkMode();}}>Parpadeo</button>
       <button aria-pressed={curtain} disabled={epochs.length<2||!!error} onClick={()=>{spherexStore.stopPlayback();spherexStore.setMode('normal');setCurtain(!curtain);}}>Cortina</button>
       {!realMode&&<button aria-pressed={hunter} onClick={()=>setHunter(!hunter)}>Cazador educativo</button>}
      </div>{blinkMode&&<label>Velocidad<select aria-label="Velocidad de parpadeo" value={fps} onChange={e=>spherexStore.setFps(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n} Hz</option>)}</select></label>}</div>
      {curtain&&<label className="curtain-position">Posición de cortina<input type="range" aria-label="División de cortina" min="0" max="1" step=".01" value={split} onChange={e=>setSplit(Number(e.target.value))}/></label>}
      <div className="temporal-controls">
        <div className="temporal-actions">
          <div className="playback-actions">
            <button aria-label="Observación anterior" disabled={isLoading || !epochs.length || !!error} onClick={() => { spherexStore.stopPlayback(); spherexStore.prevEpoch(); }}>←</button>
            <button className="primary-action" disabled={isLoading || epochs.length < 2 || !!error} onClick={() => {setCurtain(false);spherexStore.toggleBlinkMode();}}>{blinkMode ? text.pause : text.blink}</button>
            <button aria-label="Observación siguiente" disabled={isLoading || !epochs.length || !!error} onClick={() => { spherexStore.stopPlayback(); spherexStore.nextEpoch(); }}>→</button>
          </div>
          <div className="mode-selector" role="group" aria-label="Modo de visualización">
            {(['normal', 'diff'] as const).map(m => <button key={m} disabled={!frames.length || !!error} aria-pressed={mode === m} onClick={() => {setCurtain(false);spherexStore.setMode(m);}}>{m === 'normal' ? text.normal : text.diff}</button>)}
          </div>
        </div>
        <label className="timeline-scrubber">Fecha<input type="range" aria-label="Fecha de observación" min="0" max={Math.max(0,epochs.length-1)} step="1" value={currentEpoch} disabled={!epochs.length||!!error} onChange={e=>{spherexStore.stopPlayback();spherexStore.setCurrentEpoch(Number(e.target.value));}}/></label>
        <p className="active-date">Fecha activa: {epochs[currentEpoch]?.date.slice(0,10) || 'Sin observación'} UTC{mode === 'stack' ? ' · Apilado' : ''}</p>
        <div className="epoch-selector" role="group" aria-label="Fechas de observación">
          {epochs.map((ep, idx) => <button key={ep.epoch} disabled={!!error} aria-pressed={idx === currentEpoch} onClick={() => { spherexStore.stopPlayback(); spherexStore.setCurrentEpoch(idx); }}><span>Observación {idx + 1}</span><strong>{new Date(ep.date).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</strong></button>)}
        </div>
        <div className="spectral-data-rail" aria-label="Detectores disponibles">{[...new Set(frames.map(f=>f.detector))].map(det=><button key={det} aria-label={`Detector ${det}`} aria-pressed={detectors[det-1]} disabled={realMode} title={`Detector ${det}`} onClick={()=>spherexStore.toggleDetector(det)} style={{background:['#6aa7ff','#4fd1a5','#ffd34f','#ff9a3c','#d44f6e','#b07cff'][det-1],opacity:detectors[det-1]?1:.25}}/>)}</div>
        <details className="viewer-advanced"><summary>Comparación avanzada, exportación e inspección</summary><div>
          <label><input type="checkbox" checked={curtain} onChange={e=>{spherexStore.stopPlayback();spherexStore.setMode('normal');setCurtain(e.target.checked);}} /> Cortina comparadora</label>
          {curtain && <label>Posición de cortina<input aria-label="Posición de cortina" type="range" min="0" max="1" step="0.01" value={split} onChange={e=>setSplit(Number(e.target.value))}/></label>}
          {!realMode && <label><input type="checkbox" checked={hunter} onChange={e=>setHunter(e.target.checked)}/>Cazador educativo · Simulación</label>}
          <button disabled={!frames.length} onClick={()=>{if(canvasRef.current)exportComparisonCard(canvasRef.current,target.name||'M101',epochs.map(e=>e.date.slice(0,10)).join(' / '),realMode);}}>Exportar ficha</button>
          <button disabled={!frames.length} onClick={downloadSnapshot}>Descargar PNG</button><button disabled={!frames.length || isExportingGif} onClick={exportAnimatedGifAction}>Descargar GIF</button>
          <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); spherexStore.setSelectedPixel({x: Number(data.get('x')), y: Number(data.get('y'))}); }}><label>Píxel X<input name="x" type="number" min="0" max={wcs.size[0]-1} defaultValue="0" required /></label><label>Píxel Y<input name="y" type="number" min="0" max={wcs.size[1]-1} defaultValue="0" required /></label><button>Inspeccionar</button></form>
        </div></details>
      </div>
    </div>
  );
}
