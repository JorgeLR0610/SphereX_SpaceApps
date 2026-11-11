'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ConeResult,
  ConeFilterType,
  searchCone,
  formatSeparation,
  formatMovementSpeed,
} from '../lib/coneSearch';
import { resolveTargetName } from '../lib/sesame';
import { parseCoordinates, formatSexagesimal } from '../lib/wcs';
import { sound } from '../lib/sound';

interface ConeSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentRa: number;
  currentDec: number;
  currentName: string;
  onSelectResult: (result: ConeResult) => void;
  onResultsChange: (results: ConeResult[], radiusArcmin: number) => void;
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
  initialRadius = 10,
  initialFilters = ['all'],
}: ConeSearchPanelProps) {
  // Center inputs
  const [centerInput, setCenterInput] = useState<string>('');
  const [activeCoords, setActiveCoords] = useState<{ ra: number; dec: number }>({
    ra: currentRa,
    dec: currentDec,
  });

  // Search parameters
  const [radiusArcmin, setRadiusArcmin] = useState<number>(initialRadius);
  const [filters, setFilters] = useState<ConeFilterType[]>(initialFilters);

  // Status & Results
  const [results, setResults] = useState<ConeResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [noticeMessage, setNoticeMessage] = useState<string>('');
  const [hoveredResultId, setHoveredResultId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Sync initial values when current object changes or panel opens
  useEffect(() => {
    if (isOpen) {
      setActiveCoords({ ra: currentRa, dec: currentDec });
      setCenterInput(currentName);
    }
  }, [isOpen, currentRa, currentDec, currentName]);

  // Execute Search
  const executeSearch = useCallback(
    async (raToUse: number, decToUse: number, radToUse: number, filtersToUse: ConeFilterType[]) => {
      // Cancel pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await searchCone({
          ra: raToUse,
          dec: decToUse,
          radiusArcmin: radToUse,
          filters: filtersToUse,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setResults(response.results);
          setNoticeMessage(response.notice || '');
          onResultsChange(response.results, radToUse);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setErrorMessage('Hubo un problema de conexión con el catálogo celeste.');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [onResultsChange]
  );

  // Trigger search whenever activeCoords, radius, or filters change while panel is open
  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(activeCoords.ra, activeCoords.dec, radiusArcmin, filters);
    }, 280);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isOpen, activeCoords, radiusArcmin, filters, executeSearch]);

  // Handle center input submit
  const handleCenterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = centerInput.trim();
    if (!query) return;

    setErrorMessage('');

    // 1. Try coordinate parsing
    const parsed = parseCoordinates(query);
    if (parsed) {
      setActiveCoords(parsed);
      return;
    }

    // 2. Try Sesame / catalog resolver
    setIsLoading(true);
    try {
      const res = await resolveTargetName(query);
      if (res) {
        setActiveCoords({ ra: res.ra, dec: res.dec });
        setCenterInput(res.name);
      } else {
        setErrorMessage(
          'No reconocimos esa ubicación. Usa coordenadas en grados (ej. 133.795 -7.245) o sexagesimal (ej. 08h55m10s -07d14m42s).'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Filter Chip Toggle
  const toggleFilter = (f: ConeFilterType) => {
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

  // Reset to current viewer center
  const resetToViewerCenter = () => {
    setActiveCoords({ ra: currentRa, dec: currentDec });
    setCenterInput(currentName);
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Explorar alrededores por radio"
      className="fixed inset-0 z-40 pointer-events-auto flex justify-end transition-opacity"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Drawer Container (Desktop Sidebar / Mobile Bottom Sheet) */}
      <div
        ref={panelRef}
        className="relative z-50 w-full max-w-md md:max-w-lg bg-[#141733] border-l border-[#272a4f] shadow-2xl flex flex-col h-full max-md:max-h-[88vh] max-md:rounded-t-3xl max-md:mt-auto animate-slide-in text-[#f1eefb]"
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#272a4f] bg-[#0b0d1c]/60">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🔭</span>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white leading-tight">
                Explorar alrededores
              </h2>
              <p className="text-xs text-[#9a95b8]">
                Búsqueda por radio en el vecindario celeste
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar panel de exploración"
            className="w-8 h-8 rounded-full bg-[#0a0d1f] hover:bg-[#272a4f] text-[#9a95b8] hover:text-white flex items-center justify-center font-bold text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form & Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          {/* 1. Centro Selector */}
          <div className="bg-[#0a0d1f] border border-[#272a4f] rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="center-input" className="font-bold text-white text-xs">
                Centro de búsqueda
              </label>
              {(activeCoords.ra !== currentRa || activeCoords.dec !== currentDec) && (
                <button
                  type="button"
                  onClick={resetToViewerCenter}
                  className="text-[11px] text-[#ff5a7e] hover:underline font-semibold cursor-pointer"
                >
                  Volver al objeto actual
                </button>
              )}
            </div>

            <form onSubmit={handleCenterSubmit} className="flex gap-2">
              <input
                id="center-input"
                type="text"
                value={centerInput}
                onChange={(e) => setCenterInput(e.target.value)}
                placeholder="Nombre o coords (133.79 -7.24)"
                className="flex-1 px-3 py-1.5 rounded-xl border border-[#272a4f] bg-[#141733] text-xs text-white placeholder-[#9a95b8] focus:outline-none focus:border-[#ff5a7e]"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-3.5 py-1.5 rounded-xl bg-[#272a4f] hover:bg-[#34396b] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Fijar
              </button>
            </form>

            <div className="text-[11px] font-mono text-[#9a95b8] flex justify-between">
              <span>{raStr}, {decStr}</span>
              <span>({activeCoords.ra.toFixed(3)}°, {activeCoords.dec.toFixed(3)}°)</span>
            </div>
          </div>

          {/* 2. Radius Slider */}
          <div className="bg-[#0a0d1f] border border-[#272a4f] rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs">Distancia desde el centro</span>
              <span className="font-mono font-extrabold text-[#ff5a7e] text-sm">
                {radiusArcmin}′ <span className="text-[10px] text-[#9a95b8]">({radiusArcmin * 60}″)</span>
              </span>
            </div>

            <input
              type="range"
              min="1"
              max="60"
              value={radiusArcmin}
              onChange={(e) => setRadiusArcmin(parseInt(e.target.value, 10))}
              aria-label="Radio de búsqueda en minutos de arco"
              className="w-full accent-[#ff5a7e] cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-[#9a95b8] font-mono">
              <span>1′ (muy cerca)</span>
              <span>30′</span>
              <span>60′ (1 grado)</span>
            </div>

            {radiusArcmin > 25 && (
              <p className="text-[11px] text-[#ffd34f] mt-1 bg-[#ffd34f]/10 px-2 py-1 rounded-lg border border-[#ffd34f]/20">
                ℹ️ Un área mayor ({radiusArcmin}′) abarca más espacio celeste y puede tardar más en cargar.
              </p>
            )}
          </div>

          {/* 3. Filter Chips */}
          <div>
            <span className="block font-bold text-white text-xs mb-2">Filtrar por tipo de objeto:</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'fast', label: 'Se mueven rápido' },
                { id: 'browndwarf', label: 'Enanas marrones' },
                { id: 'variable', label: 'Cambian de brillo' },
              ].map((chip) => {
                const active = filters.includes(chip.id as ConeFilterType);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => toggleFilter(chip.id as ConeFilterType)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? 'bg-[#ff5a7e] text-white border-[#ff5a7e] shadow-sm'
                        : 'bg-[#0a0d1f] text-[#9a95b8] border-[#272a4f] hover:text-white hover:border-[#9a95b8]'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notices & Error Messages */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                onClick={() => executeSearch(activeCoords.ra, activeCoords.dec, radiusArcmin, filters)}
                className="underline font-bold ml-2 hover:text-white cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          )}

          {noticeMessage && !errorMessage && (
            <div className="text-[11px] text-[#9a95b8] italic">
              ℹ️ {noticeMessage}
            </div>
          )}

          {/* 4. Results Section Header */}
          <div className="flex items-center justify-between pt-2 border-t border-[#272a4f]">
            <span className="font-bold text-white text-xs">
              {isLoading
                ? `Buscando en un radio de ${radiusArcmin}′…`
                : `${results.length} objeto${results.length === 1 ? '' : 's'} encontrado${results.length === 1 ? '' : 's'}`}
            </span>
            {results.length >= 50 && (
              <span className="text-[10px] text-[#9a95b8]">Mostrando los 50 más cercanos</span>
            )}
          </div>

          {/* 5. Results List or Skeletons */}
          {isLoading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="p-3 rounded-2xl bg-[#0a0d1f] border border-[#272a4f] animate-pulse space-y-2"
                >
                  <div className="h-4 bg-[#272a4f] rounded w-2/3" />
                  <div className="h-3 bg-[#272a4f] rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#0a0d1f] border border-[#272a4f] text-center text-xs text-[#9a95b8] space-y-2">
              <span className="text-2xl block">🔍</span>
              <p className="font-semibold text-white">
                No encontramos nada con estos filtros.
              </p>
              <p>
                Prueba ampliando el radio con el deslizador o seleccionando el filtro &quot;Todos&quot;.
              </p>
            </div>
          ) : (
            <div className="space-y-2 pb-6">
              {results.map((item) => {
                const isHovered = hoveredResultId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      sound.playTargetSelect();
                      onSelectResult(item);
                      onClose();
                    }}
                    onMouseEnter={() => setHoveredResultId(item.id)}
                    onMouseLeave={() => setHoveredResultId(null)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                      isHovered
                        ? 'bg-[#1e224d] border-[#ff5a7e] shadow-lg -translate-y-0.5'
                        : 'bg-[#0a0d1f] border-[#272a4f] hover:border-[#ff5a7e]/60'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {/* Marker Number Badge */}
                      <span className="w-6 h-6 rounded-full bg-[#ff5a7e] text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        {item.number}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-extrabold text-white text-xs sm:text-sm truncate group-hover:text-[#ff5a7e] transition-colors">
                            {item.name}
                          </h3>
                        </div>

                        {/* Kind in clean human language */}
                        <p className="text-[11px] text-[#ff5a7e] font-semibold mt-0.5 truncate">
                          {item.kindLabel}
                        </p>

                        {/* Movement speed */}
                        <p className="text-[11px] text-[#9a95b8] mt-0.5">
                          {formatMovementSpeed(item.pmArcsecPerYear)}
                          {item.distanceLy && ` · ${item.distanceLy}`}
                        </p>
                      </div>
                    </div>

                    {/* Distance from search center */}
                    <div className="text-right shrink-0">
                      <span className="block font-mono font-bold text-white text-xs">
                        {formatSeparation(item.sepArcsec)}
                      </span>
                      <span className="text-[10px] text-[#9a95b8]">del centro</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
