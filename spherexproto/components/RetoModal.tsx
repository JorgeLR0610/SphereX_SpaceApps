'use client';

import React from 'react';

interface RetoModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: {
    n: string;
    hook: string;
    f: [string, string][];
  };
  found: boolean;
  score: number;
}

export function RetoModal({ isOpen, onClose, target, found, score }: RetoModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-pop">
      <div className="relative w-full max-w-md bg-[#141733] border border-[#272a4f] rounded-3xl p-6 shadow-2xl text-[#f1eefb]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#272a4f]">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🕵️</span>
            <div>
              <h3 className="text-lg font-extrabold text-white">Reto Detective</h3>
              <p className="text-xs text-[#9a95b8]">Modo educativo de búsqueda celeste</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#0a0d1f] text-[#9a95b8] hover:text-white flex items-center justify-center font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="my-4 flex flex-col gap-3">
          <div className="p-3.5 rounded-2xl bg-[#0a0d1f] border border-[#272a4f]">
            <span className="text-xs font-mono font-bold text-[#ff5a7e] uppercase tracking-wider block mb-1">
              Tu Misión:
            </span>
            <p className="text-sm font-semibold text-white leading-snug">
              Localiza a <strong className="text-[#ff5a7e]">{target.n}</strong> desplazándose entre las 34 estrellas lejanas.
            </p>
          </div>

          <div className="text-xs text-[#9a95b8] leading-relaxed space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-[#ff5a7e] font-bold">1.</span>
              <span>Fíjate en las estrellas: la gran mayoría permanecen estáticas.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#ff5a7e] font-bold">2.</span>
              <span>Usa el control de tiempo o activa &quot;Resaltar lo que cambia&quot; para comprobar su desplazamiento.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#ff5a7e] font-bold">3.</span>
              <span>Haz clic directamente sobre la estrella en movimiento dentro del visor para confirmar tu hallazgo.</span>
            </div>
          </div>

          {/* Status Badge */}
          <div className="mt-2 p-3 rounded-2xl border text-center transition-all bg-[#0a0d1f] border-[#272a4f]">
            {found ? (
              <div className="text-emerald-400 font-bold flex items-center justify-center gap-2">
                <span className="text-xl">✅</span>
                <span>¡Objetivo confirmado! Has ganado +100 puntos (Total: {score} pts)</span>
              </div>
            ) : (
              <div className="text-[#ff5a7e] text-xs font-mono font-bold animate-pulse">
                🔍 Esperando que hagas clic sobre el objeto en el visor...
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-full bg-[#ff5a7e] hover:bg-[#e8365d] text-white text-xs font-bold transition-colors w-full"
          >
            {found ? '¡Genial! Seguir explorando' : '¡Entendido! Buscar en el visor'}
          </button>
        </div>
      </div>
    </div>
  );
}

