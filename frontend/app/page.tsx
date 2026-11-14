"use client";
import React,{useEffect,useState} from 'react';
import {spherexStore,useSpherexStore} from '../store/useSpherexStore';
import {Header} from '../components/Header';
import {FrameViewer} from '../components/FrameViewer';
import {ControlPanel} from '../components/ControlPanel';
import {MetadataPanel} from '../components/MetadataPanel';
import {ObservatoryContext,ComparisonExplanation,AdvancedContext,EducationalFieldTools} from '../components/ObservatoryContext';
import {ExplorationTools} from '../components/ExplorationTools';
import {EmbedModal} from '../components/EmbedModal';
import {KeyboardHelpModal} from '../components/KeyboardHelpModal';
import {LandingHero} from '../components/LandingHero';
import {useLocale} from '../components/useLocale';
import {PRESET_TARGETS} from '../lib/constants';
export interface AstronomicalObject {
  id: string;
  n: string;
  tag: string;
  hook: string;
  type: 'mov' | 'pair' | 'var';
  icon: string;
  badge: string;
  pm: [number, number];
  f: [string, string][];
  peak: number;
  ra: number;
  dec: number;
  fitsId: string;
  mjd: number;
}

const OBJ: Record<string, AstronomicalObject> = {
  wise: {
    id: 'wise',
    n: 'WISE 0855',
    tag: 'La enana marrón más fría cercana',
    hook: 'Casi no tiene luz visible, pero brilla en infrarrojo. Mira cómo cruza el cielo mientras las estrellas de fondo se quedan quietas.',
    type: 'mov',
    icon: '🟤',
    badge: 'Objeto en movimiento',
    pm: [-1, 0.2],
    f: [['Distancia', '7,3 años luz'], ['Temperatura', '−23 °C'], ['Se mueve', '8″ al año']],
    peak: 0.75,
    ra: 133.7951,
    dec: -7.2451,
    fitsId: 'SPHX_E1_D5_WISE0855',
    mjd: 60841.5,
  },
  barnard: {
    id: 'barnard',
    n: 'Estrella de Barnard',
    tag: 'La estrella que más rápido cruza nuestro cielo',
    hook: 'Es una enana roja vecina. Recorre el ancho de la Luna en unos 180 años.',
    type: 'mov',
    icon: '🔴',
    badge: 'Objeto en movimiento',
    pm: [0.15, -1],
    f: [['Distancia', '6 años luz'], ['Temperatura', '3 200 °C'], ['Se mueve', '10,4″ al año']],
    peak: 0.35,
    ra: 269.4521,
    dec: 4.6933,
    fitsId: 'SPHX_E1_D2_BARNARD',
    mjd: 60841.5,
  },
  indi: {
    id: 'indi',
    n: 'Epsilon Indi B',
    tag: 'Dos enanas marrones que viajan juntas',
    hook: 'Son un par de “estrellas fallidas” que orbitan una estrella cercana. Busca los dos puntos que se desplazan a la vez.',
    type: 'pair',
    icon: '🪐',
    badge: 'Pareja en movimiento',
    pm: [0.9, 0.5],
    f: [['Distancia', '12 años luz'], ['Temperatura', '~1 000 °C'], ['Se mueve', '4,7″ al año']],
    peak: 0.6,
    ra: 331.0438,
    dec: -56.7828,
    fitsId: 'SPHX_E1_D3_EPSINDI',
    mjd: 60841.5,
  },
  rw: {
    id: 'rw',
    n: 'RW Aurigae',
    tag: 'Una estrella joven que parpadea',
    hook: 'No se desplaza: cambia de brillo. Fíjate en cómo se apaga y se enciende entre fechas.',
    type: 'var',
    icon: '💫',
    badge: 'Cambia de brillo',
    pm: [0, 0],
    f: [['Distancia', '450 años luz'], ['Tipo', 'Estrella joven'], ['Cambia', 'Brillo irregular']],
    peak: 0.4,
    ra: 76.9564,
    dec: 30.4014,
    fitsId: 'SPHX_E1_D1_RWAUR',
    mjd: 60841.5,
  },
  rdra: {
    id: 'rdra',
    n: 'R Draconis',
    tag: 'Un gigante que respira',
    hook: 'Se hincha y se encoge en ciclos de unos 245 días. Su brillo sube y baja a lo largo del tiempo.',
    type: 'var',
    icon: '✨',
    badge: 'Cambia de brillo',
    pm: [0, 0],
    f: [['Distancia', '~1 000 años luz'], ['Tipo', 'Gigante pulsante'], ['Ciclo', '~245 días']],
    peak: 0.3,
    ra: 248.1676,
    dec: 66.7551,
    fitsId: 'SPHX_E1_D4_RDRA',
    mjd: 60841.5,
  },
};


