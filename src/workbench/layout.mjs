export const WORKBENCH_DEFAULT_WIDTH = 520;
export const WORKBENCH_MIN_WIDTH = 320;
export const WORKBENCH_CHAT_MIN_WIDTH = 360;
export const WORKBENCH_SPLIT_MIN_WIDTH = 760;

/** The content container, not the window, owns the available chat/panel space. */
export function workbenchLayout(available, preferred = WORKBENCH_DEFAULT_WIDTH) {
 const width = Number.isFinite(available) ? Math.max(0, available) : 0;
 const overlay = width < WORKBENCH_SPLIT_MIN_WIDTH;
 const max = overlay ? Math.min(590, width) : Math.min(1000, width - WORKBENCH_CHAT_MIN_WIDTH);
 const min = Math.min(WORKBENCH_MIN_WIDTH, max);
 const desired = Number.isFinite(preferred) ? preferred : WORKBENCH_DEFAULT_WIDTH;
 return {overlay,min,max,width:Math.round(Math.max(min,Math.min(max,desired)))};
}
export function workbenchKeyWidth(key, current, bounds, shift = false) {
 const step = shift ? 80 : 20;
 const next = key==='ArrowLeft'?current+step:key==='ArrowRight'?current-step:key==='Home'?bounds.min:key==='End'?bounds.max:undefined;
 return next===undefined?undefined:Math.max(bounds.min,Math.min(bounds.max,next));
}
