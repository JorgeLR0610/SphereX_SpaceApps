'use client';

import React, { useState } from 'react';
import { useSpherexStore } from '../store/useSpherexStore';
import { CodeIcon, CheckIcon } from './Icons';

interface EmbedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EmbedModal({ isOpen, onClose }: EmbedModalProps) {
  const { target, fov, mode, currentEpoch } = useSpherexStore();

  const [width, setWidth] = useState('800');
  const [height, setHeight] = useState('600');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://spherex-timemachine.org';
  const embedUrl = `${origin}/?ra=${target.ra.toFixed(4)}&dec=${target.dec.toFixed(4)}&fov=${fov}&mode=${mode}&ep=${currentEpoch}&embed=1`;
  const iframeCode = `<iframe \n  src="${embedUrl}" \n  width="${width}" \n  height="${height}" \n  frameborder="0" \n  allow="accelerometer; autoplay; clipboard-write; encrypted-media" \n  allowfullscreen\n></iframe>`;

  const copyCode = () => {
    navigator.clipboard.writeText(iframeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <CodeIcon size={20} className="text-cyan-400" />
            <h3 className="text-base font-bold text-white">Incrustar SPHEREx Time Machine</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-3 leading-relaxed">
          Copia este código HTML para incrustar el visor interactivo de <span className="text-cyan-300 font-bold">{target.name}</span> en cualquier blog, artículo científico o web educativa.
        </p>

        {/* Dimension inputs */}
        <div className="grid grid-cols-2 gap-3 my-4">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Ancho (px)</label>
            <input
              type="text"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Alto (px)</label>
            <input
              type="text"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 font-mono"
            />
          </div>
        </div>

        {/* Code snippet block */}
        <div className="relative">
          <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-cyan-300 overflow-x-auto max-h-40">
            {iframeCode}
          </pre>
          <button
            onClick={copyCode}
            className="absolute right-2 top-2 px-3 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
          >
            {copied ? <CheckIcon size={14} /> : null}
            <span>{copied ? '¡Copiado!' : 'Copiar Código'}</span>
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

