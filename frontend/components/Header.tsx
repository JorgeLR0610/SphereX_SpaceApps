"use client";
import React, { useState } from 'react';
import { useLocale } from './useLocale';
import { useDataMode } from './useDataMode';
import { useSpherexStore, spherexStore } from '../store/useSpherexStore';
import { PRESET_TARGETS } from '../lib/constants';
import { resolveTargetName } from '../lib/sesame';

export function Header({ onOpenEmbed, onOpenHelp, onSwitchView }: { onOpenEmbed: () => void; onOpenHelp: () => void; onSwitchView?: () => void }) {
  const { frames, isLoading, error, isAudioMuted } = useSpherexStore();
  const real = useDataMode();
  const {locale,text,setLocale}=useLocale();
  const [message, setMessage] = useState('');
  return <header className="observatory-header">
    <div><h1>SPHEREx <span className="text-cyan-300">Time Machine</span></h1>
      <p>{text.purpose}</p></div>
    <div className="header-actions"><label>Idioma<select aria-label="Idioma" value={locale} onChange={e=>setLocale(e.target.value as "es"|"en")}><option value="es">Español</option><option value="en">English</option></select></label>
      <span className={real ? 'origin real' : 'origin simulation'}>{real ? (frames.length ? `${text.real} · NASA/IPAC IRSA` : isLoading ? `${text.real} · Cargando` : error ? `${text.real} · No disponibles` : text.real) : text.mock}</span>
      <label>Origen <select aria-label="Origen de los datos" value={real ? 'real' : 'mock'} onChange={e => { window.location.assign(new URL(`?view=observatory&api=${e.target.value}`, window.location.origin).href); }}><option value="real">Datos reales</option><option value="mock">Simulación</option></select></label>
      <details className="secondary-menu" onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus(); } }}><summary>Más opciones</summary><div>
        <button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setMessage('Enlace copiado'); } catch { setMessage('No se pudo copiar el enlace'); } }}>Compartir enlace</button>
        <button onClick={onOpenEmbed}>Insertar en otra web</button>
        <button onClick={() => spherexStore.toggleAudioMute()}>{isAudioMuted ? 'Activar sonido' : 'Silenciar sonido'}</button>
        <button onClick={onOpenHelp}>Atajos de teclado</button>
        <button onClick={() => { window.localStorage.removeItem('spherex_ux_hints'); window.dispatchEvent(new Event('spherex-show-hints')); }}>Mostrar guía</button>
        <button onClick={onSwitchView}>Portada educativa · Simulación</button>
        {!real && <><label>Objeto de ejemplo<select aria-label="Objeto de ejemplo" onChange={e => { const preset = PRESET_TARGETS.find(p => p.id === e.target.value); if (preset) spherexStore.setTarget(preset); }} defaultValue=""><option value="" disabled>Selecciona un objeto</option>{PRESET_TARGETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><form onSubmit={async e => { e.preventDefault(); const q = new FormData(e.currentTarget).get('query') as string; const target = await resolveTargetName(q); if (target) spherexStore.setTarget({ ...target, category: undefined }); else setMessage('Objeto no encontrado'); }}><label>Buscar para simular<input name="query" required /></label><button>Buscar</button></form></>}
        <span role="status">{message}</span>
      </div></details>
    </div>
  </header>;
}
