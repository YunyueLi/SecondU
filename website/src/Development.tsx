import {useState} from 'react';
import {ChevronDown} from '@openai/apps-sdk-ui/components/Icon';
import review from '../../docs/review.json';
import type {DevelopmentReview} from '../../shared/development-review-types';
import {TimelineRail} from '../../src/development/TimelineRail';
import {useSiteLanguage} from './site-language';
import './development.css';

// The application reads this same product record through /development/review.
const record=review as Pick<DevelopmentReview,'milestones'|'currentProgress'|'latestRelease'>;
const milestones=record.milestones??[];
export default function Development(){
 const {t}=useSiteLanguage();
 const current=record.currentProgress,release=record.latestRelease;
 const [selection,setSelectedId]=useState(current?.id??milestones.at(-1)?.id??'');
 const selectedId=milestones.some(item=>item.id===selection)||selection===current?.id?selection:current?.id??milestones.at(-1)?.id??'';
 const selected=milestones.find(item=>item.id===selectedId);
 const isCurrent=Boolean(current&&selectedId===current.id);
 const day=(at:string)=>new Date(at).toLocaleDateString(t('zh-CN','en-US'),{month:'short',day:'numeric',timeZone:'Asia/Shanghai'});
 const clock=(at:string)=>new Date(at).toLocaleTimeString(t('zh-CN','en-GB'),{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'});
 const nodes=milestones.map(item=>({id:item.id,title:t(item.title,item.titleEn??item.title),at:item.at,date:day(item.at),time:clock(item.at)}));
 if(current)nodes.push({id:current.id,title:t(current.title,current.titleEn??current.title),at:current.date,date:day(current.date),time:t('本轮最新','Current work')});
 if(!nodes.length)return null;
 return <section className="site-section site-development" id="build">
  <div className="site-section-head"><h2>{t('从想法到产品','From idea to product')}</h2><p>{t('已经走过的路，以及现在认真打磨的体验。','What has taken shape, and what we are improving now.')}</p></div>
  <TimelineRail nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} label={t('开发时间线','Development timeline')} previousLabel={t('上一个进展','Previous milestone')} nextLabel={t('下一个进展','Next milestone')} detailId="site-build-detail"/>
  <article className="site-build-detail" id="site-build-detail">
   <div className="site-build-detail-main"><div className="site-build-meta"><span>{isCurrent?t('正在完善','In progress'):t('已提交','Committed')}</span><time dateTime={isCurrent?current!.date:selected!.at}>{day(isCurrent?current!.date:selected!.at)}</time></div><h3>{isCurrent?t(current!.title,current!.titleEn??current!.title):t(selected!.title,selected!.titleEn??selected!.title)}</h3><p>{isCurrent?t(current!.summary,current!.summaryEn??current!.summary):t(selected!.detail,selected!.detailEn??selected!.detail)}</p>
    {!isCurrent&&selected&&<a className="site-build-commit" href={`https://github.com/YunyueLi/SecondU/commit/${selected.commit}`} target="_blank" rel="noreferrer"><code>{selected.commit}</code><span>{t('查看提交','View commit')}</span></a>}
   </div>
   <div className="site-build-detail-aside">{isCurrent&&current?<><ul className="site-build-changes">{current.highlights?.map(note=><li key={note.zh}>{t(note.zh,note.en)}</li>)}</ul><details className="site-build-checks"><summary>{t('本轮检查与待办','Checks and remaining work')}<ChevronDown/></summary><div><h4>{t('已检查','Checked')}</h4><ul>{current.completed.map(note=><li key={note.zh}>{t(note.zh,note.en)}</li>)}</ul><h4>{t('仍待完成','Still to complete')}</h4><ul>{current.pending.map(note=><li key={note.zh}>{t(note.zh,note.en)}</li>)}</ul></div></details></>:<p className="site-build-history-note">{t('每个节点对应一次真实提交。选择时间线上的其他节点，查看这一轮产品变化。','Each milestone points to a real commit. Select another point on the timeline to explore how the product evolved.')}</p>}</div>
  </article>
  {release&&<div className="site-build-release"><span>{t('当前公开版本','Public release')}</span><a href={release.url} target="_blank" rel="noreferrer">{release.version}</a><time dateTime={release.publishedAt}>{day(release.publishedAt)}</time>{isCurrent&&<span className="site-build-unpublished">{t('桌面更新尚未发布','Desktop update not yet released')}</span>}</div>}
  <div className="site-record-links"><a href="https://github.com/YunyueLi/SecondU/blob/main/docs/DEVELOPMENT.md" target="_blank" rel="noreferrer">{t('完整构建记录','Complete build record')}</a><a href="https://github.com/YunyueLi/SecondU/blob/main/docs/ITERATION.md" target="_blank" rel="noreferrer">{t('设计反馈与逐项迭代','Design feedback and iterations')}</a></div>
 </section>;
}
