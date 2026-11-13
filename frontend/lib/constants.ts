import { Target, DetectiveTarget, BandInfo } from './types';

export const SPHEREX_DETECTORS = [
  { id: 1, name: 'Det 1', range: '0.75 – 1.11 µm', color: '#38bdf8', hexBg: 'rgba(56, 189, 248, 0.2)', desc: 'Near-IR / Y band' },
  { id: 2, name: 'Det 2', range: '1.11 – 1.64 µm', color: '#4ade80', hexBg: 'rgba(74, 222, 128, 0.2)', desc: 'J / H band' },
  { id: 3, name: 'Det 3', range: '1.64 – 2.42 µm', color: '#facc15', hexBg: 'rgba(250, 204, 21, 0.2)', desc: 'K band / H2O ices' },
  { id: 4, name: 'Det 4', range: '2.42 – 3.82 µm', color: '#fb923c', hexBg: 'rgba(251, 146, 60, 0.2)', desc: 'Mid-IR / 3.0µm H2O ice' },
  { id: 5, name: 'Det 5', range: '3.82 – 4.42 µm', color: '#f87171', hexBg: 'rgba(248, 113, 113, 0.2)', desc: 'High-Res / 4.26µm CO2' },
  { id: 6, name: 'Det 6', range: '4.42 – 5.00 µm', color: '#c084fc', hexBg: 'rgba(192, 132, 252, 0.2)', desc: 'High-Res / 4.67µm CO' },
];

// Generate 102 continuous bands across the 6 detectors
export const SPHEREX_102_BANDS: BandInfo[] = (() => {
  const bands: BandInfo[] = [];
  const configs = [
    { det: 1, min: 0.75, max: 1.11, count: 17 },
    { det: 2, min: 1.11, max: 1.64, count: 17 },
    { det: 3, min: 1.64, max: 2.42, count: 17 },
    { det: 4, min: 2.42, max: 3.82, count: 17 },
    { det: 5, min: 3.82, max: 4.42, count: 17 },
    { det: 6, min: 4.42, max: 5.00, count: 17 },
  ];

  let overallIndex = 0;
  configs.forEach(cfg => {
    const step = (cfg.max - cfg.min) / cfg.count;
    for (let i = 0; i < cfg.count; i++) {
      const lambda = cfg.min + step * (i + 0.5);
      bands.push({
        lambda_um: parseFloat(lambda.toFixed(4)),
        width_um: parseFloat(step.toFixed(4)),
        detector: cfg.det,
        index: overallIndex++,
      });
    }
  });

  return bands;
})();

export interface PresetTarget extends Target {
  id: string;
  tagline: string;
  whyUnique: string;
  detectiveMission: DetectiveTarget;
}

