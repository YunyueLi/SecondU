// Graph interactions follow https://obsidian.md/help/plugins/graph (checked 2026-09-29).
import { t } from '../i18n';
import { spaceStorageKey } from '../space';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Simulation } from 'd3-force';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Slider } from '@openai/apps-sdk-ui/components/Slider';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { Search, Plus, Minus, Expand, Settings, UserAdd, SidebarRight, CloseBold, ArrowRight, ChevronDown } from '@openai/apps-sdk-ui/components/Icon';
import type { Bootstrap, Person, Relationship } from '../../shared/contracts';
import { Empty, PageHeading, PageToolbar } from '../components';
import { PersonForm, RelationshipForm } from './RecordForms';
import { displayRole } from './display';
import { PersonInspector } from './PersonInspector';
import { fitGraphViewport, zoomGraphAt, screenToGraph, graphLabelOpacity, visibleGraphLabels, type GraphLabelCandidate, type GraphViewport } from './graphGeometry';
import { createGraphSimulation, applyGraphForces, graphScreenRadius, DEFAULT_GRAPH_FORCES, type GraphNode, type GraphLink, type GraphForces } from './graphLayout';
import { buildGraphFilterIndex, filterGraph } from '../../shared/graph-filtering.mjs';
import './explorer.css';

