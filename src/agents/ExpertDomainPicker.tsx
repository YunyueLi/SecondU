import { useState } from 'react';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Category, ChevronDown, PencilSquare, Code, Cube, BarChart, Flag, Pencil, Suitcase, DollarCircle, Group, CheckCircle, ShieldCheck, BuildingWorkspace, Globe, BookOpen, Home, Health, Compass, UserHeart } from '@openai/apps-sdk-ui/components/Icon';
import { EXPERT_CATEGORIES, expertText } from './expertTemplates';
import { getLocale, t } from '../i18n';

const icons:Record<string,typeof Category>={product:PencilSquare,engineering:Code,games:Cube,data:BarChart,marketing:Flag,creation:Pencil,sales:Suitcase,finance:DollarCircle,operations:Group,quality:CheckCircle,legal:ShieldCheck,industry:BuildingWorkspace,global:Globe,education:BookOpen,life:Home,health:Health,travel:Compass,relationships:UserHeart,custom:Category};
export function ExpertDomainIcon({id}:{id?:string}){const Icon=id?icons[id]||Category:Category;return <Icon/>;}
export function ExpertDomainPicker({value,onChange,available,includeCustom=false}:{value:string;onChange:(value:string)=>void;available?:readonly string[];includeCustom?:boolean}){
 const [open,setOpen]=useState(false),active=EXPERT_CATEGORIES.find(group=>group.id===value);
 const groups=EXPERT_CATEGORIES.filter(group=>!available||available.includes(group.id));
 function choose(id:string){onChange(id);setOpen(false);}
 return <Popover open={open} onOpenChange={setOpen}><Popover.Trigger><Button size="sm" color="secondary" variant="ghost" pill={false} className="expert-domain-trigger" aria-label={t('选择领域','Choose domain')}><ExpertDomainIcon id={value}/><span>{value==='custom'?t('自定义','Custom'):active?expertText(active.label,getLocale()):t('领域','Domain')}</span><ChevronDown/></Button></Popover.Trigger><Popover.Content side="bottom" align="start" width={376} minWidth="auto" className="expert-domain-popover"><button className="expert-any-domain" type="button" aria-pressed={value==='all'} onClick={()=>choose('all')}><Category/>{t('不限领域','Any domain')}</button>{[{id:'work',label:t('专业工作','Professional work')},{id:'life',label:t('生活与成长','Life and learning')}].map(section=>{const options=groups.filter(group=>group.section===section.id);return options.length?<section key={section.id}><h3>{section.label}</h3><div>{options.map(group=><button type="button" key={group.id} aria-pressed={value===group.id} onClick={()=>choose(group.id)}><ExpertDomainIcon id={group.id}/><span>{expertText(group.label,getLocale())}</span></button>)}</div></section>:null;})}{includeCustom&&<section><button type="button" aria-pressed={value==='custom'} onClick={()=>choose('custom')}><Category/>{t('自定义','Custom')}</button></section>}</Popover.Content></Popover>;
}
