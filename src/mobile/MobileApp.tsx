import {getAppNavigation} from '../navigation';
import {BottomSheet} from '../shared/BottomSheet';
import {ComponentCatalogue} from '../ComponentCatalogue';
import {DevelopmentWorkspace} from '../development/DevelopmentWorkspace';
import {DeviceSimulator} from '../DeviceSimulator';
import {ProductGuide} from '../onboarding/ProductGuide';
import {RelationshipGraph} from '../cognition/RelationshipGraph';
import {getGraphFixture} from '../cognition/graphFixture';
import {enterLocalSpace} from '../LocalSpaces';
import {PERSONAL_SPACE,exampleSpaceForLocale} from '../space';
import {WorkspaceVisibility} from '../shared/WorkspaceVisibility';
import {useEffect, useMemo, useRef, useState} from 'react';
import {Button, ButtonLink} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {ArrowLeft,ArrowRight,ChevronDown,CloseBold,Reload} from '@openai/apps-sdk-ui/components/Icon';
import type {Bootstrap,Task} from '../../shared/contracts';
import {AssistantWorkspace, type TaskComposition} from '../AssistantWorkspace';
import {CognitionWorkspace} from '../cognition/CognitionWorkspace';
import {SettingsWorkspace} from '../SettingsWorkspace';
import {ProjectWorkspace} from '../ProjectWorkspace';
import {ArtifactWorkspace} from '../ArtifactWorkspace';
import {AutomationWorkspace} from '../AutomationWorkspace';
import {RecentChats} from '../RecentChats';
import {RemoteTaskWorkspace} from '../remote/RemoteTaskWorkspace';
import {AgentWorkspace} from '../agents/AgentWorkspace';
import {HitherMark} from '../HitherMark';
import {HitherWordmark} from '../HitherWordmark';
import {UserAvatarContext} from '../UserAvatar';
import {Busy, ErrorNotice} from '../components';
import {useAppearance} from '../appearance';
import {useUnsavedChanges} from '../useUnsavedChanges';
import {write,messageOf} from '../api';
import {t, useLocale} from '../i18n';
import {useMobileWorkspace} from './useMobileWorkspace';

type Route={view:string;id?:string};
function readRoute():Route {
  const [raw,id]=location.hash.slice(1).split('/');
  const aliases:Record<string,string>={new:'assistant',services:'assistant',connection:'settings',project:'projects',artifact:'artifacts',capture:'building',captureDetail:'building',tasks:'history'};
  return {view:aliases[raw]||raw||'assistant',id:raw==='connection'?'computer':id};
}
const go=(view:string,id?:string)=>{location.hash=view+(id?'/'+encodeURIComponent(id):'');};

function MenuIcon(){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 13h11M4 19h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;}

