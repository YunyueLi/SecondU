import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bootstrap, Task } from '../shared/contracts';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Chat, User, Document, Agent, Clock, Settings, Code, Plus, Search, MenuSidebar, ChevronDown, ArrowRotateCw } from '@openai/apps-sdk-ui/components/Icon';
import { api, write, messageOf } from './api';
import { Busy, Empty } from './components';
import { AssistantWorkspace, type TaskComposition } from './AssistantWorkspace';
import { ArtifactWorkspace } from './ArtifactWorkspace';
import { AutomationWorkspace } from './AutomationWorkspace';
import { SettingsWorkspace, type Theme } from './SettingsWorkspace';
import { ComponentCatalogue } from './ComponentCatalogue';
import { CognitionWorkspace } from './cognition/CognitionWorkspace';

const cognitionNav = [{id:'self',label:'自我认识'},{id:'life',label:'当前生活'},{id:'conversations',label:'对话'},{id:'timeline',label:'人生时间轴'},{id:'relationships',label:'人物关系'},{id:'sources',label:'资料与依据'}];
const viewTitles: Record<string,string> = {assistant:'助理',task:'助理',artifacts:'成果',automations:'自动化',agents:'Agents',settings:'设置',components:'组件目录',...Object.fromEntries(cognitionNav.map(item=>[item.id,item.label]))};
function routeNow() { const [raw,id] = location.hash.slice(1).split('/'); return {view:viewTitles[raw] ? raw : 'assistant',id}; }
const navigate = (view:string,id?:string) => { location.hash = id ? `${view}/${id}` : view; };

