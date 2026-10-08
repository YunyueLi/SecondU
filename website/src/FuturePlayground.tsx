import {useEffect,useId,useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Brain,ChatCompose,Calendar,Groups,FolderDocumentsFinder,Terminal,ConnectApps,Mobile,Lightbulb,CompareArrows,UserHeart,BookClock,Compass} from '@openai/apps-sdk-ui/components/Icon';
import {useSiteLanguage} from './site-language';
import {openProductRoute,type ProductRoute} from './product-navigation';
import RoadmapEmblem from './RoadmapEmblem';
import './future-playground.css';

export default function FuturePlayground(){
 const {t}=useSiteLanguage();
 const experiences:Partial<Record<number,{route:ProductRoute;action:string}>>={
  7:{route:'devices',action:t('体验跨设备衔接','Explore cross-device continuity')},
  8:{route:'agents/market',action:t('体验专业服务','Explore professional services')},
  9:{route:'agents/market',action:t('查看市场流程','Explore the marketplace')},
  10:{route:'agents/dating',action:t('体验相识流程','Explore introductions')},
 };
    const directions = [
        { name: t("持续理解你", "Keep understanding you"), status: t("本机功能可用", "Available locally"), now: t("来源、经历、偏好、关系与近况可以查阅和修订；相关上下文参与任务。", "Review and revise sources, experiences, preferences, relationships and current circumstances. Relevant context informs tasks."), next: t("让文字、图像、语音及获准的活动进入统一认知；理解随时间更新，保留来源与适用范围。", "Bring text, images, speech and authorized activity into one understanding. Update it over time while preserving sources and scope.") },
        { name: t("工作与生活助理", "Help with work and life"), status: t("本机功能可用", "Available locally"), now: t("可保存对话和任务，配置模型，审批工具操作，并编辑、保存和重新打开成果。", "Save conversations and tasks, configure models, approve tool actions, and edit, save and reopen results."), next: t("覆盖写作、研究、申请、学习、创作、出行和家庭事务，比较长期使用中建议与结果的适合程度。", "Extend to writing, research, applications, learning, creativity, travel and household matters. Evaluate how well suggestions and outcomes fit over long-term use.") },
        { name: t("主动帮助与长期目标", "Proactive help and long-term goals"), status: t("开发中", "In development"), now: t("可记录目标和生活近况，设置由本机服务运行的定期任务。", "Record goals and life updates, and schedule recurring tasks run by the local service."), next: t("根据约定持续关注变化，决定何时提醒、建议或继续办理，并让用户看懂依据、接手或停止。", "Follow agreed changes over time and decide when to remind, suggest or continue. Make the reasoning clear and let the user take over or stop.") },
        { name: t("专家与团队协作", "Experts and team collaboration"), status: t("本机功能可用", "Available locally"), now: t("可配置专业 Agent，由负责人委派工作，通过执行树查看分工和结果。", "Configure specialist Agents, let a lead delegate work, and view assignments and results in the execution tree."), next: t("完善复杂任务中的分工、结果复核与意见冲突处理。", "Improve delegation, result review and conflict resolution for complex tasks.") },
        { name: t("项目与成果资产", "Projects and lasting results"), status: t("本机功能可用", "Available locally"), now: t("项目材料、对话、任务与产物版本一起保存，支持多种格式预览与原件下载。", "Keep project materials, conversations, tasks and result versions together, with previews for several formats and original-file downloads."), next: t("让决定、修改与交付跨时间持续可用，进一步完善大文件、更多格式与长期项目恢复。", "Keep decisions, revisions and deliveries useful over time. Improve large-file support, format coverage and long-running project recovery.") },
        { name: t("自己的电脑与远程环境", "Your computer and remote environments"), status: t("开发中", "In development"), now: t("本机任务可执行并审批操作；远程连接和恢复协议已实现，真实主机仍待验证。", "Local tasks can run with action approvals. Remote connection and recovery protocols are implemented; real hosts still need testing."), next: t("在真实远端主机与常开设备上验证执行、断线恢复和接管，持续呈现准确的任务状态。", "Validate execution, reconnect recovery and takeover on real remote hosts and always-on devices, while keeping task states accurate.") },
        { name: t("通信与现实资源", "Communications and real-world resources"), status: t("分项接入", "Integration in stages"), now: t("可查看和配置连接器、工具及 Agent 资源；具体服务是否可用取决于接入和授权状态。", "View and configure connectors, tools and Agent resources. Availability depends on each service’s integration and authorization status."), next: t("逐一接入邮件、消息、日历、服务身份、电话与支付，在具体授权后执行并保留真实回执。", "Integrate email, messages, calendars, service identities, calls and payments individually. Act with specific authorization and retain real receipts.") },
        { name: t("跨设备的资料与任务", "Context and tasks across devices"), status: t("开发中的概念预览", "Concept in development"), now: t("已提供手机、电脑和眼镜围绕同一任务的交互演示，尚未完成真实硬件同步。", "Interactive demonstrations show phones, computers and glasses sharing one task. Real hardware synchronization is not complete."), next: t("原始文字、画面、语音、来源、任务状态与成果版本连续流转；换设备、离线恢复后仍能接着做。", "Carry original text, images, speech, sources, task state and result versions forward. Continue across device changes and offline recovery.") },
        { name: t("个人能力与服务分发", "Share personal capabilities and services"), status: t("本机子集可用", "Local subset available"), now: t("受限知识快照、本机文本调用、接收者授权、逐次审批和撤销已有实现。", "Scoped knowledge snapshots, local text calls, recipient authorization, approval for each call and revocation are implemented."), next: t("让专业分身通过链接、二维码和名片提供服务，完善远程身份、服务托管、访问规则与审计。", "Offer professional twins through links, QR codes and cards. Develop remote identity, service hosting, access rules and auditing.") },
        { name: t("A2A 协作与服务交易", "A2A collaboration and service transactions"), status: t("开发中的概念预览", "Concept in development"), now: t("本机 A2A 文本子集与市场流程可体验；没有真实订单、付款或商业结算。", "A local A2A text subset and marketplace workflow can be explored. There are no real orders, payments or commercial settlements."), next: t("从发现、询价、范围确认到委托、阶段交付、验收和结算，验证跨产品 Agent 的实际互通。", "Validate actual interoperability between Agents across products: discovery, quotes, scope, delegation, staged delivery, acceptance and settlement.") },
        { name: t("社交、合作与恋爱", "Friendship, collaboration and dating"), status: t("开发中的概念预览", "Concept in development"), now: t("Dating 的偏好、建议、兴趣与开场白使用虚构示例，未联系真人或完成撮合。", "Dating preferences, suggestions, interest and opening messages use fictional examples. No real people have been contacted or matched."), next: t("在双方主动开放的范围内寻找联系理由，分别确认意愿后再介绍，保留拒绝、退出和撤回的选择。", "Find reasons to connect within the scope both people choose to open. Confirm each person's wishes before an introduction and preserve the ability to decline, leave or revoke.") },
        { name: t("持续更新的个人资产", "Personal knowledge that keeps improving"), status: t("开发中", "In development"), now: t("来源、认知修正、成果和版本保留在个人空间；用户可以核对与确认更新。", "Sources, corrections, results and versions remain in the personal workspace. Users can review and confirm updates."), next: t("结合新经历和更好的模型重新理解资料，比较新旧判断，积累经验证有效的个人办事方法。", "Revisit materials as new experiences and better models become available. Compare old and new judgments and accumulate approaches that have proved useful.") },
    ];
 const stages=[
  {title:t('从今天开始','Start today'),items:[0,1,3,4]},
  {title:t('让理解持续生长','Deepen understanding'),items:[2,11]},
  {title:t('跨越设备与场景','Move across devices'),items:[5,7]},
  {title:t('连接能力与服务','Connect capabilities'),items:[6,8,9]},
  {title:t('建立新的联系','Build new connections'),items:[10]},
 ];
 const directionIcons=[Brain,ChatCompose,Calendar,Groups,FolderDocumentsFinder,Terminal,ConnectApps,Mobile,Lightbulb,CompareArrows,UserHeart,BookClock];
 const [direction,setDirection]=useState(0);
 const [inlineDetail,setInlineDetail]=useState(()=>matchMedia('(max-width:980px)').matches);
 useEffect(()=>{const media=matchMedia('(max-width:980px)');const update=()=>setInlineDetail(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const selected=directions[direction];
 const experience=experiences[direction];
 const activeStage=stages.findIndex(stage=>stage.items.includes(direction));
 const curveId=useId().replaceAll(':','');
 function select(index:number){setDirection(index);}
 const detail=<div className={`future-direction-detail${inlineDetail?' is-inline':''}`} id="future-direction-detail" aria-live="polite">
    <div className={`future-detail-scene future-detail-scene-${activeStage}`} aria-hidden="true"><span className="future-scene-number">{String(activeStage+1).padStart(2,'0')}</span><i className="future-scene-orbit"/><i className="future-scene-orbit future-scene-orbit-inner"/><RoadmapEmblem stage={activeStage}/></div>
    <div className="future-detail-content">
     <div className="future-detail-heading"><span className="future-detail-status">{selected.status}</span><h3>{selected.name}</h3></div>
     <div className="future-detail-panels">
      <div className="future-detail-panel"><h4>{t('今天可以体验','Available today')}</h4><p>{selected.now}</p>{experience&&<Button className="future-detail-experience" color="secondary" variant="ghost" onClick={event=>openProductRoute(experience.route,event.currentTarget)}>{experience.action}</Button>}</div>
      <div className="future-detail-panel future-detail-next"><h4>{t('接下来','What comes next')}</h4><p>{selected.next}</p></div>
     </div>
     <a className="future-full-roadmap" href="https://github.com/YunyueLi/SecondU/blob/main/docs/ROADMAP.md" target="_blank" rel="noreferrer">{t('查看完整路线','View the full roadmap')}</a>
    </div>
   </div>;
 return <section className="site-section future-playground" id="future">
  <div className="site-section-head"><span className="future-status"><Compass/>{t('发展路线','The path ahead')}</span><h2><span>{t('同一个你，','The same you, ')}</span><span>{t('走向更大的世界。','in a wider world.')}</span></h2><p>{t('从持续理解你，到跨设备协作、分享专长与建立新的联系。选择一个方向，看看今天能体验什么，接下来还要完成什么。','From understanding you to working across devices, sharing expertise and making new connections. Choose a direction to explore what works today and what comes next.')}</p></div>
  <div className="future-roadmap">
   <div className="future-route-landscape">
    <svg className="future-route-curve future-route-curve-wide" viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={`${curveId}-wide`}><stop stopColor="var(--future-gold)"/><stop offset=".48" stopColor="var(--future-lilac)"/><stop offset="1" stopColor="var(--future-gold)"/></linearGradient></defs><path className="future-route-ribbon" d="M-25 188C35 188 53 166 100 166C196 166 204 60 300 60S404 166 500 166S604 60 700 60S804 166 900 166S973 207 1025 198"/><path className="future-route-thread" stroke={`url(#${curveId}-wide)`} d="M-25 184C35 184 53 162 100 162C196 162 204 56 300 56S404 162 500 162S604 56 700 56S804 162 900 162S973 203 1025 194"/><path className="future-route-trace" d="M-25 184C35 184 53 162 100 162C196 162 204 56 300 56S404 162 500 162S604 56 700 56S804 162 900 162S973 203 1025 194" pathLength="1000"/></svg>
    <ol className="future-route" aria-label={t('产品发展路线','Product development path')}>
     {stages.map(({title,items},stage)=><li key={stage} className={activeStage===stage?'is-active':''}>
      {inlineDetail&&stage<stages.length-1&&<svg className="future-stage-connector" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="future-route-thread" d={stage%2?'M61 0C61 50 27 50 27 100':'M27 0C27 50 61 50 61 100'}/></svg>}
      <button className="future-route-stage" type="button" aria-pressed={activeStage===stage} aria-controls="future-direction-detail" onClick={()=>select(activeStage===stage?direction:items[0])}>
       <span className="future-route-symbol"><RoadmapEmblem stage={stage}/></span>
       <span className="future-route-number">{String(stage+1).padStart(2,'0')}</span>
       <span className="future-route-title">{title}</span>
      </button>
      <div className="future-route-directions">{items.map(index=>{const ItemIcon=directionIcons[index];return <button key={index} type="button" aria-pressed={direction===index} aria-controls="future-direction-detail" onClick={()=>select(index)}><ItemIcon/><span>{directions[index].name}</span></button>;})}</div>
      {inlineDetail&&activeStage===stage&&detail}
     </li>)}
    </ol>
   </div>
   {!inlineDetail&&detail}
  </div>
 </section>;
}
