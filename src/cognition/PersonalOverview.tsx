import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Bootstrap, Fact, LifeEvent, Person } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { ArrowRight, ChevronDown, Document, X } from '@openai/apps-sdk-ui/components/Icon';
import { PageHeading, when } from '../components';
import { getLocale, t } from '../i18n';
import './personal-overview.css';
import { SectionLink, SectionHeading } from '../design-system/SectionLink';

type Refs = (ids: string[], compact?: boolean) => ReactNode;
type Selection = {kind:'fact';value:Fact}|{kind:'event';value:LifeEvent}|{kind:'person';value:Person};
const factStatus = (fact:Fact) => ({confirmed:t('已确认','Confirmed'),candidate:t('待确认','To confirm'),inferred:t('推断','Inferred'),superseded:t('已替代','Superseded')}[fact.status]);
const count = (value:number) => new Intl.NumberFormat(getLocale()).format(value);

export function PersonalOverview({data,refs,onEdit,onHistory,onCreateTask}:{data:Bootstrap;refs:Refs;onEdit:(fact:Fact)=>void;onHistory:(fact:Fact)=>void;onCreateTask:(prompt:string,factIds?:string[])=>void|Promise<void>}) {
  const [selection,setSelected] = useState<Selection>();
  let selected = selection;
  if(selection?.kind==='fact'){const value=data.facts.find(fact=>fact.id===selection.value.id);selected=value?{kind:'fact',value}:undefined;}
  const [expanded,setExpanded] = useState<Record<string,boolean>>({});
  const detailRef = useRef<HTMLElement>(null);
  const facts = data.facts.filter(fact=>fact.status==='confirmed');
  const unresolved=data.facts.filter(fact=>fact.status==='candidate'||fact.status==='inferred');
  const capabilities=facts.filter(fact=>fact.kind==='capability');
  const preferences=facts.filter(fact=>fact.kind==='preference');
  const stylePreferences=preferences.filter(fact=>fact.preferenceDomain==='taste');
  const generalPreferences=preferences.filter(fact=>!fact.preferenceDomain||fact.preferenceDomain==='general');
  const ways=[...preferences.filter(fact=>fact.preferenceDomain==='work'),...facts.filter(fact=>fact.kind==='value'||fact.kind==='decision')];
  const overviewFacts=[...ways,...generalPreferences,...stylePreferences].slice(0,2);
  const overviewIds=new Set(overviewFacts.map(fact=>fact.id));
  const remainingWays=ways.filter(fact=>!overviewIds.has(fact.id));
  const remainingTaste=stylePreferences.filter(fact=>!overviewIds.has(fact.id));
  const remainingPreferences=generalPreferences.filter(fact=>!overviewIds.has(fact.id));
  const constraints=facts.filter(fact=>fact.kind==='constraint');
  const peopleById=new Map(data.people.map(person=>[person.id,person]));
  const self=peopleById.get(data.profile.selfPersonId??'person-self');
  const events=data.events.filter(event=>(self?event.personIds.includes(self.id):event.personIds.length===0)&&event.scope!=='note').sort((a,b)=>a.date.localeCompare(b.date));
  const direct=self?data.relationships.filter(relation=>relation.from===self.id||relation.to===self.id).map(relation=>({relation,person:peopleById.get(relation.from===self.id?relation.to:relation.from)})).filter((row):row is typeof row & {person:Person}=>!!row.person):[];
  const relationGroups=[{id:'family',label:t('家人','Family'),rows:direct.filter(({relation})=>/父|母|家|兄|弟|姐|妹|伴侣|爱人|配偶/.test(relation.label))},{id:'friends',label:t('朋友','Friends'),rows:direct.filter(({relation})=>/朋友|同学|邻居/.test(relation.label))}];
  const grouped=new Set(relationGroups.flatMap(group=>group.rows.map(row=>row.relation.id)));
  relationGroups.push({id:'work',label:t('协作与往来','Work and connections'),rows:direct.filter(({relation})=>!grouped.has(relation.id))});
  for(const group of relationGroups)group.rows=[...new Map(group.rows.map(row=>[row.person.id,row])).values()];
  const goals=data.goals.filter(goal=>goal.status==='active').sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
  function select(value:Selection){setSelected(value);if(window.matchMedia('(max-width: 800px)').matches)requestAnimationFrame(()=>detailRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));}
  function more(key:string){setExpanded(previous=>({...previous,[key]:!previous[key]}));}
  function factRows(items:Fact[],key:string,empty:string,limit=3){return <><div className="portrait-fact-list">{(expanded[key]?items:items.slice(0,limit)).map(fact=><button key={fact.id} type="button" className={`portrait-fact-row ${selected?.kind==='fact'&&selected.value.id===fact.id?'is-selected':''}`} onClick={()=>select({kind:'fact',value:fact})}><span className="portrait-fact-copy"><span className="portrait-fact-text">{fact.statement}</span>{fact.status!=='confirmed'&&<small>{factStatus(fact)}</small>}</span><ArrowRight aria-hidden="true"/></button>)}</div>{!items.length&&empty&&<p className="portrait-missing">{empty}</p>}{items.length>limit&&<button type="button" className="portrait-more" aria-expanded={!!expanded[key]} onClick={()=>more(key)}>{expanded[key]?t('收起','Show less'):t(`查看全部 ${count(items.length)} 条`,`View all ${count(items.length)}`)}<ChevronDown aria-hidden="true"/></button>}</>}
  return <div className="personal-overview">
    <PageHeading className="portrait-heading" title={<span className="portrait-title">{t('个人画像','Personal profile')}{data.profile.demo&&<Badge color="secondary" size="sm">{t('虚构人物','Fictional profile')}</Badge>}</span>} decoration="profile" description={t('查看个人背景、做事方式与重要关系。','Explore personal context, preferences and important relationships.')}/>

    <div className="portrait-layout">
      <div className="portrait-main">
        <section className="portrait-background"><SectionHeading>{t('个人理解','Personal understanding')}</SectionHeading>{factRows(overviewFacts,'overview',t('确认做事方式或偏好后，会在这里显示。','Confirmed working preferences will appear here.'),2)}{capabilities.length>0&&<div className="portrait-fact-group portrait-capabilities"><h3>{t('能力与经验','Skills and experience')}</h3>{factRows(capabilities,'capabilities','',2)}</div>}</section>
        <section className="portrait-biography"><SectionHeading action={<SectionLink href="#timeline">{t('时间轴','Timeline')}</SectionLink>}>{t('关键经历','Key experiences')}</SectionHeading>
          <ol className="portrait-career">{events.filter(event=>['education','career'].includes(event.category)).slice(-4).map(event=><li key={event.id}><time dateTime={event.date}>{event.date.slice(0,4)}{event.endDate?`—${event.endDate.slice(0,4)}`:''}</time><button type="button" onClick={()=>select({kind:'event',value:event})}><strong>{event.title}</strong><ArrowRight aria-hidden="true"/></button></li>)}</ol>
          {!events.some(event=>['education','career'].includes(event.category))&&<p className="portrait-missing">{t('还没有记录关键经历','No key experiences recorded yet')}</p>}
        </section>
        {(remainingWays.length>0||remainingTaste.length>0||remainingPreferences.length>0)&&<div className="portrait-understandings">{remainingWays.length>0&&<section><SectionHeading>{t('做事方式','How you work')}</SectionHeading>{factRows(remainingWays,'ways','')}</section>}{(remainingTaste.length>0||remainingPreferences.length>0)&&<section><SectionHeading>{t('偏好','Preferences')}</SectionHeading>{remainingTaste.length>0&&<div className="portrait-preference-group"><h3>{t('审美与生活','Taste and lifestyle')}</h3>{factRows(remainingTaste,'taste','',2)}</div>}{remainingPreferences.length>0&&<div className="portrait-preference-group">{remainingTaste.length>0&&<h3>{t('其他偏好','Other preferences')}</h3>}{factRows(remainingPreferences,'preferences','',2)}</div>}</section>}</div>}

        {unresolved.length>0&&<details className="portrait-unresolved"><summary><span>{t('待你核对','For your review')}</span><span>{count(unresolved.length)}</span><ChevronDown/></summary>{factRows(unresolved,'unresolved','')}</details>}
      </div>
      {selected?<aside ref={detailRef} className="portrait-detail"><header><h2>{selected.kind==='fact'?t('个人理解','Personal context'):selected.kind==='event'?t('经历','Experience'):t('人物','Person')}</h2><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('关闭详情','Close details')} onClick={()=>setSelected(undefined)}><X/></Button></header>
        {selected.kind==='fact'?<><p className="portrait-detail-statement">{selected.value.statement}</p><div className="portrait-detail-meta"><Badge color="secondary" size="sm">{factStatus(selected.value)}</Badge><span>{t(`第 ${selected.value.version} 版`,`Version ${selected.value.version}`)}</span><time>{when(selected.value.updatedAt)}</time></div>{refs(selected.value.sourceIds)}<div className="portrait-detail-actions"><Button color="secondary" variant="outline" size="sm" onClick={()=>onEdit(selected.value as Fact)}>{t('纠正','Correct')}</Button><Button color="secondary" variant="ghost" size="sm" onClick={()=>onHistory(selected.value as Fact)}>{t('修订记录','History')}</Button><Button color="secondary" variant="ghost" size="sm" onClick={()=>onCreateTask(t(`请结合这条个人背景帮我推进接下来的事：${(selected.value as Fact).statement}`,`Use this personal context to help me move forward: ${(selected.value as Fact).statement}`),[selected.value.id])}>{t('用于对话','Use in a chat')}<ArrowRight/></Button></div></>:selected.kind==='event'?<><h3>{selected.value.title}</h3><time className="portrait-detail-meta">{selected.value.date}{selected.value.endDate?` — ${selected.value.endDate}`:''}</time><p>{selected.value.description}</p>{refs(selected.value.sourceIds)}<div className="portrait-event-people">{selected.value.personIds.map(id=>data.people.find(person=>person.id===id)).filter((person):person is Person=>!!person&&person.id!==self?.id).map(person=><button key={person.id} onClick={()=>select({kind:'person',value:person})}>{person.name}<ArrowRight/></button>)}</div></>:<><div className="portrait-person-detail"><span className="portrait-person-avatar">{selected.value.name[0]}</span><div><h3>{selected.value.name}</h3><small>{selected.value.role}</small></div></div><p>{selected.value.description}</p>{refs(selected.value.sourceIds)}<div className="portrait-person-entries">{selected.value.portrait?.entries.filter(entry=>entry.status==='confirmed').slice(0,5).map(entry=><p key={entry.id}>{entry.statement}</p>)}</div><a className="portrait-detail-link" href="#relationships">{t('查看关系图谱','Open relationship map')}<ArrowRight/></a></>}
      </aside>:<aside className="portrait-context"><section className="portrait-relationships"><SectionHeading action={<SectionLink href="#relationships">{t('图谱','Map')}</SectionLink>}>{t('重要关系','People in your life')}</SectionHeading>{relationGroups.filter(group=>group.rows.length).map(group=><div key={group.id} className="portrait-relation-group"><h3>{group.label}<span>{count(group.rows.length)}</span></h3>{group.rows.slice(0,3).map(({person,relation})=><button key={relation.id} className="portrait-person-row" onClick={()=>select({kind:'person',value:person})}><span className="portrait-person-avatar">{person.name[0]}</span><span><strong>{person.name}</strong><small>{relation.label}</small></span><ArrowRight/></button>)}{group.rows.length>3&&<a className="portrait-more" href="#relationships">{t('查看全部','View all')}<ArrowRight/></a>}</div>)}{!direct.length&&<p className="portrait-missing">{t('还没有与你关联的人物记录','No people connected to you yet')}</p>}</section><section className="portrait-circumstances"><SectionHeading>{t('当前处境','Current circumstances')}</SectionHeading>{factRows(constraints,'constraints',t('当前条件尚待补充','Current circumstances have not been added'))}{goals.length>0&&<div className="portrait-current-goals"><h3>{t('正在推进','In progress')}</h3>{goals.slice(0,3).map(goal=><a key={goal.id} href="#life"><span>{goal.title}</span>{goal.dueDate&&<time>{goal.dueDate.slice(5).replace('-','/')}</time>}<ArrowRight/></a>)}</div>}</section></aside>}
    </div>
    {!facts.length&&!events.length&&!direct.length&&<a className="portrait-add-source" href="#sources"><Document/>{t('添加让 SecondU 了解你的资料','Add context for SecondU')}<ArrowRight/></a>}
  </div>;
}
