// Adapted from SphereXTM 1c8b348: shared scientific pixel pipeline.
import { Frame, ContaminationFlag, ColormapType, StretchFunction } from './types';
import { getColormapLut, applyStretch } from './colormaps';
export function computeProcessedBuffer(
  frames: Frame[],
  epochIdx: number,
  activeDetectors: boolean[],
  mode: 'normal' | 'diff' | 'stack',
  diffRef: 'first' | 'previous' | 'median',
  sumDetectors = false
): { buffer: Float32Array; flags: ContaminationFlag[]; validMask: number[] } | null {
  if (!frames || frames.length === 0) return null;

  const size = frames[0].width;
  const numPixels = size * frames[0].height;

  // Detectors 1-indexed (1 to 6)
  const activeDets = activeDetectors
    .map((on, idx) => (on ? idx + 1 : null))
    .filter((d): d is number => d !== null);

  if (activeDets.length === 0) return null;

  const activeEpochFrames = frames.filter(
    (f) => f.epochIndex === epochIdx && activeDets.includes(f.detector)
  );

  const activeFlags = Array.from(
    new Set(activeEpochFrames.flatMap((f) => f.flags).filter((fl) => fl !== 'clean'))
  );

  const contributing = frames.filter(f => activeDets.includes(f.detector));
  const validMask = Array.from({length:numPixels}, (_,i) => contributing.every(f => !f.validMask || f.validMask[i] === 1) ? 1 : 0);
  // 1. STACK MODE: Co-add and average across all epochs and selected detectors
  if (mode === 'stack') {
    const stacked = new Float32Array(numPixels);
    let count = 0;

    frames.forEach((f) => {
      if (activeDets.includes(f.detector)) {
        const data = f.pixelData;
        for (let i = 0; i < numPixels; i++) {
          stacked[i] += data[i];
        }
        count++;
      }
    });

    if (count > 0) {
      for (let i = 0; i < numPixels; i++) stacked[i] /= count;
    }
    return { buffer: stacked, flags: [], validMask };
  }

  // 2. DIFFERENCE MODE: I_diff = I_curr - I_ref
  if (mode === 'diff') {
    let refIdx = 0;
    if (diffRef === 'previous') {
      refIdx = Math.max(0, epochIdx - 1);
    }

    const currFrames = frames.filter(
      (f) => f.epochIndex === epochIdx && activeDets.includes(f.detector)
    );
    const refFrames = frames.filter(
      (f) => (diffRef === 'median' ? f.epochIndex !== epochIdx : f.epochIndex === refIdx) && activeDets.includes(f.detector)
    );

    if (currFrames.length === 0 || refFrames.length === 0) return null;

    const currComb = new Float32Array(numPixels);
    currFrames.forEach((f) => {
      const data = f.pixelData;
      for (let i = 0; i < numPixels; i++) currComb[i] += data[i];
    });
    for (let i = 0; i < numPixels; i++) currComb[i] /= currFrames.length;

    const refComb = new Float32Array(numPixels);
    refFrames.forEach((f) => {
      const data = f.pixelData;
      for (let i = 0; i < numPixels; i++) refComb[i] += data[i];
    });
    for (let i = 0; i < numPixels; i++) if (diffRef === 'median') { const v=refFrames.map(f=>f.pixelData[i]).sort((a,b)=>a-b); const m=Math.floor(v.length/2); refComb[i]=v.length%2?v[m]:(v[m-1]+v[m])/2; } else refComb[i] /= refFrames.length;

    const diff = new Float32Array(numPixels);
    for (let i = 0; i < numPixels; i++) {
      diff[i] = currComb[i] - refComb[i];
    }
    return { buffer: diff, flags: activeFlags, validMask };
  }

  // 3. NORMAL MODE: Average active detectors at current epoch
  if (activeEpochFrames.length === 0) return null;

  const normal = new Float32Array(numPixels);
  activeEpochFrames.forEach((f) => {
    const data = f.pixelData;
    for (let i = 0; i < numPixels; i++) normal[i] += data[i];
  });

  for (let i = 0; i < numPixels; i++) if (!sumDetectors) normal[i] /= activeEpochFrames.length;

  return { buffer: normal, flags: activeFlags, validMask };
}


export function renderImage(frames: Frame[], epoch: number, detectors: boolean[], mode: 'normal'|'diff'|'stack', diffRef: 'first'|'previous'|'median', stretch: {min:number;max:number;fn:StretchFunction}, colormap:ColormapType, sum=false, split?:number): ImageData | null {
 const processed=computeProcessedBuffer(frames,epoch,detectors,mode,diffRef,sum);
 if(!processed) return null;
 const {width,height}=frames[0];
 const image=new ImageData(width,height); const lut=getColormapLut(mode==='diff'?'coolwarm':colormap);
 const first=split===undefined?null:computeProcessedBuffer(frames,0,detectors,'normal','first',sum);
 const last=split===undefined?null:computeProcessedBuffer(frames,Math.max(...frames.map(f=>f.epochIndex)),detectors,'normal','first',sum);
 for(let i=0;i<width*height;i++) {
  const selected=first&&last?(i%width < width*(split||0)?first:last):processed;
  const offset=i*4;
  if(!selected.validMask[i]) {image.data.set([43,61,91,255],offset);continue;}
  const v=selected.buffer[i]; const range=Math.max(1e-6,(stretch.max-stretch.min)*.45);
  const value=mode==='diff'&&split===undefined?(v+range)/(2*range):applyStretch(v,stretch.min,stretch.max,stretch.fn);
  const color=lut[Math.floor(Math.max(0,Math.min(1,value))*255)];
  image.data.set([color.r,color.g,color.b,255],offset);
 }
 return image;
}
