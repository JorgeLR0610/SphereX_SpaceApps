"use client";
import React,{useState} from 'react';
import { useSpherexStore,spherexStore } from '../store/useSpherexStore';
import { useDataMode } from './useDataMode';
import { SpectrumViewer } from './SpectrumViewer';
import { ConeSearchPanel } from './ConeSearchPanel';
export function ExplorationTools(){
 const state=useSpherexStore();const real=useDataMode();const [open,setOpen]=useState(false);
 return <section><h3>Vecindario celeste</h3><p>{real?'Catálogo externo: contexto, no detecciones SPHEREx. Seleccionar un objeto no cambia el campo real validado.':'Simulación educativa: objetos y espectros generados.'}</p>
 <button onClick={()=>setOpen(true)}>Explorar vecindario</button>
 <ConeSearchPanel isOpen={open} onClose={()=>setOpen(false)} currentRa={state.target.ra} currentDec={state.target.dec} currentName={state.target.name||'M101'} onResultsChange={()=>{}} onSelectResult={item=>{if(!real)spherexStore.setTarget({ra:item.ra,dec:item.dec,name:item.name});}} />
 {!real && <details><summary>Espectro interactivo · Simulación</summary><SpectrumViewer ra={state.target.ra} dec={state.target.dec} fov={state.fov} targetName={state.target.name||''} targetType="mov" epochIndex={state.currentEpoch} bandOn={state.detectors}/></details>}
 </section>;
}
