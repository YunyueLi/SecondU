import '../styles.css';
import '../desktop-refinement.css';
import '../assistant-conversation.css';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AppsSDKUIProvider} from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import {TaskActivity,TaskEventDetails} from '../design-system/TaskActivity';
import {ContextFacts} from '../AssistantWorkspace';
import type {Task,TaskEvent,TaskStatus} from '../../shared/contracts';
import {setLocale,useLocale,t} from '../i18n';

const start=Date.now()-73000;
const event=(id:string,type:string,label:string,seconds:number,detail?:string,activity?:TaskEvent['activity']):TaskEvent=>({id,type,label,createdAt:new Date(start+seconds*1000).toISOString(),detail,activity});
const events:TaskEvent[]=[
 event('start','started','执行开始',0),
 event('note','runtime.message','工作说明',1,'先核对项目资料和最近的反馈，再检查页面上的主要交互。',{kind:'message',phase:'completed',messagePhase:'commentary'}),
 event('plan','runtime.plan','检查方案',2,JSON.stringify({plan:[{step:'核对资料与需求',status:'completed'},{step:'检查页面交互',status:'inProgress'},{step:'整理结果与待办',status:'pending'}]})),
 event('search-start','runtime.action','网页检索开始',3,JSON.stringify({query:'interface accessibility'}),{kind:'web_search',phase:'running',callId:'search',name:'网页检索'}),
 event('search-end','runtime.action','网页检索已结束',8,JSON.stringify({sources:['公开设计说明']}),{kind:'web_search',phase:'completed',callId:'search',name:'网页检索'}),
 event('read-start','connector.call','读取文件',9,'读取项目说明',{kind:'connector',phase:'running',callId:'read',name:'读取项目说明'}),
 event('read-end','connector.result','文件读取完成',12,'项目说明已读取',{kind:'connector',phase:'completed',callId:'read',name:'读取项目说明'}),
 event('current','runtime.action','本机命令开始',13,'npm run check',{kind:'command',phase:'running',callId:'command',name:'执行检查'}),
];
const facts=[{id:'preview-context',statement:'示例：偏好简洁、可核对的结果。',status:'confirmed' as const,sourceIds:['preview-source'],version:1}];
function Preview(){
 const [status,setStatus]=useState<TaskStatus>('running'),[simple,setSimple]=useState(false),[scenario,setScenario]=useState('normal'),[dark,setDark]=useState(document.documentElement.dataset.theme==='dark');const locale=useLocale();const [selected,setSelected]=useState<TaskEvent>();
 const terminal:Partial<Record<TaskStatus,string>>={completed:'已完成',failed:'执行失败',cancelled:'已停止',interrupted:'已中断',needs_input:'需要补充信息'};
 const scoped=simple?[events[0]]:[...events];
 if(terminal[status]){if(!simple)scoped.push(event('tool-end','runtime.action',status==='completed'?'检查已完成':'检查未完成',27,'检查结果',{kind:'command',phase:status==='completed'?'completed':'failed',callId:'command',name:'执行检查'}));scoped.push(event('terminal',status,terminal[status]!,28));}
 if(!simple){
  scoped.push(event('collaboration','runtime.collaboration','协作进度已更新',14,JSON.stringify({tool:'spawnAgent',receiverThreadIds:['research','interaction'],agentsStates:{research:{status:'completed'},interaction:{status:status==='completed'?'completed':status==='failed'?'errored':'running'}}})));
  scoped.push(event('research','runtime.subagent_activity','协作任务',15,JSON.stringify({agentThreadId:'research',agentPath:'/资料核对'})));
  scoped.push(event('interaction','runtime.subagent_activity','协作任务',15,JSON.stringify({agentThreadId:'interaction',agentPath:'/交互检查'})));
 }
 if(status==='awaiting_approval')scoped.push(event('approval','approval_requested','等待批准',25,'需要批准写入文档'));
 if(!simple&&scenario==='review')scoped.push(event('review','runtime.auto_review','操作审查',20,JSON.stringify({reviewId:'review',status:'inProgress'})));
 if(!simple&&scenario==='denied'){scoped.push(event('review','runtime.auto_review','操作审查',20,JSON.stringify({reviewId:'review',status:'inProgress'})));scoped.push(event('denied','runtime.auto_review','审查结束',21,JSON.stringify({reviewId:'review',status:'denied'})));}
 if(!simple&&scenario==='duplicate')scoped.push(event('late-search-start','runtime.action','网页检索开始',26,'重复通知',{kind:'web_search',phase:'running',callId:'search'}));
 const task:Task={id:'activity-preview',title:'虚构任务',prompt:'检查交互',agentIds:[],contextFactIds:[],mode:'demo',status,createdAt:new Date(start).toISOString(),updatedAt:new Date(start+30000).toISOString(),messages:[],events:status==='queued'?[]:[...scoped].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),artifactIds:[],approvals:[],...(scenario==='remote'?{remoteExecution:{runId:'preview-run',computerId:'preview-computer',computerName:'示例电脑',status:'running',dispatch:'submitted',observation:{status:'disconnected'},cursor:4,fileCount:0,cancelRequested:false} as Task['remoteExecution']}: {})};
 return <main style={{maxWidth:900,margin:'0 auto',padding:'32px 24px'}}><header style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:16,paddingBottom:32,borderBottom:'1px solid var(--color-border-subtle)'}}><h1 style={{fontSize:20,margin:0}}>{t('执行状态预览','Activity preview')}</h1><span>{t('虚构事件 · 不执行任何操作','Fictional events · No operations executed')}</span><label>{t('状态','Status')} <select value={status} onChange={event=>setStatus(event.target.value as TaskStatus)}>{['queued','running','awaiting_approval','needs_input','completed','failed','cancelled','interrupted'].map(value=><option key={value}>{value}</option>)}</select></label><label>{t('情形','Scenario')} <select value={scenario} onChange={event=>setScenario(event.target.value)}>{['normal','review','denied','remote','duplicate'].map(value=><option key={value}>{value}</option>)}</select></label><button type="button" aria-pressed={simple} onClick={()=>setSimple(!simple)}>{t('无工具调用','No tool use')}</button><button onClick={()=>setLocale(locale==='en'?'zh-CN':'en')}>中文 / English</button><button onClick={()=>{setDark(!dark);document.documentElement.dataset.theme=!dark?'dark':'light';document.documentElement.classList.toggle('dark',!dark);}}>{t('切换外观','Toggle theme')}</button></header><section className="assistant-workspace" style={{display:'block',minHeight:420,paddingTop:40}}><div className="message message-assistant message-pending" style={{padding:0,maxWidth:'100%',width:'100%'}}><TaskActivity key={`${status}:${simple}:${scenario}`} task={task} onEvent={setSelected}/><div className="message-footer"><ContextFacts facts={facts} queued={status==='queued'}/></div></div>{selected&&<aside aria-label={t('已选过程记录','Selected activity record')} style={{marginTop:24,borderTop:'1px solid var(--color-border-subtle)',paddingTop:16}}><button onClick={()=>setSelected(undefined)}>{t('关闭记录','Close record')}</button><TaskEventDetails event={selected}/></aside>}</section></main>;
}
if(import.meta.env.DEV)createRoot(document.getElementById('root')!).render(<AppsSDKUIProvider linkComponent="a"><Preview/></AppsSDKUIProvider>);