export function App() {
  const [data,setData] = useState<Bootstrap|null>(null); const [error,setError] = useState(''); const [actionError,setActionError]=useState(''); const [starting,setStarting] = useState(true); const [refreshing,setRefreshing]=useState(false);
  const [composition,setComposition]=useState<TaskComposition>();
  const [route,setRoute] = useState(routeNow); const [sidebarOpen,setSidebarOpen]=useState(false); const [knowOpen,setKnowOpen]=useState(true); const [search,setSearch]=useState('');
  const [theme,setTheme] = useState<Theme>(()=>{const value=localStorage.getItem('hither.theme');return value==='dark'||value==='light' ? value:'system';});
  const sequence=useRef(0); const mounted=useRef(true); const sidebarButton=useRef<HTMLButtonElement>(null); const searchRef=useRef<HTMLInputElement>(null);
  const refresh=useCallback(async()=>{ const seq=++sequence.current;try { const result=await api<Bootstrap>('/bootstrap');if(mounted.current&&seq===sequence.current){setData(result);setError('');} }catch(e){if(mounted.current&&seq===sequence.current)setError(messageOf(e));throw e;}finally{if(mounted.current&&seq===sequence.current)setStarting(false);}},[]);
  useEffect(()=>{mounted.current=true;void refresh().catch(()=>{});return()=>{mounted.current=false;};},[refresh]);
  useEffect(()=>{if(!data)return;const active=data.tasks.some(task=>task.status==='running'||task.status==='queued');const timer=setInterval(()=>void refresh().catch(()=>{}),active?1200:10000);return()=>clearInterval(timer);},[refresh,!!data,data?.tasks.some(task=>task.status==='running'||task.status==='queued')]);
  useEffect(()=>{const update=()=>{setRoute(routeNow());setSidebarOpen(false);};addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);},[]);
  useEffect(()=>{document.title=`${viewTitles[route.view]} · Hither`;},[route.view]);
  useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{document.documentElement.dataset.theme=theme==='system'?(media.matches?'dark':'light'):theme;};apply();localStorage.setItem('hither.theme',theme);media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[theme]);
  useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();setSidebarOpen(true);requestAnimationFrame(()=>searchRef.current?.focus());}if(event.key==='Escape'&&sidebarOpen){setSidebarOpen(false);sidebarButton.current?.focus();}};addEventListener('keydown',shortcut);return()=>removeEventListener('keydown',shortcut);},[sidebarOpen]);
  async function createTask(prompt:string,contextFactIds?:string[],agentIds:string[]=[],mode:'demo'|'live'='demo') {
    const selectedFacts=contextFactIds ?? data?.facts.filter(fact=>fact.status==='confirmed').map(fact=>fact.id) ?? [];
    setActionError('');
    try { const task=await write<Task>('/tasks',{prompt,contextFactIds:selectedFacts,agentIds,mode});await refresh();navigate('task',task.id);try{await write<Task>(`/tasks/${task.id}/run`);}finally{await refresh();} }
    catch(e){setActionError(messageOf(e));throw e;}
  }
  async function prepareTask(prompt:string,contextFactIds?:string[],agentIds:string[]=[]){setComposition({id:crypto.randomUUID(),prompt,factIds:contextFactIds ?? data?.facts.filter(fact=>fact.status==='confirmed').map(fact=>fact.id) ?? [],agentIds});navigate('assistant');}
  async function manualRefresh(){setRefreshing(true);try{await refresh();}catch{}finally{setRefreshing(false);}}
  if(starting&&!data)return <div className="startup"><div className="brand">Hither<span>暂名</span></div><Busy label="正在打开本地空间…" /></div>;
  if(!data)return <div className="startup"><Empty title="暂时连不上这台电脑" description={error || '本机服务还没有启动。请稍后重试。'} action={<Button color="primary" onClick={manualRefresh} loading={refreshing}>重新连接</Button>} /></div>;
  const currentTask=data.tasks.find(task=>task.id===route.id);const tasks=[...data.tasks].filter(task=>`${task.title} ${task.prompt}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const isCognition=cognitionNav.some(item=>item.id===route.view)||route.view==='agents';
  const navLink=(id:string,label:string,Icon:typeof Chat)=><ButtonLink as="a" key={id} href={`#${id}`} color="secondary" variant="ghost" size="lg" pill={false} className="nav-item" aria-current={route.view===id?'page':undefined}><Icon /><span>{label}</span></ButtonLink>;
  const desktopMode=new URLSearchParams(location.search).get('desktop')==='1';
  return <div className={`app-shell ${desktopMode?'desktop-mode':''}`}>{desktopMode&&<div className="desktop-drag-region" aria-hidden="true" />}<a className="skip-link" href="#main-workspace" onClick={event=>{event.preventDefault();document.getElementById('main-workspace')?.focus();}}>跳到主内容</a>{sidebarOpen&&<button className="sidebar-backdrop" aria-label="关闭导航" onClick={()=>setSidebarOpen(false)} />}
    <aside className={`app-sidebar ${sidebarOpen?'is-open':''}`} aria-label="主导航"><div className="sidebar-brand"><a href="#assistant" className="brand">Hither<span>暂名</span></a><Button color="secondary" variant="ghost" uniform size="sm" aria-label="开始新任务" onClick={()=>prepareTask('')}><Plus /></Button></div><Button color="secondary" variant="outline" size="lg" className="new-task-button" onClick={()=>prepareTask('')}><Plus />新的任务</Button><nav className="main-navigation" aria-label="工作区">{navLink('assistant','助理',Chat)}<Button color="secondary" variant="ghost" size="lg" pill={false} className={`nav-item cognition-parent ${isCognition&&route.view!=='agents'?'active':''}`} aria-expanded={knowOpen} onClick={()=>setKnowOpen(!knowOpen)}><User /><span>认识我</span><ChevronDown className={knowOpen?'':'rotated'} /></Button>{knowOpen&&<div className="sub-navigation">{cognitionNav.map(item=><ButtonLink as="a" key={item.id} color="secondary" variant="ghost" size="md" pill={false} href={`#${item.id}`} className="nav-item" aria-current={route.view===item.id?'page':undefined}>{item.label}</ButtonLink>)}</div>}{navLink('artifacts','成果',Document)}{navLink('agents','Agents',Agent)}{navLink('automations','自动化',Clock)}</nav><div className="task-navigation"><div className="sidebar-section-label">最近任务</div><Input ref={searchRef} size="sm" variant="soft" startAdornment={<Search />} aria-label="搜索任务" placeholder="搜索任务  ⌘K" value={search} onChange={event=>setSearch(event.target.value)} /><nav aria-label="最近任务">{tasks.slice(0,16).map(task=><ButtonLink as="a" color="secondary" variant="ghost" size="lg" pill={false} key={task.id} href={`#task/${task.id}`} className="nav-item task-nav-item" aria-current={route.view==='task'&&route.id===task.id?'page':undefined}><span className={`task-dot ${task.status==='running'?'running':''}`} /><span>{task.title}</span>{task.status==='awaiting_approval'&&<span className="attention-dot" aria-label="等待确认" />}</ButtonLink>)}{tasks.length===0&&<p className="no-tasks">{search?'没有匹配的任务':'从一个想法开始'}</p>}</nav></div><div className="sidebar-bottom">{navLink('settings','设置',Settings)}{navLink('components','组件目录',Code)}<div className="profile-switch"><span className="profile-avatar">{data.profile.name.slice(0,1)}</span><div><strong>{data.profile.name}</strong><small>{data.profile.demo?'虚构演示空间':'本地个人空间'}</small></div></div></div></aside>
    <div className="app-workspace"><header className="app-topbar"><div className="row"><Button ref={sidebarButton} color="secondary" variant="ghost" uniform className="sidebar-toggle" aria-label={sidebarOpen?'关闭导航':'打开导航'} aria-expanded={sidebarOpen} onClick={()=>setSidebarOpen(!sidebarOpen)}><MenuSidebar /></Button><span>{route.view==='task'?currentTask?.title||'任务':viewTitles[route.view]}</span></div><div className="row"><ButtonLink as="a" color="secondary" variant="ghost" size="sm" href="#settings" className="computer-indicator"><span className={`connection-dot ${data.computer.status==='online'?'online':''}`} />当前电脑</ButtonLink>{data.profile.demo&&<Badge variant="outline">演示空间</Badge>}</div></header>{error&&<div className="connection-error"><Alert color="danger" variant="soft" title="与本机的连接中断" description="正在显示上一次载入的内容。恢复连接后会自动更新。" actions={<Button color="secondary" variant="outline" size="sm" loading={refreshing} onClick={manualRefresh}><ArrowRotateCw />重试</Button>} /></div>}<>{actionError&&<div className="connection-error"><Alert color="danger" variant="soft" title="任务操作没有完成" description={actionError} actions={<Button color="secondary" variant="ghost" size="sm" onClick={()=>setActionError('')}>关闭提示</Button>} /></div>}</><main id="main-workspace" tabIndex={-1} className={route.view==='assistant'||route.view==='task'?'main-workspace assistant-main':'main-workspace'}>
      {(route.view==='assistant'||route.view==='task')&&<AssistantWorkspace data={data} composition={composition} taskId={route.view==='task'?route.id:undefined} onRefresh={refresh} onCreateTask={createTask} />}
      {route.view==='artifacts'&&<ArtifactWorkspace data={data} id={route.id} onRefresh={refresh} />}
      {route.view==='automations'&&<AutomationWorkspace data={data} onRefresh={refresh} onTask={id=>navigate('task',id)} />}
      {route.view==='settings'&&<SettingsWorkspace data={data} onRefresh={refresh} theme={theme} onTheme={setTheme} />}
      {route.view==='components'&&<ComponentCatalogue />}
      {isCognition&&<CognitionWorkspace view={route.view} data={data} onRefresh={refresh} onCreateTask={prepareTask} />}
    </main></div></div>;
}
