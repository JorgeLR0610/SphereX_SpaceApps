'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { resolveTargetName } from '../lib/sesame';
import { formatSexagesimal } from '../lib/wcs';
import { sound } from '../lib/sound';
import { LandingHero } from '../components/LandingHero';
import { MapModal } from '../components/MapModal';
import { RetoModal } from '../components/RetoModal';
import { GuidedTour } from '../components/GuidedTour';
import { ConeSearchPanel } from '../components/ConeSearchPanel';
import {
  ConeResult,
  ConeFilterType,
  formatMovementSpeed,
  formatSeparation,
} from '../lib/coneSearch';

export interface AstronomicalObject {
  id: string;
  n: string;
  tag: string;
  hook: string;
  type: 'mov' | 'pair' | 'var';
  icon: string;
  badge: string;
  pm: [number, number];
  f: [string, string][];
  peak: number;
  ra: number;
  dec: number;
  fitsId: string;
  mjd: number;
}

const OBJ: Record<string, AstronomicalObject> = {
  wise: {
    id: 'wise',
    n: 'WISE 0855',
    tag: 'La enana marrón más fría cercana',
    hook: 'Casi no tiene luz visible, pero brilla en infrarrojo. Mira cómo cruza el cielo mientras las estrellas de fondo se quedan quietas.',
    type: 'mov',
    icon: '🟤',
    badge: 'Objeto en movimiento',
    pm: [-1, 0.2],
    f: [['Distancia', '7,3 años luz'], ['Temperatura', '−23 °C'], ['Se mueve', '8″ al año']],
    peak: 0.75,
    ra: 133.7951,
    dec: -7.2451,
    fitsId: 'SPHX_E1_D5_WISE0855',
    mjd: 60841.5,
  },
  barnard: {
    id: 'barnard',
    n: 'Estrella de Barnard',
    tag: 'La estrella que más rápido cruza nuestro cielo',
    hook: 'Es una enana roja vecina. Recorre el ancho de la Luna en unos 180 años.',
    type: 'mov',
    icon: '🔴',
    badge: 'Objeto en movimiento',
    pm: [0.15, -1],
    f: [['Distancia', '6 años luz'], ['Temperatura', '3 200 °C'], ['Se mueve', '10,4″ al año']],
    peak: 0.35,
    ra: 269.4521,
    dec: 4.6933,
    fitsId: 'SPHX_E1_D2_BARNARD',
    mjd: 60841.5,
  },
  indi: {
    id: 'indi',
    n: 'Epsilon Indi B',
    tag: 'Dos enanas marrones que viajan juntas',
    hook: 'Son un par de “estrellas fallidas” que orbitan una estrella cercana. Busca los dos puntos que se desplazan a la vez.',
    type: 'pair',
    icon: '🪐',
    badge: 'Pareja en movimiento',
    pm: [0.9, 0.5],
    f: [['Distancia', '12 años luz'], ['Temperatura', '~1 000 °C'], ['Se mueve', '4,7″ al año']],
    peak: 0.6,
    ra: 331.0438,
    dec: -56.7828,
    fitsId: 'SPHX_E1_D3_EPSINDI',
    mjd: 60841.5,
  },
  rw: {
    id: 'rw',
    n: 'RW Aurigae',
    tag: 'Una estrella joven que parpadea',
    hook: 'No se desplaza: cambia de brillo. Fíjate en cómo se apaga y se enciende entre fechas.',
    type: 'var',
    icon: '💫',
    badge: 'Cambia de brillo',
    pm: [0, 0],
    f: [['Distancia', '450 años luz'], ['Tipo', 'Estrella joven'], ['Cambia', 'Brillo irregular']],
    peak: 0.4,
    ra: 76.9564,
    dec: 30.4014,
    fitsId: 'SPHX_E1_D1_RWAUR',
    mjd: 60841.5,
  },
  rdra: {
    id: 'rdra',
    n: 'R Draconis',
    tag: 'Un gigante que respira',
    hook: 'Se hincha y se encoge en ciclos de unos 245 días. Su brillo sube y baja a lo largo del tiempo.',
    type: 'var',
    icon: '✨',
    badge: 'Cambia de brillo',
    pm: [0, 0],
    f: [['Distancia', '~1 000 años luz'], ['Tipo', 'Gigante pulsante'], ['Ciclo', '~245 días']],
    peak: 0.3,
    ra: 248.1676,
    dec: 66.7551,
    fitsId: 'SPHX_E1_D4_RDRA',
    mjd: 60841.5,
  },
};