export default function Home(){
 const state=useSpherexStore();const {locale,text}=useLocale();
 const [landing,setLanding]=useState(false);const [embed,setEmbed]=useState(false);const [help,setHelp]=useState(false);
 useEffect(()=>{
  const p=new URLSearchParams(location.search);const hash=location.hash.slice(1);
  const aliases:Record<string,string>={wise:'wise0855',indi:'eps_indi_b',rw:'rw_aur',rdra:'r_dra'};
  const old=p.get('sel')||p.get('target')||hash;
  if(aliases[old]&&!p.has('api')){p.set('api','mock');p.set('target',aliases[old]);history.replaceState(null,'',`?${p}`);}
  spherexStore.initFromUrl();const timer=setTimeout(()=>setLanding(p.get('view')==='landing'||hash==='portada'),0);
  const keyboard=(e:KeyboardEvent)=>{
   if((e.target as HTMLElement).closest('input,textarea,select,button,summary,[contenteditable],[role=dialog]'))return;
   if(e.code==='Space'||e.key.toLowerCase()==='b'){e.preventDefault();spherexStore.toggleBlinkMode();}
   if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();spherexStore.stopPlayback();if(e.key==='ArrowLeft')spherexStore.prevEpoch();else spherexStore.nextEpoch();}
   if(e.key.toLowerCase()==='d')spherexStore.setMode(spherexStore.getState().mode==='diff'?'normal':'diff');
   if(e.key.toLowerCase()==='s')spherexStore.setMode(spherexStore.getState().mode==='stack'?'normal':'stack');
   if(e.key.toLowerCase()==='m')spherexStore.setDetective(!spherexStore.getState().detective);
   if(/^[1-6]$/.test(e.key))spherexStore.toggleDetector(Number(e.key));
   if(e.key==='?')setHelp(true);
  };window.addEventListener('keydown',keyboard);return()=>{clearTimeout(timer);window.removeEventListener('keydown',keyboard);};
 },[]);
 const select=(id:string)=>{if(id==='m101'){location.assign(new URL(`?api=real&lang=${locale}`,location.origin).href);return;}const aliases:Record<string,string>={wise:'wise0855',indi:'eps_indi_b',rw:'rw_aur',rdra:'r_dra'};location.assign(new URL(`?api=mock&target=${aliases[id]||id}&lang=${locale}`,location.origin).href);};
 if(state.isEmbed)return <main className="observatory-main"><FrameViewer/></main>;
 if(landing)return <LandingHero objects={{...OBJ,m101:{...OBJ.wise,id:'m101',n:'M101 · Datos reales',tag:'Galaxia del Molinete',hook:'Compara dos observaciones auténticas de SPHEREx.',badge:'Datos reales',f:[['Origen','NASA/IPAC IRSA'],['Épocas','2']],pm:[0,0]}}} onSelect={select} onSearch={q=>{const p=PRESET_TARGETS.find(p=>p.name?.toLowerCase().includes(q.toLowerCase()));if(p)select(p.id);}} onOpenConeSearch={()=>{setLanding(false);setTimeout(()=>window.dispatchEvent(new Event('spherex-neighborhood')),0);}} isSearching={false} searchMessage="M101: datos reales. Los demás ejemplos son simulaciones educativas." locale={locale}/>;
 return <div className="reference-app"><Header onOpenEmbed={()=>setEmbed(true)} onOpenHelp={()=>setHelp(true)} onSwitchView={()=>setLanding(true)}/>
 <main className="viewer-shell"><div className="viewer-body"><div className="viewer-canvas-col"><FrameViewer/></div>
 <aside className="viewer-info-col"><ObservatoryContext facts={Object.values(OBJ).find(o=>Math.abs(o.ra-state.target.ra)<.01&&Math.abs(o.dec-state.target.dec)<.01)?.f}/><EducationalFieldTools/>
 <ComparisonExplanation/>
 <details className="advanced-tools"><summary>{text.advanced}</summary><ControlPanel/></details>
 <ExplorationTools/>
 <details className="technical-details"><summary>Detalles técnicos y procedencia</summary><MetadataPanel/><AdvancedContext/></details>
 <footer className="reference-footer">SPHEREx Time Machine · NASA / Caltech / JPL / IPAC</footer>
 </aside></div></main><EmbedModal isOpen={embed} onClose={()=>setEmbed(false)}/><KeyboardHelpModal isOpen={help} onClose={()=>setHelp(false)}/></div>;
}