export const PRESET_TARGETS: PresetTarget[] = [
  {
    id: 'm101',
    name: 'M101 (Galaxia del Molinete)',
    ra: 210.80227,
    dec: 54.34895,
    category: 'Standard',
    tagline: 'Datos reales SPHEREx QR3 (Detector 2, ~1.49 µm)',
    whyUnique: 'Par de observaciones reales de SPHEREx (Quick Release 3) alineadas mediante WCS estricto con una separación temporal de 37.68 días.',
    description: 'Región de la galaxia M101 observada por la misión SPHEREx de la NASA en mayo y junio de 2026. Permite comparar dos épocas reales a 1.49 µm con WCS idéntico y máscara de calidad de píxeles.',
    detectiveMission: {
      name: 'M101 (SPHEREx Real QR3)',
      category: 'Región Extragaláctica / Calibración',
      expectedPmRaMasYr: 0.0,
      expectedPmDecMasYr: 0.0,
      initialCoords: { ra: 210.80227, dec: 54.34895 },
      initialPixel: [15, 15],
      hints: [
        'Observaciones reales de NASA SPHEREx en el Detector 2 (1.49 µm).',
        'Los píxeles en azul pizarra indican zonas fuera de cobertura o con máscara de calidad.',
        'La misión detecta fuentes astronómicas con precisión fotométrica y astrométrica.',
      ],
      description: 'Exploración de datos reales de SPHEREx QR3 en la región de M101.',
      foundTolerancePixels: 15,
    },
  },
  {
    id: 'wise0855',
    name: 'WISE 0855-0714',
    ra: 133.7951,
    dec: -7.2451,
    pmRa: -8150.0,
    pmDec: 540.0,
    category: 'Brown Dwarf',
    tagline: 'La enana marrón más fría conocida (~250 K)',
    whyUnique: 'Temperatura bajo cero (hielo de agua). Casi invisible en óptico, pero brillante en el IR medio de SPHEREx. Muévete entre épocas para verla saltar.',
    description: 'WISE J085510.83-071442.5 es una sub-enana marrón a solo 7.27 años luz. Con una masa estimada de 3-10 masas de Júpiter y una temperatura de 250 Kelvin (-23°C), alberga nubes de hielo de agua y metano.',
    detectiveMission: {
      name: 'WISE 0855-0714',
      category: 'Enana Marrón Sub-Estelar (Y4)',
      expectedPmRaMasYr: -8150.0,
      expectedPmDecMasYr: 540.0,
      initialCoords: { ra: 133.7951, dec: -7.2451 },
      initialPixel: [64, 64],
      hints: [
        'Brilla con fuerza en Detectores 4, 5 y 6 (2.4 – 5.0 µm).',
        'Tiene un movimiento colosal de ~8.1 segundos de arco por año hacia el Oeste.',
        'Activa el Modo Diferencia para ver el par de parpadeo azul/rojo característico.',
      ],
      description: 'WISE 0855 se está moviendo velozmente cruzando el campo estelar. ¡Haz clic en el objeto para confirmar su detección!',
      foundTolerancePixels: 14,
    },
  },
  {
    id: 'barnard',
    name: "Barnard's Star",
    ra: 269.4521,
    dec: 4.6933,
    pmRa: -802.8,
    pmDec: 10362.5,
    category: 'High Proper Motion',
    tagline: 'El velocista supremo del cielo nocturno (~10.3"/año)',
    whyUnique: 'La estrella con mayor movimiento propio conocida. En solo 6 meses entre épocas de SPHEREx se desplaza notablemente hacia el norte.',
    description: 'La estrella de Barnard es una enana roja tipo M4 a 5.96 años luz de la Tierra en Ofiuco. Posee el movimiento aparente más rápido de todas las estrellas respecto al Sol (10.36 segundos de arco por año).',
    detectiveMission: {
      name: "Barnard's Star",
      category: 'Enana Roja de Alta Velocidad (M4.0V)',
      expectedPmRaMasYr: -802.8,
      expectedPmDecMasYr: 10362.5,
      initialCoords: { ra: 269.4521, dec: 4.6933 },
      initialPixel: [64, 64],
      hints: [
        'Se mueve marcadamente en dirección Norte (+Dec).',
        'Visible en todos los detectores, especialmente en 1, 2 y 3.',
        'Compara con los círculos de Gaia DR3: ¡la posición actual ya no coincide con la del catálogo de 2016!',
      ],
      description: 'Encuentra a la Estrella de Barnard desplazándose verticalmente por la pantalla a lo largo de las 4 épocas.',
      foundTolerancePixels: 15,
    },
  },
  {
    id: 'eps_indi_b',
    name: 'Epsilon Indi B',
    ra: 331.0438,
    dec: -56.7828,
    pmRa: 3961.0,
    pmDec: -2539.0,
    category: 'Brown Dwarf',
    tagline: 'Sistema binario de enanas marrones frías (T1 + T6)',
    whyUnique: 'Desplazamiento propio rápido con un espectro repleto de profundas bandas de absorción de CH4 (metano) y H2O.',
    description: 'Epsilon Indi Ba y Bb orbitan entre sí a 11.8 años luz. Es uno de los mejores laboratorios astrofísicos para calibrar atmósferas de enanas marrones y planetas gigantes.',
    detectiveMission: {
      name: 'Epsilon Indi B',
      category: 'Par Binario de Enanas Marrones T',
      expectedPmRaMasYr: 3961.0,
      expectedPmDecMasYr: -2539.0,
      initialCoords: { ra: 331.0438, dec: -56.7828 },
      initialPixel: [64, 64],
      hints: [
        'Desplazamiento en diagonal hacia el sureste (+RA, -Dec).',
        'Al hacer clic en su espectro, nota la caída abrupta a 1.6 µm y 3.3 µm por absorción de metano.',
      ],
      description: 'Rastrea el par binario enano y examina su huella molecular de metano con el panel de espectro.',
      foundTolerancePixels: 14,
    },
  },
  {
    id: 'rw_aur',
    name: 'RW Aurigae',
    ra: 76.9564,
    dec: 30.4014,
    pmRa: 1.2,
    pmDec: -22.4,
    category: 'Variable Star',
    tagline: 'Estrella T Tauri con eclipses masivos de polvo',
    whyUnique: 'No se mueve rápido, ¡pero parpadea violentamente! Su disco protoplanetario sufre perturbaciones que causan caídas drásticas de brillo.',
    description: 'RW Aur es un sistema estelar binario joven muy activo de tipo T Tauri con corrientes de marea de gas y polvo que producen caídas de varios órdenes de magnitud en el flujo óptico e infrarrojo.',
    detectiveMission: {
      name: 'RW Aurigae',
      category: 'Estrella Variable T Tauri con Disco',
      expectedPmRaMasYr: 1.2,
      expectedPmDecMasYr: -22.4,
      initialCoords: { ra: 76.9564, dec: 30.4014 },
      initialPixel: [64, 64],
      hints: [
        'Fíjate en el centro: el objeto permanece casi estacionario pero su intensidad lumínica oscila entre fotogramas.',
        'El Modo Diferencia revelará un anillo brillante o apagado debido a la oscilación de flujo.',
        'Haz clic en el espectro en épocas diferentes para ver cómo el velo de polvo atenúa el infrarrojo cercano.',
      ],
      description: '¡Detecta la estrella variable del disco protoplanetario midiendo su cambio de flujo térmico!',
      foundTolerancePixels: 14,
    },
  },
  {
    id: 'r_dra',
    name: 'R Draconis',
    ra: 248.1676,
    dec: 66.7551,
    pmRa: -14.8,
    pmDec: 12.3,
    category: 'Variable Star',
    tagline: 'Gigante roja pulsante Mira con espectro camaleónico',
    whyUnique: 'Pulsación masiva cada 245 días. Su temperatura y diámetro oscilan, alterando drásticamente las bandas moleculares de TiO y H2O.',
    description: 'R Draconis es una estrella gigante asintótica (AGB) pulsante tipo Mira. Pasa de ser una de las estrellas más brillantes del campo a casi desaparecer entre épocas semestrales.',
    detectiveMission: {
      name: 'R Draconis',
      category: 'Variable Pulsante Mira de Largo Periodo',
      expectedPmRaMasYr: -14.8,
      expectedPmDecMasYr: 12.3,
      initialCoords: { ra: 248.1676, dec: 66.7551 },
      initialPixel: [64, 64],
      hints: [
        'Compara el fotograma 1 con el 3: la estrella experimenta una gigantesca variación de brillo.',
        'El espectro de 102 bandas cambia su pendiente y profundidad de absorción molecular entre épocas.',
      ],
      description: 'Identifica la gigante pulsante y observa la metamorfosis de su atmósfera estelar.',
      foundTolerancePixels: 14,
    },
  },
];

