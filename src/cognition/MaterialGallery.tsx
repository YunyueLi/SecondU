import {useEffect,useId,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {ArrowRight,Chat,Check,Document,Images,Link,Edit,Folder,Brain} from '@openai/apps-sdk-ui/components/Icon';
import {t} from '../i18n';
import './material-gallery.css';

export interface MaterialGalleryItem {
  id:string;
  title:string;
  description:string;
  kind:'sources'|'text'|'media'|'conversation'|'memory'|'connector'|'write';
  disabled?:boolean;
  availability?:'material'|'connected';
}

/** A presentation of existing source entry points. It owns no import or source state. */
export function MaterialGallery({items,onOpen}:{items:MaterialGalleryItem[];onOpen:(id:string)=>void}) {
  const [activeId,setActiveId]=useState(()=>items[0]?.id),[drag,setDrag]=useState(0);
  const gesture=useRef<{x:number;y:number;pointer:number;swiping:boolean}|undefined>(undefined),suppressClick=useRef(false);
  const cards=useRef(new Map<string,HTMLButtonElement>()),keyboardTarget=useRef<string|undefined>(undefined);
  const stageId=useId();
  const index=Math.max(0,items.findIndex(item=>item.id===activeId)),current=items[index];
  useEffect(()=>{if(!items.some(item=>item.id===activeId))setActiveId(items[0]?.id);},[items,activeId]);
  const choose=(next:number,keyboard=false)=>{const id=items[next]?.id;if(!id)return;if(keyboard)keyboardTarget.current=id;setActiveId(id);};
  const move=(step:number,keyboard=false)=>{if(items.length)choose((index+step+items.length)%items.length,keyboard);};
  useEffect(()=>{if(keyboardTarget.current===activeId){cards.current.get(activeId)?.focus({preventScroll:true});keyboardTarget.current=undefined;}},[activeId]);
  function begin(event:PointerEvent<HTMLDivElement>) {
    if(!event.isPrimary||event.pointerType==='mouse'&&event.button!==0)return;
    suppressClick.current=false;gesture.current={x:event.clientX,y:event.clientY,pointer:event.pointerId,swiping:false};
  }
  function slide(event:PointerEvent<HTMLDivElement>) {
    const start=gesture.current;if(!start||start.pointer!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(!start.swiping&&Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>10){gesture.current=undefined;return;}
    if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)){
      start.swiping=true;suppressClick.current=true;
      if(!event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.setPointerCapture(event.pointerId);
    }
    if(start.swiping)setDrag(Math.max(-80,Math.min(80,dx*.5)));
  }
  function end(event:PointerEvent<HTMLDivElement>,cancelled=false) {
    const start=gesture.current;if(!start||start.pointer!==event.pointerId)return;
    const distance=event.clientX-start.x;
    if(!cancelled&&start.swiping&&Math.abs(distance)>35)move(distance<0?1:-1);
    gesture.current=undefined;setDrag(0);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  if(!current)return null;
  return <section className="material-gallery" aria-label={t('资料接入画廊','Source gallery')} aria-roledescription={t('可左右切换的画廊','Carousel')}>
    <div id={stageId} className={'material-gallery-stage'+(drag?' is-dragging':'')} style={{'--gallery-drag':drag+'px'} as CSSProperties}
      onPointerDown={begin} onPointerMove={slide} onPointerUp={event=>end(event)} onPointerCancel={event=>end(event,true)}
      onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1,true);}else if(event.key==='Home'||event.key==='End'){event.preventDefault();choose(event.key==='Home'?0:items.length-1,true);}}}>
      {items.map((item,position)=>{
        let offset=position-index;const half=Math.floor(items.length/2);
        if(offset>half)offset-=items.length;if(offset < -half)offset+=items.length;
        const selected=offset===0,distance=Math.abs(offset),side=Math.sign(offset);
        const Icon={sources:Folder,text:Document,media:Images,conversation:Chat,memory:Brain,connector:Link,write:Edit}[item.kind];
        const status=item.availability==='connected'?t('已连接','Connected'):item.availability==='material'?t('已有资料','Materials added'):'';
        return <button key={item.id} type="button" className={'material-gallery-cover is-'+item.kind+(selected?' is-current':'')+(item.availability?' has-connection':'')}
          ref={node=>{if(node)cards.current.set(item.id,node);else cards.current.delete(item.id);}}
          style={{'--gallery-offset':offset,'--gallery-side':side,'--gallery-depth':distance,'--gallery-order':items.length-distance} as CSSProperties}
          tabIndex={selected?0:-1} aria-label={(selected?t(`打开${item.title}`,`Open ${item.title}`):t(`切换到${item.title}`,`Show ${item.title}`))+(status?t(`，${status}`,`, ${status}`):'')}
          aria-current={selected?'true':undefined} aria-disabled={selected&&item.disabled?true:undefined} title={status||undefined}
          onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}if(!selected)setActiveId(item.id);else if(!item.disabled)onOpen(item.id);}}>
          <span className="material-gallery-brand" aria-hidden="true">SecondU</span>
          <span className="material-gallery-face">
            <Icon className="material-gallery-icon" aria-hidden="true"/>
            {status&&<span className="material-gallery-availability" aria-label={status}><Check aria-hidden="true"/></span>}
            <span className="material-gallery-title">{item.title}</span>
            <span className="material-gallery-description">{item.description}</span>
            <ArrowRight className="material-gallery-open" aria-hidden="true"/>
          </span>
        </button>;
      })}
    </div>
    <div className="material-gallery-navigation" aria-label={t('切换资料入口','Choose a source')}>
      {items.map((item,position)=><button key={item.id} type="button" className={'material-gallery-indicator'+(position===index?' is-current':'')}
        aria-label={t(`第 ${position+1} 项，共 ${items.length} 项：${item.title}`,`${position+1} of ${items.length}: ${item.title}`)}
        aria-current={position===index?'true':undefined} aria-controls={stageId} onClick={()=>choose(position)}><span aria-hidden="true"/></button>)}
    </div>
    <span className="material-gallery-announcement" role="status" aria-live="polite">{current.title}</span>
  </section>;
}
