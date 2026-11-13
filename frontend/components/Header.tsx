'use client';

import React, { useState } from 'react';
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';
import { PRESET_TARGETS } from '../lib/constants';
import { resolveTargetName } from '../lib/sesame';
import { 
  SearchIcon, 
  SparklesIcon, 
  ShareIcon, 
  CodeIcon, 
  VolumeIcon, 
  VolumeXIcon, 
  HelpIcon, 
  CheckIcon 
} from './Icons';

interface HeaderProps {
  onOpenEmbed: () => void;
  onOpenHelp: () => void;
  onSwitchView?: () => void;
}

export function Header({ onOpenEmbed, onOpenHelp, onSwitchView }: HeaderProps) {
  const { target, isAudioMuted, detectiveScore, frames, provenance } = useSpherexStore();

  const isRealData = Boolean(
    provenance?.data_origin === 'observed_spherex' ||
    (frames && frames.length > 0 && (
      frames[0].provenance?.data_origin === 'observed_spherex' ||
      (typeof frames[0].provenance?.collection === 'string' && frames[0].provenance.collection.includes('spherex'))
    ))
  );

  const [queryInput, setQueryInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;

    try {
      setIsSearching(true);
      const res = await resolveTargetName(queryInput);
      if (res) {
        spherexStore.setTarget({
          name: res.name,
          ra: res.ra,
          dec: res.dec,
          category: res.type as unknown as import('../lib/types').Target['category'],
          pmRa: res.pmRa,
          pmDec: res.pmDec,
          description: res.description,
        });
        setQueryInput('');
      } else {
        alert(`No se encontró el objeto o coordenadas "${queryInput}". Prueba con coordenadas (ej. "133.795, -7.245") o un nombre válido.`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const copyShareUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <header className="w-full flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      {/* 1. Brand Logo & Pitch */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-black text-lg">
          🔭
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-extrabold tracking-tight text-white">
              SPHEREx <span className="text-cyan-400">Time Machine</span>
            </h1>
            {isRealData ? (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 shadow-sm shadow-emerald-500/20">
                🔭 DATOS REALES SPHEREx
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-600/40">
                🧪 MODO DEMO
              </span>
            )}
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
              IR Sky
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Ver el cielo infrarrojo en movimiento · NASA All-Sky Survey
          </p>
        </div>
      </div>

      {/* 2. Central SearchBox with Sesame/SIMBAD & RA/Dec parser */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md relative flex items-center">
        <div className="relative w-full">
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Estrella o RA/Dec (ej: WISE 0855, Barnard, 133.795 -7.245)..."
            className="w-full pl-9 pr-16 py-1.5 rounded-lg bg-slate-950/70 border border-slate-700/80 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-mono"
          />
          <SearchIcon size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <button
            type="submit"
            disabled={isSearching}
            className="absolute right-1 top-1 px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-bold font-mono transition-colors disabled:opacity-50"
          >
            {isSearching ? 'Buscando...' : 'Ir'}
          </button>
        </div>
      </form>

      {/* 3. Action Tools: Share, Embed, Sound, Help */}
      <div className="flex items-center gap-1.5">
        {/* Detective Score badge */}
        {detectiveScore > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-pink-950/40 border border-pink-500/40 text-pink-300 text-xs font-mono font-bold">
            <SparklesIcon size={12} className="text-pink-400" />
            <span>{detectiveScore} pts</span>
          </div>
        )}

        {/* Share Button */}
        <button
          onClick={copyShareUrl}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition-colors border border-slate-700/80"
          title="Copiar enlace con coordenadas actuales"
        >
          {copiedLink ? <CheckIcon size={14} className="text-emerald-400" /> : <ShareIcon size={14} />}
          <span className="hidden md:inline">{copiedLink ? 'Copiado!' : 'Compartir'}</span>
        </button>

        {/* Embed Button */}
        <button
          onClick={onOpenEmbed}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition-colors border border-slate-700/80"
          title="Generar código iframe para incrustar en cualquier web"
        >
          <CodeIcon size={14} />
          <span className="hidden md:inline">Embed</span>
        </button>

        {/* Sound toggle */}
        <button
          onClick={() => spherexStore.toggleAudioMute()}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition-colors border border-slate-700/80"
          title={isAudioMuted ? 'Activar sonido' : 'Silenciar'}
        >
          {isAudioMuted ? <VolumeXIcon size={15} /> : <VolumeIcon size={15} />}
        </button>

        {/* Help */}
        <button
          onClick={onOpenHelp}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition-colors border border-slate-700/80"
          title="Atajos de teclado y ayuda"
        >
          <HelpIcon size={15} />
        </button>

        {/* Optional View Switcher */}
        {onSwitchView && (
          <button
            onClick={onSwitchView}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 text-xs transition-colors border border-indigo-700/60"
            title="Volver a la portada educativa"
          >
            <span>🌟</span>
            <span className="hidden md:inline">Portada</span>
          </button>
        )}
      </div>

      {/* 4. Preset Buttons Bar */}
      <div className="w-full flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 border-t border-slate-800/50">
        <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
          Seleccionar Caso de Estudio:
        </span>
        <div className="flex items-center gap-2">
          {PRESET_TARGETS.map((preset) => {
            const isCurrent = target.name === preset.name;
            const shortTag: Record<string, string> = {
              m101: 'SPHEREx QR3 (1.49 µm)',
              wise0855: 'Enana marrón fría (-23°C)',
              barnard: 'Récord velocidad (10.4"/a)',
              eps_indi_b: 'Par binario (Metano)',
              rw_aur: 'Disco protoplanetario',
              r_dra: 'Gigante pulsante Mira',
            };

            return (
              <button
                key={preset.id}
                onClick={() => {
                  spherexStore.setTarget({
                    name: preset.name,
                    ra: preset.ra,
                    dec: preset.dec,
                    category: preset.category,
                    pmRa: preset.pmRa,
                    pmDec: preset.pmDec,
                    description: preset.description,
                  });
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs whitespace-nowrap transition-all border ${
                  isCurrent
                    ? preset.id === 'm101'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-sm shadow-emerald-500/20 font-bold'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-sm shadow-cyan-500/20 font-bold'
                    : 'bg-slate-950/60 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                }`}
                title={`${preset.tagline} - ${preset.whyUnique}`}
              >
                <span>{preset.name}</span>
                <span className={`text-[10px] ${isCurrent ? (preset.id === 'm101' ? 'text-emerald-400/80 font-normal' : 'text-cyan-400/80 font-normal') : 'text-slate-500'}`}>
                  · {shortTag[preset.id] || preset.category}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

