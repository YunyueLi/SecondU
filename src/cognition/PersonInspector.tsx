import {useEffect, useRef, useState, type ReactNode} from 'react';
import type { Person, Relationship } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { ArrowRight, CloseBold, Edit } from '@openai/apps-sdk-ui/components/Icon';
import { t } from '../i18n';
import { PortraitView } from './PortraitView';
import { displayRole } from './display';

type Props = {
  person?: Person; people: Person[]; relationships: Relationship[]; focused?: string; readOnly: boolean;
  refs: (ids:string[], compact?:boolean)=>ReactNode;
  onClose:()=>void; onSelect:(id:string)=>void; onFocus:()=>void;
  onEditPerson:(person:Person)=>void; onEditRelationship:(relationship:Relationship)=>void;
};

export function PersonInspector(props:Props) {
  const rail=useRef<HTMLElement>(null);
  useEffect(()=>{const opener=document.activeElement instanceof HTMLElement?document.activeElement:undefined;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();props.onClose();if(opener?.isConnected)opener.focus();}};const target=rail.current;target?.addEventListener('keydown',key);return()=>target?.removeEventListener('keydown',key);},[props.onClose]);
  return <aside ref={rail} className="network-details person-inspector" aria-label={t('人物资料','Person details')}>
    <header className="person-inspector-toolbar"><span>{t('人物资料','Person details')}</span><Button uniform size="sm" color="secondary" variant="ghost" aria-label={t('关闭人物资料','Close person details')} onClick={props.onClose}><CloseBold/></Button></header>
    {props.person?<PersonContent key={props.person.id} {...props} person={props.person}/>:<div className="person-inspector-content"><p className="person-inspector-empty">{t('选择一位人物，查看背景与联系。','Select a person to see their background and connections.')}</p></div>}
  </aside>;
}

function PersonContent({person,people,relationships,focused,readOnly,refs,onSelect,onFocus,onEditPerson,onEditRelationship}:Props&{person:Person}){
  const [tab,setTab]=useState('overview');
  const [expanded,setExpanded]=useState(false);
  const related=relationships.filter(r=>r.from===person.id||r.to===person.id);
  const normalize=(text:string)=>text.replace(/\s+/g,'').trim();
  const entries=person.portrait?.entries||[];
  // When the same text has a structured status and source, keep that version.
  const duplicateBio=entries.some(entry=>normalize(entry.statement)===normalize(person.description||''));
  const sourceIds=[...new Set([...person.sourceIds,...entries.flatMap(entry=>entry.sourceIds),...related.flatMap(relation=>relation.sourceIds)])];
  return <>
    <div className="person-inspector-summary">
      <div className="person-inspector-identity"><span className="person-inspector-avatar">{person.name[0]}</span><div><h2>{person.name}</h2><p>{displayRole(person.role)}</p></div>{!readOnly&&<Button uniform size="sm" color="secondary" variant="ghost" aria-label={t('编辑人物资料','Edit person profile')} title={t('编辑资料','Edit profile')} onClick={()=>onEditPerson(person)}><Edit/></Button>}</div>
      <Button color="secondary" variant="ghost" size="sm" className="person-inspector-focus" onClick={onFocus}>{focused===person.id?t('查看全图','View full graph'):t('聚焦关系','Focus relationships')}<ArrowRight/></Button>
      <SegmentedControl value={tab} onChange={setTab} aria-label={t('人物资料视图','Person detail view')}><SegmentedControl.Option value="overview">{t('概览','Overview')}</SegmentedControl.Option><SegmentedControl.Option value="relations">{t('关系','Relations')} <small>{related.length}</small></SegmentedControl.Option><SegmentedControl.Option value="sources">{t('来源','Sources')} <small>{sourceIds.length}</small></SegmentedControl.Option></SegmentedControl>
    </div>
    <div className="person-inspector-content" key={tab}>
      {tab==='overview'?<>
        {person.description&&!duplicateBio&&<section className="person-inspector-intro"><h3>{t('简介','About')}</h3><p className={`person-inspector-bio ${expanded?'is-expanded':''}`}>{person.description}</p>{person.description.length>180&&<button type="button" className="person-text-toggle" onClick={()=>setExpanded(!expanded)}>{expanded?t('收起','Show less'):t('展开全文','Read more')}</button>}</section>}
        {entries.length>0&&<PortraitView person={person} refs={refs} relationships={related} compact/>}
        {!person.description&&!entries.length&&<p className="person-inspector-empty">{t('还没有人物简介。','No profile notes yet.')}</p>}
      </>:tab==='relations'?<>
        <div className="person-connection-list">{related.map(relation=>{const other=people.find(p=>p.id===(relation.from===person.id?relation.to:relation.from));return <article className="person-connection" key={relation.id}>
          <div className="person-connection-heading"><button onClick={()=>other&&onSelect(other.id)} disabled={!other}><span className="person-connection-avatar">{other?.name[0]||'?'}</span><span>{other?.name||t('未知人物','Unknown person')}</span><ArrowRight/></button><span className="person-connection-label">{relation.label}</span></div>
          <details className="person-connection-details"><summary>{t('关系详情','Details')}<ArrowRight/></summary><div>{relation.description&&<p>{relation.description}</p>}<div className="person-connection-foot">{refs(relation.sourceIds,true)}{!readOnly&&<Button uniform color="secondary" variant="ghost" size="sm" aria-label={t(`编辑与${other?.name||'此人'}的关系`,`Edit relationship with ${other?.name||'this person'}`)} title={t('编辑关系','Edit relationship')} onClick={()=>onEditRelationship(relation)}><Edit/></Button>}</div></div></details>
        </article>;})}</div>
        {!related.length&&<p className="person-inspector-empty">{t('还没有记录相关人物。','No connections recorded yet.')}</p>}
      </>:<div className="person-inspector-source-list">{sourceIds.length?refs(sourceIds):<p className="person-inspector-empty">{t('还没有关联资料来源。','No sources linked yet.')}</p>}</div>}
    </div>
  </>;
}
