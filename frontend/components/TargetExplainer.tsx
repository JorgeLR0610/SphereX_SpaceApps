'use client';

import React from 'react';
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';

export function TargetExplainer() {
  const { target } = useSpherexStore();

  const getScienceInsight = () => {
    switch (target.name) {
      case 'M101 (Galaxia del Molinete)':
        return {
          badge: 'Datos Reales SPHEREx QR3 · Región Extragaláctica',
          temp: 'Infrarrojo Cercano (~1.49 µm)',
          dist: '21 millones de años luz',
          speed: '0.0 mas/año (Campo Estático)',
          guide: 'Comparación fotométrica de dos observaciones reales de NASA SPHEREx tomadas el 17 de mayo y el 24 de junio de 2026 (separación de 37.7 días). Ambas imágenes fueron re-muestreadas sobre una cuadrícula astrométrica idéntica (30×30 píxeles, 6.15"/px) con máscara de píxeles válidos.',
        };
      case 'WISE 0855-0714':
        return {
          badge: 'Sub-enana Marrón (Y4) · Objeto Más Frío',
          temp: '~250 K (-23 °C)',
          dist: '7.27 años luz',
          speed: '~83 km/s',
          guide: 'Observa cómo el punto fucsia salta velozmente hacia el Oeste entre las 4 épocas (2025–2027), mientras las estrellas lejanas permanecen fijas. En los detectores 1 y 2 (0.75–1.6 µm) es casi invisible, pero brilla con fuerza térmica en los detectores 4, 5 y 6 (2.4–5.0 µm).',
        };
      case "Barnard's Star":
        return {
          badge: 'Enana Roja (M4.0V) · Récord de Velocidad',
          temp: '~3,130 K',
          dist: '5.96 años luz',
          speed: '~142 km/s',
          guide: 'La estrella con mayor movimiento propio del firmamento (~10.36"/año). Se desplaza marcadamente en dirección Norte (+Dec). En solo 6 meses entre épocas de SPHEREx su desplazamiento es evidente respecto al catálogo de Gaia (2016).',
        };
      case 'Epsilon Indi B':
        return {
          badge: 'Par Binario de Enanas Marrones (T1+T6)',
          temp: '~1,300 K',
          dist: '11.8 años luz',
          speed: '~78 km/s',
          guide: 'Par binario con rápido desplazamiento hacia el sureste (+RA, -Dec). Haz clic sobre él para examinar en el gráfico inferior las profundas caídas de absorción causadas por moléculas de metano (CH4) y vapor de agua.',
        };
      case 'RW Aurigae':
        return {
          badge: 'Variable T Tauri · Disco Protoplanetario',
          temp: '~4,800 K',
          dist: '530 años luz',
          speed: '< 2 km/s',
          guide: 'Este sistema estelar no se desplaza rápido, pero sufre violentos eclipses periódicos causados por corrientes de polvo circunestelar en su disco de formación de planetas. Cambia de época para ver fluctuar su brillo térmico.',
        };
      case 'R Draconis':
        return {
          badge: 'Gigante Roja Pulsante Mira (AGB)',
          temp: '~2,200 – 3,400 K',
          dist: '1,450 años luz',
          speed: '< 5 km/s',
          guide: 'Estrella gigante que respira y pulsa cada 245 días. En la Época 1 y 3 es una de las fuentes más luminosas del campo, y en las Épocas 2 y 4 su brillo colapsa. Su atmósfera molecular cambia drásticamente en el espectro.',
        };
      default:
        return {
          badge: target.category || 'Objetivo Astronómico Infrarrojo',
          temp: 'Estimada',
          dist: 'En catálogo',
          speed: `${Math.hypot(target.pmRa || 0, target.pmDec || 0).toFixed(0)} mas/año`,
          guide: 'Estás analizando un campo temporal de SPHEREx. Usa los modos Normal, Diferencia o Apilado para identificar fuentes variables y enanas marrones mediante astrometría diferencial.',
        };
    }
  };

  const insight = getScienceInsight();

  return (
    <div className="w-full bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-cyan-950/30 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        {/* Title & Category */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xl text-cyan-400 font-bold shadow-inner">
            ✨
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white tracking-wide">
                {target.name}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                {insight.badge}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              <span>Coordenadas J2000: </span>
              <span className="text-cyan-400 font-bold">{target.ra.toFixed(4)}°, {target.dec.toFixed(4)}°</span>
            </div>
          </div>
        </div>

        {/* Quick astrophysical telemetry chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-2">
            <span className="text-slate-500">Distancia:</span>
            <span className="text-slate-200 font-bold">{insight.dist}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-2">
            <span className="text-slate-500">Temp:</span>
            <span className="text-amber-400 font-bold">{insight.temp}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-2">
            <span className="text-slate-500">Velocidad:</span>
            <span className="text-pink-400 font-bold">{insight.speed}</span>
          </div>
        </div>
      </div>

      {/* Guide explanation box: what to look for */}
      <div className="mt-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed max-w-4xl">
          <span className="text-cyan-400 font-bold text-sm shrink-0">💡 Qué buscar:</span>
          <p className="text-slate-300 font-normal">
            {insight.guide}
          </p>
        </div>

        {/* Context Action pills */}
        <div className="flex items-center gap-2 text-[11px] font-medium shrink-0">
          <button
            onClick={() => {
              const el = document.getElementById('spectrum-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all shadow-md bg-slate-800/90 text-cyan-300 border-cyan-500/40 hover:text-white hover:bg-slate-700 font-bold"
          >
            <span>📊</span>
            <span>Ver Espectro (102 Bandas)</span>
          </button>

          <button
            onClick={() => spherexStore.setDetective(!spherexStore.getState().detective)}
            className="px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all shadow-md bg-pink-950/60 text-pink-300 border-pink-500/40 hover:bg-pink-900/60 font-bold"
          >
            <span>🕵️</span>
            <span>Reto Detective</span>
          </button>
        </div>
      </div>
    </div>
  );
}

