"use client";
import React,{useState,useEffect} from 'react';
import { useSpherexStore,spherexStore } from '../store/useSpherexStore';
import { useDataMode } from './useDataMode';
import { SpectrumViewer } from './SpectrumViewer';
import { ConeSearchPanel } from './ConeSearchPanel';
export function ExplorationTools(){
 const state=useSpherexStore();const real=useDataMode();const [open,setOpen]=useState(false);
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('spherex-neighborhood',show);return()=>window.removeEventListener('spherex-neighborhood',show);},[]);
 return <section><h3>Vecindario celeste</h3><p>{real?'Catálogo externo: contexto, no detecciones SPHEREx. Seleccionar un objeto no cambia el campo real validado.':'Simulación educativa: objetos y espectros generados.'}</p>
 <button onClick={()=>setOpen(true)}>Explorar vecindario</button>
 <ConeSearchPanel isOpen={open} onClose={()=>setOpen(false)} currentRa={state.target.ra} currentDec={state.target.dec} currentName={state.target.name||'M101'} onResultsChange={()=>{}} onSelectResult={item=>{if(!real)spherexStore.setTarget({ra:item.ra,dec:item.dec,name:item.name});}} />
 {!real && <details><summary>Espectro interactivo · Simulación</summary><SpectrumViewer ra={state.target.ra} dec={state.target.dec} fov={state.fov} targetName={state.target.name||''} targetType="mov" epochIndex={state.currentEpoch} bandOn={state.detectors}/></details>}
 </section>;
}
