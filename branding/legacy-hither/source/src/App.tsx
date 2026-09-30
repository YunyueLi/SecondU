import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bootstrap, Task } from '../shared/contracts';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { useAppearance } from './appearance';
import { useArtwork } from './artwork';
import { HitherMark } from './HitherMark';
import { HitherWordmark } from './HitherWordmark';
import { ProjectWorkspace, ProjectEditor } from './ProjectWorkspace';
import { RecentChats } from './RecentChats';
import { SidebarResizeHandle, useSidebarWidth } from './SidebarResize';
import { t, useLocale } from './i18n';
import { AgentWorkspace } from './agents/AgentWorkspace';
import { AgentAvatar, AgentGroupAvatar } from './agents/AgentIdentity';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Chat, ChatCompose, Folder, User, Document, Agent, Clock, Settings, Code, Sun, Desktop, Plus, Search, MenuSidebar, ChevronDown, ArrowRotateCw, CloseBold, ArrowRight, Edit } from '@openai/apps-sdk-ui/components/Icon';
import { api, write, messageOf } from './api';
import { Busy, Empty, Dialog } from './components';
import { AssistantWorkspace, type TaskComposition } from './AssistantWorkspace';
import { ArtifactWorkspace } from './ArtifactWorkspace';
import { AutomationWorkspace } from './AutomationWorkspace';
import { SettingsWorkspace, type Theme } from './SettingsWorkspace';
import { ComponentCatalogue } from './ComponentCatalogue';
import { RelationshipGraph } from './cognition/RelationshipGraph';
import { graphFixture } from './cognition/graphFixture';
import { ProductGuide, hasSeenProductGuide } from './onboarding/ProductGuide';
import { DevelopmentWorkspace } from './development/DevelopmentWorkspace';
import { DeviceSimulator } from './DeviceSimulator';
import { CognitionWorkspace } from './cognition/CognitionWorkspace';

function SidebarPanelIcon(){return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>;}
const getCognitionNav = () => [{id:'self',label:t("个人画像", "About you")},{id:'life',label:t("生活近况", "Life now")},{id:'conversations',label:t("交流记录", "Conversations")},{id:'timeline',label:t("时间轴", "Timeline")},{id:'relationships',label:t("关系图谱", "Relationship map")},{id:'sources',label:t("资料来源", "Sources")}];
const getViewTitles = (): Record<string,string> => { return {development:t('构建过程','Building Hither'),devices:t('随身 Hither','Hither on your devices'),projects:t('项目','Projects'),assistant:'Hither',task:t("对话", "Conversations"),artifacts:t("资料库", "Library"),automations:t("自动化", "Automations"),agents:'Agents',settings:t("设置", "Settings"),components:t("组件目录", "Component library"),'graph-lab':t("图谱实验", "Graph playground"),...Object.fromEntries(getCognitionNav().map(item=>[item.id,item.label]))}; };
function routeNow() { const [raw,id] = location.hash.slice(1).split('/'); return {view:getViewTitles()[raw] ? raw : 'assistant',id}; }
const navigate = (view:string,id?:string) => { location.hash = id ? `${view}/${id}` : view; };

