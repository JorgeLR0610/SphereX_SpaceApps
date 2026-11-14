// SphereXTM export utilities adapted to the shared masked renderer.
import { renderImage } from './renderEngine';
import { Frame, ColormapType, StretchFunction, DiffReference, DisplayMode } from './types';
import { createAnimatedGif } from './gifEncoder';
export function saveBlob(blob:Blob,name:string) { const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
export function exportTimelapseGif(frames:Frame[],detectors:boolean[],mode:DisplayMode,reference:DiffReference,stretch:{min:number;max:number;fn:StretchFunction},colormap:ColormapType,fps:number,sum:boolean) {
 const images=[...new Set(frames.map(f=>f.epochIndex))].sort((a,b)=>a-b).map(ep=>renderImage(frames,ep,detectors,mode,reference,stretch,colormap,sum)).filter((image):image is ImageData=>!!image);
 saveBlob(createAnimatedGif(images.map(imageData=>({imageData,delayMs:1000/fps}))), `SPHEREx_${frames[0]?.provenance?.data_origin==='observed_spherex'?'observed':'simulation'}_timelapse.gif`);
}
export function exportComparisonCard(canvas:HTMLCanvasElement,title:string,dates:string,real:boolean) {
 const card=document.createElement('canvas');card.width=620;card.height=760;const ctx=card.getContext('2d');if(!ctx)return;
 ctx.fillStyle='#0c0d12';ctx.fillRect(0,0,620,760);ctx.fillStyle='#ff9a6c';ctx.font='bold 22px Georgia';ctx.fillText(real?'Ficha de comparación':'Ficha educativa · SIMULACIÓN',24,45);
 ctx.fillStyle='#f2f1f5';ctx.font='16px sans-serif';ctx.fillText(title.slice(0,60),24,82);ctx.fillText(dates.slice(0,65),24,112);
 ctx.imageSmoothingEnabled=false;const scale=Math.min(560/canvas.width,480/canvas.height);ctx.drawImage(canvas,30+(560-canvas.width*scale)/2,145,canvas.width*scale,canvas.height*scale);ctx.font='14px sans-serif';ctx.fillText(real?'NASA/IPAC IRSA · Sin detección confirmada':'Datos generados; no son mediciones de SPHEREx',24,680);
 card.toBlob(blob=>{if(blob)saveBlob(blob,'SPHEREx_comparison.png');});
}