const DATES = ['Jun 2025', 'Dic 2025', 'Jun 2026', 'Dic 2026'];
const BANDS = [
  ['Azul', '0,75–1,1 µm'],
  ['Verde', '1,1–1,6 µm'],
  ['Amarillo', '1,6–2,4 µm'],
  ['Naranja', '2,4–3,8 µm'],
  ['Rojo', '3,8–4,4 µm'],
  ['Rojo lejano', '4,4–5,0 µm'],
];

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export default function Home() {
  // Navigation: 'landing' (Momento 1) vs 'viewer' (Momento 2 & 3)
  const [view, setView] = useState<'landing' | 'viewer'>('landing');

  // Object State
  const [key, setKey] = useState<string>('wise');
  const [target, setTarget] = useState<AstronomicalObject>(OBJ.wise);
  const [playing, setPlaying] = useState<boolean>(true);
  const [time, setTime] = useState<number>(0); // 0 to 3 continuous float
  const [highlight, setHighlight] = useState<boolean>(true);
  const [fov, setFov] = useState<number>(5);
  const [contrast, setContrast] = useState<number>(65);
  const [bandOn, setBandOn] = useState<boolean[]>([true, true, true, true, true, true]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchMessage, setSearchMessage] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Modals, Reto, Guided Tour & Cone Search state
  const [isMapOpen, setIsMapOpen] = useState<boolean>(false);
  const [isRetoOpen, setIsRetoOpen] = useState<boolean>(false);
  const [isTourOpen, setIsTourOpen] = useState<boolean>(false);
  const [isConeSearchOpen, setIsConeSearchOpen] = useState<boolean>(false);
  const [coneResults, setConeResults] = useState<ConeResult[]>([]);
  const [coneRadius, setConeRadius] = useState<number>(10);
  const [coneFilters, setConeFilters] = useState<ConeFilterType[]>(['all']);

  const [retoFound, setRetoFound] = useState<boolean>(false);
  const [retoScore, setRetoScore] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const specCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const starsRef = useRef<{ x: number; y: number; b: number }[]>([]);
  const lastTsRef = useRef<number>(0);

  // Load target by key
  const loadTarget = useCallback((k: string) => {
    const o = OBJ[k] || OBJ.wise;
    setKey(k);
    setTarget(o);
    setTime(0);
    setSearchMessage('');
    setRetoFound(false);

    // Re-seed background stars
    const r = rng(42 + k.length * 7);
    starsRef.current = Array.from({ length: 34 }, () => ({
      x: r() * 560,
      y: r() * 560,
      b: 0.25 + r() * 0.75,
    }));

    if (typeof window !== 'undefined') {
      history.replaceState(null, '', '#' + k);
    }
  }, []);

  // Check URL parameters and hash on load
  // Supports:
  // - Hash: #wise, #barnard, etc.
  // - Cone search params: ?ra=133.795&dec=-7.245&r=10&f=rapidos
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const search = new URLSearchParams(window.location.search);
    const raParam = search.get('ra');
    const decParam = search.get('dec');
    const rParam = search.get('r');
    const fParam = search.get('f');

    if (raParam && decParam) {
      const raVal = parseFloat(raParam);
      const decVal = parseFloat(decParam);
      const radVal = parseFloat(rParam || '10') || 10;

      if (!isNaN(raVal) && !isNaN(decVal)) {
        setConeRadius(radVal);
        if (fParam) {
          if (fParam === 'rapidos' || fParam === 'fast') setConeFilters(['fast']);
          else if (fParam === 'enanas' || fParam === 'browndwarf') setConeFilters(['browndwarf']);
          else if (fParam === 'variables' || fParam === 'variable') setConeFilters(['variable']);
          else setConeFilters(['all']);
        }

        // Check if matches known preset
        const matchedPresetKey = Object.keys(OBJ).find(
          (k) => Math.hypot(OBJ[k].ra - raVal, OBJ[k].dec - decVal) < 0.05
        );

        if (matchedPresetKey) {
          loadTarget(matchedPresetKey);
        } else {
          const customObj: AstronomicalObject = {
            id: `custom_${raVal.toFixed(3)}_${decVal.toFixed(3)}`,
            n: `Centro (${raVal.toFixed(3)}°, ${decVal.toFixed(3)}°)`,
            tag: 'Coordenadas seleccionadas para exploración por radio',
            hook: 'Vecindario celeste consultado con SPHEREx y catálogos estelares.',
            type: 'mov',
            icon: '🔭',
            badge: 'Área explorada',
            pm: [-0.4, 0.3],
            f: [
              ['RA', `${raVal.toFixed(3)}°`],
              ['Dec', `${decVal.toFixed(3)}°`],
              ['Radio', `${radVal}′`],
            ],
            peak: 0.5,
            ra: raVal,
            dec: decVal,
            fitsId: `SPHX_CONE_${raVal.toFixed(2)}_${decVal.toFixed(2)}`,
            mjd: 60841.5,
          };
          setTarget(customObj);
          setKey(customObj.id);
        }

        setView('viewer');
        setIsConeSearchOpen(true);
        return;
      }
    }

    if (hash && OBJ[hash]) {
      loadTarget(hash);
      setView('viewer');
    } else if (search.has('target') || search.has('q')) {
      const q = search.get('target') || search.get('q') || '';
      if (q && OBJ[q]) {
        loadTarget(q);
      }
      setView('viewer');
    }
  }, [loadTarget]);

  // Transition from landing to viewer with auto-guided tour on first visit
  const handleSelectObject = (k: string) => {
    loadTarget(k);
    setView('viewer');

    try {
      const tourSeen = localStorage.getItem('spherex_tour_seen');
      if (!tourSeen) {
        setIsTourOpen(true);
      }
    } catch {
      // ignore
    }
  };

  // Handle selecting an item from the Cone Search results
  const handleSelectConeResult = (item: ConeResult) => {
    // Check if matches an existing preset
    const presetKey = Object.keys(OBJ).find(
      (k) =>
        OBJ[k].n.toLowerCase() === item.name.toLowerCase() ||
        Math.hypot(OBJ[k].ra - item.ra, OBJ[k].dec - item.dec) < 0.005
    );

    if (presetKey) {
      loadTarget(presetKey);
    } else {
      const isVar =
        item.kindCode.startsWith('V') ||
        item.kindCode.startsWith('Mi') ||
        item.kindLabel.toLowerCase().includes('cambia');
      const isBrownDwarf =
        item.kindCode.startsWith('BD') || item.kindLabel.toLowerCase().includes('marrón');

      // Scaled proper motion for animation
      const scalePm = item.pmArcsecPerYear > 0 ? Math.min(1.8, Math.max(0.2, item.pmArcsecPerYear / 2.0)) : 0.3;
      const pmX = item.pmRa !== 0 ? (item.pmRa / Math.hypot(item.pmRa, item.pmDec || 1)) * scalePm : 0;
      const pmY = item.pmDec !== 0 ? (item.pmDec / Math.hypot(item.pmRa || 1, item.pmDec)) * scalePm : 0;

      const newTarget: AstronomicalObject = {
        id: item.id,
        n: item.name,
        tag: item.kindLabel,
        hook: isBrownDwarf
          ? 'Enana marrón detectada en el infrarrojo profundo. Observa su desplazamiento en el cielo mientras las estrellas lejanas están fijas.'
          : isVar
          ? 'Estrella variable: fíjate en cómo cambia su brillo en las cuatro épocas de SPHEREx.'
          : 'Objeto detectado en el radio de búsqueda con el telescopio espacial SPHEREx.',
        type: isVar ? 'var' : 'mov',
        icon: isBrownDwarf ? '🟤' : isVar ? '💫' : item.pmArcsecPerYear >= 0.2 ? '🔴' : '⭐',
        badge: item.kindLabel,
        pm: isVar ? [0, 0] : [pmX, -pmY],
        f: [
          ['Distancia', item.distanceLy || 'En catálogo'],
          ['Movimiento', formatMovementSpeed(item.pmArcsecPerYear)],
          ['Separación', formatSeparation(item.sepArcsec)],
        ],
        peak: isBrownDwarf ? 0.75 : isVar ? 0.4 : 0.5,
        ra: item.ra,
        dec: item.dec,
        fitsId: `SPHX_OBJ_${item.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
        mjd: 60841.5,
      };

      setTarget(newTarget);
      setKey(item.id);
      setTime(0);
      setPlaying(true);

      // Re-seed background stars for new area
      const r = rng(42 + item.name.length * 9);
      starsRef.current = Array.from({ length: 34 }, () => ({
        x: r() * 560,
        y: r() * 560,
        b: 0.25 + r() * 0.75,
      }));
    }

    // Sync URL with parameters
    if (typeof window !== 'undefined') {
      const fSlug = coneFilters.includes('fast')
        ? 'rapidos'
        : coneFilters.includes('browndwarf')
        ? 'enanas'
        : coneFilters.includes('variable')
        ? 'variables'
        : 'todos';
      const newUrl = `?ra=${item.ra.toFixed(4)}&dec=${item.dec.toFixed(4)}&r=${coneRadius}&f=${fSlug}`;
      history.replaceState(null, '', newUrl);
    }
  };

  // Position calculation with FOV scaling
  const getPos = useCallback(
    (tt: number): [number, number] => {
      const k = Math.max(1, fov / 5.0);
      const s = 70.0 / Math.sqrt(k);
      return [
        280 + target.pm[0] * s * (tt - 1.5),
        280 + target.pm[1] * s * (tt - 1.5),
      ];
    },
    [fov, target.pm]
  );

  // Main Canvas render loop (including Search Radius Circle and Result Markers)
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;

    const ct = contrast / 100.0;
    const act = bandOn.filter(Boolean).length / 6.0;

    // Deep space background
    g.fillStyle = '#0a0d1f';
    g.fillRect(0, 0, 560, 560);

    const dim = highlight ? 0.35 : 1.0;
    const gain = ct * (0.4 + act * 0.6);

    const glow = (x: number, y: number, rad: number, col: string, a: number) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, col.replace('A', a.toString()));
      gr.addColorStop(1, col.replace('A', '0'));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, rad, 0, 2 * Math.PI);
      g.fill();
    };

    // 1. Draw fixed background stars
    starsRef.current.forEach((s) => {
      glow(s.x, s.y, 10 + s.b * 14, 'rgba(190,200,255,A)', s.b * gain * dim);
    });

    // 2. Draw search radius circle on viewer canvas
    if (coneRadius > 0 && (coneResults.length > 0 || isConeSearchOpen)) {
      const pxRadius = coneRadius * (560.0 / fov);
      if (pxRadius > 15) {
        g.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        g.lineWidth = 1.5;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.arc(280, 280, pxRadius, 0, 2 * Math.PI);
        g.stroke();
        g.setLineDash([]);

        // Radius label
        if (pxRadius > 35 && pxRadius < 270) {
          g.fillStyle = 'rgba(56, 189, 248, 0.85)';
          g.font = '600 11px monospace';
          g.textAlign = 'center';
          g.fillText(`Radio: ${coneRadius}′`, 280, Math.max(16, 280 - pxRadius - 6));
        }
      }
    }

    // 3. Draw numbered markers for Cone Search results
    if (coneResults.length > 0) {
      const cosDec = Math.cos((target.dec * Math.PI) / 180.0);
      const safeCosDec = Math.abs(cosDec) > 0.05 ? cosDec : 0.05;
      const pxPerArcmin = 560.0 / fov;

      coneResults.slice(0, 20).forEach((item) => {
        const dRaArcmin = (item.ra - target.ra) * safeCosDec * 60.0;
        const dDecArcmin = (item.dec - target.dec) * 60.0;

        // RA increases to the left (-x), Dec increases up (-y on canvas)
        const mx = 280 - dRaArcmin * pxPerArcmin;
        const my = 280 - dDecArcmin * pxPerArcmin;

        // Avoid drawing directly on top of the central object
        const distFromCenter = Math.hypot(mx - 280, my - 280);
        if (distFromCenter < 14) return;

        if (mx >= 12 && mx <= 548 && my >= 12 && my <= 548) {
          // Outer subtle ring
          g.strokeStyle = 'rgba(56, 189, 248, 0.85)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(mx, my, 11, 0, 2 * Math.PI);
          g.stroke();

          // Inner fill
          g.fillStyle = 'rgba(11, 13, 28, 0.9)';
          g.beginPath();
          g.arc(mx, my, 10, 0, 2 * Math.PI);
          g.fill();

          // Number badge
          g.fillStyle = '#ffffff';
          g.font = 'bold 10px "Bricolage Grotesque", system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(String(item.number), mx, my);

          // Small tag label
          g.fillStyle = '#38bdf8';
          g.font = '600 10px "Bricolage Grotesque", system-ui, sans-serif';
          g.textAlign = 'left';
          g.textBaseline = 'middle';
          const shortName = item.name.length > 14 ? item.name.slice(0, 12) + '…' : item.name;
          g.fillText(shortName, mx + 14, my);
        }
      });
    }

    // 4. Draw central target object
    if (target.type === 'var') {
      const ph = Math.sin(time * 2.1 + (key === 'rdra' ? 0 : 1.3)) * 0.5 + 0.5;
      const r = 16 + ph * 26;
      glow(280, 280, r * 1.8, 'rgba(255,110,90,A)', (0.35 + ph * 0.65) * gain);

      if (highlight) {
        g.strokeStyle = '#ff5a7e';
        g.lineWidth = 2;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.arc(280, 280, 48, 0, 2 * Math.PI);
        g.stroke();
        g.setLineDash([]);

        g.fillStyle = '#ff5a7e';
        g.font = '600 16px "Bricolage Grotesque", system-ui, sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.fillText(target.n, 335, 275);
      }
    } else {
      const offs = target.type === 'pair' ? [[-9, -5], [9, 5]] : [[0, 0]];

      if (highlight) {
        // Dashed trajectory path
        g.strokeStyle = '#ff5a7e88';
        g.lineWidth = 2;
        g.setLineDash([4, 7]);
        g.beginPath();
        for (let i = 0; i < 4; i++) {
          const [p, q] = getPos(i);
          if (i === 0) g.moveTo(p, q);
          else g.lineTo(p, q);
        }
        g.stroke();
        g.setLineDash([]);

        // Epoch dots along trail
        for (let i = 0; i < 4; i++) {
          const [p, q] = getPos(i);
          g.fillStyle = i <= time + 0.01 ? '#ff5a7e' : '#ff5a7e55';
          g.beginPath();
          g.arc(p, q, 4, 0, 2 * Math.PI);
          g.fill();
        }
      }

      const [x, y] = getPos(time);
      offs.forEach(([dx, dy]) => {
        glow(x + dx, y + dy, 26, 'rgba(255,90,120,A)', gain * 1.1);
      });

      if (highlight) {
        g.strokeStyle = '#ff5a7e';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(x, y, target.type === 'pair' ? 34 : 30, 0, 2 * Math.PI);
        g.stroke();

        g.fillStyle = '#ff5a7e';
        g.font = '600 16px "Bricolage Grotesque", system-ui, sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.fillText(target.n, x + 40, y - 25);
      }
    }
  }, [contrast, bandOn, highlight, target, time, key, getPos, coneRadius, coneResults, isConeSearchOpen, fov]);

  // Spectrum chart render
  const drawSpectrum = useCallback(() => {
    const canvas = specCanvasRef.current;
    if (!canvas) return;
    const h = canvas.getContext('2d');
    if (!h) return;

    h.clearRect(0, 0, 460, 200);
    const cols = ['#6aa7ff', '#4fd1a5', '#ffd34f', '#ff9a3c', '#ff5a7e', '#b07cff'];

    // 6 Detector Zones
    BANDS.forEach((_, i) => {
      h.fillStyle = cols[i] + (bandOn[i] ? '33' : '0d');
      h.fillRect(10 + i * 74, 10, 72, 150);
    });

    // Infrared Spectrum Curve
    h.strokeStyle = '#f1eefb';
    h.lineWidth = 2.5;
    h.beginPath();
    for (let x = 0; x <= 440; x++) {
      const u = x / 440.0;
      const y = 0.15 + 0.7 * Math.exp(-Math.pow((u - target.peak) / 0.28, 2)) + 0.05 * Math.sin(u * 40);
      if (x === 0) h.moveTo(10, 160 - y * 140);
      else h.lineTo(10 + x, 160 - y * 140);
    }
    h.stroke();

    h.fillStyle = '#9a95b8';
    h.font = '12px "Bricolage Grotesque", system-ui, sans-serif';
    h.textAlign = 'left';
    h.fillText('más azul (0,75 µm)', 10, 185);
    h.fillText('más rojo (5,0 µm)', 340, 185);
  }, [bandOn, target.peak]);

  // Continuous animation frame loop
  useEffect(() => {
    if (view !== 'viewer') return;
    let animId: number;
    const loop = (ts: number) => {
      if (playing) {
        setTime((prev) => {
          const delta = (ts - lastTsRef.current) / 1600.0;
          return (prev + delta) % 3.0;
        });
      }
      lastTsRef.current = ts;
      draw();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [view, playing, draw]);

  // Re-draw spectrum on target or bands change
  useEffect(() => {
    if (view === 'viewer') {
      drawSpectrum();
    }
  }, [view, drawSpectrum]);

  // Canvas click: handles clicking on target (for Reto) or on a Cone Result marker
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = 560.0 / rect.width;
    const cx = (e.clientX - rect.left) * scale;
    const cy = (e.clientY - rect.top) * scale;

    // 1. Check if clicked on a Cone Result marker
    if (coneResults.length > 0) {
      const cosDec = Math.cos((target.dec * Math.PI) / 180.0);
      const safeCosDec = Math.abs(cosDec) > 0.05 ? cosDec : 0.05;
      const pxPerArcmin = 560.0 / fov;

      for (const item of coneResults.slice(0, 20)) {
        const dRaArcmin = (item.ra - target.ra) * safeCosDec * 60.0;
        const dDecArcmin = (item.dec - target.dec) * 60.0;
        const mx = 280 - dRaArcmin * pxPerArcmin;
        const my = 280 - dDecArcmin * pxPerArcmin;

        if (Math.hypot(cx - mx, cy - my) <= 16) {
          sound.playTargetSelect();
          handleSelectConeResult(item);
          return;
        }
      }
    }

    // 2. Check if clicked on the current target (for Reto Detective)
    const [tx, ty] = target.type === 'var' ? [280, 280] : getPos(time);
    const dist = Math.hypot(cx - tx, cy - ty);

    if (dist <= 45) {
      sound.playDetectiveFound();
      setRetoFound(true);
      setRetoScore((prev) => prev + 100);
      setIsRetoOpen(true);
    }
  };

  // Search handler (Sesame CDS + local resolver)
  const handleSearch = async (queryStr: string) => {
    const q = queryStr.trim().toLowerCase();
    if (!q) return;

    // Check local presets first
    const foundKey = Object.keys(OBJ).find(
      (k) => OBJ[k].n.toLowerCase().includes(q) || k.includes(q) || (q === 'wise 0855' && k === 'wise')
    );

    if (foundKey) {
      handleSelectObject(foundKey);
      setSearchQuery('');
      return;
    }

    try {
      setIsSearching(true);
      const res = await resolveTargetName(queryStr);
      if (res) {
        // Build custom object from resolved coordinates
        OBJ['custom'] = {
          id: 'custom',
          n: res.name,
          tag: 'Objeto resuelto en catálogo SIMBAD/CDS',
          hook: res.description || 'Coordenadas astronómicas identificadas en catálogo.',
          type: 'mov',
          icon: '🔭',
          badge: 'Objeto astronómico',
          pm: [-0.6, 0.4],
          f: [
            ['RA', `${res.ra.toFixed(3)}°`],
            ['Dec', `${res.dec.toFixed(3)}°`],
            ['Origen', res.source],
          ],
          peak: 0.5,
          ra: res.ra,
          dec: res.dec,
          fitsId: `SPHX_CAT_${res.name.replace(/\s+/g, '')}`,
          mjd: 60841.5,
        };
        handleSelectObject('custom');
        setSearchQuery('');
      } else {
        setSearchMessage(`No encontramos "${queryStr}". Prueba con uno de los ejemplos sugeridos.`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Download spectrum as CSV
  const downloadSpectrumCsv = () => {
    const lines = ['longitud_onda_um,flujo_relativo,canal'];
    for (let x = 0; x <= 100; x++) {
      const u = x / 100.0;
      const lambda = 0.75 + u * (5.0 - 0.75);
      const flux = 0.15 + 0.7 * Math.exp(-Math.pow((u - target.peak) / 0.28, 2));
      lines.push(`${lambda.toFixed(4)},${flux.toFixed(4)},${Math.min(6, Math.floor(u * 6) + 1)}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `SPHEREx_${target.n.replace(/\s+/g, '_')}_espectro.csv`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy share link
  const copyShareLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const currEpochIdx = Math.round(time);
  const { raStr, decStr } = formatSexagesimal(target.ra, target.dec);

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0d1c] text-[#f1eefb]">
      {/* ============================================================== */}
      {/* MOMENTO 1: PORTADA (Lo primero que ve)                          */}
      {/* ============================================================== */}
      {view === 'landing' ? (
        <LandingHero
          objects={OBJ}
          onSelect={handleSelectObject}
          onSearch={handleSearch}
          onOpenConeSearch={() => {
            setView('viewer');
            setIsConeSearchOpen(true);
          }}
          isSearching={isSearching}
          searchMessage={searchMessage}
        />
      ) : (
        /* ============================================================== */
        /* MOMENTO 2 & 3: VISOR DIRECTO Y CONTROLES BAJO DEMANDA           */
        /* ============================================================== */
        <div className="flex flex-col flex-1">
          {/* Header Bar */}
          <header className="flex flex-wrap gap-2.5 sm:gap-4 items-center justify-between px-4 sm:px-8 py-3.5 border-b border-[#272a4f] bg-[#0b0d1c]/90 backdrop-blur-md sticky top-0 z-30">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => {
                  setView('landing');
                  if (typeof window !== 'undefined') history.replaceState(null, '', ' ');
                }}
                title="Volver a la portada"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141733] hover:bg-[#272a4f] border border-[#272a4f] text-xs font-bold text-white transition-all cursor-pointer"
              >
                <span>←</span>
                <span>Cambiar objeto</span>
              </button>

              <h1
                onClick={() => setView('landing')}
                className="text-lg font-extrabold text-white tracking-tight cursor-pointer hover:text-[#ff5a7e] transition-colors hidden md:block"
              >
                SPHEREx Time Machine
              </h1>
            </div>

            {/* Quick Object Switcher Chips */}
            <div className="hidden lg:flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Objetos de ejemplo">
              {Object.keys(OBJ).map((k) => (
                <button
                  key={k}
                  onClick={() => loadTarget(k)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                    key === k
                      ? 'bg-[#f1eefb] text-[#0b0d1c] border-[#f1eefb]'
                      : 'bg-[#141733] text-[#f1eefb] border-[#272a4f] hover:border-[#9a95b8]'
                  }`}
                >
                  {OBJ[k].n}
                </button>
              ))}
            </div>

            {/* Search Input & Secondary Button: Explorar Alrededores */}
            <div className="flex items-center gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearch(searchQuery);
                }}
                className="relative hidden sm:flex items-center"
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar objeto..."
                  className="w-36 md:w-48 px-3 py-1.5 rounded-full border border-[#272a4f] bg-[#141733] text-xs text-white placeholder-[#9a95b8] focus:outline-none focus:border-[#ff5a7e]"
                />
              </form>

              {/* Botón secundario: Explorar alrededores */}
              <button
                type="button"
                onClick={() => setIsConeSearchOpen(true)}
                title="Buscar objetos en un radio de 1′ a 60′"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#141733] hover:bg-[#1e224d] border border-[#272a4f] hover:border-[#38bdf8] text-xs font-bold text-[#38bdf8] transition-all cursor-pointer shadow-sm hover:shadow"
              >
                <span>🔭</span>
                <span className="hidden sm:inline">Explorar alrededores</span>
                <span className="sm:hidden">Radio</span>
                {coneResults.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#38bdf8]/20 text-[#38bdf8] text-[10px] font-extrabold">
                    {coneResults.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setIsTourOpen(true)}
                title="Repetir tour guiado"
                className="w-8 h-8 rounded-full bg-[#141733] hover:bg-[#272a4f] border border-[#272a4f] text-[#ff5a7e] hover:text-white font-extrabold text-sm flex items-center justify-center transition-colors cursor-pointer shadow-md"
              >
                ?
              </button>

              <button
                onClick={copyShareLink}
                title="Copiar enlace directo"
                className="px-3 py-1.5 rounded-xl bg-[#141733] hover:bg-[#272a4f] border border-[#272a4f] text-xs font-semibold text-[#f1eefb] transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>🔗</span>
                <span>{copiedLink ? '¡Copiado!' : 'Compartir'}</span>
              </button>
            </div>
          </header>

          {/* Search Feedback Message */}
          {searchMessage && (
            <div className="text-[#ff5a7e] text-xs px-4 sm:px-8 py-2 bg-[#141733] border-b border-[#272a4f] text-center" role="status">
              {searchMessage}
            </div>
          )}

          {/* Main Visor Grid */}
          <main className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-6 p-4 sm:p-8 max-w-[1240px] w-full mx-auto flex-1 items-start">
            {/* Left Column: Canvas Viewport (Autoplays with continuous movement) */}
            <section className="flex flex-col" id="tour-canvas-area">
              <div className="bg-[#0a0d1f] rounded-3xl overflow-hidden relative border border-[#272a4f] shadow-2xl">
                <canvas
                  ref={canvasRef}
                  width={560}
                  height={560}
                  onClick={handleCanvasClick}
                  aria-label="Imagen animada del cielo infrarrojo con marcadores de búsqueda"
                  className="block w-full h-auto aspect-square cursor-crosshair"
                />

                {/* Badge Overlay */}
                <div className="absolute left-3.5 top-3.5 bg-black/70 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-semibold border border-white/10 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#ff5a7e] animate-ping" />
                  <span>{target.badge}</span>
                </div>

                {/* Number of nearby objects badge if cone search active */}
                {coneResults.length > 0 && (
                  <div className="absolute right-3.5 top-3.5 bg-[#0a0d1f]/85 backdrop-blur-md text-[#38bdf8] px-3 py-1 rounded-full text-xs font-mono font-bold border border-[#38bdf8]/30 flex items-center gap-1.5">
                    <span>🔭</span>
                    <span>Radio {coneRadius}′: {coneResults.length} objetos</span>
                  </div>
                )}

                {/* Bottom Playback Bar */}
                <div className="flex items-center gap-3.5 px-4 py-3 bg-[#0a0d1f] border-t border-[#272a4f] text-white">
                  <button
                    onClick={() => setPlaying(!playing)}
                    aria-label={playing ? 'Pausar' : 'Reproducir'}
                    className="w-11 h-11 rounded-full bg-[#ff5a7e] hover:bg-[#e8365d] text-white flex items-center justify-center font-bold text-base cursor-pointer shrink-0 transition-colors shadow-lg"
                  >
                    {playing ? '❚❚' : '▶'}
                  </button>

                  <div className="flex-1 flex flex-col justify-center">
                    <input
                      type="range"
                      min="0"
                      max="300"
                      value={Math.round(time * 100)}
                      onChange={(e) => {
                        setPlaying(false);
                        setTime(parseFloat(e.target.value) / 100.0);
                      }}
                      aria-label="Línea de tiempo"
                      className="w-full accent-[#ff5a7e] cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-[#9a95b8] mt-1 font-mono">
                      {DATES.map((d, idx) => (
                        <span
                          key={d}
                          className={idx === currEpochIdx ? 'text-[#ff5a7e] font-bold' : ''}
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Right Column: Narrative, Quick Controls & On-Demand Triggers */}
            <aside className="flex flex-col justify-start space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                    {target.n}
                  </h2>
                </div>
                <p className="text-[#ff5a7e] font-semibold text-base mt-1 mb-2">
                  {target.tag}
                </p>
                <p className="text-[#f1eefb] text-sm leading-relaxed">
                  {target.hook}
                </p>
              </div>

              {/* Facts Chips */}
              <div className="flex gap-4 sm:gap-6 flex-wrap py-2 border-y border-[#272a4f]">
                {target.f.map(([label, val]) => (
                  <div key={label} className="flex flex-col">
                    <b className="text-lg sm:text-xl font-extrabold text-white">{val}</b>
                    <small className="text-[#9a95b8] text-xs">{label}</small>
                  </div>
                ))}
              </div>

              {/* Interactive Game & Celestial Map Trigger Buttons */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setIsRetoOpen(true)}
                  className="flex-1 py-2.5 px-4 rounded-2xl bg-[#ff5a7e] hover:bg-[#e8365d] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <span>🎯</span>
                  <span>Reto: ¿Puedes encontrarlo?</span>
                </button>

                <button
                  onClick={() => setIsMapOpen(true)}
                  className="py-2.5 px-4 rounded-2xl bg-[#141733] hover:bg-[#272a4f] text-[#f1eefb] border border-[#272a4f] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>🗺️</span>
                  <span>Ver en el mapa</span>
                </button>
              </div>

              {/* Single Main Switch: "Resaltar lo que cambia" */}
              <div id="tour-highlight-switch" className="bg-[#141733] border border-[#272a4f] rounded-2xl p-4 transition-all">
                <label className="flex items-center gap-3 cursor-pointer font-bold text-sm text-white select-none">
                  <input
                    type="checkbox"
                    checked={highlight}
                    onChange={(e) => setHighlight(e.target.checked)}
                    className="w-5 h-5 accent-[#ff5a7e] rounded cursor-pointer"
                  />
                  <span>Resaltar lo que cambia</span>
                </label>
                <p className="text-xs text-[#9a95b8] mt-1.5 ml-8">
                  {target.type === 'var'
                    ? 'Marca la estrella que cambia de brillo y apaga el resto.'
                    : 'Apaga las estrellas fijas y deja una estela con el recorrido.'}
                </p>
              </div>

              {/* On-Demand Folded Panel 1: Más opciones */}
              <details className="pt-2 border-t border-[#272a4f] group">
                <summary className="cursor-pointer font-bold text-sm text-[#f1eefb] flex items-center justify-between py-1.5 select-none hover:text-[#ff5a7e] transition-colors">
                  <span>Más opciones</span>
                  <span className="text-xs text-[#9a95b8] group-open:rotate-180 transition-transform">▾</span>
                </summary>

                <div className="my-3 space-y-3.5">
                  <div>
                    <label htmlFor="fov" className="block text-xs text-[#9a95b8] mb-1">
                      Tamaño del área: <span className="text-white font-bold">{fov}′</span> (arcminutos)
                    </label>
                    <input
                      id="fov"
                      type="range"
                      min="1"
                      max="30"
                      value={fov}
                      onChange={(e) => setFov(parseInt(e.target.value, 10))}
                      className="w-full accent-[#ff5a7e] cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#9a95b8] mb-1.5">
                      Colores del infrarrojo (de más azul a más rojo)
                    </label>
                    <div className="flex gap-1.5 flex-wrap">
                      {BANDS.map(([name, range], idx) => {
                        const active = bandOn[idx];
                        return (
                          <button
                            key={name}
                            onClick={() => {
                              const next = [...bandOn];
                              next[idx] = !next[idx];
                              if (!next.some(Boolean)) next[idx] = true;
                              setBandOn(next);
                            }}
                            title={range}
                            className={`border rounded-xl px-2.5 py-1 text-xs cursor-pointer transition-colors ${
                              active
                                ? 'bg-[#f1eefb] text-[#0b0d1c] font-bold border-[#f1eefb]'
                                : 'bg-transparent text-[#9a95b8] border-[#272a4f] hover:text-white'
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contrast" className="block text-xs text-[#9a95b8] mb-1">
                      Contraste
                    </label>
                    <input
                      id="contrast"
                      type="range"
                      min="30"
                      max="100"
                      value={contrast}
                      onChange={(e) => setContrast(parseInt(e.target.value, 10))}
                      className="w-full accent-[#ff5a7e] cursor-pointer"
                    />
                  </div>
                </div>
              </details>

              {/* On-Demand Folded Panel 2: Ver su huella infrarroja */}
              <details className="pt-2 border-t border-[#272a4f] group">
                <summary className="cursor-pointer font-bold text-sm text-[#f1eefb] flex items-center justify-between py-1.5 select-none hover:text-[#ff5a7e] transition-colors">
                  <span>Ver su huella infrarroja (102 bandas)</span>
                  <span className="text-xs text-[#9a95b8] group-open:rotate-180 transition-transform">▾</span>
                </summary>

                <div className="mt-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[#9a95b8] leading-relaxed">
                      Cada color del infrarrojo muestra cuánto brilla el objeto. Esa curva revela su temperatura y composición química.
                    </p>
                    <button
                      onClick={downloadSpectrumCsv}
                      title="Descargar datos en CSV"
                      className="text-xs font-mono text-[#ff5a7e] hover:underline shrink-0 ml-3 cursor-pointer"
                    >
                      Descargar CSV
                    </button>
                  </div>
                  <canvas
                    ref={specCanvasRef}
                    width={460}
                    height={200}
                    className="w-full h-auto mt-2.5 block bg-[#0a0d1f] rounded-xl border border-[#272a4f]"
                  />
                </div>
              </details>

              {/* On-Demand Folded Panel 3: Detalles técnicos */}
              <details className="pt-2 border-t border-[#272a4f] group">
                <summary className="cursor-pointer font-bold text-sm text-[#9a95b8] hover:text-white flex items-center justify-between py-1.5 select-none transition-colors">
                  <span>Detalles técnicos (Metadatos)</span>
                  <span className="text-xs text-[#9a95b8] group-open:rotate-180 transition-transform">▾</span>
                </summary>

                <div className="mt-2.5 p-3 rounded-xl bg-[#0a0d1f] border border-[#272a4f] text-xs font-mono text-[#9a95b8] space-y-1">
                  <div><span className="text-white">ID FITS:</span> {target.fitsId}</div>
                  <div><span className="text-white">J2000 RA/Dec:</span> {raStr}, {decStr} ({target.ra.toFixed(4)}°, {target.dec.toFixed(4)}°)</div>
                  <div><span className="text-white">MJD Época 1:</span> {target.mjd.toFixed(1)}</div>
                  <div><span className="text-white">Telescopio:</span> SPHEREx (NASA, All-Sky Survey)</div>
                  <div><span className="text-white">Escala nativa:</span> 6.2 arcsec/píxel</div>
                </div>
              </details>

              <p className="text-xs text-[#9a95b8] pt-2">
                Demo con datos simulados. En la versión final, las imágenes serán de SPHEREx y el movimiento se verá a escala real.
              </p>
            </aside>
          </main>
        </div>
      )}

      {/* Cone Search Lateral Panel (Explorar Alrededores por Radio) */}
      <ConeSearchPanel
        isOpen={isConeSearchOpen}
        onClose={() => setIsConeSearchOpen(false)}
        currentRa={target.ra}
        currentDec={target.dec}
        currentName={target.n}
        onSelectResult={handleSelectConeResult}
        onResultsChange={(results, rad) => {
          setConeResults(results);
          setConeRadius(rad);
        }}
        initialRadius={coneRadius}
        initialFilters={coneFilters}
      />

      {/* Guided Tour Didactic Balloons (Momento 2) */}
      <GuidedTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        targetName={target.n}
        isVariable={target.type === 'var'}
      />

      {/* Modals (Momento 3) */}
      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        target={target}
        fov={fov}
      />

      <RetoModal
        isOpen={isRetoOpen}
        onClose={() => setIsRetoOpen(false)}
        target={target}
        found={retoFound}
        score={retoScore}
      />
    </div>
  );
}