type Gesture={pointerId:number;x:number;y:number;viewport:GraphViewport;node?:GraphNode;nodeX:number;nodeY:number;moved:boolean};
type ColorGroup={id:number;query:string;color:string};
type Props={data:Bootstrap;refs:(ids:string[],compact?:boolean)=>ReactNode;onRefresh:()=>Promise<void>;readOnly?:boolean};
const reducedMotion=()=>document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const initialGroups:ColorGroup[]=[
  {id:0,query:'同事|项目协作',color:'#3c8ce0'},
  {id:1,query:'父亲|母亲|家人|姐姐|弟弟|共同研究',color:'#d99f20'},
  {id:2,query:'老师|导师|兴趣伙伴',color:'#9868b0'},
  {id:3,query:'同学|朋友',color:'#4eaa59'},
];
function savedGroups(fallback:ColorGroup[],readOnly:boolean):ColorGroup[]{
  if(readOnly)return fallback;
  try{const value=JSON.parse(localStorage.getItem(spaceStorageKey('hither.graph.groups'))||'null');if(Array.isArray(value)&&value.every(group=>typeof group.id==='number'&&typeof group.query==='string'&&/^#[0-9a-f]{6}$/i.test(group.color)))return value;}catch{}
  return fallback;
}
const groupColors=['#9b78d0','#639b88','#ce9568','#648fbd','#c57491'];

export function RelationshipGraph({data,refs,onRefresh,readOnly=false}:Props) {
  const graphIndex=useMemo(()=>buildGraphFilterIndex({people:data.people,relationships:data.relationships,sources:data.sources,selfPersonId:data.profile.selfPersonId}),[data.people,data.relationships,data.sources,data.profile.selfPersonId]);
  const [query,setQuery]=useState('');const [filter,setFilter]=useState('all');const [showOrphans,setShowOrphans]=useState(true);
  const [category,setCategory]=useState('all');const [circle,setCircle]=useState('all');
  const [source,setSource]=useState(()=>data.people.length>120&&graphIndex.sources.some(item=>item.id==='documented'&&item.count>0)?'documented':'all');
  const [searchOpen,setSearchOpen]=useState(false);
  const [selected,setSelected]=useState<string>();const [focused,setFocused]=useState<string>();const [hovered,setHovered]=useState<string>();
  const [detailsOpen,setDetailsOpen]=useState(false);const [settingsOpen,setSettingsOpen]=useState(false);
  const [showLabels,setShowLabels]=useState(false);const [labelThreshold,setLabelThreshold]=useState(.5);const [nodeSize,setNodeSize]=useState(1);const [linkWidth,setLinkWidth]=useState(1);
  const [settling,setSettling]=useState(true);
  const [forces,setForces]=useState<GraphForces>({...DEFAULT_GRAPH_FORCES});const [groups,setGroups]=useState<ColorGroup[]>(()=>savedGroups(data.profile.demo?initialGroups.map(group=>({...group})):[],readOnly));const nextGroup=useRef(Math.max(4,...groups.map(group=>group.id+1)));
  useEffect(()=>{if(!readOnly)try{localStorage.setItem(spaceStorageKey('hither.graph.groups'),JSON.stringify(groups));}catch{}},[groups,readOnly]);
  const [personForm,setPersonForm]=useState<{person?:Person}>();const [relationshipForm,setRelationshipForm]=useState<{relationship?:Relationship}>();
  const [nodes,setNodes]=useState<GraphNode[]>([]);const [viewport,setViewport]=useState<GraphViewport>({x:0,y:0,k:1});
  const stage=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),canvas=useRef<HTMLCanvasElement>(null),palette=useRef<HTMLDivElement>(null);
  const nodeMap=useRef(new Map<string,GraphNode>());const simulation=useRef<Simulation<GraphNode,GraphLink>|null>(null);const gesture=useRef<Gesture|null>(null);
  const manualViewport=useRef(false);const viewportRef=useRef(viewport);viewportRef.current=viewport;
  const people=useMemo(()=>new Map(data.people.map(person=>[person.id,person])),[data.people]);
  const relationLabels=[...new Set(data.relationships.map(relation=>relation.label))].sort();
  const personMatches=(person:Person,text:string)=>`${person.name} ${displayRole(person.role)} ${person.description}`.toLocaleLowerCase().includes(text.trim().toLocaleLowerCase());
  const {visibleIds,visibleRelations,matches}=useMemo(()=>filterGraph(graphIndex,{query,category,source,circle,relationship:filter,showOrphans,focused}),[graphIndex,query,category,source,circle,filter,showOrphans,focused]);
  const visibleKey=[...visibleIds].sort().join('|');const visibleRef=useRef(visibleIds);visibleRef.current=visibleIds;
  const canvasMode=visibleIds.size>120;
  const drawCanvas=useRef<()=>void>(()=>{});const drawFrame=useRef(0);
  const scheduleDraw=useCallback(()=>{if(!drawFrame.current)drawFrame.current=requestAnimationFrame(()=>{drawFrame.current=0;drawCanvas.current();});},[]);
  const publish=useCallback(()=>{if(canvasMode)scheduleDraw();else setNodes([...nodeMap.current.values()]);},[canvasMode,scheduleDraw]);
  const topology=JSON.stringify([visibleKey,visibleRelations.map(relation=>[relation.id,relation.from,relation.to])]);
  const person=selected?people.get(selected):undefined;
  const highlighted=hovered;const neighbors=new Set(highlighted?[highlighted,...visibleRelations.filter(relation=>relation.from===highlighted||relation.to===highlighted).flatMap(relation=>[relation.from,relation.to])]:[]);
  const nodeColors=new Map(data.people.map(person=>[person.id,groups.find(group=>group.query.trim()&&group.query.split('|').map(query=>query.trim()).filter(Boolean).some(query=>personMatches(person,query)))?.color||graphIndex.categories.find(item=>(graphIndex.personCategories.get(person.id)||[]).includes(item.id))?.color]));
  const isSelf=(id:string)=>data.profile.selfPersonId?id===data.profile.selfPersonId:id==='person-self'||(data.profile.demo&&(['本人','我','self','me'].includes((people.get(id)?.role||'').toLowerCase())||/^我[（(]/.test(people.get(id)?.role||'')));
  const radiusOf=(node:GraphNode,zoom=viewportRef.current.k)=>Math.max(visibleIds.size<=60?4:visibleIds.size<=250?2.5:1.5,graphScreenRadius(node.degree,zoom,nodeSize,isSelf(node.id)));
  const labelOpacity=(zoom:number,active=false)=>graphLabelOpacity(zoom,visibleIds.size<=60?0:visibleIds.size<=250?Math.min(labelThreshold,.15):labelThreshold,active);
  function labelVisibility(view:GraphViewport){
    const candidates:GraphLabelCandidate[]=[];const area=stage.current;
    for(const node of nodeMap.current.values()){
      if(!visibleIds.has(node.id)||labelOpacity(view.k,neighbors.has(node.id)||selected===node.id)<=0)continue;
      const active=selected===node.id||hovered===node.id;
      const x=(node.x||0)*view.k+view.x,y=(node.y||0)*view.k+view.y;
      if(area&&(x< -100||x>area.clientWidth+100||y< -40||y>area.clientHeight+40))continue;
      candidates.push({id:node.id,x:(node.x||0)*view.k+view.x,y:(node.y||0)*view.k+view.y,radius:radiusOf(node,view.k),text:people.get(node.id)?.name||'',fontSize:active?13:12,forced:hovered===node.id,priority:(active?1000:neighbors.has(node.id)?100:isSelf(node.id)?80:0)+node.degree});
    }
    return visibleGraphLabels(candidates);
  }
  const svgLabelIds=canvasMode?new Set<string>():labelVisibility(viewport);
  const settingsRef=useRef({forces,nodeSize});settingsRef.current={forces,nodeSize};const appliedSettings=useRef('');

  const fit=useCallback(()=>{const area=stage.current;if(!area||!area.clientWidth||!area.clientHeight)return;manualViewport.current=false;setViewport(fitGraphViewport([...nodeMap.current.values()].filter(node=>visibleRef.current.has(node.id)),area.clientWidth,area.clientHeight));},[]);
  useLayoutEffect(()=>{
    const degrees=new Map<string,number>();
    for(const relation of visibleRelations){if(!people.has(relation.from)||!people.has(relation.to))continue;degrees.set(relation.from,(degrees.get(relation.from)||0)+1);degrees.set(relation.to,(degrees.get(relation.to)||0)+1);}
    const nextNodes:GraphNode[]=data.people.filter(person=>visibleIds.has(person.id)).map(person=>({...nodeMap.current.get(person.id),id:person.id,degree:degrees.get(person.id)||0,fx:null,fy:null}));
    nodeMap.current=new Map(nextNodes.map(node=>[node.id,node]));
    const links:GraphLink[]=visibleRelations.filter(relation=>nodeMap.current.has(relation.from)&&nodeMap.current.has(relation.to)).map(relation=>({id:relation.id,source:relation.from,target:relation.to}));
    const current=settingsRef.current;const force=createGraphSimulation(nextNodes,links,current.forces,current.nodeSize);simulation.current=force;
    setNodes([...nextNodes]);setSettling(true);manualViewport.current=false;appliedSettings.current=JSON.stringify(current);
    force.on('tick',publish).on('end',()=>{if(!manualViewport.current)fit();});
    // Settle in short frames so large graphs never block navigation or input.
    // Reduced motion keeps the geometry hidden until the same calculation finishes.
    let frame=0,ticks=0,cancelled=false;
    const settle=()=>{
      const deadline=performance.now()+8;
      do{force.tick();ticks++;}while(ticks<300&&performance.now()<deadline);
      if(cancelled)return;
      if(!reducedMotion()||ticks>=300){publish();if(!manualViewport.current)fit();}
      if(ticks<300)frame=requestAnimationFrame(settle);else setSettling(false);
    };
    frame=requestAnimationFrame(settle);
    return()=>{cancelled=true;cancelAnimationFrame(frame);force.stop();simulation.current=null;};
  // Rebuild topology only; unchanged records and locale switches preserve geometry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[topology,canvasMode,publish,fit]);
  useEffect(()=>{
    const signature=JSON.stringify({forces,nodeSize});const force=simulation.current;if(!force||signature===appliedSettings.current)return;
    appliedSettings.current=signature;manualViewport.current=false;applyGraphForces(force,forces,nodeSize);force.alpha(.65);
    if(reducedMotion()){force.stop().tick(150);publish();fit();}else force.restart();
  },[forces,nodeSize,publish,fit]);
  useLayoutEffect(()=>{fit();},[visibleKey,fit]);
  useEffect(()=>{if(selected&&!visibleRef.current.has(selected)){setSelected(undefined);setDetailsOpen(false);}setHovered(undefined);},[selected,visibleKey]);
  useLayoutEffect(()=>{
    const area=stage.current;if(!area)return;let previous={width:area.clientWidth,height:area.clientHeight};
    const observer=new ResizeObserver(()=>{const next={width:area.clientWidth,height:area.clientHeight};if(!next.width||!next.height)return;if(!manualViewport.current)fit();else setViewport(current=>({...current,x:current.x+(next.width-previous.width)/2,y:current.y+(next.height-previous.height)/2}));previous=next;scheduleDraw();});
    observer.observe(area);return()=>observer.disconnect();
  },[fit,scheduleDraw]);
  useEffect(()=>{
    const surface=canvasMode?canvas.current:svg.current;if(!surface)return;
    const wheel=(event:Event)=>{if(!(event instanceof WheelEvent))return;event.preventDefault();if(gesture.current)return;manualViewport.current=true;const rect=surface.getBoundingClientRect();const factor=Math.exp(-event.deltaY*(event.deltaMode===1?.04:.002));setViewport(current=>zoomGraphAt(current,factor,event.clientX-rect.left,event.clientY-rect.top));};
    surface.addEventListener('wheel',wheel,{passive:false});return()=>surface.removeEventListener('wheel',wheel);
  },[canvasMode,nodes.length>0]);

  drawCanvas.current=()=>{
    const surface=canvas.current,area=stage.current;if(!canvasMode||!surface||!area)return;const ctx=surface.getContext('2d');if(!ctx)return;
    const width=area.clientWidth,height=area.clientHeight,ratio=window.devicePixelRatio||1;
    if(surface.width!==Math.round(width*ratio)||surface.height!==Math.round(height*ratio)){surface.width=Math.round(width*ratio);surface.height=Math.round(height*ratio);}
    const color=(name:string,fallback:string)=>{const element=palette.current?.querySelector(`.${name}`);return element?getComputedStyle(element).color:fallback;};
    const primary=color('primary','#333'),secondary=color('secondary','#929292'),edge=color('edge','#d3d3d3'),accent=color('accent','#8b6dcc'),background=color('background','#fff');const view=viewportRef.current;
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);ctx.translate(view.x,view.y);ctx.scale(view.k,view.k);
    for(const active of [false,true]){ctx.beginPath();for(const relation of visibleRelations){if((relation.from===highlighted||relation.to===highlighted)!==active)continue;const a=nodeMap.current.get(relation.from),b=nodeMap.current.get(relation.to);if(!a||!b)continue;ctx.moveTo(a.x||0,a.y||0);ctx.lineTo(b.x||0,b.y||0);}ctx.strokeStyle=active?accent:edge;ctx.lineWidth=linkWidth*(active?1.25:.8)/view.k;ctx.globalAlpha=active?.9:highlighted?.14:.65;ctx.stroke();}
    ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.lineJoin='round';const font=getComputedStyle(surface).fontFamily,labelScale=view.k,labelIds=labelVisibility(view);
    for(const relation of visibleRelations){const active=relation.from===highlighted||relation.to===highlighted;if(!showLabels&&!active)continue;const a=nodeMap.current.get(relation.from),b=nodeMap.current.get(relation.to);if(!a||!b)continue;const x=((a.x||0)+(b.x||0))/2,y=((a.y||0)+(b.y||0))/2-7/labelScale;ctx.globalAlpha=highlighted&&!active?.15:1;ctx.font=`${10/labelScale}px ${font}`;ctx.lineWidth=4/labelScale;ctx.strokeStyle=background;ctx.strokeText(relation.label,x,y);ctx.fillStyle=active?accent:secondary;ctx.fillText(relation.label,x,y);}
    for(const node of nodeMap.current.values()){
      if(!visibleIds.has(node.id))continue;const x=node.x||0,y=node.y||0,screenX=x*view.k+view.x,screenY=y*view.k+view.y;if(screenX< -100||screenX>width+100||screenY< -60||screenY>height+60)continue;
      const radius=radiusOf(node,view.k)/view.k,muted=!!highlighted&&!neighbors.has(node.id),active=selected===node.id||hovered===node.id;
      ctx.globalAlpha=muted?.16:1;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fillStyle=active?accent:nodeColors.get(node.id)||secondary;ctx.fill();
      const opacity=labelOpacity(view.k,neighbors.has(node.id)||selected===node.id);if(labelIds.has(node.id)){ctx.globalAlpha=opacity*(muted?.16:1);const name=people.get(node.id)?.name||'',labelY=y+radius+14/labelScale;ctx.font=`${active?500:400} ${(active?13:12)/labelScale}px ${font}`;ctx.lineWidth=4/labelScale;ctx.strokeStyle=background;ctx.strokeText(name,x,labelY);ctx.fillStyle=active?accent:secondary;ctx.fillText(name,x,labelY);}
    }
    ctx.globalAlpha=1;
  };
  useEffect(()=>{scheduleDraw();},[viewport,selected,hovered,focused,filter,showLabels,labelThreshold,nodeSize,linkWidth,groups,nodes,canvasMode,visibleKey,data.people,data.relationships,scheduleDraw]);
  useEffect(()=>{const observer=new MutationObserver(scheduleDraw);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});observer.observe(document.body,{attributes:true,attributeFilter:['class','style','data-theme']});const media=matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',scheduleDraw);return()=>{observer.disconnect();media.removeEventListener('change',scheduleDraw);cancelAnimationFrame(drawFrame.current);drawFrame.current=0;};},[scheduleDraw]);

  function hitNode(clientX:number,clientY:number){const area=stage.current;if(!area)return;const rect=area.getBoundingClientRect(),view=viewportRef.current;const point=screenToGraph(view,clientX-rect.left,clientY-rect.top);let nearest:GraphNode|undefined,distance=Infinity;for(const node of nodeMap.current.values()){if(!visibleIds.has(node.id))continue;const candidate=Math.hypot((node.x||0)-point.x,(node.y||0)-point.y);if(candidate<Math.max(12,radiusOf(node)+4)/view.k&&candidate<distance){nearest=node;distance=candidate;}}return nearest;}
  function select(id:string,center=false){setSelected(id);setDetailsOpen(true);if(center){const node=nodeMap.current.get(id),area=stage.current;if(node&&area){manualViewport.current=true;setViewport(current=>({...current,x:area.clientWidth/2-(node.x||0)*current.k,y:area.clientHeight/2-(node.y||0)*current.k}));}}}
  function startGesture(event:ReactPointerEvent<SVGElement|HTMLCanvasElement>,node?:GraphNode){if(event.button!==0)return;event.preventDefault();event.stopPropagation();const surface=canvasMode?canvas.current:svg.current;surface?.focus({preventScroll:true});surface?.setPointerCapture(event.pointerId);gesture.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,viewport:viewportRef.current,node,nodeX:node?.x||0,nodeY:node?.y||0,moved:false};if(node){node.fx=node.x;node.fy=node.y;}}
  function moveGesture(event:ReactPointerEvent<SVGSVGElement|HTMLCanvasElement>){const current=gesture.current;if(canvasMode&&!current)setHovered(hitNode(event.clientX,event.clientY)?.id);if(!current||current.pointerId!==event.pointerId)return;const dx=event.clientX-current.x,dy=event.clientY-current.y;if(Math.hypot(dx,dy)>3){current.moved=true;manualViewport.current=true;}if(!current.moved)return;if(current.node){current.node.fx=current.nodeX+dx/current.viewport.k;current.node.fy=current.nodeY+dy/current.viewport.k;current.node.x=current.node.fx;current.node.y=current.node.fy;const force=simulation.current;if(force){if(reducedMotion())force.alpha(.3).alphaTarget(0).stop().tick(3);else force.alphaTarget(.12).restart();}publish();}else setViewport({...current.viewport,x:current.viewport.x+dx,y:current.viewport.y+dy});}
  function endGesture(event:ReactPointerEvent<SVGSVGElement|HTMLCanvasElement>){const current=gesture.current;if(!current||current.pointerId!==event.pointerId)return;gesture.current=null;if(current.node){current.node.fx=null;current.node.fy=null;simulation.current?.alphaTarget(0);if(current.moved&&reducedMotion()){simulation.current?.stop().tick(100);publish();}if(!current.moved&&event.type==='pointerup')select(current.node.id);}else if(!current.moved&&event.type==='pointerup'){setSelected(undefined);setDetailsOpen(false);}if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
  function zoom(factor:number){const area=stage.current;if(!area)return;manualViewport.current=true;setViewport(current=>zoomGraphAt(current,factor,area.clientWidth/2,area.clientHeight/2));}
  function canvasKey(event:ReactKeyboardEvent<SVGSVGElement|HTMLCanvasElement>){
    if(canvasMode&&['n','p','Enter'].includes(event.key)){
      event.preventDefault();
      if(event.key==='Enter'){if(hovered)select(hovered,true);return;}
      const ids=[...visibleIds],index=ids.indexOf(hovered||'');
      const id=ids[(index+(event.key==='n'?1:ids.length-1)+ids.length)%ids.length];
      if(id){setHovered(id);const node=nodeMap.current.get(id),area=stage.current;if(node&&area){manualViewport.current=true;setViewport(current=>({...current,x:area.clientWidth/2-(node.x||0)*current.k,y:area.clientHeight/2-(node.y||0)*current.k}));}}return;
    }
if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home','Escape'].includes(event.key))event.preventDefault();if(event.key==='+'||event.key==='=')zoom(1.2);else if(event.key==='-')zoom(1/1.2);else if(event.key==='Home')fit();else if(event.key==='Escape'){setHovered(undefined);setSelected(undefined);setDetailsOpen(false);}else if(event.key.startsWith('Arrow')){manualViewport.current=true;const step=event.shiftKey?120:40;setViewport(current=>({...current,x:current.x+(event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0),y:current.y+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0)}));}}
  function clearFilters(){setQuery('');setFilter('all');setCategory('all');setCircle('all');setSource('all');setFocused(undefined);setShowOrphans(true);setSearchOpen(false);}
  function resetSettings(){clearFilters();setShowOrphans(true);setShowLabels(false);setLabelThreshold(.5);setNodeSize(1);setLinkWidth(1);setGroups(data.profile.demo?initialGroups.map(group=>({...group})):[]);setForces({...DEFAULT_GRAPH_FORCES});fit();}

  return <div className={`network-workspace ${detailsOpen?'has-details':''}`}>
    <header className="network-header">
      <PageHeading title={t('关系图谱','Relationships')} description={t('查看人物联系、关系分组与关联记录。','Explore connections, groups and related records.')} compactDescription={t('查看人物联系与关联记录。','Explore people and connections.')} illustration="/art/page-connections-v2.png" action={<div className="network-toolbar">
      {!readOnly&&<Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="sm" uniform aria-label={t('添加人物或关系','Add a person or relationship')} title={t('添加','Add')}><Plus/></Button></Menu.Trigger><Menu.Content align="end" minWidth={180}><Menu.Item onSelect={()=>setPersonForm({})}><UserAdd/>{t('添加人物','Add person')}</Menu.Item><Menu.Item disabled={data.people.length<2} onSelect={()=>setRelationshipForm({})}><Plus/>{t('添加关系','Add relationship')}</Menu.Item></Menu.Content></Menu>}
      {selected&&<Button color="secondary" variant="ghost" size="sm" uniform aria-label={detailsOpen?t('收起人物资料','Hide person details'):t('展开人物资料','Show person details')} title={t('人物资料','Person details')} aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(!detailsOpen)}><SidebarRight/></Button>}
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}><Popover.Trigger><Button color="secondary" variant="ghost" size="sm" uniform aria-label={t('图谱设置','Graph settings')} title={t('图谱设置','Graph settings')}><Settings/>{(query||filter!=='all'||!showOrphans)&&<span className="network-filter-dot"/>}</Button></Popover.Trigger><Popover.Content align="end" side="bottom" width={300} minWidth="auto"><div className="network-settings">
        <header><strong>{t('图谱设置','Graph settings')}</strong><Button color="secondary" variant="ghost" size="sm" onClick={resetSettings}>{t('恢复默认','Reset')}</Button></header>
        <details open><summary>{t('更多筛选','More filters')}</summary><div className="network-setting-fields"><Select value={filter} options={[{value:'all',label:t('所有关系标签','All relationship labels')},...relationLabels.map(label=>({value:label,label}))]} onChange={option=>setFilter(option.value)} aria-label={t('关系标签','Relationship label')}/><Checkbox checked={showOrphans} onCheckedChange={setShowOrphans} label={t('显示未关联人物','Show unconnected people')}/></div></details>
        <details><summary>{t('分组','Groups')}{groups.length>0&&<small>{groups.length}</small>}</summary><div className="network-setting-fields"><p>{t('关键词决定人物颜色，用 | 分隔多个关键词。优先采用第一个匹配分组。','Color people by keyword. The first matching group takes precedence.')}</p>{groups.map(group=><div className="network-color-group" key={group.id}><input type="color" value={group.color} aria-label={t('分组颜色','Group color')} onChange={event=>setGroups(current=>current.map(item=>item.id===group.id?{...item,color:event.target.value}:item))}/><Input variant="soft" size="sm" placeholder={t('姓名或角色关键词','Name or role keyword')} aria-label={t('分组关键词','Group keyword')} value={group.query} onChange={event=>setGroups(current=>current.map(item=>item.id===group.id?{...item,query:event.target.value}:item))}/><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('移除分组','Remove group')} onClick={()=>setGroups(current=>current.filter(item=>item.id!==group.id))}><CloseBold/></Button></div>)}<Button color="secondary" variant="ghost" size="sm" onClick={()=>setGroups(current=>[...current,{id:nextGroup.current++,query:'',color:groupColors[current.length%groupColors.length]}])}><Plus/>{t('新建分组','New group')}</Button></div></details>
        <details><summary>{t('显示','Display')}</summary><div className="network-setting-fields"><Slider label={t('文字显示阈值','Text fade threshold')} value={labelThreshold} min={0} max={2} step={.05} onChange={setLabelThreshold}/><Slider label={t('节点大小','Node size')} value={nodeSize} min={.5} max={2} step={.1} onChange={setNodeSize}/><Slider label={t('连线粗细','Link thickness')} value={linkWidth} min={.3} max={2} step={.1} onChange={setLinkWidth}/><Checkbox label={t('显示关系名称','Show relationship labels')} checked={showLabels} onCheckedChange={setShowLabels}/></div></details>
        <details><summary>{t('力学','Forces')}</summary><div className="network-setting-fields"><Slider label={t('向心力','Center force')} value={forces.center} min={0} max={100} step={1} onChange={center=>setForces(current=>({...current,center}))}/><Slider label={t('排斥力','Repel force')} value={forces.repel} min={0} max={600} step={10} onChange={repel=>setForces(current=>({...current,repel}))}/><Slider label={t('连线引力','Link force')} value={forces.link} min={0} max={100} step={1} onChange={link=>setForces(current=>({...current,link}))}/><Slider label={t('连线距离','Link distance')} value={forces.distance} min={30} max={250} step={5} onChange={distance=>setForces(current=>({...current,distance}))}/></div></details>
      </div></Popover.Content></Popover>
    </div>} />
      <PageToolbar className="network-filter-bar" label={t('关系图谱筛选','Relationship filters')}>
        <div className="network-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setSearchOpen(false);}}>
          <Input variant="outline" size="md" startAdornment={<Search/>} aria-label={t('搜索人物','Search people')} placeholder={t('搜索姓名、角色或背景','Search name, role, or context')} value={query} onFocus={()=>setSearchOpen(true)} onChange={event=>{setQuery(event.target.value);setFocused(undefined);setSearchOpen(true);}} onKeyDown={event=>{if(event.key==='Escape'){setQuery('');setSearchOpen(false);}if(event.key==='Enter'&&matches.length){select(matches[0].id,true);setSearchOpen(false);}}}/>
          {searchOpen&&query.trim()&&<div className="network-search-results" role="list" aria-label={t('匹配人物','Matching people')}><p>{t(`${matches.length} 位匹配人物`,`${matches.length} matching people`)}</p>{matches.slice(0,8).map(record=><button key={record.id} type="button" onClick={()=>{select(record.id,true);setSearchOpen(false);}}><span className="network-search-avatar">{record.name.slice(0,1)}</span><span><strong>{record.name}</strong><small>{displayRole(record.role)}</small></span><ArrowRight/></button>)}{matches.length===0&&<span>{t('试试其他姓名或调整筛选','Try another name or change the filters')}</span>}</div>}
        </div>
        <Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="sm" pill={false} className="network-source-filter" aria-label={t('资料范围','Source scope')}><span>{source==='all'?t('全部人物','All people'):t(graphIndex.sources.find(item=>item.id===source)?.label||'',graphIndex.sources.find(item=>item.id===source)?.labelEn||'')}</span><ChevronDown/></Button></Menu.Trigger><Menu.Content align="end" minWidth={208}><Menu.RadioGroup value={source} onChange={value=>{setSource(value);setFocused(undefined);}}><Menu.RadioItem value="all">{t('全部人物','All people')}<small className="network-menu-count">{data.people.length}</small></Menu.RadioItem>{graphIndex.sources.filter(item=>item.count>0).map(item=><Menu.RadioItem key={item.id} value={item.id}>{t(item.label,item.labelEn)}<small className="network-menu-count">{item.count}</small></Menu.RadioItem>)}</Menu.RadioGroup></Menu.Content></Menu>
        <Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="sm" pill={false} className="network-source-filter network-circle-filter" aria-label={t('人物圈层','People circles')}><span>{circle==='all'?t('所有圈层','All circles'):circle}</span><ChevronDown/></Button></Menu.Trigger><Menu.Content align="end" minWidth={220} maxHeight={320}><Menu.RadioGroup value={circle} onChange={value=>{setCircle(value);setFocused(undefined);}}><Menu.RadioItem value="all">{t('所有圈层','All circles')}</Menu.RadioItem>{graphIndex.circles.map(item=><Menu.RadioItem key={item.id} value={item.id}>{item.label}<small className="network-menu-count">{item.count}</small></Menu.RadioItem>)}</Menu.RadioGroup></Menu.Content></Menu>
        <Select size="md" block={false} value={category} options={[{value:'all',label:t('全部关系','All relationships')},...graphIndex.categories.filter(item=>item.count>0).map(item=>({value:item.id,label:t(item.label,item.labelEn)}))]} onChange={option=>{setCategory(option.value);setFocused(undefined);}} aria-label={t('关系分类','Relationship category')}/>
        {(query||filter!=='all'||category!=='all'||circle!=='all'||source!=='all'||focused||!showOrphans)&&<Button color="secondary" variant="ghost" size="sm" onClick={clearFilters}>{t('重置','Reset')}</Button>}
      </PageToolbar>
    </header>
    <div className={`network-body ${detailsOpen?'has-details':''}`}>
      <div className={`network-stage ${settling&&reducedMotion()?'is-settling':''}`} ref={stage}>
      {settling&&<span className="network-settling" role="status">{t('正在整理关系布局','Arranging connections')}</span>}
      {canvasMode&&<span className="sr-only" aria-live="polite">{hovered?people.get(hovered)?.name:''}</span>}
        {focused&&<div className="network-focus-label"><Badge color="secondary" variant="soft">{t(`${people.get(focused)?.name}的局部图谱`,`${people.get(focused)?.name}'s connections`)}</Badge><Button color="secondary" variant="ghost" size="sm" onClick={()=>setFocused(undefined)}>{t('退出','Exit')}</Button></div>}
        <div ref={palette} className="network-palette" aria-hidden="true"><span className="primary"/><span className="secondary"/><span className="edge"/><span className="accent"/><span className="background"/></div>
        {nodes.length?canvasMode?<canvas ref={canvas} className="network-canvas" role="img" tabIndex={0} onKeyDown={canvasKey} aria-label={t('人物关系图。悬停查看连接，点击查看资料。方向键平移，加减键缩放，Home 适应视图。N 或 P 选择人物，Enter 打开资料。','Relationship graph. Hover to highlight connections, click for details. Arrow keys pan, plus and minus zoom, Home fits the view. N or P selects a person, Enter opens details.')} onPointerDown={event=>startGesture(event,hitNode(event.clientX,event.clientY))} onPointerMove={moveGesture} onPointerLeave={()=>{if(!gesture.current)setHovered(undefined);}} onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={endGesture} onDoubleClick={event=>{const node=hitNode(event.clientX,event.clientY);if(node){setFocused(node.id);select(node.id);}}}/>:<svg ref={svg} className="network-canvas" role="group" tabIndex={0} onKeyDown={canvasKey} aria-label={t('人物关系图。拖动人物调整位置，拖动画布平移，滚轮缩放。方向键平移，Shift 加速，加减键缩放，Home 适应视图。','Relationship graph. Drag a person to move it, drag the canvas to pan, scroll to zoom. Arrow keys pan, Shift moves faster, plus and minus zoom, Home fits the view. N or P selects a person, Enter opens details.')} onPointerDown={event=>startGesture(event)} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={endGesture} onPointerLeave={()=>{if(!gesture.current)setHovered(undefined);}}>
          <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.k})`}>
            {visibleRelations.map(relation=>{const a=nodeMap.current.get(relation.from),b=nodeMap.current.get(relation.to);if(!a||!b)return null;const active=relation.from===highlighted||relation.to===highlighted;return <g key={relation.id} className={`network-edge ${active?'is-highlighted':''} ${highlighted&&!active?'is-muted':''}`}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" style={{strokeWidth:linkWidth*(active?1.25:.8)}}/>{(showLabels||active)&&<text x={((a.x||0)+(b.x||0))/2} y={((a.y||0)+(b.y||0))/2-7/viewport.k} style={{fontSize:10/viewport.k,strokeWidth:4/viewport.k}} textAnchor="middle">{relation.label}</text>}</g>;})}
            {nodes.filter(node=>visibleIds.has(node.id)).map(node=>{const record=people.get(node.id);if(!record)return null;const radius=radiusOf(node)/viewport.k,labelScale=viewport.k,active=selected===node.id||hovered===node.id,opacity=labelOpacity(viewport.k,neighbors.has(node.id)||selected===node.id);return <g key={node.id} transform={`translate(${node.x||0},${node.y||0})`} className={`network-node ${selected===node.id||hovered===node.id?'is-selected':''} ${highlighted&&!neighbors.has(node.id)?'is-muted':''}`} style={{'--graph-group-color':nodeColors.get(node.id)} as CSSProperties} role="button" tabIndex={0} aria-label={t(`查看${record.name}的关系`,`View relationships for ${record.name}`)} aria-pressed={selected===node.id} onPointerDown={event=>startGesture(event,node)} onPointerEnter={()=>{if(!gesture.current)setHovered(node.id);}} onPointerLeave={()=>{if(!gesture.current)setHovered(undefined);}} onDoubleClick={()=>{setFocused(node.id);select(node.id);}} onFocus={()=>setHovered(node.id)} onBlur={()=>setHovered(undefined)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();select(node.id,true);}}}>
              <title>{record.name} — {displayRole(record.role)}</title><circle className="network-node-hit" r={Math.max(12/viewport.k,radius+4/viewport.k)}/><circle className="network-node-ring" r={radius+3/viewport.k} vectorEffect="non-scaling-stroke"/><circle className="network-node-dot" r={radius}/>{svgLabelIds.has(node.id)&&<text y={radius+14/labelScale} style={{fontSize:(active?13:12)/labelScale,strokeWidth:4/labelScale,opacity}} textAnchor="middle">{record.name}</text>}
            </g>;})}
          </g>
        </svg>:data.people.length?null:<div className="network-empty"><Empty title={readOnly?t('这里还没有人物','No people yet'):t('从一位熟悉的人开始','Add your first person')} description={readOnly?undefined:t('添加人物与关系，让背景在这里连接起来。','Add people and their relationships.')} action={!readOnly&&<Button color="secondary" variant="outline" onClick={()=>setPersonForm({})}>{t('添加人物','Add person')}</Button>}/></div>}
        {!!data.people.length&&!visibleIds.size&&<div className="network-empty"><Empty title={t('没有符合筛选的人物','No people match this filter')} action={<Button color="secondary" variant="outline" onClick={clearFilters}>{t('清除筛选','Clear filters')}</Button>}/></div>}
        <div className="network-map-controls"><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('放大图谱','Zoom in')} title={t('放大','Zoom in')} onClick={()=>zoom(1.2)}><Plus/></Button><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('缩小图谱','Zoom out')} title={t('缩小','Zoom out')} onClick={()=>zoom(1/1.2)}><Minus/></Button><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('适应全部可见人物','Fit visible people')} title={t('适应视图','Fit view')} onClick={fit}><Expand/></Button></div>
        <div className="network-map-caption"><span>{t(`显示 ${visibleIds.size.toLocaleString()} / ${data.people.length.toLocaleString()} 位人物`,`${visibleIds.size.toLocaleString()} / ${data.people.length.toLocaleString()} people`)}</span><span>{t(`${visibleRelations.length} 段关系`,`${visibleRelations.length} relationships`)}</span><span>{t('双击人物查看局部图谱','Double-click a person for a local graph')}</span></div>
      </div>

    </div>
      {detailsOpen&&<PersonInspector person={person} isSelf={isSelf} people={data.people} relationships={data.relationships} focused={focused} readOnly={readOnly} refs={refs} onClose={()=>setDetailsOpen(false)} onSelect={id=>{clearFilters();setFocused(id);select(id,true);}} onFocus={()=>person&&setFocused(focused===person.id?undefined:person.id)} onEditPerson={person=>setPersonForm({person})} onEditRelationship={relationship=>setRelationshipForm({relationship})}/>}
    {!readOnly&&personForm&&<PersonForm person={personForm.person} data={data} onClose={()=>setPersonForm(undefined)} onSaved={onRefresh}/>}
    {!readOnly&&relationshipForm&&<RelationshipForm relationship={relationshipForm.relationship} data={data} onClose={()=>setRelationshipForm(undefined)} onSaved={onRefresh}/>}
  </div>;
}
