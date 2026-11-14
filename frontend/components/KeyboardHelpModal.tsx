'use client';

import { useDialogFocus } from './useDialogFocus';
import React from 'react';
import { isRealApiActive } from '../lib/apiAdapter';
import { HelpIcon, InfoIcon } from './Icons';

interface KeyboardHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardHelpModal({ isOpen, onClose }: KeyboardHelpModalProps) {
  const dialogRef = useDialogFocus(isOpen, onClose);
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Espacio', desc: 'Reproducir / Pausar animación' },
    { key: '← / →', desc: 'Fotograma / Época anterior o siguiente' },
    { key: 'D', desc: 'Alternar Modo Diferencia' },
    { key: 'S', desc: 'Alternar Modo Apilado' },
    { key: 'M', desc: 'Alternar Modo Detective 🕵️' },
    { key: '1 – 6', desc: 'Activar / Desactivar detector infrarrojo correspondiente' },
    { key: 'B', desc: 'Activar / Pausar parpadeo' },
  ];

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Atajos de teclado" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <HelpIcon size={20} className="text-cyan-400" />
            <h3 className="text-base font-bold text-white">Guía y Atajos de Teclado</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="my-4">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Atajos Rápidos de Teclado
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {shortcuts.filter(sc => !isRealApiActive() || !['M', '1 – 6'].includes(sc.key)).map((sc, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                <span className="text-slate-300">{sc.desc}</span>
                <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] font-bold text-cyan-300">
                  {sc.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Science Explanation Box */}
        <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-xs text-slate-300 leading-relaxed mb-4">
          <div className="flex items-center gap-1.5 font-bold text-cyan-300 mb-1">
            <InfoIcon size={14} />
            <span>¿Por qué se ve un par azul / rojo en Modo Diferencia?</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Azul y rojo muestran diferencias negativas y positivas respecto a la referencia. También pueden deberse a ruido, fondo o respuesta instrumental. Este visor no confirma movimiento ni descubrimientos.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
