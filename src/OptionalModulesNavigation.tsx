import {useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Popover} from '@openai/apps-sdk-ui/components/Popover';
import {DotsHorizontalMoreMenu,Pin,PinFilled} from '@openai/apps-sdk-ui/components/Icon';
import {getAppNavigation,isOptionalWorkspace} from './navigation';
import {OPTIONAL_WORKSPACE_IDS,type OptionalWorkspace} from './optional-navigation-model.mjs';
import {useNavigationPreferences} from './NavigationPreferences';
import {t} from './i18n';
import './optional-modules-navigation.css';

/** One preference drives the expanded sidebar, icon rail, and phone drawer. */
export function usePinnedOptionalModules(){
  const state=useNavigationPreferences();
  const pinned=state.value.pinned;
  const toggle=(id:string)=>{
    if(!OPTIONAL_WORKSPACE_IDS.includes(id as OptionalWorkspace)||state.busy)return;
    void state.client.setPinned(id as OptionalWorkspace,!pinned.includes(id as OptionalWorkspace));
  };
  return {...state,pinned,toggle};
}

export function OptionalModulesMenu({workspace,rail=false,presentation='desktop',onNavigate}:{workspace:string;rail?:boolean;presentation?:'desktop'|'mobile';onNavigate?:(workspace:string,section?:string)=>void}){
  const [open,setOpen]=useState(false);
  const preference=usePinnedOptionalModules();
  const {pinned,toggle}=preference;
  const active=isOptionalWorkspace(workspace)&&!pinned.includes(workspace)&&!['agents','finance'].includes(workspace);
  const select=(id:string)=>{
    setOpen(false);
    if(onNavigate)onNavigate(id,id==='finance'?'overview':undefined);
    else location.hash=id==='finance'?'finance/overview':id;
  };
  return <Popover open={open} onOpenChange={setOpen}>
    <Popover.Trigger><Button color="secondary" variant="ghost" size="lg" pill={false} className={`nav-item optional-modules-trigger ${presentation==='mobile'?'is-mobile':''}`} aria-label={t('更多功能','More features')} title={rail?t('更多功能','More features'):undefined} aria-current={active?'page':undefined} selected={active}><DotsHorizontalMoreMenu/>{!rail&&<span>{t('更多','More')}</span>}</Button></Popover.Trigger>
    <Popover.Content side={rail?'right':'bottom'} align="start" width={248} minWidth="auto" className={`optional-modules-popover ${presentation==='mobile'?'is-mobile':''}`}>
      <div className="optional-modules-heading">{t('按需使用','Choose what you need')}</div>

      {getAppNavigation().optionalWorkspaces.map(({id,label,Icon})=>{
        const fixed=pinned.includes(id);
        const pinLabel=fixed?t(`取消固定${label}`,`Unpin ${label}`):t(`固定${label}到侧栏`,`Pin ${label} to sidebar`);
        return <div className="optional-module-row" key={id}>
          <Button color="secondary" variant="ghost" pill={false} className="optional-module-open" aria-current={workspace===id?'page':undefined} selected={workspace===id} onClick={()=>select(id)}><Icon/><span>{label}</span></Button>
          <Button color="secondary" variant="ghost" uniform pill={false} className="optional-module-pin" aria-label={pinLabel} title={pinLabel} aria-pressed={fixed} disabled={!preference.ready||preference.busy} onClick={()=>toggle(id)}>{fixed?<PinFilled/>:<Pin/>}</Button>
        </div>;
      })}
    </Popover.Content>
  </Popover>;
}
