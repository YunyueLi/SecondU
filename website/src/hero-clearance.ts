import {alphaDistance} from './hero-alpha-distance';

export const PORTRAIT_ALPHA_REQUEST = 'secondu:portrait-alpha-request';
export const PORTRAIT_ALPHA_FRAME = 'secondu:portrait-alpha-frame';

const SAMPLE_INTERVAL = 250;
const SAMPLE_SIZE = 256;

/** A small distance field from the actual composited portrait, including every
 * point layer. Readback is requested only during a pointer trail, at most four
 * times a second; the character animation only samples this cached array. */
export function createPortraitClearance(field:HTMLElement) {
 const sample = document.createElement('canvas');
 const context = sample.getContext('2d', {willReadFrequently:true});
 let left=0, top=0, width=0, height=0, scale=1;
 let distances:Float32Array|null=null, previous:Float32Array|null=null;
 let lastRequest=-Infinity, lastCapture=-Infinity, pending=false, rendered=false, disposed=false;
 let readCount=0;

 const read = () => {
  if (!context || !sample.width || !sample.height) return;
  const pixels=context.getImageData(0,0,sample.width,sample.height).data;
  const {distances:next,occupied}=alphaDistance(pixels,sample.width,sample.height);
  if (import.meta.env.DEV) {
   field.dataset.clearanceReads=String(++readCount);
   field.dataset.clearancePixels=String(occupied);
   field.dataset.clearanceLastRead=String(Math.round(performance.now()));
  }
  // A lost or unavailable GPU buffer must not clear a valid silhouette.
  if (!occupied) return false;
  const now=performance.now();
  previous=rendered&&now-lastCapture<600?distances:null; distances=next; lastCapture=now;
  field.dataset.clearance='rendered-alpha';
  return true;
 };
 const capture = (event:Event) => {
  if (disposed || !context || !width || !height) return;
  const canvas=(event as CustomEvent<HTMLCanvasElement>).detail;
  context.clearRect(0,0,sample.width,sample.height);
  // The event runs immediately after the existing WebGL render, while its
  // drawing buffer is valid. This also retains the real camera fit and tilt.
  context.drawImage(canvas,0,0,sample.width,sample.height);
  if (read()) rendered=true; pending=false;
 };
 const fallback=field.querySelector<HTMLImageElement>('.hero-portrait-fallback');
 const readFallback = () => {
  if (rendered || !context || !fallback?.complete || !fallback.naturalWidth || !width) return;
  const style=getComputedStyle(fallback);
  const px=parseFloat(style.paddingLeft)||0, py=parseFloat(style.paddingTop)||0;
  const fit=Math.min((width-px*2)/fallback.naturalWidth,(height-py*2)/fallback.naturalHeight);
  const w=fallback.naturalWidth*fit,h=fallback.naturalHeight*fit;
  context.clearRect(0,0,sample.width,sample.height);
  context.drawImage(fallback,(width-w)/2*scale,(height-h)/2*scale,w*scale,h*scale);
  read(); field.dataset.clearance='source-alpha';
 };
 field.addEventListener(PORTRAIT_ALPHA_FRAME,capture);
 fallback?.addEventListener('load',readFallback);
 const representation=new MutationObserver(() => {
  if (field.dataset.ready==='false'&&rendered) {
   rendered=false; distances=previous=null; pending=false;
   readFallback();
  }
 });
 representation.observe(field,{attributes:true,attributeFilter:['data-ready']});

 return {
  measure(hostBounds:DOMRect) {
   const bounds=field.getBoundingClientRect();
   left=bounds.left-hostBounds.left; top=bounds.top-hostBounds.top;
   if (width===bounds.width&&height===bounds.height) return;
   width=bounds.width; height=bounds.height; scale=Math.min(1,SAMPLE_SIZE/Math.max(width,height,1));
   sample.width=Math.max(1,Math.round(width*scale)); sample.height=Math.max(1,Math.round(height*scale));
   distances=previous=null; rendered=false; pending=false; lastRequest=-Infinity;
   readFallback();
   field.dispatchEvent(new Event(PORTRAIT_ALPHA_REQUEST));
  },
  request(now:number) {
   if (pending || now-lastRequest<SAMPLE_INTERVAL) return;
   pending=true; lastRequest=now;
   field.dispatchEvent(new Event(PORTRAIT_ALPHA_REQUEST));
  },
  at(x:number,y:number) {
   if (!distances) return 1;
   const localX=(x-left)*scale,localY=(y-top)*scale;
   if (localX<0||localY<0||localX>=sample.width||localY>=sample.height) return 1;
   const i=Math.floor(localY)*sample.width+Math.floor(localX);
   const distance=Math.min(distances[i],previous?.[i]??Infinity)/scale;
   // Glyph half-height, interaction movement and a soft falloff at real edges.
   const ramp=Math.max(0,Math.min(1,(distance-10)/24));
   return ramp*ramp*(3-2*ramp);
  },
  dispose() {
   disposed=true; field.removeEventListener(PORTRAIT_ALPHA_FRAME,capture);
   representation.disconnect();
   fallback?.removeEventListener('load',readFallback);
   distances=previous=null; sample.width=sample.height=1;
   delete field.dataset.clearance;
   delete field.dataset.clearanceReads; delete field.dataset.clearancePixels; delete field.dataset.clearanceLastRead;
  },
 };
}
