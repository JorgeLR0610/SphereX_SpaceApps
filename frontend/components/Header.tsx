"use client";
import React,{useState,useRef,useEffect} from 'react';
import {useLocale} from './useLocale';
import {useDataMode} from './useDataMode';
import {useSpherexStore,spherexStore} from '../store/useSpherexStore';
import {resolveTargetName} from '../lib/sesame';
export function Header({onOpenEmbed,onOpenHelp,onSwitchView}:{onOpenEmbed:()=>void;onOpenHelp:()=>void;onSwitchView?:()=>void}){
 const {target,isAudioMuted}=useSpherexStore();const real=useDataMode();const {locale,text,setLocale}=useLocale();
 const [search,setSearch]=useState(false);const [message,setMessage]=useState('');const input=useRef<HTMLInputElement>(null);
 const openSearch=()=>{setSearch(true);setTimeout(()=>input.current?.focus(),0);};
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='/'&&!(e.target as HTMLElement).closest('input,textarea,select')){e.preventDefault();openSearch();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
 const share=async()=>{try{await navigator.clipboard.writeText(location.href);setMessage('Enlace copiado');}catch{setMessage('No se pudo copiar el enlace');}};
 return <header className="reference-header">
 <button className="back-target" onClick={onSwitchView} title="Volver a la portada"><span aria-hidden="true">←</span><span>{real?'M101 — Galaxia del Molinete':target.name}</span></button>
 <div className="reference-header-actions">
 {search?<form className="header-search" onSubmit={async e=>{e.preventDefault();const q=input.current?.value||'';if(real){setMessage('El campo real disponible es M101. Usa Simulación para otros objetos.');return;}try{const result=await resolveTargetName(q);if(result){await spherexStore.setTarget({...result,category:undefined});setSearch(false);}else setMessage('Objeto no encontrado');}catch{setMessage('No se pudo consultar el objeto');}}}><input ref={input} aria-label="Buscar objeto" placeholder="Objeto o coordenadas…" onKeyDown={e=>{if(e.key==='Escape')setSearch(false);}}/><button type="submit">Ir</button><button type="button" onClick={()=>setSearch(false)} aria-label="Cerrar búsqueda">×</button></form>:<button onClick={openSearch} title="Buscar (/)" aria-label="Abrir búsqueda">⌕</button>}
 <button onClick={()=>window.dispatchEvent(new Event('spherex-neighborhood'))}>Vecindario</button>
 <select aria-label="Idioma" value={locale} onChange={e=>setLocale(e.target.value as 'es'|'en')}><option value="es">ES</option><option value="en">EN</option></select>
 <button onClick={share}>Compartir</button>
 <span className={real?'origin real':'origin simulation'}>{real?text.real:text.mock}</span>
 <details className="secondary-menu" onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary aria-label="Más opciones">•••</summary><div>
 <label>Origen<select aria-label="Origen de los datos" value={real?'real':'mock'} onChange={e=>location.assign(new URL(`?api=${e.target.value}&lang=${locale}`,location.origin).href)}><option value="real">Datos reales</option><option value="mock">Simulación</option></select></label>
 <button onClick={onOpenEmbed}>Insertar en otra web</button><button onClick={onOpenHelp}>Atajos de teclado</button><button onClick={()=>spherexStore.toggleAudioMute()}>{isAudioMuted?'Activar sonido':'Silenciar sonido'}</button>
 <p>{text.purpose}</p><span role="status">{message}</span></div></details>
 </div>{message&&<div className="header-feedback" role="status"><button onClick={()=>setMessage('')} aria-label="Cerrar mensaje">×</button>{message}</div>}
 </header>;
}
