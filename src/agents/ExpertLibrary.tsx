import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AgentProfile, Bootstrap } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { ExpertDomainPicker } from './ExpertDomainPicker';
import { ArrowRight, ArrowLeft, Search } from '@openai/apps-sdk-ui/components/Icon';
import { getLocale, t } from '../i18n';
import { AgentAvatar, AgentBadgeStage } from './AgentIdentity';
import { EXPERT_CATEGORIES, expertText, existingExpert, recommendExperts, expertShelf, filterExperts, type ExpertRecommendation } from './expertTemplates';
import { ExpertPreview } from './ExpertPreview';
import './experts.css';

type Props={navigation:ReactNode;data:Bootstrap;onCreated:(agent:AgentProfile)=>Promise<void>;onOpen:(agent:AgentProfile)=>void;onRefresh:()=>Promise<void>};

export function ExpertLibrary({navigation,data,onCreated,onOpen,onRefresh}:Props){
  const results=useRef<HTMLDivElement>(null),stage=useRef<HTMLElement>(null);
  const [preview,setPreview]=useState<ExpertRecommendation>();
  const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[view,setView]=useState('suggested'),[selectedId,setSelectedId]=useState('');
  const [face,setFace]=useState<'identity'|'role'|'history'>('identity');
  const recommendations=useMemo(()=>recommendExperts(data),[data.profile,data.facts,data.goals,data.sources]);
  const shelf=expertShelf(recommendations,data.agents),hasMatches=recommendations.some(item=>item.score>0);
  const suggested=view==='suggested'&&category==='all'&&!query.trim();
  const visible=suggested?shelf:filterExperts(recommendations,query,category);
  const selected=visible.find(item=>item.template.id===selectedId)||visible[0],selectedIndex=visible.findIndex(item=>item===selected);
  const avatarStyle=data.defaultAgentAvatarStyle||'pixelArt';
  const selectedName=selected?expertText(selected.template.name,getLocale()):'';
  const selectedGroup=selected?EXPERT_CATEGORIES.find(group=>group.id===selected.template.category):undefined;
  const added=selected?existingExpert(data.agents,selected.template):undefined;
  const previewAgent:AgentProfile|undefined=selected?{id:`expert-${selected.template.id}`,name:selectedName,role:expertText(selected.template.role,getLocale()),instructions:expertText(selected.template.instructions,getLocale()),avatarStyle,createdAt:''}:undefined;
  function choose(id:string,focus=false){setSelectedId(id);setFace('identity');if(focus)requestAnimationFrame(()=>results.current?.querySelector<HTMLButtonElement>(`[data-expert-id="${id}"]`)?.focus());}
  function step(offset:number){const item=visible[selectedIndex+offset];if(item){choose(item.template.id);requestAnimationFrame(()=>results.current?.querySelector(`[data-expert-id="${item.template.id}"]`)?.scrollIntoView({block:'nearest'}));}}
  useEffect(()=>{setFace('identity');},[selected?.template.id]);
  function flip(next:'identity'|'role'|'history'){setFace(next);requestAnimationFrame(()=>stage.current?.querySelector<HTMLButtonElement>(next==='identity'?'.ag-pass-face-front footer button':'.ag-pass-face-back header button')?.focus());}
  return <div className="expert-library-shell">
    <div className="ag-directory-toolbar expert-directory-toolbar">{navigation}<ExpertDomainPicker value={category} onChange={value=>{setCategory(value);setView('all');setSelectedId('');results.current?.scrollTo({top:0});}}/><Input size="md" variant="soft" startAdornment={<Search/>} aria-label={t('搜索专家和使用场景','Search experts and scenarios')} placeholder={t('搜索专家或要做的事','Search a role or task')} value={query} onChange={event=>{setQuery(event.target.value);if(event.target.value.trim())setView('all');setSelectedId('');results.current?.scrollTo({top:0});}}/>
        <div className="expert-view-modes"><div aria-label={t('专家浏览范围','Expert view')}>{[{id:'suggested',label:hasMatches?t('推荐','For you'):t('常用','Common')},{id:'all',label:t('全部','All')}].map(item=><button key={item.id} type="button" aria-pressed={view===item.id} onClick={()=>{setView(item.id);setCategory('all');setQuery('');setSelectedId('');results.current?.scrollTo({top:0});}}>{item.label}</button>)}</div></div>

      </div>
    <div className="expert-browser expert-badge-browser"><section className="expert-choice-panel" aria-label={t('专家目录','Expert catalogue')}>
      <div className="expert-choice-list" role="listbox" aria-label={t('选择专家','Choose an expert')} ref={results}>{visible.map((item,index)=>{
        const template=item.template,name=expertText(template.name,getLocale()),saved=existingExpert(data.agents,template);
        return <button className="expert-choice" role="option" aria-selected={selected?.template.id===template.id} tabIndex={selected?.template.id===template.id?0:-1} data-expert-id={template.id} key={template.id} onClick={()=>choose(template.id)} onKeyDown={event=>{const next=event.key==='ArrowDown'?index+1:event.key==='ArrowUp'?index-1:event.key==='Home'?0:event.key==='End'?visible.length-1:-1;if(next>=0&&next<visible.length){event.preventDefault();choose(visible[next].template.id,true);}}}>
          <AgentAvatar agent={{id:`expert-${template.id}`,name,avatarStyle}} size={31}/><span className="expert-choice-copy"><strong>{name}</strong><span>{expertText(template.role,getLocale())}</span></span><span className="expert-choice-index">{saved?<span className="expert-choice-saved">{t('已添加','Added')}</span>:String(index+1).padStart(2,'0')}</span>
        </button>;
      })}{!visible.length&&<div className="expert-empty"><h3>{t('没有匹配的专家','No matching experts')}</h3><p>{t('换一个任务词，或选择其他分类。','Try another task or category.')}</p><Button size="sm" color="secondary" variant="ghost" onClick={()=>{setQuery('');setCategory('all');setView('all');}}>{t('清除筛选','Clear filters')}</Button></div>}</div>
    </section>
    <section className="expert-showcase" aria-label={t('专家工牌预览','Expert badge preview')} ref={stage}>
      {selected&&previewAgent?<><header className="expert-showcase-header"><span>{expertText(selectedGroup!.label,getLocale())}</span><span>{String(selectedIndex+1).padStart(2,'0')} / {String(visible.length).padStart(2,'0')}</span></header>
        <div className="expert-showcase-stage"><AgentBadgeStage agent={previewAgent} face={face} onFaceChange={flip}/></div>
        <div className="expert-showcase-action"><Button color="primary" size="md" onClick={()=>added?onOpen(added):setPreview(selected)}>{added?t('打开我的 Agent','Open my agent'):t('了解并添加','Preview and add')}<ArrowRight/></Button></div>
        <footer className="expert-showcase-switcher"><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('上一位专家','Previous expert')} disabled={selectedIndex<=0} onClick={()=>step(-1)}><ArrowLeft/></Button><div className="expert-neighbor-strip">{visible.slice(Math.max(0,selectedIndex-1),Math.min(visible.length,Math.max(0,selectedIndex-1)+3)).map(item=>{const name=expertText(item.template.name,getLocale());return <button key={item.template.id} type="button" className={item===selected?'is-selected':''} aria-label={t(`切换到${name}`,`Switch to ${name}`)} aria-pressed={item===selected} onClick={()=>choose(item.template.id)}><AgentAvatar agent={{id:`expert-${item.template.id}`,name,avatarStyle}} size={28}/><span>{name}</span></button>;})}</div><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('下一位专家','Next expert')} disabled={selectedIndex>=visible.length-1} onClick={()=>step(1)}><ArrowRight/></Button></footer>
      </>:<div className="expert-showcase-empty"><p>{t('从目录中选择一位专家','Choose an expert from the catalogue')}</p></div>}
    </section>
    </div>
    {preview&&<ExpertPreview key={preview.template.id} item={preview} avatarStyle={avatarStyle} onClose={()=>setPreview(undefined)} onCreated={async agent=>{await onCreated(agent);setPreview(undefined);}}/>}
  </div>;
}
