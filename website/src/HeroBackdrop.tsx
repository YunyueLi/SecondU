import {useEffect, useLayoutEffect, useRef} from 'react';
import {createPortraitClearance} from './hero-clearance';
import {createTextClearance} from './hero-text-clearance';
import {useSiteMotion} from './site-motion';
import './hero-backdrop.css';

type Cell = {column:number; row:number; energy:number; updated:number};
type SafeArea = {left:number; top:number; right:number; bottom:number};
const CELL_WIDTH = 10, CELL_HEIGHT = 13;
const LIFETIME = 1050;

/** Pointer-driven type on a fixed grid; content has its own feathered clearance. */
export function createHeroBackdrop(element:HTMLCanvasElement,initialPaused=false) {
  const host = element.parentElement;
  if (!host) return;
  const context = element.getContext('2d');
  if (!context) return;
  const disabled = matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 800px)');
  const cells = new Map<number, Cell>();
  const textNodes=[...host.querySelectorAll('.site-hero-copy h1, .site-hero-copy p')];
  const safeNodes = [...host.querySelectorAll('.site-hero-actions a, .site-hero-actions button, .hero-motion-toggle')];
  const textClearance=createTextClearance(textNodes);
  const portrait=host.querySelector<HTMLElement>('.hero-portrait-field');
  const portraitClearance=portrait?createPortraitClearance(portrait):null;
  let width = 0, height = 0, frame = 0, lastPaint = 0, visible = true, ratio = 1;
  let paused=initialPaused,pauseStarted=performance.now(),pausedDuration=0;
  const motionTime=(now=performance.now())=>(paused?pauseStarted:now)-pausedDuration;
  let documentLeft=0, documentTop=0;
  let ink = '';
  let previous: {x:number; y:number; time:number} | null = null;
  let safeAreas: SafeArea[] = [];
  const measure = () => {
   const box = host.getBoundingClientRect();
   width = box.width; height = box.height;
   documentLeft=box.left+scrollX; documentTop=box.top+scrollY;
   ratio = Math.min(devicePixelRatio, 1.5);
   element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
   context.setTransform(ratio, 0, 0, ratio, 0, 0);
   ink = getComputedStyle(element).getPropertyValue('--hero-character-ink').trim();
   safeAreas = safeNodes.map(node => {
    const bounds = node.getBoundingClientRect();
    const padding = 5;
    return {left:bounds.left-box.left-padding, top:bounds.top-box.top-padding, right:bounds.right-box.left+padding, bottom:bounds.bottom-box.top+padding};
   });
   portraitClearance?.measure(box);
   textClearance.measure(box);
   // Resizing clears a canvas buffer. Redraw any live trail with the current
   // theme and clearances; a paused character field remains empty.
   if (cells.size && visible && !document.hidden && !disabled.matches) paint(motionTime());
  };
  const clear = () => {
   cancelAnimationFrame(frame); frame = 0; previous = null; cells.clear();
   context.clearRect(0, 0, width, height);
  };
  const clearance = (x:number, y:number) => {
   let strength = Math.min(portraitClearance?.at(x,y)??1,textClearance.at(x,y));
   for (const area of safeAreas) {
    const distance = Math.hypot(Math.max(area.left-x, 0, x-area.right), Math.max(area.top-y, 0, y-area.bottom));
    const ramp = Math.min(1, distance/28);
    strength = Math.min(strength, ramp*ramp*(3-2*ramp));
   }
   return strength;
  };
  const paint = (now:number) => {
   context.clearRect(0, 0, width, height);
   context.font = '400 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
   context.textAlign = 'center'; context.textBaseline = 'middle';
   context.fillStyle = ink;
   for (const [key, cell] of cells) {
    const age = (now-cell.updated)/LIFETIME;
    const energy = cell.energy*Math.pow(Math.max(0, 1-age), 1.3);
    if (energy < .075) { cells.delete(key); continue; }
    const x = cell.column*CELL_WIDTH, y = cell.row*CELL_HEIGHT;
    const edge = clearance(x, y);
    if (edge < .015) continue;
    // Read across each row in the fixed 2 → n → d → U cycle. Letters remain
    // upright and keep their identity as the pointer trail fades.
    const glyph = '2ndU'[(cell.column+cell.row*3)%4];
    context.globalAlpha = Math.min(1, energy*3.4)*edge;
    context.fillText(glyph, x, y);
   }
   context.globalAlpha = 1;
  };
  const draw = (wallTime:number) => {
   frame = 0;
   if (!visible || document.hidden || disabled.matches) { clear(); return; }
   if (paused) return;
   const now=motionTime(wallTime);
   if (now-lastPaint < 30) { frame = requestAnimationFrame(draw); return; }
   lastPaint = now;
   portraitClearance?.request(wallTime);
   paint(now);
   if (cells.size) frame = requestAnimationFrame(draw);
  };
  const deposit = (x:number, y:number, now:number) => {
   const column = Math.round(x/CELL_WIDTH), row = Math.round(y/CELL_HEIGHT);
   for (let dy=-3; dy<=3; dy++) for (let dx=-4; dx<=4; dx++) {
    const distance = Math.hypot(dx/4.1, dy/3.2);
    if (distance>=1) continue;
    const cx = column+dx, cy = row+dy;
    if (cx<0 || cy<0 || cx*CELL_WIDTH>width || cy*CELL_HEIGHT>height) continue;
    const key = cy*65536+cx, energy = Math.pow(1-distance, .7), existing = cells.get(key);
    const remaining = existing ? existing.energy*Math.pow(Math.max(0,1-(now-existing.updated)/LIFETIME),1.3) : 0;
    if (remaining<energy) cells.set(key, {column:cx, row:cy, energy, updated:now});
   }
  };
  const move = (event:PointerEvent) => {
   if (paused || event.pointerType!=='mouse' || disabled.matches || !visible || document.hidden) return;
   const now = motionTime();
   const point = {x:event.clientX+scrollX-documentLeft, y:event.clientY+scrollY-documentTop, time:now};
   if (previous && now-previous.time<20) return;
   if (previous && now-previous.time<140) {
    const steps = Math.min(16, Math.ceil(Math.hypot(point.x-previous.x,point.y-previous.y)/10));
    for (let step=1;step<=steps;step++) deposit(previous.x+(point.x-previous.x)*step/steps,previous.y+(point.y-previous.y)*step/steps,now);
   } else deposit(point.x,point.y,now);
   previous = point;
   if (!frame) frame = requestAnimationFrame(draw);
  };
  const leave = () => { previous = null; };
  const visibility = () => {
   if (document.hidden) clear();
   host.dataset.backdropVisible = String(!document.hidden && visible && !disabled.matches && !paused);
   element.dataset.motion=disabled.matches?'disabled':paused?'paused':!visible||document.hidden?'suspended':'playing';
  };
  const setPaused = (next:boolean) => {
   if (!active || next===paused) return;
   const now=performance.now();
   if (next) {
    // Pointer trails are transient decoration. Clear them once so clicking
    // pause cannot leave faded glyphs around the control; no fade-out RAF.
    pauseStarted=now;clear();
   } else {
    pausedDuration+=now-pauseStarted;lastPaint=0;
   }
   paused=next;previous=null;visibility();
   if (!paused && cells.size && visible && !document.hidden && !disabled.matches && !frame) frame=requestAnimationFrame(draw);
  };
  const onPreference = () => { clear(); visibility(); };
  const observer = new IntersectionObserver(([entry]) => {
   visible = entry.isIntersecting;
   if (!visible) clear();
   visibility();
  });
  const resizeObserver = new ResizeObserver(measure);
  observer.observe(host); resizeObserver.observe(host);
  if (portrait) resizeObserver.observe(portrait);
  for (const node of safeNodes) resizeObserver.observe(node);
  for (const node of textNodes) resizeObserver.observe(node);
  // Keep clearance and ink in sync with layout and theme, outside the draw loop.
  const copyObserver = new MutationObserver(measure);
  const copy = host.querySelector('.site-hero-copy');
  if (copy) copyObserver.observe(copy,{childList:true,subtree:true,characterData:true});
  copyObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  let active=true;
  void document.fonts.ready.then(()=>{if(active)measure();});
  document.fonts.addEventListener('loadingdone',measure);
  host.addEventListener('pointermove',move,{passive:true});
  host.addEventListener('pointerleave',leave,{passive:true});
  document.addEventListener('visibilitychange',visibility); disabled.addEventListener('change',onPreference);
  measure();visibility();
  const dispose = () => {
   active=false; clear(); observer.disconnect(); resizeObserver.disconnect(); copyObserver.disconnect();
   portraitClearance?.dispose();
   textClearance.dispose();document.fonts.removeEventListener('loadingdone',measure);
   host.removeEventListener('pointermove',move); host.removeEventListener('pointerleave',leave);
   document.removeEventListener('visibilitychange',visibility); disabled.removeEventListener('change',onPreference);
   delete host.dataset.backdropVisible;delete element.dataset.motion;
  };
  return {setPaused,dispose};
}

export default function HeroBackdrop() {
 const {paused}=useSiteMotion();
 const canvas=useRef<HTMLCanvasElement>(null),scene=useRef<ReturnType<typeof createHeroBackdrop>>(undefined);
 const pausePreference=useRef(paused);pausePreference.current=paused;
 useEffect(() => {
  if (!canvas.current) return;
  scene.current=createHeroBackdrop(canvas.current,pausePreference.current);
  return()=>{scene.current?.dispose();scene.current=undefined;};
 }, []);
 useLayoutEffect(()=>{scene.current?.setPaused(paused);},[paused]);
 return <><div className="hero-backdrop-wash" aria-hidden="true"><i/><i/></div><canvas className="hero-character-field" ref={canvas} aria-hidden="true"/></>;
}
