import {useWorkspaceVisible} from './WorkspaceVisibility';
import {useEffect, useRef, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ArrowLeft,CloseBold} from '@openai/apps-sdk-ui/components/Icon';
import {t} from '../i18n';
import './bottom-sheet.css';

/** Mobile presentation for existing tools; contents keep their own state and actions. */
export function BottomSheet({title, onClose, onBack, children, className=''}:{title:string;onBack?:()=>void;onClose:()=>void;children:ReactNode;className?:string}) {
  const active=useWorkspaceVisible();
  const panel=useRef<HTMLDivElement>(null), close=useRef(onClose);
  close.current=onClose;
  useEffect(()=>{
    if(!active)return;
    const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const shell=document.querySelector<HTMLElement>('.mobile-shell, .app-shell');
    const wasInert=shell?.inert||false;
    if(shell)shell.inert=true;
    const focusable=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex]')||[]).filter(el=>el.tabIndex>=0&&el.getClientRects().length>0&&!el.closest('[inert]'));
    (focusable()[0]||panel.current)?.focus({preventScroll:true});
    const keys=(event:KeyboardEvent)=>{
      const sheets=Array.from(document.querySelectorAll<HTMLElement>('[data-bottom-sheet]')).filter(sheet=>sheet.getClientRects().length>0&&!sheet.closest('[hidden]'));
      if(sheets.at(-1)!==panel.current||event.defaultPrevented)return;
      const menuOpen=Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper]')).some(el=>el.querySelector('[data-state="open"]'));
      if(menuOpen)return;
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key==='Tab'){
        const items=focusable(),first=items[0],last=items.at(-1);
        if(!first){event.preventDefault();panel.current?.focus({preventScroll:true});}
        else if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last?.focus({preventScroll:true});}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus({preventScroll:true});}
      }
    };
    document.addEventListener('keydown',keys);
    return()=>{document.removeEventListener('keydown',keys);if(shell)shell.inert=wasInert;if(opener?.isConnected)opener.focus({preventScroll:true});};
  },[active]);
  return createPortal(<div className="bottom-sheet-overlay" hidden={!active} onPointerDown={event=>{if(event.target===event.currentTarget)close.current();}}><div ref={panel} data-bottom-sheet className={'bottom-sheet '+className} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><div className="bottom-sheet-handle" aria-hidden="true"/><header>{onBack&&<Button color="secondary" variant="ghost" uniform aria-label={t('返回','Back')} onClick={onBack}><ArrowLeft/></Button>}<h2>{title}</h2><Button color="secondary" variant="ghost" uniform aria-label={t('关闭','Close')} onClick={()=>close.current()}><CloseBold/></Button></header><div className="bottom-sheet-content">{children}</div></div></div>,document.body);
}
