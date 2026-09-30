import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Bootstrap, Fact, LifeEvent, Person } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { ArrowRight, ChevronDown, Document, X } from '@openai/apps-sdk-ui/components/Icon';
import { when } from '../components';
import { t } from '../i18n';
import { displayProfileName } from '../profile';

type Refs = (ids: string[], compact?: boolean) => ReactNode;
type Selection = {kind:'fact';value:Fact}|{kind:'event';value:LifeEvent}|{kind:'person';value:Person};
const factStatus = (fact:Fact) => ({confirmed:t('已确认','Confirmed'),candidate:t('待确认','To confirm'),inferred:t('推断','Inferred'),superseded:t('已替代','Superseded')}[fact.status]);
const excerpt = (value:string,max=155) => value.length>max?`${value.slice(0,max)}…`:value;
const displayDescription=(text:string,demo:boolean)=>demo?text.replace(/^虚构示例[：:]/,''):text;

export function PersonalOverview({data,refs,onEdit,onHistory,onCreateTask}:{data:Bootstrap;refs:Refs;onEdit:(fact:Fact)=>void;onHistory:(fact:Fact)=>void;onCreateTask:(prompt:string,factIds?:string[])=>void|Promise<void>}) {
  const [selection,setSelected] = useState<Selection>();
  let selected = selection;
  if(selection?.kind==='fact'){const value=data.facts.find(fact=>fact.id===selection.value.id);selected=value?{kind:'fact',value}:undefined;}
  const [expanded,setExpanded] = useState<Record<string,boolean>>({});
  const detailRef = useRef<HTMLElement>(null);
  const facts = data.facts.filter(fact=>fact.status==='confirmed');
  const unresolved=data.facts.filter(fact=>fact.status==='candidate'||fact.status==='inferred');
  const identity=facts.filter(fact=>fact.kind==='identity'||fact.kind==='capability');
  const preferences=facts.filter(fact=>fact.kind==='preference');
  const stylePreferences=preferences.filter(fact=>fact.preferenceDomain==='taste');
  const generalPreferences=preferences.filter(fact=>!fact.preferenceDomain||fact.preferenceDomain==='general');
  const ways=[...preferences.filter(fact=>fact.preferenceDomain==='work'),...facts.filter(fact=>fact.kind==='value'||fact.kind==='decision')];
  const constraints=facts.filter(fact=>fact.kind==='constraint');
  const self=data.people.find(person=>person.id===(data.profile.selfPersonId??'person-self'));
  const events=data.events.filter(event=>(self?event.personIds.includes(self.id):event.personIds.length===0)&&event.scope!=='note').sort((a,b)=>a.date.localeCompare(b.date));
  const direct=self?data.relationships.filter(relation=>relation.from===self.id||relation.to===self.id).map(relation=>({relation,person:data.people.find(person=>person.id===(relation.from===self.id?relation.to:relation.from))})).filter((row):row is typeof row & {person:Person}=>!!row.person):[];
  const relationGroups=[{id:'family',label:t('家人','Family'),rows:direct.filter(({relation})=>/父|母|家|兄|弟|姐|妹|伴侣|爱人|配偶/.test(relation.label))},{id:'friends',label:t('朋友','Friends'),rows:direct.filter(({relation})=>/朋友|同学|邻居/.test(relation.label))}];
  const grouped=new Set(relationGroups.flatMap(group=>group.rows.map(row=>row.relation.id)));
  relationGroups.push({id:'work',label:t('协作与往来','Work and connections'),rows:direct.filter(({relation})=>!grouped.has(relation.id))});
  const goals=data.goals.filter(goal=>goal.status==='active').sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
  function select(value:Selection){setSelected(value);if(window.matchMedia('(max-width: 800px)').matches)requestAnimationFrame(()=>detailRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));}
  function more(key:string){setExpanded(previous=>({...previous,[key]:!previous[key]}));}
  function factRows(items:Fact[],key:string,empty:string){return <>{(expanded[key]?items:items.slice(0,3)).map(fact=><button key={fact.id} className={`portrait-fact-row ${selected?.kind==='fact'&&selected.value.id===fact.id?'is-selected':''}`} onClick={()=>select({kind:'fact',value:fact})}><span>{fact.statement}</span><ArrowRight/></button>)}{!items.length&&<p className="portrait-missing">{empty}</p>}{items.length>3&&<Button color="secondary" variant="ghost" size="sm" className="portrait-more" onClick={()=>more(key)}>{expanded[key]?t('收起','Show less'):t(`另外 ${items.length-3} 条`,`${items.length-3} more`)}<ChevronDown/></Button>}</>}
  return <div className="personal-overview">
    <header className="portrait-header"><span className="portrait-avatar" aria-hidden="true">{Array.from(displayProfileName(data.profile))[0]||'S'}</span><div className="portrait-header-copy"><div><h1>{displayProfileName(data.profile)}</h1>{data.profile.demo&&<Badge color="secondary" size="sm">{t('虚构人物','Fictional profile')}</Badge>}</div>{identity[0]?<button className="portrait-header-summary" onClick={()=>select({kind:'fact',value:identity[0]})}>{identity[0].statement}</button>:<p>{displayDescription(data.profile.description,data.profile.demo)}</p>}</div></header>
    <div className="portrait-layout">
      <div className="portrait-main">
        <section className="portrait-biography"><header><h2>{t('经历与能力','Experience and skills')}</h2><a href="#timeline">{t('时间轴','Timeline')}<ArrowRight/></a></header>{identity.length>1&&<div className="portrait-identity-lines">{factRows(identity.slice(1),'identity','')}</div>}
          <ol className="portrait-career">{(expanded.events?events:events.filter(event=>['education','career'].includes(event.category)).slice(-4)).map(event=><li key={event.id}><time dateTime={event.date}>{event.date.slice(0,4)}{event.endDate?`—${event.endDate.slice(0,4)}`:''}</time><button onClick={()=>select({kind:'event',value:event})}><strong>{event.title}</strong><span>{excerpt(displayDescription(event.description,data.profile.demo),85)}</span></button></li>)}</ol>
          {events.length>4&&<Button color="secondary" variant="ghost" size="sm" className="portrait-more" onClick={()=>more('events')}>{expanded.events?t('收起经历','Show less'):t(`查看全部 ${events.length} 段经历`,`All ${events.length} experiences`)}<ChevronDown/></Button>}
        </section>
        <div className="portrait-understandings"><section><h2>{t('做事方式','How you work')}</h2>{factRows(ways,'ways',t('做事方式尚待补充','Working preferences have not been added'))}</section><section><h2>{t('偏好','Preferences')}</h2>{stylePreferences.length>0&&<><h3>{t('审美与生活','Taste and lifestyle')}</h3>{factRows(stylePreferences,'taste','')}</>}{generalPreferences.length>0&&<>{stylePreferences.length>0&&<h3>{t('其他偏好','Other preferences')}</h3>}{factRows(generalPreferences,'preferences','')}</>}{!stylePreferences.length&&!generalPreferences.length&&<p className="portrait-missing">{t('还没有确认的个人偏好','No personal preferences confirmed yet')}</p>}</section></div>
        {unresolved.length>0&&<details className="portrait-unresolved"><summary><span>{t('待你核对','For your review')}</span><span>{unresolved.length}</span><ChevronDown/></summary>{unresolved.map(fact=><button key={fact.id} className="portrait-fact-row" onClick={()=>select({kind:'fact',value:fact})}><span>{fact.statement}<small>{factStatus(fact)}</small></span><ArrowRight/></button>)}</details>}
      </div>
      {selected?<aside ref={detailRef} className="portrait-detail"><header><h2>{selected.kind==='fact'?t('个人理解','Personal context'):selected.kind==='event'?t('经历','Experience'):t('人物','Person')}</h2><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('关闭详情','Close details')} onClick={()=>setSelected(undefined)}><X/></Button></header>
        {selected.kind==='fact'?<><p className="portrait-detail-statement">{selected.value.statement}</p><div className="portrait-detail-meta"><Badge color="secondary" size="sm">{factStatus(selected.value)}</Badge><span>{t(`第 ${selected.value.version} 版`,`Version ${selected.value.version}`)}</span><time>{when(selected.value.updatedAt)}</time></div>{refs(selected.value.sourceIds)}<div className="portrait-detail-actions"><Button color="secondary" variant="outline" size="sm" onClick={()=>onEdit(selected.value as Fact)}>{t('纠正','Correct')}</Button><Button color="secondary" variant="ghost" size="sm" onClick={()=>onHistory(selected.value as Fact)}>{t('修订记录','History')}</Button><Button color="secondary" variant="ghost" size="sm" onClick={()=>onCreateTask(t(`请结合这条个人背景帮我推进接下来的事：${(selected.value as Fact).statement}`,`Use this personal context to help me move forward: ${(selected.value as Fact).statement}`),[selected.value.id])}>{t('用于对话','Use in a chat')}<ArrowRight/></Button></div></>:selected.kind==='event'?<><h3>{selected.value.title}</h3><time className="portrait-detail-meta">{selected.value.date}{selected.value.endDate?` — ${selected.value.endDate}`:''}</time><p>{selected.value.description}</p>{refs(selected.value.sourceIds)}<div className="portrait-event-people">{selected.value.personIds.map(id=>data.people.find(person=>person.id===id)).filter((person):person is Person=>!!person&&person.id!==self?.id).map(person=><button key={person.id} onClick={()=>select({kind:'person',value:person})}>{person.name}<ArrowRight/></button>)}</div></>:<><div className="portrait-person-detail"><span className="portrait-person-avatar">{selected.value.name[0]}</span><div><h3>{selected.value.name}</h3><small>{selected.value.role}</small></div></div><p>{selected.value.description}</p>{refs(selected.value.sourceIds)}<div className="portrait-person-entries">{selected.value.portrait?.entries.filter(entry=>entry.status==='confirmed').slice(0,5).map(entry=><p key={entry.id}>{entry.statement}</p>)}</div><a className="portrait-detail-link" href="#relationships">{t('查看关系图谱','Open relationship map')}<ArrowRight/></a></>}
      </aside>:<aside className="portrait-context"><section className="portrait-relationships"><header><h2>{t('重要关系','People in your life')}</h2><a href="#relationships">{t('图谱','Map')}<ArrowRight/></a></header>{relationGroups.filter(group=>group.rows.length).map(group=><div key={group.id} className="portrait-relation-group"><h3>{group.label}</h3>{(expanded[group.id]?group.rows:group.rows.slice(0,1)).map(({person,relation})=><button key={relation.id} className="portrait-person-row" onClick={()=>select({kind:'person',value:person})}><span className="portrait-person-avatar">{person.name[0]}</span><span><strong>{person.name}</strong><small>{relation.label}</small></span><ArrowRight/></button>)}{group.rows.length>1&&<Button className="portrait-more" color="secondary" variant="ghost" size="sm" onClick={()=>more(group.id)}>{expanded[group.id]?t('收起','Show less'):t(`另外 ${group.rows.length-1} 位`,`${group.rows.length-1} more`)}</Button>}</div>)}{!direct.length&&<p className="portrait-missing">{t('还没有与你关联的人物记录','No people connected to you yet')}</p>}</section><section className="portrait-circumstances"><h2>{t('当前处境','Current circumstances')}</h2>{factRows(constraints,'constraints',t('当前条件尚待补充','Current circumstances have not been added'))}{goals.length>0&&<div className="portrait-current-goals"><h3>{t('正在推进','In progress')}</h3>{goals.slice(0,3).map(goal=><a key={goal.id} href="#life"><span>{goal.title}</span>{goal.dueDate&&<time>{goal.dueDate.slice(5).replace('-','/')}</time>}<ArrowRight/></a>)}</div>}</section></aside>}
    </div>
    {!facts.length&&!events.length&&!direct.length&&<a className="portrait-add-source" href="#sources"><Document/>{t('添加让 SecondU 了解你的资料','Add context for SecondU')}<ArrowRight/></a>}
  </div>;
}
