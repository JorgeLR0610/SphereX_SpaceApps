"use client";
import React, { useEffect, useState } from 'react';
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';
import { pixelToCelestial } from '../lib/wcs';
import { useLocale } from './useLocale';
import { useDataMode } from './useDataMode';
function epochsSeparation(frames: {mjd:number}[]) {const values=frames.map(f=>f.mjd);return values.length?Math.max(...values)-Math.min(...values):null;}
export function ObservatoryContext({facts}: {facts?:[string,string][]}) {
  const { mode, frames, currentEpoch, detectors, target } = useSpherexStore();
  const real = useDataMode();
  const frame = frames.find(f => f.epochIndex === currentEpoch && detectors[f.detector - 1]);
  const separation=epochsSeparation(frames);
  return <section className="field-heading"><h1>{real ? 'M101 — Galaxia del Molinete' : target.name}</h1><p>{real?'La misma región del cielo, observada en dos fechas. Compara imágenes infrarrojas auténticas de SPHEREx.':target.description||'Exploración educativa con imágenes generadas.'}</p>
  {!real&&facts?<table className="metric-table"><thead><tr>{facts.map(([label])=><th key={label}>{label}</th>)}</tr></thead><tbody><tr>{facts.map(([label,value])=><td key={label}>{value}</td>)}</tr></tbody></table>:<table className="metric-table"><thead><tr><th>{real?'Separación':'Épocas'}</th><th>Detector</th><th>Longitud de onda</th></tr></thead><tbody><tr><td>{real?(separation===null?'—':`${separation.toLocaleString('es',{maximumFractionDigits:2})} días`):new Set(frames.map(f=>f.epochIndex)).size}</td><td>{frame?frame.detector:'—'}</td><td>{frame?`≈ ${frame.band.lambda_um.toLocaleString('es',{maximumFractionDigits:3})} µm`:'—'}</td></tr></tbody></table>}
  <small>{real?'Fuente: NASA/IPAC IRSA · SPHEREx QR3':'Simulación · Sin mediciones espectrales reales'}{mode==='stack'?' · Apilado':''}</small></section>;
}
export function ComparisonExplanation() {
  const {text}=useLocale();
  const { mode, currentEpoch, epochs, diffRef } = useSpherexStore();
  const real = useDataMode();
  const reference = diffRef === 'first' ? epochs[0] : diffRef === 'previous' ? epochs[Math.max(0, currentEpoch - 1)] : undefined;
  return <section className="comparison-context"><h2>{mode === 'diff' ? '¿Qué muestra la diferencia?' : mode === 'stack' ? '¿Qué muestra el apilado?' : '¿Qué estoy viendo?'}</h2><p>{mode === 'diff' ? `Resta visual: ${epochs[currentEpoch]?.date.slice(0,10) || 'observación activa'} menos ${reference?.date.slice(0,10) || 'mediana de las otras fechas'}. Azul indica valores menores; rojo, mayores. El centro de la escala representa cero.` : mode === 'stack' ? 'Promedio de las observaciones disponibles en los detectores seleccionados.' : 'La misma región en distintas fechas. Selecciona una fecha o activa el parpadeo para alternar las imágenes.'}</p><p>{real ? text.limit : 'Simulación educativa: los objetos, movimientos y espectros generados no son mediciones de SPHEREx.'}</p></section>;
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

export function EducationalFieldTools(){const real=useDataMode();const {detective,overlays}=useSpherexStore();if(real)return null;return <section className="educational-field-tools"><button className="btn-primary" onClick={()=>spherexStore.setDetective(!detective)}>{detective?'Salir del reto educativo':'Reto Detective: ¿Dónde está?'}</button><label>Resaltar lo que cambia<input type="checkbox" checked={overlays.annotations} onChange={()=>spherexStore.toggleOverlay('annotations')}/></label><small>Ejercicio con posiciones generadas; no es una detección real.</small></section>;}
