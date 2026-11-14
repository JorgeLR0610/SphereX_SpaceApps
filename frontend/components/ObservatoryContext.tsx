"use client";
import React, { useEffect, useState } from 'react';
import { useSpherexStore } from '../store/useSpherexStore';
import { pixelToCelestial } from '../lib/wcs';
import { useDataMode } from './useDataMode';
export function ObservatoryContext() {
  const { mode, frames, currentEpoch, detectors, target } = useSpherexStore();
  const real = useDataMode();
  const frame = frames.find(f => f.epochIndex === currentEpoch && detectors[f.detector - 1]);
  return <section className="field-heading"><div><h2>{real ? 'M101 — Galaxia del Molinete' : target.name}</h2><p>{real ? 'Dos observaciones de la misma región del cielo' : 'Experiencia educativa con imágenes, movimiento y espectros generados'}</p></div>{frame && <p>Detector {frame.detector} · ≈ {frame.band.lambda_um.toLocaleString('es', { maximumFractionDigits: 4 })} µm · {mode === 'stack' ? 'Promedio de observaciones' : 'Infrarrojo cercano'}</p>}</section>;
}
export function ComparisonExplanation() {
  const { mode, currentEpoch, epochs, diffRef } = useSpherexStore();
  const real = useDataMode();
  const reference = diffRef === 'first' ? epochs[0] : diffRef === 'previous' ? epochs[Math.max(0, currentEpoch - 1)] : undefined;
  return <section className="comparison-context"><h2>{mode === 'diff' ? '¿Qué muestra la diferencia?' : mode === 'stack' ? '¿Qué muestra el apilado?' : '¿Qué estoy viendo?'}</h2><p>{mode === 'diff' ? `Resta visual: ${epochs[currentEpoch]?.date.slice(0,10) || 'observación activa'} menos ${reference?.date.slice(0,10) || 'mediana de las otras fechas'}. Azul indica valores menores; rojo, mayores. El centro de la escala representa cero.` : mode === 'stack' ? 'Promedio de las observaciones disponibles en los detectores seleccionados.' : 'La misma región en distintas fechas. Selecciona una fecha o activa el parpadeo para alternar las imágenes.'}</p><p>{real ? 'Esta comparación usa observaciones auténticas. Las diferencias pueden incluir ruido y efectos instrumentales; no confirman objetos en movimiento ni el Planeta X. No se han igualado los fondos ni las respuestas instrumentales.' : 'Simulación educativa: los objetos, movimientos y espectros generados no son mediciones de SPHEREx.'}</p></section>;
}
export function InlineGuide() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const show = () => setVisible(true); const timer = setTimeout(() => { try { setVisible(localStorage.getItem('spherex_ux_hints') !== 'closed'); } catch { setVisible(true); } }, 0); window.addEventListener('spherex-show-hints', show); return () => { clearTimeout(timer); window.removeEventListener('spherex-show-hints', show); }; }, []);
  return visible ? <aside className="inline-guide" aria-label="Guía de comparación"><p>1. Selecciona una fecha. <span>2. Activa el parpadeo.</span> <span>3. Usa Diferencia para resaltar cambios.</span></p><button aria-label="Cerrar guía" onClick={() => { setVisible(false); try { localStorage.setItem('spherex_ux_hints', 'closed'); } catch {} }}>Cerrar</button></aside> : null;
}

export function AdvancedContext() {
  const real = useDataMode();
  const { wcs, hoverCoords, selectedPixel, fov, provenance } = useSpherexStore();
  const coordinates = selectedPixel ? pixelToCelestial(selectedPixel.x, selectedPixel.y, wcs) : undefined;
  return <section><h3>Coordenadas y validez</h3><p>Campo de visión: {fov}′</p><p>Centro ICRS: {wcs.crval.map(n => n.toFixed(5)).join(', ')}° · Escala: {(wcs.cdelt * 3600).toFixed(3)}″/px</p><p>{hoverCoords ? `RA ${hoverCoords.ra.toFixed(5)}° · Dec ${hoverCoords.dec.toFixed(5)}°` : selectedPixel ? `Píxel seleccionado: ${selectedPixel.x}, ${selectedPixel.y} · RA ${coordinates?.ra.toFixed(5)}° · Dec ${coordinates?.dec.toFixed(5)}°` : 'Selecciona un píxel para inspeccionar su posición.'}</p>{real && <p>Los píxeles excluidos permanecen enmascarados en todas las vistas. No hay espectros calibrados de 102 bandas ni catálogos en vivo en este conjunto.</p>}<details><summary>Procedencia y procesamiento</summary><pre className="provenance-json">{JSON.stringify(provenance || { origen: "Simulación educativa" }, null, 2)}</pre></details><a href={`https://aladin.cds.unistra.fr/AladinLite/?target=${wcs.crval[0]}%20${wcs.crval[1]}`} target="_blank" rel="noopener noreferrer">Abrir contexto externo en Aladin</a></section>;
}
