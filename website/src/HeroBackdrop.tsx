import {useEffect, useRef} from 'react';
import './hero-backdrop.css';

type Cell = {column:number; row:number; energy:number; updated:number};
type SafeArea = {left:number; top:number; right:number; bottom:number};
const CELL_WIDTH = 10, CELL_HEIGHT = 13;
const LIFETIME = 1050;

/** Pointer-driven type on a fixed grid; content has its own feathered clearance. */
export default function HeroBackdrop() {
 const canvas = useRef<HTMLCanvasElement>(null);
 useEffect(() => {
  const element = canvas.current, host = element?.parentElement;
  if (!element || !host) return;
  const context = element.getContext('2d');
  if (!context) return;
  const disabled = matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 800px)');
  const cells = new Map<number, Cell>();
  let width = 0, height = 0, frame = 0, lastPaint = 0, visible = true;
  let previous: {x:number; y:number; time:number} | null = null;
  let safeAreas: SafeArea[] = [];
  const measure = () => {
   const box = host.getBoundingClientRect();
   width = box.width; height = box.height;
   const ratio = Math.min(devicePixelRatio, 1.5);
   element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
   context.setTransform(ratio, 0, 0, ratio, 0, 0);
   safeAreas = [...host.querySelectorAll('.site-hero-copy h1, .site-hero-copy p, .site-hero-actions')].map(node => {
    const bounds = node.getBoundingClientRect();
    return {left:bounds.left-box.left-5, top:bounds.top-box.top-5, right:bounds.right-box.left+5, bottom:bounds.bottom-box.top+5};
   });
  };
  const clear = () => {
   cancelAnimationFrame(frame); frame = 0; previous = null; cells.clear();
   context.clearRect(0, 0, width, height);
  };
  const clearance = (x:number, y:number) => {
   let strength = 1;
   for (const area of safeAreas) {
    const distance = Math.hypot(Math.max(area.left-x, 0, x-area.right), Math.max(area.top-y, 0, y-area.bottom));
    const ramp = Math.min(1, distance/28);
    strength = Math.min(strength, ramp*ramp*(3-2*ramp));
   }
   return strength;
  };
  const draw = (now:number) => {
   frame = 0;
   if (!visible || document.hidden || disabled.matches) { clear(); return; }
   if (now-lastPaint < 30) { frame = requestAnimationFrame(draw); return; }
   lastPaint = now;
   context.clearRect(0, 0, width, height);
   context.font = '400 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
   context.textAlign = 'center'; context.textBaseline = 'middle';
   context.fillStyle = 'rgba(255, 255, 255, 0.8)';
   for (const [key, cell] of cells) {
    const age = (now-cell.updated)/LIFETIME;
    const energy = cell.energy*Math.pow(Math.max(0, 1-age), 1.3);
    if (energy < .075) { cells.delete(key); continue; }
    const x = cell.column*CELL_WIDTH, y = cell.row*CELL_HEIGHT;
    const edge = clearance(x, y);
    if (edge < .015) continue;
    // Density changes with the trail's strength; glyphs remain anchored to the grid.
    const glyph = energy > .77 ? 'U' : energy > .48 ? 'd' : energy > .22 ? 'n' : '2';
    context.globalAlpha = Math.min(1, energy*3.4)*edge;
    context.fillText(glyph, x, y);
   }
   context.globalAlpha = 1;
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
   if (event.pointerType!=='mouse' || disabled.matches || !visible || document.hidden) return;
   const now = performance.now(), box = host.getBoundingClientRect();
   const point = {x:event.clientX-box.left, y:event.clientY-box.top, time:now};
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
   host.dataset.backdropVisible = String(!document.hidden && visible && !disabled.matches);
  };
  const onPreference = () => { clear(); visibility(); };
  const observer = new IntersectionObserver(([entry]) => {
   visible = entry.isIntersecting;
   if (!visible) clear();
   visibility();
  });
  const resizeObserver = new ResizeObserver(measure);
  observer.observe(host); resizeObserver.observe(host);
  // Re-measure after translated text reflows, without reading layout during animation.
  const copyObserver = new MutationObserver(measure);
  const copy = host.querySelector('.site-hero-copy');
  if (copy) copyObserver.observe(copy,{childList:true,subtree:true,characterData:true});
  host.addEventListener('pointermove',move,{passive:true});
  host.addEventListener('pointerleave',leave,{passive:true});
  document.addEventListener('visibilitychange',visibility); disabled.addEventListener('change',onPreference);
  measure();
  return () => {
   clear(); observer.disconnect(); resizeObserver.disconnect(); copyObserver.disconnect();
   host.removeEventListener('pointermove',move); host.removeEventListener('pointerleave',leave);
   document.removeEventListener('visibilitychange',visibility); disabled.removeEventListener('change',onPreference);
  };
 }, []);
 return <><div className="hero-backdrop-wash" aria-hidden="true"><i/><i/></div><canvas className="hero-character-field" ref={canvas} aria-hidden="true"/></>;
}
