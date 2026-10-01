import {useState} from 'react';
import {ArrowRight,ChevronDown} from '@openai/apps-sdk-ui/components/Icon';
import type {DevelopmentMilestone,DevelopmentProgress,DevelopmentRelease} from '../../shared/development-review-types';
import {TimelineRail} from './TimelineRail';
import {t} from '../i18n';

export function BuildTimeline({milestones=[],currentProgress,latestRelease,onSelect}:{milestones?:DevelopmentMilestone[];currentProgress?:DevelopmentProgress;latestRelease?:DevelopmentRelease;onSelect:(id:string)=>void}){
 const current=currentProgress;
 const [selection,setSelectedId]=useState(current?.id??milestones.at(-1)?.id??'');
 const selectedId=milestones.some(item=>item.id===selection)||selection===current?.id?selection:current?.id??milestones.at(-1)?.id??'';
 const selected=milestones.find(item=>item.id===selectedId);
 const isCurrent=Boolean(current&&selectedId===current.id);
 const day=(at:string)=>new Date(at).toLocaleDateString(t('zh-CN','en-US'),{month:'short',day:'numeric',timeZone:'Asia/Shanghai'});
 const clock=(at:string)=>new Date(at).toLocaleTimeString(t('zh-CN','en-GB'),{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'});
 const nodes=milestones.map(item=>({id:item.id,title:t(item.title,item.titleEn??item.title),at:item.at,date:day(item.at),time:clock(item.at)}));
 if(current)nodes.push({id:current.id,title:t(current.title,current.titleEn??current.title),at:current.date,date:day(current.date),time:t('本轮最新','Current work')});
 if(!nodes.length)return null;
 return <section className="build-timeline" aria-label={t('最近的构建进展','Recent development progress')}>
  <TimelineRail nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} label={t('开发时间线','Development timeline')} previousLabel={t('上一个进展','Previous milestone')} nextLabel={t('下一个进展','Next milestone')} detailId="build-node-detail"/>
  <article className="build-node-detail" id="build-node-detail"><div className="build-node-main"><div className="build-node-meta"><span>{isCurrent?t('正在完善','In progress'):t('已提交','Committed')}</span><time dateTime={isCurrent?current!.date:selected!.at}>{day(isCurrent?current!.date:selected!.at)}</time></div><h2>{isCurrent?t(current!.title,current!.titleEn??current!.title):t(selected!.title,selected!.titleEn??selected!.title)}</h2><p>{isCurrent?t(current!.summary,current!.summaryEn??current!.summary):t(selected!.detail,selected!.detailEn??selected!.detail)}</p><button className="build-node-record" type="button" onClick={()=>onSelect(isCurrent?current!.iteration:selected!.iteration)}>{!isCurrent&&<code>{selected!.commit}</code>}<span>{t('查看这一轮记录','Read this iteration')}</span><ArrowRight/></button></div>
   <div className="build-node-aside">{isCurrent&&current?<><ul className="build-node-changes">{current.highlights?.map(note=><li key={note.zh}>{t(note.zh,note.en)}</li>)}</ul><details className="build-node-checks"><summary>{t('本轮检查与待办','Checks and remaining work')}<ChevronDown/></summary><div><h3>{t('已检查','Checked')}</h3><ul>{current.completed.map(note=><li key={note.zh}>{t(note.zh,note.en)}</li>)}</ul><h3>{t('仍待完成','Still to complete')}</h3><ul>{current.pending.map(note=><li key={note.zh}>{t(note.zh,note.en)}</li>)}</ul></div></details></>:<p className="build-node-history-note">{t('每个节点对应一次真实提交。选择时间线上的其他节点，查看这一轮产品变化。','Each milestone points to a real commit. Select another point on the timeline to explore how the product evolved.')}</p>}</div>
  </article>
  {latestRelease&&<div className="build-timeline-release"><span>{t('当前公开版本','Public release')}</span><a href={latestRelease.url} target="_blank" rel="noreferrer">{latestRelease.version}<ArrowRight/></a><time dateTime={latestRelease.publishedAt}>{day(latestRelease.publishedAt)}</time>{isCurrent&&<span className="build-node-unpublished">{t('本轮改动尚未发布','Current work is not yet published')}</span>}</div>}
 </section>;
}
