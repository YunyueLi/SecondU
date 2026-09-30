import {useState} from 'react';
import {ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import {ScaledAgentBadge} from '../../src/agents/ScaledAgentBadge';
import {EXPERT_TEMPLATES,expertText} from '../../src/agents/expertTemplates';
import type {AgentProfile} from '../../shared/contracts';
import {useSiteLanguage} from './site-language';
import './expert-showcase.css';

const templates=['product-review','prototype-builder','writing-editor'].map(id=>EXPERT_TEMPLATES.find(template=>template.id===id)!);

/** Real catalogue entries and the same physical badge used by the desktop app. */
export default function ExpertShowcase(){
 const {language,t}=useSiteLanguage();
 const [faces,setFaces]=useState<Record<string,'identity'|'role'|'history'>>({});
 function explore(){
  window.dispatchEvent(new CustomEvent('secondu:explore',{detail:{route:'agents'}}));
  document.getElementById('experience')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 return <section className="site-section site-experts" id="experts" aria-labelledby="experts-heading">
  <div className="site-experts-heading"><div className="site-section-head"><h2 id="experts-heading">{t('为每件事，找到合适的专业能力。','The right expertise for what you want to do.')}</h2><p>{t('从研究、设计到写作，选择任务需要的专家。明确职责，配置模型、知识与工具，再由负责人协调每一项分工。','Choose experts for research, design, writing and more. Define their roles, models, knowledge and tools, with a lead to coordinate the work.')}</p></div><button className="site-experts-link" onClick={explore}>{t('查看专家','Explore experts')}<ArrowRight/></button></div>
  <div className="site-experts-stage" aria-label={t('可翻面的专家工牌','Interactive expert badges')}>
   {templates.map(template=>{
    const agent:AgentProfile={id:`expert-${template.id}`,name:expertText(template.name,language),role:expertText(template.role,language),instructions:expertText(template.instructions,language),avatarStyle:'pixelArt',createdAt:'2026-09-30'};
    return <div className="site-expert" key={agent.id}><ScaledAgentBadge agent={agent} face={faces[agent.id]||'identity'} onFaceChange={face=>setFaces(current=>({...current,[agent.id]:face}))}/><p className="site-expert-output">{expertText(template.outputs,language)}</p></div>;
   })}
  </div>
 </section>;
}
