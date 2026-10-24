import {replaceExampleRoute} from './navigation.mjs';

export const financePreviewViews=['overview','portfolio','structure','allocation','details','holdings'] as const;
export type FinancePreviewView=typeof financePreviewViews[number];
const dashboardWidgets={
 overview:['.finance-widget-net-worth','.finance-widget-spend-by-category','.finance-widget-spend-this-month','.finance-widget-upcoming-payments'],
 portfolio:['.finance-dashboard-portfolio','.finance-widget-market-update','.finance-widget-credit-score'],
} as const;

/** Select native Finance views in the website's non-interactive story iframe. */
export function installFinancePresentation(view:Window & typeof globalThis){
 const url=new URL(view.location.href);
 if(view.parent===view||url.searchParams.get('presentation')!=='finance')return()=>{};
 const doc=view.document;
 doc.documentElement.dataset.websitePresentation='finance';
 let requested:FinancePreviewView='overview',scheduled=0,lastReady='';
 doc.documentElement.dataset.financePreviewView=requested;
 const previousInert=doc.body.inert;
 // This iframe is an image-like preview. Inert prevents native dialog autofocus
 // and user interaction; explicit programmatic clicks still select its views.
 doc.body.inert=true;
 const announce=()=>{
  const signature=`${requested}:${doc.documentElement.lang}`;
  if(signature===lastReady)return;
  lastReady=signature;
  view.parent.postMessage({type:'secondu-finance-preview-ready',view:requested},view.location.origin);
 };
 const apply=()=>{
  scheduled=0;
  doc.documentElement.dataset.financePreviewView=requested;
  const route=requested==='holdings'?'finance/holdings':'finance';
  if(view.location.hash!==`#${route}`){replaceExampleRoute(view,route);return;}
  const fullscreen=doc.querySelector('.finance-panorama-fullscreen');
  if(fullscreen&&(requested==='overview'||requested==='portfolio'||requested==='holdings')){
   // The dashboard and panorama share a route. Close through the native control
   // so the dialog releases its focus/scroll lifecycle before the preview moves on.
   fullscreen.querySelector<HTMLButtonElement>(':scope > header button')?.click();
   return;
  }
  if(requested==='holdings'){
   if(doc.querySelector('.finance-page-holdings .holdings-page'))announce();
   return;
  }
  if(requested==='overview'||requested==='portfolio'){
   const grid=doc.querySelector('.finance-page-overview > .finance-dashboard .finance-dashboard-grid');
   if(grid&&grid.getAttribute('aria-busy')!=='true'&&dashboardWidgets[requested].every(selector=>grid.querySelector(selector)))announce();
   return;
  }
  if(!fullscreen){
   const open=doc.querySelector<HTMLButtonElement>('.finance-page-overview > .finance-panorama .panorama-header-actions button');
   if(open&&!open.disabled)open.click();
   return;
  }
  const controls=fullscreen.querySelector('[data-finance-panorama-views]');
  const option=controls?.querySelector<HTMLButtonElement>(`button[data-finance-panorama-view="${requested}"]`);
  if(!option)return;
  if(option.dataset.state!=='on'){option.click();return;}
  announce();
 };
 const schedule=()=>{if(!scheduled)scheduled=view.requestAnimationFrame(apply);};
 const receive=(event:MessageEvent)=>{
  if(event.source!==view.parent||event.origin!==view.location.origin||event.data?.type!=='secondu-finance-preview'||!financePreviewViews.includes(event.data.view))return;
  requested=event.data.view;lastReady='';schedule();
 };
 const observer=new view.MutationObserver(schedule);
 observer.observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-state','aria-busy']});
 view.addEventListener('message',receive);
 view.addEventListener('hashchange',schedule);
 schedule();
 return()=>{
  observer.disconnect();view.removeEventListener('message',receive);view.removeEventListener('hashchange',schedule);
  if(scheduled)view.cancelAnimationFrame(scheduled);
  doc.body.inert=previousInert;
  delete doc.documentElement.dataset.websitePresentation;delete doc.documentElement.dataset.financePreviewView;
 };
}