export function App() {
  const locale = useLocale();
  const cognitionNav=getCognitionNav(); const viewTitles=getViewTitles();
  const [data,setData] = useState<Bootstrap|null>(null); const [error,setError] = useState(''); const [actionError,setActionError]=useState(''); const [starting,setStarting] = useState(true); const [refreshing,setRefreshing]=useState(false);
  const [appearance,updateAppearance,appearanceStatus]=useAppearance();
  const customArtwork=useArtwork();
  useEffect(()=>{document.documentElement.style.setProperty('--hither-custom-artwork',customArtwork.url?`url("${customArtwork.url}")`:'none');document.documentElement.style.setProperty('--hither-artwork-ink',customArtwork.ink);},[customArtwork.url,customArtwork.ink]);
  const [guideOpen,setGuideOpen]=useState(()=>!hasSeenProductGuide()&&!location.hash);
  const [exploreDismissed,setExploreDismissed]=useState(()=>localStorage.getItem('hither.exploreDismissed')==='true');
  const [creatingProject,setCreatingProject]=useState(false);
  const [composition,setComposition]=useState<TaskComposition>();
  const [narrowWindow,setNarrowWindow] = useState(()=>matchMedia('(max-width:800px)').matches);
  const sidebarSize=useSidebarWidth();
  const [route,setRoute] = useState(routeNow); const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem('hither.sidebarCollapsed')==='true'); const [sidebarOpen,setSidebarOpen]=useState(false); const [knowOpen,setKnowOpen]=useState(()=>localStorage.getItem('hither.digitalTwinOpen')==='true'); const [search,setSearch]=useState('');
  const previousWorkspace=useRef<{view:string;id?:string}>(route.view==='settings'?{view:'assistant'}:route);
  useEffect(()=>{if(route.view!=='settings')previousWorkspace.current=route;},[route]);
  const theme=appearance.theme; const setTheme=(theme:Theme)=>updateAppearance({theme});
  const sequence=useRef(0); const mounted=useRef(true); const sidebarButton=useRef<HTMLButtonElement>(null); const mobileSidebarButton=useRef<HTMLButtonElement>(null); const searchRef=useRef<HTMLInputElement>(null);
  const refresh=useCallback(async()=>{ const seq=++sequence.current;try { const result=await api<Bootstrap>('/bootstrap');if(mounted.current&&seq===sequence.current){setData(result);setError('');} }catch(e){if(mounted.current&&seq===sequence.current)setError(messageOf(e));throw e;}finally{if(mounted.current&&seq===sequence.current)setStarting(false);}},[]);
  useEffect(()=>{mounted.current=true;void refresh().catch(()=>{});return()=>{mounted.current=false;};},[refresh]);
  useEffect(()=>{if(!data)return;const active=data.tasks.some(task=>task.status==='running'||task.status==='queued');const timer=setInterval(()=>void refresh().catch(()=>{}),active?1200:10000);return()=>clearInterval(timer);},[refresh,!!data,data?.tasks.some(task=>task.status==='running'||task.status==='queued')]);
  useEffect(()=>{const update=()=>{setRoute(routeNow());setSidebarOpen(false);};addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);},[]);
  useEffect(()=>{const media=matchMedia('(max-width:800px)');const update=()=>setNarrowWindow(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{document.title=route.view==='assistant'?'Hither':`${viewTitles[route.view]} — Hither`;},[route.view,locale]);
  useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{document.documentElement.dataset.theme=theme==='system'?(media.matches?'dark':'light'):theme;};apply();localStorage.setItem('hither.theme',theme);media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[theme]);
  useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();void prepareTask('');}if((event.metaKey||event.ctrlKey)&&event.shiftKey&&event.key.toLowerCase()==='f'){event.preventDefault();setSidebarCollapsed(false);setSidebarOpen(narrowWindow);requestAnimationFrame(()=>searchRef.current?.focus());}if(event.key==='Escape'&&sidebarOpen){setSidebarOpen(false);mobileSidebarButton.current?.focus();}};addEventListener('keydown',shortcut);return()=>removeEventListener('keydown',shortcut);},[sidebarOpen,narrowWindow]);
  async function createTask(prompt:string,contextFactIds?:string[],agentIds:string[]=[],mode:'demo'|'live'='demo',connectionId?:string,projectId?:string,attachmentIds?:string[],connectorIds?:string[],digitalTwinEnabled?:boolean) {
    const selectedFacts=contextFactIds ?? data?.facts.filter(fact=>fact.status==='confirmed').map(fact=>fact.id) ?? [];
    setActionError('');
    try { const task=await write<Task>('/tasks',{prompt,contextFactIds:selectedFacts,agentIds,mode,connectionId,projectId,attachmentIds,connectorIds,digitalTwinEnabled});await refresh();navigate('task',task.id);try{await write<Task>(`/tasks/${task.id}/run`);}finally{await refresh();} }
    catch(e){setActionError(messageOf(e));throw e;}
  }
  async function prepareTask(prompt:string,contextFactIds?:string[],agentIds:string[]=[],projectId?:string){setComposition({id:crypto.randomUUID(),prompt,factIds:contextFactIds,agentIds,projectId});navigate('assistant');}
  async function manualRefresh(){setRefreshing(true);try{await refresh();}catch{}finally{setRefreshing(false);}}
  if(starting&&!data)return <div className="startup"><div className="brand">Hither</div><Busy label={t("正在打开本地空间", "Opening your workspace")} /></div>;
  if(!data)return <div className="startup"><Empty title={t("暂时连不上这台电脑", "Cannot connect to this computer")} description={error || t("本机服务还没有启动。请稍后重试。", "The local service is not running yet. Try again shortly.")} action={<Button color="primary" onClick={manualRefresh} loading={refreshing}>{t("重新连接", "Reconnect")}</Button>} /></div>;
  const workspaceRoute=route.view==='settings'?previousWorkspace.current:route;
  const currentTask=data.tasks.find(task=>task.id===workspaceRoute.id);const tasks=[...data.tasks].filter(task=>`${task.title} ${task.prompt}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const isCognition=cognitionNav.some(item=>item.id===workspaceRoute.view);
  const rail=sidebarCollapsed&&!narrowWindow;
  const toggleSidebar=()=>{if(narrowWindow)setSidebarOpen(!sidebarOpen);else setSidebarCollapsed(current=>{localStorage.setItem('hither.sidebarCollapsed',String(!current));return !current;});};
  const navLink=(id:string,label:string,Icon:typeof Chat)=><ButtonLink as="a" key={id} href={`#${id}`} title={rail?label:undefined} aria-label={label} color="secondary" variant="ghost" size="lg" pill={false} className="nav-item" aria-current={workspaceRoute.view===id&&!(id==='agents'&&workspaceRoute.id)?'page':undefined}><Icon /><span>{label}</span></ButtonLink>;
  const desktopMode=new URLSearchParams(location.search).get('desktop')==='1';
  const chatView=workspaceRoute.view==='assistant'||workspaceRoute.view==='task';
  return <div className={`app-shell ${desktopMode?'desktop-mode':''} ${rail?'sidebar-collapsed':''} view-${workspaceRoute.view}`} style={narrowWindow?undefined:sidebarSize.style}>
    {desktopMode&&<div className="desktop-drag-region" aria-hidden="true" />}
    <a className="skip-link" href="#main-workspace" onClick={event=>{event.preventDefault();document.getElementById('main-workspace')?.focus();}}>{t("跳到主内容", "Skip to content")}</a>
    {sidebarOpen&&<button className="sidebar-backdrop" aria-label={t("关闭导航", "Close sidebar")} onClick={()=>setSidebarOpen(false)} />}
    <aside className={`app-sidebar ${sidebarOpen?'is-open':''}`} aria-label={t("主导航", "Main navigation")} inert={narrowWindow&&!sidebarOpen}>
      <div className="sidebar-brand">
        {!rail&&<a href="#assistant" className="brand"><span className="brand-symbol"><HitherMark /></span><HitherWordmark/></a>}
        <Button ref={sidebarButton} color="secondary" variant="ghost" uniform className="sidebar-toggle" aria-label={rail?t("展开导航", "Open sidebar"):t("收起导航", "Close sidebar")} title={rail?t("展开导航", "Open sidebar"):t("收起导航", "Close sidebar")} aria-expanded={!rail} onClick={toggleSidebar}>{rail?<span className="rail-brand-switch"><span className="rail-brand-mark"><HitherMark/></span><span className="rail-panel-icon"><SidebarPanelIcon/></span></span>:<SidebarPanelIcon/>}</Button>
      </div>

      <nav className="main-navigation" aria-label={t("工作区", "Workspace")}>
        <Button color="secondary" variant="ghost" size="lg" pill={false} className="new-task-button" title={rail?t("新对话", "New chat"):undefined} aria-label={t("新对话", "New chat")} aria-keyshortcuts="Meta+K Control+K" onClick={()=>prepareTask('')}><Edit /><span>{t("新对话", "New chat")}</span>{!rail&&<kbd className="new-chat-shortcut">⌘ K</kbd>}</Button>
        {rail?<Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="lg" className="nav-item" aria-label={t("数字分身", "Digital twin")} title={t("数字分身", "Digital twin")}><User /></Button></Menu.Trigger><Menu.Content side="right" align="start" minWidth={180}>{cognitionNav.map(item=><Menu.Item key={item.id} onSelect={()=>navigate(item.id)}>{item.label}</Menu.Item>)}</Menu.Content></Menu>:<><Button color="secondary" variant="ghost" size="lg" pill={false} className={`nav-item cognition-parent ${isCognition?'active':''}`} aria-expanded={knowOpen} onClick={()=>setKnowOpen(current=>{localStorage.setItem('hither.digitalTwinOpen',String(!current));return !current;})}><User /><span>{t("数字分身", "Digital twin")}</span><ChevronDown className={knowOpen?'':'rotated'} /></Button>{knowOpen&&<div className="sub-navigation">{cognitionNav.map(item=><ButtonLink as="a" key={item.id} color="secondary" variant="ghost" size="md" pill={false} href={`#${item.id}`} className="nav-item" aria-current={workspaceRoute.view===item.id?'page':undefined}>{item.label}</ButtonLink>)}</div>}</>}
        {navLink('agents','Agents',Agent)}{navLink('artifacts',t("资料库", "Library"),Document)}{navLink('automations',t("自动化", "Automations"),Clock)}
      </nav>
      {rail?navLink('projects',t('项目','Projects'),Folder):<section className="sidebar-projects" aria-label={t('项目','Projects')}><div className="sidebar-projects-header"><a href="#projects">{t('项目','Projects')}</a><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('新建项目','New project')} onClick={()=>setCreatingProject(true)}><Plus/></Button></div>{(data.projects||[]).filter(p=>!p.archived).slice(0,4).map(p=><a className="sidebar-project-link" href={`#projects/${p.id}`} key={p.id} aria-current={workspaceRoute.view==='projects'&&workspaceRoute.id===p.id?'page':undefined}><Folder/><span>{p.name}</span></a>)}{!(data.projects||[]).some(p=>!p.archived)?<button className="sidebar-project-link" onClick={()=>setCreatingProject(true)}><Folder/><span>{t('添加文件夹或仓库','Add a folder or repository')}</span></button>:(data.projects||[]).filter(p=>!p.archived).length>4&&<a href="#projects" className="sidebar-project-more">{t('所有项目','All projects')}</a>}</section>}
      {rail?<Button color="secondary" variant="ghost" uniform aria-label={t("搜索对话", "Search chats")} title={t("搜索对话", "Search chats")} onClick={()=>{setSidebarCollapsed(false);requestAnimationFrame(()=>searchRef.current?.focus());}}><Search /></Button>:<div className="task-navigation"><div className="sidebar-section-label">{t("最近对话", "Recent chats")}</div><Input ref={searchRef} size="sm" variant="soft" startAdornment={<Search />} aria-label={t("搜索对话", "Search chats")} placeholder={t("搜索对话", "Search chats")} value={search} onChange={event=>setSearch(event.target.value)} /><RecentChats data={data} query={search} view={workspaceRoute.view} id={workspaceRoute.id} onRefresh={refresh}/></div>}
      <div className="sidebar-bottom">
        {rail||exploreDismissed?<Button color="secondary" variant="ghost" size="sm" className="sidebar-explore" aria-label={t('探索 Hither','Explore Hither')} onClick={()=>setGuideOpen(true)}><HitherMark/>{!rail&&<span>{t('探索 Hither','Explore Hither')}</span>}</Button>:<div className="sidebar-explore-card"><Button className="explore-dismiss" color="secondary" variant="ghost" size="sm" uniform aria-label={t('收起介绍卡片','Dismiss introduction card')} onClick={()=>{setExploreDismissed(true);localStorage.setItem('hither.exploreDismissed','true');}}><CloseBold/></Button><strong>{t('让 Hither 更懂你','Make Hither your own')}</strong><p>{t('从认识你，到一起把事情做好。','From understanding you to getting things done together.')}</p><Button color="secondary" variant="outline" size="sm" onClick={()=>setGuideOpen(true)}>{t('探索 Hither','Explore Hither')}<ArrowRight/></Button></div>}
        <Menu><Menu.Trigger><button type="button" className="profile-trigger" aria-label={t(`${data.profile.name}的个人菜单`, `${data.profile.name} profile menu`)} title={rail?t("个人菜单", "Profile menu"):undefined}><span className="profile-avatar">{data.profile.name.slice(0,1)}</span>{!rail&&<><span className="profile-copy"><strong>{data.profile.name}</strong><small>{data.profile.demo?t("示例空间", "Demo workspace"):t("个人空间", "Personal workspace")}</small></span></>}</button></Menu.Trigger><Menu.Content side="top" align="start" minWidth={240}>
          <div className="profile-menu-heading"><strong>{data.profile.name}</strong><span>{data.profile.demo?t("虚构资料演示", "Fictional sample data"):t("本地个人空间", "Local workspace")}</span></div>
          <Menu.Item onSelect={()=>navigate('settings','personal')}><User />{t("个人资料", "Profile")}</Menu.Item>
          <Menu.Item onSelect={()=>navigate('settings','appearance')}><Sun />{t("外观与个性化", "Appearance")}</Menu.Item>
          <Menu.Item onSelect={()=>navigate('settings','model')}><Settings />{t("设置", "Settings")}</Menu.Item>
          <Menu.Separator />
          <Menu.Item onSelect={()=>navigate('settings','computer')}><Desktop />{t("我的电脑", "My computer")}<span className="menu-online">{data.computer.status==='online'?t("在线", "Online"):t("离线", "Offline")}</span></Menu.Item>
          <Menu.Item onSelect={()=>navigate('development')}><Document />{t('构建过程与开发记录','Development history')}</Menu.Item>
          <Menu.Item onSelect={()=>navigate('devices')}><Desktop />{t('随身 Hither','Hither on your devices')}<span className="menu-online">Dev</span></Menu.Item>
          <Menu.Item onSelect={()=>navigate('components')}><Code />{t("组件与设计规范", "Design system")}</Menu.Item>
        </Menu.Content></Menu>
      </div>
    </aside>
    {!rail&&!narrowWindow&&<SidebarResizeHandle width={sidebarSize.width} onChange={sidebarSize.setWidth} />}
    <div className="app-workspace" inert={narrowWindow&&sidebarOpen}>
      {narrowWindow&&!chatView&&!(workspaceRoute.view==='agents'&&workspaceRoute.id)&&<header className="app-topbar"><div className="row">{narrowWindow&&<Button ref={mobileSidebarButton} color="secondary" variant="ghost" uniform aria-label={t("展开导航", "Open sidebar")} onClick={toggleSidebar}><SidebarPanelIcon /></Button>}<span className="topbar-title" title={workspaceRoute.view==='task'?currentTask?.title:undefined}>{workspaceRoute.view==='task'?currentTask?.title||t("任务", "Tasks"):workspaceRoute.view==='assistant'?'Hither':viewTitles[workspaceRoute.view]}</span></div></header>}
      {error&&<div className="connection-error"><Alert color="danger" variant="soft" title={t("与本机的连接中断", "Connection lost")} description={t("正在显示上一次载入的内容。恢复连接后会自动更新。", "Showing the last saved view. It will refresh when the connection returns.")} actions={<Button color="secondary" variant="outline" size="sm" loading={refreshing} onClick={manualRefresh}><ArrowRotateCw />{t("重试", "Retry")}</Button>} /></div>}
      {actionError&&<div className="connection-error"><Alert color="danger" variant="soft" title={t("任务操作没有完成", "Task action failed")} description={actionError} actions={<Button color="secondary" variant="ghost" size="sm" onClick={()=>setActionError('')}>{t("关闭提示", "Dismiss")}</Button>} /></div>}
      <main id="main-workspace" tabIndex={-1} className={`main-workspace ${chatView?'assistant-main':''} ${['agents','conversations','relationships','settings','graph-lab'].includes(workspaceRoute.view)?'immersive-main':''}`}>
        {chatView&&<AssistantWorkspace navigation={narrowWindow?<Button ref={mobileSidebarButton} color="secondary" variant="ghost" uniform aria-label={t("展开导航", "Open sidebar")} onClick={toggleSidebar}><SidebarPanelIcon /></Button>:undefined} data={data} composition={composition} taskId={workspaceRoute.view==='task'?workspaceRoute.id:undefined} onRefresh={refresh} onCreateTask={createTask} />}
        {workspaceRoute.view==='projects'&&<ProjectWorkspace key={workspaceRoute.id||'all'} data={data} id={workspaceRoute.id} onRefresh={refresh} onChat={id=>void prepareTask('',undefined,[],id)}/> }
        {workspaceRoute.view==='agents'&&<AgentWorkspace navigation={narrowWindow?<Button ref={mobileSidebarButton} color="secondary" variant="ghost" uniform aria-label={t("展开导航", "Open sidebar")} onClick={toggleSidebar}><SidebarPanelIcon /></Button>:undefined} data={data} initialRoomId={workspaceRoute.id} onRefresh={refresh} onTask={id=>navigate('task',id)} />}
        {workspaceRoute.view==='artifacts'&&<ArtifactWorkspace data={data} id={workspaceRoute.id} onRefresh={refresh} />}
        {workspaceRoute.view==='automations'&&<AutomationWorkspace data={data} onRefresh={refresh} onTask={id=>navigate('task',id)} />}

        {workspaceRoute.view==='components'&&<ComponentCatalogue />}
        {workspaceRoute.view==='development'&&<DevelopmentWorkspace onExplore={()=>setGuideOpen(true)}/>}
        {workspaceRoute.view==='devices'&&<DeviceSimulator/>}
        {workspaceRoute.view==='graph-lab'&&<section className="graph-lab"><header><ButtonLink as="a" href="#components" color="secondary" variant="ghost" size="sm">{t("返回组件目录", "Back to components")}</ButtonLink><span>{t(`${graphFixture.people.length} 位虚构人物，${graphFixture.relationships.length.toLocaleString()} 条关系，仅供交互体验`, `${graphFixture.people.length} fictional people and ${graphFixture.relationships.length.toLocaleString()} connections for interaction testing`)}</span></header><RelationshipGraph data={graphFixture} refs={()=>null} onRefresh={async()=>{}} readOnly /></section>}
        {isCognition&&<CognitionWorkspace view={workspaceRoute.view} data={data} onRefresh={refresh} onCreateTask={prepareTask} />}
      </main>
        {guideOpen&&<ProductGuide onClose={()=>setGuideOpen(false)} onNavigate={view=>{setGuideOpen(false);navigate(view);}}/>}
        {creatingProject&&<ProjectEditor onClose={()=>setCreatingProject(false)} onSaved={async project=>{await refresh();setCreatingProject(false);navigate('projects',project.id);}}/>}
        {route.view==='settings'&&<Dialog title={t("设置", "Settings")} className="settings-dialog" onClose={()=>navigate(previousWorkspace.current.view,previousWorkspace.current.id)}><SettingsWorkspace data={data} onRefresh={refresh} theme={theme} onTheme={setTheme} initialCategory={route.id} appearance={appearance} appearanceStatus={appearanceStatus} onAppearance={updateAppearance} /></Dialog>}
    </div>
  </div>;
}
