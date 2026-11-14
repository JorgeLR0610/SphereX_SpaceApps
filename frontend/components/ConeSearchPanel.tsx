'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ConeResult,
  ConeFilterType,
  CURATED_CONE_TARGETS,
  searchCone,
  formatSeparation,
  formatMovementSpeed,
} from '../lib/coneSearch';
import { resolveTargetName } from '../lib/sesame';
import { parseCoordinates, formatSexagesimal } from '../lib/wcs';
import { sound } from '../lib/sound';
import { useDialogFocus } from './useDialogFocus';
import { CelestialConeChart } from './CelestialConeChart';

interface ConeSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentRa: number;
  currentDec: number;
  currentName: string;
  onSelectResult: (result: ConeResult) => void;
  onResultsChange: (results: ConeResult[], radiusArcmin: number) => void;
  onHuntArea?: () => void;
  initialRadius?: number;
  initialFilters?: ConeFilterType[];
}

export function ConeSearchPanel({
  isOpen,
  onClose,
  currentRa,
  currentDec,
  currentName,
  onSelectResult,
  onResultsChange,
  onHuntArea,
  initialRadius = 10,
  initialFilters = ['all'],
}: ConeSearchPanelProps) {
  const dialogRef=useDialogFocus(isOpen,onClose);
  const [synthetic, setSynthetic] = useState(false);
  // Center coordinates & query string
  const [centerInput, setCenterInput] = useState<string>('');
  const [activeCoords, setActiveCoords] = useState<{ ra: number; dec: number }>({
    ra: currentRa,
    dec: currentDec,
  });

  // Search parameters
  const [radiusArcmin, setRadiusArcmin] = useState<number>(initialRadius);
  const [filters, setFilters] = useState<ConeFilterType[]>(initialFilters);
  const [sortBy, setSortBy] = useState<'interest' | 'distance'>('interest');

  // UI state
  const [showChart, setShowChart] = useState<boolean>(true);
  const [curatedIndex, setCuratedIndex] = useState<number>(0);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);
  const [hoveredResultId, setHoveredResultId] = useState<string | null>(null);

  // Status & Data
  const [rawResults, setRawResults] = useState<ConeResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('Iniciando consulta...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [noticeMessage, setNoticeMessage] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const panelRef = dialogRef;
  const onResultsChangeRef = useRef(onResultsChange);

  useEffect(() => {
    onResultsChangeRef.current = onResultsChange;
  }, [onResultsChange]);

  // Sync initial values when current object changes or panel opens
  useEffect(() => {
    const timer=setTimeout(()=>{ if (isOpen) {
      setActiveCoords((prev) => {
        if (prev.ra === currentRa && prev.dec === currentDec) return prev;
        return { ra: currentRa, dec: currentDec };
      });
      setCenterInput((prev) => (prev === currentName ? prev : currentName));
    } },0);return ()=>clearTimeout(timer);
  }, [isOpen, currentRa, currentDec, currentName]);

  // Execute Search: Fetch all candidates in the cone to calculate dynamic category counts
  const executeSearch = useCallback(
    async (raToUse: number, decToUse: number, radToUse: number) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setLoadingStep('Consultando SIMBAD TAP, Gaia DR3 y WISE...');
      setErrorMessage('');
      setRawResults([]);

      try {
        const response = await searchCone({ useReal: !synthetic,
          ra: raToUse,
          dec: decToUse,
          radiusArcmin: radToUse,
          filters: ['all'],
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setRawResults(response.results);
          setNoticeMessage(response.notice || '');
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setErrorMessage(
          'No se pudo conectar con el catálogo astronómico federado (SIMBAD / Gaia / WISE). Comprueba tu conexión o reintenta.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [synthetic]
  );

  // Trigger search with debounce whenever activeCoords or radius changes
  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(activeCoords.ra, activeCoords.dec, radiusArcmin);
    }, 280);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isOpen, activeCoords, radiusArcmin, executeSearch]);

  // Compute dynamic category counts BEFORE filtering
  const counts = useMemo(() => {
    return {
      all: rawResults.length,
      fast: rawResults.filter((r) => r.pmArcsecPerYear >= 0.20).length,
      coldcandidate: rawResults.filter(
        (r) =>
          r.isColdCandidate ||
          (!r.hasGaiaMatch && (r.kindCode.startsWith('BD') || r.pmArcsecPerYear >= 0.1))
      ).length,
      browndwarf: rawResults.filter(
        (r) => r.kindCode.startsWith('BD') || r.kindLabel.toLowerCase().includes('marrón')
      ).length,
      variable: rawResults.filter(
        (r) =>
          r.kindCode.startsWith('V') ||
          r.kindCode.startsWith('Mi') ||
          r.kindLabel.toLowerCase().includes('cambia')
      ).length,
    };
  }, [rawResults]);

  // Filtered and Ranked results by Scientific Interest Score or Distance
  const displayedResults = useMemo(() => {
    let list = rawResults;
    if (!filters.includes('all') && filters.length > 0) {
      list = rawResults.filter((item) => {
        return filters.some((f) => {
          if (f === 'fast') return item.pmArcsecPerYear >= 0.20;
          if (f === 'coldcandidate')
            return (
              item.isColdCandidate ||
              (!item.hasGaiaMatch && (item.kindCode.startsWith('BD') || item.pmArcsecPerYear >= 0.1))
            );
          if (f === 'browndwarf')
            return item.kindCode.startsWith('BD') || item.kindLabel.toLowerCase().includes('marrón');
          if (f === 'variable')
            return (
              item.kindCode.startsWith('V') ||
              item.kindCode.startsWith('Mi') ||
              item.kindLabel.toLowerCase().includes('cambia')
            );
          return true;
        });
      });
    }

    const sorted = [...list].sort((a, b) => {
      if (a.sepArcsec === 0 && b.sepArcsec !== 0) return -1;
      if (b.sepArcsec === 0 && a.sepArcsec !== 0) return 1;

      if (sortBy === 'distance') {
        if (a.sepArcsec !== b.sepArcsec) return a.sepArcsec - b.sepArcsec;
        return b.interestScore - a.interestScore;
      }

      if (b.interestScore !== a.interestScore) return b.interestScore - a.interestScore;
      return a.sepArcsec - b.sepArcsec;
    });

    return sorted.map((item, idx) => ({
      ...item,
      number: idx + 1,
    }));
  }, [rawResults, filters, sortBy]);

  // Sync displayed results with parent viewer markers
  useEffect(() => {
    onResultsChangeRef.current?.(displayedResults, radiusArcmin);
  }, [displayedResults, radiusArcmin]);

  // Handle center input submit
  const handleCenterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = centerInput.trim();
    if (!query) return;

    setErrorMessage('');

    const parsed = parseCoordinates(query);
    if (parsed) {
      setActiveCoords(parsed);
      return;
    }

    setIsLoading(true);
    setLoadingStep(`Resolviendo nombre "${query}" en CDS Sesame...`);
    try {
      const res = await resolveTargetName(query);
      if (res) {
        setActiveCoords({ ra: res.ra, dec: res.dec });
        setCenterInput(res.name);
      } else {
        setErrorMessage(
          'No reconocimos esa ubicación. Usa coordenadas en grados (ej. 133.795 -7.245) o sexagesimal (ej. 08h55m10.8s -07d14m42s).'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // "Sorpréndeme": Cycle through curated astronomical targets
  const handleSurpriseMe = () => {
    sound.playBlip(640, 0.04);
    const nextIdx = (curatedIndex + 1) % CURATED_CONE_TARGETS.length;
    setCuratedIndex(nextIdx);
    const target = CURATED_CONE_TARGETS[nextIdx];
    setActiveCoords({ ra: target.ra, dec: target.dec });
    setCenterInput(target.name);
    setRadiusArcmin(target.defaultRadius);
  };

  // "Usar objeto actual": Reset to viewer's center
  const resetToViewerCenter = () => {
    sound.playBlip(540, 0.04);
    setActiveCoords({ ra: currentRa, dec: currentDec });
    setCenterInput(currentName);
  };

  // Filter Chip Toggle
  const toggleFilter = (f: ConeFilterType) => {
    sound.playBlip(580, 0.03);
    if (f === 'all') {
      setFilters(['all']);
      return;
    }

    let next: ConeFilterType[] = filters.filter((item) => item !== 'all');
    if (next.includes(f)) {
      next = next.filter((item) => item !== f);
    } else {
      next.push(f);
    }

    if (next.length === 0) {
      next = ['all'];
    }
    setFilters(next);
  };

  // Key navigation for accessibility
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { raStr, decStr } = formatSexagesimal(activeCoords.ra, activeCoords.dec);

  // Astronomical equivalences
  const moonDiameterEquiv = ((radiusArcmin * 2) / 30.0).toFixed(1);
  const fastMoverTravel2YrArcsec = 20; // 10"/yr * 2 years
  const radiusArcsec = radiusArcmin * 60;
  const isRadiusSufficient = radiusArcsec >= fastMoverTravel2YrArcsec;

  // Logarithmic ticks for radius ruler
  const rulerTicks = [1, 2, 5, 10, 20, 30, 60];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Explorar el vecindario"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
      }}
      className="flex flex-row md:justify-end max-md:flex-col max-md:justify-end"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
        }}
      />

      {/* Drawer Container (Desktop Sidebar / Mobile Bottom Sheet) */}
      <div
        ref={panelRef} role="dialog" aria-modal="true" aria-label="Vecindario celeste"
        style={{
          position: 'relative',
          zIndex: 60,
          width: '100%',
          maxWidth: 440,
          background: 'var(--panel)',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--ink)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
        }}
        className="h-full md:border-l md:border-[var(--line)] max-md:h-auto max-md:max-h-[85vh] max-md:rounded-t-xl max-md:border-t max-md:border-[var(--line)] animate-slide-in"
      >
        {/* Panel Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--panel)',
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 400,
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Explorar el vecindario
            </h2>
            <p style={{ fontSize: 'var(--text-data)', color: 'var(--mute)', margin: '2px 0 0' }}>
              Búsqueda por radio en el infrarrojo (SPHEREx / Gaia / WISE)
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar panel de exploración"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--mute)',
              fontSize: '1.1rem',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* 1. Centro Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px 10px' }}>
              <label htmlFor="center-input" style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink)' }}>
                Centro de observación
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={resetToViewerCenter}
                  className="link-text"
                  style={{ fontSize: 'var(--text-data)' }}
                  title="Restablecer al objeto cargado en el visor"
                >
                  Usar objeto actual
                </button>
                <span style={{ color: 'var(--line)' }}>·</span>
                <button
                  type="button"
                  onClick={handleSurpriseMe}
                  className="link-text"
                  style={{ fontSize: 'var(--text-data)' }}
                  title="Saltar a un objetivo astronómico notable"
                >
                  Sorpréndeme
                </button>
              </div>
            </div>

            <form onSubmit={handleCenterSubmit} style={{ display: 'flex', gap: 6 }}>
              <input
                id="center-input"
                type="text"
                value={centerInput}
                onChange={(e) => setCenterInput(e.target.value)}
                placeholder="Nombre o coords (ej. 76.956 30.401 o 05h07m49s)"
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--line)',
                  background: 'var(--panel-raised)',
                  color: 'var(--ink)',
                  fontSize: 'var(--text-caption)',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
                style={{ padding: '6px 12px' }}
              >
                Fijar
              </button>
            </form>

            <div
              style={{
                fontSize: 'var(--text-data)',
                color: 'var(--mute)',
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 4,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>{raStr}, {decStr}</span>
              <span>({activeCoords.ra.toFixed(4)}°, {activeCoords.dec.toFixed(4)}°)</span>
            </div>
          </div>

          {/* 2. Radius Logarithmic Ruler */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink)' }}>
                Radio de búsqueda
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--alert)', fontSize: 'var(--text-body)' }}>
                {radiusArcmin}′ <span style={{ fontSize: 'var(--text-data)', color: 'var(--mute)', fontWeight: 400 }}>({radiusArcmin * 60}″)</span>
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min="1"
              max="60"
              value={radiusArcmin}
              onChange={(e) => setRadiusArcmin(parseInt(e.target.value, 10))}
              aria-label="Radio de búsqueda en minutos de arco"
              style={{ width: '100%', accentColor: 'var(--alert)', cursor: 'pointer' }}
            />

            {/* Quick tick buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-data)', color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>
              {rulerTicks.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRadiusArcmin(t)}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    border: `1px solid ${radiusArcmin === t ? 'var(--alert)' : 'transparent'}`,
                    background: radiusArcmin === t ? 'rgba(255,107,53,0.12)' : 'transparent',
                    color: radiusArcmin === t ? 'var(--alert)' : 'var(--mute)',
                    cursor: 'pointer',
                    fontWeight: radiusArcmin === t ? 700 : 400,
                  }}
                >
                  {t}′
                </button>
              ))}
            </div>

            {/* Astronomical context lines */}
            <div
              style={{
                fontSize: 'var(--text-data)',
                color: 'var(--mute)',
                background: 'var(--panel-raised)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm, 4px)',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div>
                <strong style={{ color: 'var(--ink)' }}>Equivalencia lunar:</strong> {moonDiameterEquiv}× el diámetro de la Luna llena (~30′).
              </div>
              <div>
                <strong style={{ color: 'var(--ink)' }}>Seguimiento:</strong> Un objeto a 10″/año recorre {fastMoverTravel2YrArcsec}″ en dos años: este radio ({radiusArcsec}″) es{' '}
                <span style={{ color: isRadiusSufficient ? 'var(--ink)' : 'var(--alert)', fontWeight: 600 }}>
                  {isRadiusSufficient ? 'suficiente' : 'estrecho'}
                </span>{' '}
                para seguirlo en SPHEREx.
              </div>
            </div>
          </div>

          {/* 3. Carta Celeste del Panel (Elemento Protagonista) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink)' }}>
                Carta celeste del cono
              </span>
              <button
                type="button"
                onClick={() => setShowChart((v) => !v)}
                className="link-text"
                style={{ fontSize: 'var(--text-data)' }}
              >
                {showChart ? 'Ocultar carta' : 'Ver carta celeste'}
              </button>
            </div>

            {showChart && (
              <><label><input type="checkbox" checked={synthetic} onChange={e=>setSynthetic(e.target.checked)}/>Catálogo simulado (seleccionar y consultar de nuevo)</label><CelestialConeChart
                centerRa={activeCoords.ra}
                centerDec={activeCoords.dec}
                radiusArcmin={radiusArcmin}
                results={displayedResults}
                hoveredId={hoveredResultId}
                onHoverId={setHoveredResultId}
                onSelectResult={(item) => {
                  sound.playTargetSelect();
                  onSelectResult(item);
                  onClose();
                }}
                onSelectNewCenter={(coords) => {
                  sound.playBlip(520, 0.04);
                  setActiveCoords(coords);
                  setCenterInput(`${coords.ra.toFixed(4)} ${coords.dec.toFixed(4)}`);
                }}
              /></>
            )}
          </div>

          {/* 4. Filter Chips con contadores calculados dinámicamente */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink)' }}>
              Filtrar candidatos:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                { id: 'all' as ConeFilterType, label: 'Todos', count: counts.all },
                { id: 'fast' as ConeFilterType, label: 'Se mueven rápido', count: counts.fast },
                { id: 'coldcandidate' as ConeFilterType, label: 'Sin pareja en Gaia', count: counts.coldcandidate },
                { id: 'browndwarf' as ConeFilterType, label: 'Enanas marrones', count: counts.browndwarf },
                { id: 'variable' as ConeFilterType, label: 'Cambian de brillo', count: counts.variable },
              ].map((chip) => {
                const active = filters.includes(chip.id);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => toggleFilter(chip.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm, 4px)',
                      border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`,
                      background: active ? 'var(--panel-raised)' : 'transparent',
                      color: active ? 'var(--ink)' : 'var(--mute)',
                      fontSize: 'var(--text-data)',
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{chip.label}</span>
                    <span
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 700,
                        color: active ? 'var(--alert)' : 'var(--mute)',
                      }}
                    >
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {noticeMessage && !errorMessage && (
            <div style={{ fontSize: 'var(--text-data)', color: 'var(--mute)', fontStyle: 'italic' }}>
              {noticeMessage}
            </div>
          )}

          {/* 5. Header de la Sección de Resultados con ordenación y acción Cazar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              borderTop: '1px solid var(--line)',
              paddingTop: 12,
            }}
          >
            <div>
              <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink)' }}>
                {isLoading
                  ? 'Consultando catálogos celestes…'
                  : errorMessage
                  ? 'Error en la consulta'
                  : `${displayedResults.length} objeto${displayedResults.length === 1 ? '' : 's'} en ${radiusArcmin}′`}
              </span>
              {!isLoading && !errorMessage && displayedResults.length >= 200 && (
                <span style={{ display: 'block', fontSize: 'var(--text-data)', color: 'var(--mute)' }}>
                  Mostrando los 200 más interesantes del área
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {onHuntArea && !isLoading && displayedResults.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTargetSelect();
                    onHuntArea();
                    onClose();
                  }}
                  className="btn-primary"
                  style={{
                    padding: '3px 8px',
                    fontSize: 'var(--text-data)',
                  }}
                  title="Detectar dipolos de movimiento y cruzarlos con el catálogo"
                >
                  Cazar movimiento en esta zona
                </button>
              )}

              {/* Sort toggle */}
              {!isLoading && displayedResults.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-data)', color: 'var(--mute)' }}>
                  <span>Ordenar:</span>
                  <button
                    type="button"
                    onClick={() => setSortBy('interest')}
                    className="link-text"
                    style={{
                      color: sortBy === 'interest' ? 'var(--ink)' : 'var(--mute)',
                      fontWeight: sortBy === 'interest' ? 700 : 400,
                      textDecoration: sortBy === 'interest' ? 'underline' : 'none',
                    }}
                  >
                    Interés
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setSortBy('distance')}
                    className="link-text"
                    style={{
                      color: sortBy === 'distance' ? 'var(--ink)' : 'var(--mute)',
                      fontWeight: sortBy === 'distance' ? 700 : 400,
                      textDecoration: sortBy === 'distance' ? 'underline' : 'none',
                    }}
                  >
                    Distancia
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 6. Resultados en Formato Cuaderno de Campo (Field Notebook) */}
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
              <div
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-sm, 4px)',
                  background: 'var(--panel-raised)',
                  border: '1px solid var(--line)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink)', margin: 0 }}>
                  {loadingStep}
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 'var(--text-data)', color: 'var(--mute)' }}>
                  <span>SIMBAD (CDS)</span>
                  <span>Gaia DR3 (ESA)</span>
                  <span>CatWISE (NASA)</span>
                </div>
              </div>
            </div>
          ) : errorMessage ? (
            <div
              style={{
                padding: 16,
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <p style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 'var(--text-body)', margin: 0 }}>
                Error al consultar el catálogo celeste
              </p>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', margin: 0 }}>
                {errorMessage}
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => executeSearch(activeCoords.ra, activeCoords.dec, radiusArcmin)}
                  className="btn-primary"
                  style={{ padding: '6px 14px' }}
                >
                  Reintentar búsqueda
                </button>
              </div>
            </div>
          ) : displayedResults.length === 0 ? (
            <div
              style={{
                padding: 20,
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'var(--panel-raised)',
                border: '1px solid var(--line)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <p style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 'var(--text-body)', margin: 0 }}>
                Sin resultados en este radio
              </p>
              <p style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', margin: 0 }}>
                No encontramos objetos dentro de {radiusArcmin}′ con los filtros activos.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setRadiusArcmin(Math.min(60, Math.max(20, radiusArcmin * 2)))}
                  className="btn-ghost"
                >
                  Sube el radio a {Math.min(60, Math.max(20, radiusArcmin * 2))}′
                </button>
                <button
                  type="button"
                  onClick={() => setFilters(['all'])}
                  className="btn-ghost"
                >
                  Activar filtro &quot;Todos&quot;
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>
              {displayedResults.map((item: ConeResult) => {
                const isHovered = hoveredResultId === item.id;
                const isCenter = item.sepArcsec === 0;
                const isDetailsOpen = expandedDetailsId === item.id;

                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredResultId(item.id)}
                    onMouseLeave={() => setHoveredResultId(null)}
                    style={{
                      borderBottom: '1px solid var(--line)',
                      background: isHovered ? 'var(--panel-raised)' : 'transparent',
                      transition: 'background 0.12s',
                    }}
                  >
                    {/* Main Row Clickable Button */}
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTargetSelect();
                        onSelectResult(item);
                        onClose();
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 4px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 10,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                        {/* Marker Number Pill */}
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight: 700,
                            fontSize: '0.68rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: 1,
                            background: isCenter
                              ? 'var(--ink)'
                              : item.isColdCandidate || item.pmArcsecPerYear >= 0.20
                              ? 'var(--alert)'
                              : 'var(--panel-raised)',
                            color: isCenter
                              ? 'var(--panel)'
                              : item.isColdCandidate || item.pmArcsecPerYear >= 0.20
                              ? '#fff'
                              : 'var(--ink)',
                            border: `1px solid ${isCenter ? 'var(--ink)' : 'var(--line)'}`,
                          }}
                        >
                          {item.number}
                        </span>

                        <div style={{ minWidth: 0 }}>
                          {/* Name and Candidate Badges */}
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 'var(--text-body)' }}>
                              {item.name}
                            </span>
                            {item.isCandidate && (
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  color: 'var(--alert)',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Candidato
                              </span>
                            )}
                            {item.isColdCandidate && (
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  color: '#38bdf8',
                                }}
                              >
                                Sin pareja en Gaia
                              </span>
                            )}
                          </div>

                          {/* Kind in plain language */}
                          <p style={{ fontSize: 'var(--text-caption)', color: 'var(--mute)', margin: '2px 0 0' }}>
                            {item.kindLabel}
                          </p>

                          {/* Speed & Distance */}
                          <p style={{ fontSize: 'var(--text-data)', color: item.pmArcsecPerYear >= 0.20 ? 'var(--alert)' : 'var(--mute)', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums', fontWeight: item.pmArcsecPerYear >= 0.20 ? 600 : 400 }}>
                            {formatMovementSpeed(item.pmArcsecPerYear)}
                            {item.distanceLy && ` · ${item.distanceLy}`}
                          </p>

                          {/* Scientific justification in 1 human sentence */}
                          {item.interestReason && (
                            <p style={{ fontSize: 'var(--text-caption)', color: 'var(--ink)', margin: '4px 0 0', lineHeight: 1.4 }}>
                              {item.interestReason}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Column: Distance & Score */}
                      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--ink)', fontSize: 'var(--text-caption)' }}>
                          {isCenter ? '0″ (Centro)' : `A ${formatSeparation(item.sepArcsec)}`}
                        </span>
                        <span style={{ fontSize: 'var(--text-data)', color: 'var(--mute)' }}>
                          {isCenter ? 'Referencia' : 'del centro'}
                        </span>
                        <span style={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums', color: 'var(--mute)', marginTop: 2 }}>
                          {item.interestScore} pts
                        </span>
                      </div>
                    </button>

                    {/* Bottom Toolbar of the Item: Catalog Sources & Raw Technical Drawer */}
                    <div
                      style={{
                        padding: '4px 4px 8px 32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 'var(--text-data)',
                        color: 'var(--mute)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>Fuente:</span>
                        <span>
                          {item.source === 'crossmatch' || (item.source as string) === 'federated'
                            ? 'SIMBAD + Gaia'
                            : item.source.toUpperCase()}
                        </span>
                        {item.w1MinusW2 !== undefined && <span>· CatWISE</span>}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {onHuntArea && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sound.playTargetSelect();
                              onSelectResult(item);
                              onHuntArea();
                              onClose();
                            }}
                            className="link-text"
                            style={{ fontSize: 'var(--text-data)', color: 'var(--alert)' }}
                          >
                            Cazar en visor
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDetailsId(isDetailsOpen ? null : item.id);
                          }}
                          className="link-text"
                          style={{ fontSize: 'var(--text-data)' }}
                        >
                          {isDetailsOpen ? 'Ocultar datos' : 'Datos técnicos'}
                        </button>
                      </div>
                    </div>

                    {/* Raw Scientific Parameters Drawer */}
                    {isDetailsOpen && (
                      <div
                        style={{
                          margin: '0 4px 8px 32px',
                          padding: '8px 10px',
                          background: 'var(--panel-raised)',
                          border: '1px solid var(--line)',
                          borderRadius: 'var(--radius-sm, 4px)',
                          fontSize: 'var(--text-data)',
                          fontVariantNumeric: 'tabular-nums',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: 6,
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--mute)', display: 'block' }}>RA / Dec (ICRS):</span>
                          <span>{item.ra.toFixed(5)}°, {item.dec.toFixed(5)}°</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--mute)', display: 'block' }}>Movimiento propio:</span>
                          <span>
                            pmRA: {item.pmRa.toFixed(1)} · pmDE: {item.pmDec.toFixed(1)} mas/a
                          </span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--mute)', display: 'block' }}>Tipo de objeto SIMBAD:</span>
                          <span>{item.kindCode} ({item.kindLabel})</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--mute)', display: 'block' }}>Color infrarrojo W1−W2:</span>
                          <span>
                            {item.w1MinusW2 !== undefined ? `${item.w1MinusW2.toFixed(2)} mag` : 'No medido'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