/** The phone owns navigation and presentation. Product state and actions stay in the desktop workspaces. */
export function MobileApp(){
  const locale=useLocale();
  const graphFixture=useMemo(()=>getGraphFixture(locale),[locale]);
  const workspace=useMobileWorkspace(),{data,connection,refresh}=workspace;
  const [appearance,updateAppearance,appearanceStatus]=useAppearance();
  useUnsavedChanges({unsaved:appearanceStatus.pendingChanges,busy:appearanceStatus.saving});
  const [route,setRoute]=useState(readRoute),[chatRoute,setChatRoute]=useState<Route>(()=>{const first=readRoute();return ['assistant','task'].includes(first.view)?first:{view:'assistant'};});
  const [workspaceRoutes,setWorkspaceRoutes]=useState<Record<string,Route>>(()=>{const initial=readRoute();return ['assistant','task'].includes(initial.view)?{}:{[initial.view]:initial};});
  const [accountOpen,setAccountOpen]=useState(false),[guideOpen,setGuideOpen]=useState(false),[switchingSpace,setSwitchingSpace]=useState(false),[accountError,setAccountError]=useState('');
  const [composition,setComposition]=useState<TaskComposition>();
  const [drawer,setDrawer]=useState(false),[twinExpanded,setTwinExpanded]=useState(false);
  const drawerRef=useRef<HTMLElement>(null),menuRef=useRef<HTMLButtonElement>(null),mainRef=useRef<HTMLElement>(null);
  const previousRoute=useRef(route),backStack=useRef<Route[]>([]),goingBack=useRef(false),scrollPositions=useRef(new Map<string,number>());
  const appNavigation=getAppNavigation();
  const cognitionNav=appNavigation.cognition;
  const isChat=['assistant','task'].includes(route.view);
  const isAgentRoom=route.view==='agents'&&!!route.id&&!['market','network','dating','discover'].includes(route.id);
  useEffect(()=>{
    const update=()=>{
      const previous=previousRoute.current,next=readRoute();
      scrollPositions.current.set(previous.view+'/'+(previous.id||''),mainRef.current?.scrollTop||0);
      if(!goingBack.current)backStack.current.push(previous);
      goingBack.current=false;previousRoute.current=next;setRoute(next);setDrawer(false);
      if(['assistant','task'].includes(next.view))setChatRoute(next);
      else setWorkspaceRoutes(previous=>({...previous,[next.view]:next}));
      requestAnimationFrame(()=>mainRef.current?.scrollTo({top:scrollPositions.current.get(next.view+'/'+(next.id||''))||0}));
    };
    addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);
  },[]);
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=appearance.theme==='system'?(media.matches?'dark':'light'):appearance.theme;};
    apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);
  },[appearance.theme]);
  useEffect(()=>{
    const viewport=window.visualViewport;
    const update=()=>document.documentElement.style.setProperty('--mobile-viewport-height',(viewport?.height||innerHeight)+'px');
    update();viewport?.addEventListener('resize',update);return()=>viewport?.removeEventListener('resize',update);
  },[]);
  useEffect(()=>{
    if(!drawer)return;
    const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    drawerRef.current?.focus({preventScroll:true});
    const keys=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setDrawer(false);}
      if(event.key==='Tab'){
        const items=Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)')||[]).filter(item=>item.getClientRects().length>0);
        const first=items[0],last=items.at(-1);
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===drawerRef.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',keys);return()=>{document.removeEventListener('keydown',keys);if(opener?.isConnected)opener.focus({preventScroll:true});};
  },[drawer]);
  const newChat=()=>prepareTask('');
  const prepareTask=(prompt:string,factIds?:string[],agentIds:string[]=[],projectId?:string)=>{setComposition({id:crypto.randomUUID(),prompt,factIds,agentIds,projectId});setDrawer(false);go('assistant');};
  const back=()=>{
    const previous=backStack.current.pop();
    if(previous){goingBack.current=true;go(previous.view,previous.id);}
    else if(route.view==='settings'&&route.id)go('settings');
    else go('assistant');
  };
  const title=route.view==='settings'?t('设置','Settings'):cognitionNav.some(item=>item.id===route.view)?appNavigation.digitalTwin.label:route.view==='history'?t('对话','Chats'):'SecondU';
  if(!data)return <div className="mobile-start"><HitherMark/><HitherWordmark/>{connection==='connecting'?<Busy label={t('正在读取你的对话……','Loading your conversations…')}/>:<><ErrorNotice error={workspace.error}/><Button color="primary" onClick={()=>void refresh().catch(()=>{})}><Reload/>{t('重新连接','Reconnect')}</Button></>}</div>;
  const internalTasks=new Set(data.twinBuilding?.captures.flatMap(capture=>capture.taskIds)||[]);
  const tasks=data.tasks.filter(task=>!task.archived&&!internalTasks.has(task.id)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const currentTask=chatRoute.view==='task'?data.tasks.find(task=>task.id===chatRoute.id):undefined;
  const navigation=<Button ref={menuRef} color="secondary" variant="ghost" uniform className="mobile-nav-button" aria-label={t('打开导航','Open navigation')} aria-expanded={drawer} onClick={()=>setDrawer(true)}><MenuIcon/></Button>;
  const newChatAction=<Button color="secondary" variant="ghost" uniform className="mobile-nav-button" aria-label={appNavigation.newChat.label} onClick={newChat}><appNavigation.newChat.Icon/></Button>;
  return <UserAvatarContext.Provider value={data.profile.avatarImage}><div className="mobile-shell">
    <div className="mobile-workspace" inert={drawer}>
      {connection==='offline'&&<div className="mobile-offline" role="status"><span>{t('连接已中断，已读取的内容和草稿仍在。','Disconnected. Your loaded content and drafts are still here.')}</span><Button color="secondary" variant="ghost" size="sm" onClick={()=>void refresh().catch(()=>{})}>{t('重试','Retry')}</Button></div>}
      <WorkspaceVisibility.Provider value={isChat}><div className="mobile-chat-host" hidden={!isChat}>
        {currentTask?.remoteExecution?<RemoteTaskWorkspace task={currentTask} navigation={navigation} onRefresh={refresh}/>:<AssistantWorkspace presentation="mobile" active={isChat} connected={connection==='connected'} navigation={navigation} headerActions={newChatAction} data={data} taskId={chatRoute.view==='task'?chatRoute.id:undefined} composition={composition} onRefresh={refresh} onCreateTask={async(prompt,facts,agents,mode,connectionId,projectId,attachmentIds,connectorIds,digitalTwinEnabled,approvalMode)=>{
          const task=await write<Task>('/tasks',{prompt,contextFactIds:facts,agentIds:agents,mode:mode||'live',connectionId,projectId,attachmentIds,connectorIds,digitalTwinEnabled,approvalMode});
          await refresh();go('task',task.id);try{await write('/tasks/'+task.id+'/run');}finally{await refresh();}
        }}/>}
      </div></WorkspaceVisibility.Provider>
      <><header hidden={isChat||isAgentRoom} className="mobile-header"><Button color="secondary" variant="ghost" uniform className="mobile-nav-button" aria-label={t('返回','Back')} onClick={back}><ArrowLeft/></Button><h1>{title}</h1></header>{Object.values(workspaceRoutes).map(workspaceRoute=><WorkspaceVisibility.Provider key={workspaceRoute.view} value={!isChat&&workspaceRoute.view===route.view}><main hidden={isChat||workspaceRoute.view!==route.view} ref={node=>{if(workspaceRoute.view===route.view)mainRef.current=node;}} className={'mobile-main mobile-view-'+workspaceRoute.view} data-mobile-layout={workspaceRoute.view==='agents'&&workspaceRoute.id&&!['market','network','dating','discover'].includes(workspaceRoute.id)?'conversation':undefined} >
        {cognitionNav.some(item=>item.id===workspaceRoute.view)&&<CognitionWorkspace presentation="mobile" view={workspaceRoute.view} data={data} onRefresh={refresh} onCreateTask={prepareTask}/>} 
        {workspaceRoute.view==='projects'&&<ProjectWorkspace data={data} id={workspaceRoute.id} onRefresh={refresh} onChat={id=>prepareTask('',undefined,[],id)}/>} 
        {workspaceRoute.view==='artifacts'&&<ArtifactWorkspace data={data} id={workspaceRoute.id} onRefresh={refresh}/>} 
        {workspaceRoute.view==='automations'&&<AutomationWorkspace data={data} onRefresh={refresh} onTask={id=>go('task',id)}/>} 
        {workspaceRoute.view==='agents'&&<AgentWorkspace presentation="mobile" navigation={navigation} data={data} onRefresh={refresh} onTask={id=>go('task',id)} initialRoomId={workspaceRoute.id}/>} 
        {workspaceRoute.view==='settings'&&<SettingsWorkspace presentation="mobile" data={data} onRefresh={refresh} theme={appearance.theme} onTheme={theme=>updateAppearance({theme})} initialCategory={workspaceRoute.id} appearance={appearance} appearanceStatus={appearanceStatus} onAppearance={updateAppearance}/>} 
        {workspaceRoute.view==='history'&&<MobileHistory data={data} onRefresh={refresh}/>}
        {workspaceRoute.view==='development'&&<DevelopmentWorkspace onExplore={()=>setGuideOpen(true)}/>}
        {workspaceRoute.view==='components'&&<ComponentCatalogue appearance={appearance}/>}
        {workspaceRoute.view==='devices'&&<DeviceSimulator/>}
        {workspaceRoute.view==='graph-lab'&&<section className="graph-lab"><header><ButtonLink as="a" href="#components" color="secondary" variant="ghost" size="sm">{t('返回组件目录','Back to components')}</ButtonLink><span>{t(`${graphFixture.people.length} 位虚构人物，仅供交互体验`,`${graphFixture.people.length} fictional people for interaction testing`)}</span></header><RelationshipGraph data={graphFixture} refs={()=>null} onRefresh={async()=>{}} readOnly/></section>}
 
        {!cognitionNav.some(item=>item.id===workspaceRoute.view)&&!['projects','artifacts','automations','agents','settings','history','development','components','devices','graph-lab'].includes(workspaceRoute.view)&&<div className="mobile-empty"><h2>{t('这条记录暂时不可用','This record is unavailable')}</h2><ButtonLink as="a" href="#assistant" color="secondary">{t('回到对话','Back to chat')}</ButtonLink></div>}
      </main></WorkspaceVisibility.Provider>)}</>
    </div>
    {drawer&&<div className="mobile-drawer-layer"><button className="mobile-drawer-scrim" aria-label={t('关闭导航','Close navigation')} onClick={()=>setDrawer(false)}/><aside ref={drawerRef} className="mobile-drawer" role="dialog" aria-modal="true" aria-label={t('主导航','Main navigation')} tabIndex={-1}><header><HitherMark/><HitherWordmark/><Button color="secondary" variant="ghost" uniform aria-label={t('关闭导航','Close navigation')} onClick={()=>setDrawer(false)}><CloseBold/></Button></header><div className="mobile-drawer-scroll"><Button color="secondary" variant="ghost" pill={false} className="mobile-drawer-action" onClick={newChat}><appNavigation.newChat.Icon/>{appNavigation.newChat.label}</Button><nav aria-label={t('工作区','Workspace')}><ButtonLink as="a" href={'#'+appNavigation.search.id} color="secondary" variant="ghost" pill={false} className="mobile-drawer-action"><appNavigation.search.Icon/>{appNavigation.search.label}</ButtonLink><Button color="secondary" variant="ghost" pill={false} className="mobile-drawer-action" aria-expanded={twinExpanded} onClick={()=>setTwinExpanded(value=>!value)}><appNavigation.digitalTwin.Icon/>{appNavigation.digitalTwin.label}<ChevronDown className={twinExpanded?'':'is-collapsed'}/></Button>{twinExpanded&&<div className="mobile-drawer-subnav">{cognitionNav.map(item=><ButtonLink as="a" href={'#'+item.id} key={item.id} color="secondary" variant="ghost" pill={false} className="mobile-drawer-action" aria-current={route.view===item.id?'page':undefined}><item.Icon/>{item.label}</ButtonLink>)}</div>}{[...appNavigation.workspaces,appNavigation.projects].map(item=><ButtonLink as="a" href={'#'+item.id} key={item.id} color="secondary" variant="ghost" pill={false} className="mobile-drawer-action" aria-current={route.view===item.id?'page':undefined}><item.Icon/>{item.label}</ButtonLink>)}</nav><section className="mobile-recent-chats"><a href="#history">{appNavigation.recentChats}<ArrowRight/></a><RecentChats presentation="mobile" data={{...data,tasks}} query="" view={route.view} id={route.id} onRefresh={refresh}/></section></div><footer><a href="#settings" aria-label={t('个人菜单','Profile menu')} aria-haspopup="dialog" onClick={event=>{event.preventDefault();setDrawer(false);setAccountOpen(true);}}><span className="profile-avatar">{data.profile.name.slice(0,1)}</span><span>{data.profile.name}<small>{t('个人菜单','Profile menu')}</small></span><ArrowRight/></a></footer></aside></div>}
    {accountOpen&&<BottomSheet title={data.profile.name} onClose={()=>setAccountOpen(false)}><div className="mobile-sheet-actions"><ButtonLink as="a" href="#settings/personal" color="secondary" variant="ghost" onClick={()=>setAccountOpen(false)}>{t('个人资料','Profile')}</ButtonLink><ButtonLink as="a" href="#settings/appearance" color="secondary" variant="ghost" onClick={()=>setAccountOpen(false)}>{t('外观与个性化','Appearance')}</ButtonLink><ButtonLink as="a" href="#settings" color="secondary" variant="ghost" onClick={()=>setAccountOpen(false)}>{t('设置','Settings')}</ButtonLink><ButtonLink as="a" href="#settings/computer" color="secondary" variant="ghost" onClick={()=>setAccountOpen(false)}>{t('我的电脑','My computer')}</ButtonLink><Button color="secondary" variant="ghost" onClick={()=>{setAccountOpen(false);setGuideOpen(true);}}>{t('探索 SecondU','Explore SecondU')}</Button><ButtonLink as="a" href="#development" color="secondary" variant="ghost" onClick={()=>setAccountOpen(false)}>{t('构建过程与开发记录','Development history')}</ButtonLink><ButtonLink as="a" href="#components" color="secondary" variant="ghost" onClick={()=>setAccountOpen(false)}>{t('组件与设计规范','Design system')}</ButtonLink><Button color="secondary" variant="ghost" loading={switchingSpace} disabled={switchingSpace} onClick={()=>{setSwitchingSpace(true);setAccountError('');void enterLocalSpace(data.profile.demo?PERSONAL_SPACE:exampleSpaceForLocale(locale)).catch(error=>{setAccountError(messageOf(error));setSwitchingSpace(false);});}}>{data.profile.demo?t('退出示例','Exit example'):t('查看示例','View example')}</Button></div><ErrorNotice error={accountError}/></BottomSheet>}
    {guideOpen&&<ProductGuide presentation="mobile" onClose={()=>setGuideOpen(false)} onNavigate={view=>{setGuideOpen(false);go(view);}}/>}
  </div></UserAvatarContext.Provider>;
}

function MobileHistory({data,onRefresh}:{data:Bootstrap;onRefresh:()=>Promise<void>}){
  const [query,setQuery]=useState('');
  return <section className="mobile-history"><Input value={query} onChange={event=>setQuery(event.target.value)} aria-label={t('搜索对话','Search chats')} placeholder={t('搜索对话','Search chats')}/><RecentChats presentation="mobile" data={data} query={query} view="history" onRefresh={onRefresh}/></section>;
}
