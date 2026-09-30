import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {CollapseLarge,ExpandLarge} from '@openai/apps-sdk-ui/components/Icon';
import {t} from '../i18n';
import {WORKBENCH_DEFAULT_WIDTH,workbenchKeyWidth,workbenchLayout} from './layout.mjs';
import './workbench-pane.css';

const PanelLayout=createContext<{fullscreen:boolean;toggle:()=>void}|null>(null);
export function WorkbenchExpandButton(){
 const layout=useContext(PanelLayout);
 if(!layout)return null;
 const label=layout.fullscreen?t('还原侧栏','Restore side panel'):t('展开工作区','Expand workspace');
 return <Button data-expand-workbench color="secondary" variant="ghost" uniform size="sm" aria-label={label} title={label} aria-pressed={layout.fullscreen} onClick={layout.toggle}>{layout.fullscreen?<CollapseLarge/>:<ExpandLarge/>}</Button>;
}

/** The same DOM and editor stay mounted while resizing, expanding or changing breakpoints. */
export function WorkbenchPane({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const pane=useRef<HTMLElement>(null);
 const [available,setAvailable]=useState(()=>window.innerWidth);
 const [preferred,setPreferred]=useState(WORKBENCH_DEFAULT_WIDTH);
 const [fullscreen,setFullscreen]=useState(false);
 const [dragging,setDragging]=useState(false);
 const drag=useRef<{x:number;width:number;pointer:number}|null>(null);
 const close=useRef(onClose);close.current=onClose;
 const layout=workbenchLayout(available,preferred),covering=layout.overlay||fullscreen;
 useLayoutEffect(()=>{
  const container=pane.current?.parentElement;if(!container)return;
  const measure=()=>setAvailable(container.getBoundingClientRect().width);
  measure();const observer=new ResizeObserver(measure);observer.observe(container);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!covering)return;const element=pane.current;if(!element)return;
  const container=element.parentElement;if(!container)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const muted:Array<{element:HTMLElement;inert:boolean}>=[];
  // Only the covered conversation is inactive; navigation remains usable.
  for(const sibling of container.children){if(sibling!==element&&sibling instanceof HTMLElement&&!sibling.matches('script,style,link')){muted.push({element:sibling,inert:sibling.inert});sibling.inert=true;}}
  const externalLayer=()=>[...document.querySelectorAll('[data-radix-popper-content-wrapper]')].some(node=>node.querySelector('[data-state="open"]'))||[...document.querySelectorAll('[role="dialog"][data-state="open"]')].some(node=>!element.contains(node));
  const focusStart=()=>{(element.querySelector<HTMLElement>('[data-expand-workbench]')||element).focus();};
  if(container.contains(document.activeElement)&&!element.contains(document.activeElement))focusStart();
  const keys=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||externalLayer()||element.closest('[inert]'))return;
   if(event.key==='Escape'&&element.contains(document.activeElement)){event.preventDefault();event.stopPropagation();if(fullscreen)setFullscreen(false);else close.current();}
  };
  document.addEventListener('keydown',keys);
  return()=>{document.removeEventListener('keydown',keys);for(const item of muted)item.element.inert=item.inert;if(!element.isConnected&&previous?.isConnected)previous.focus();};
 },[covering,fullscreen]);
 useEffect(()=>{if(covering){drag.current=null;setDragging(false);}},[covering]);
 useEffect(()=>{if(!dragging)return;const previous=document.body.style.cursor;document.body.style.cursor='col-resize';return()=>{document.body.style.cursor=previous;};},[dragging]);
 return <PanelLayout.Provider value={{fullscreen,toggle:()=>setFullscreen(value=>!value)}}><aside ref={pane} className="workbench-surface" data-overlay={layout.overlay} data-fullscreen={fullscreen} data-resizing={dragging} aria-label={title} tabIndex={-1} style={{'--workbench-width':`${layout.width}px`} as CSSProperties}>
  {!covering&&<div className="workbench-resize" role="separator" aria-orientation="vertical" aria-label={t('调整工作区宽度','Resize work panel')} aria-valuemin={layout.min} aria-valuemax={layout.max} aria-valuenow={layout.width} aria-valuetext={t(`${layout.width} 像素`,`${layout.width} pixels`)} tabIndex={0} title={t('拖动调整宽度，双击还原','Drag to resize; double-click to reset')} onDoubleClick={()=>setPreferred(WORKBENCH_DEFAULT_WIDTH)} onKeyDown={event=>{const next=workbenchKeyWidth(event.key,layout.width,layout,event.shiftKey);if(next===undefined)return;event.preventDefault();setPreferred(next);}} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,width:layout.width,pointer:event.pointerId};setDragging(true);}} onPointerMove={event=>{const start=drag.current;if(!start||start.pointer!==event.pointerId)return;setPreferred(Math.max(layout.min,Math.min(layout.max,start.width+start.x-event.clientX)));}} onPointerUp={event=>{if(drag.current?.pointer!==event.pointerId)return;drag.current=null;setDragging(false);event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{drag.current=null;setDragging(false);}} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}/>}
  {children}
 </aside></PanelLayout.Provider>;
}
