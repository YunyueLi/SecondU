import {useState,useEffect} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import {api,messageOf} from './api';
import {Dialog,ErrorNotice} from './components';
import {currentSpace,exampleSpaceForLocale,isExampleSpace,LEGACY_ENGINEER_SPACE,PERSONAL_SPACE,type SpaceId} from './space';
import {t,getLocale} from './i18n';
import './local-spaces.css';

export async function enterLocalSpace(space:SpaceId){
  if(space!=='main')await api('/spaces/'+space,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},true);
  const url=new URL(location.href);url.searchParams.set('space',space);url.hash='';
  location.assign(url.href);
}

export function LocalSpacesDialog({onClose}:{onClose:()=>void}){
  return <Dialog title={isExampleSpace(currentSpace())?t('示例空间','Example workspace'):t('体验示例','Explore an example')} className="local-spaces-dialog" onClose={onClose}><LocalSpaces standalone/></Dialog>;
}

export function LocalSpaces({compact=false,standalone=false}:{compact?:boolean;standalone?:boolean}){
  const current=currentSpace();
  const [hasLegacy,setHasLegacy]=useState(false);
  useEffect(()=>{if(compact)return;let active=true;void api<{spaces:{id:string;exists?:boolean}[]}>('/spaces',{},true).then(value=>{if(active)setHasLegacy(value.spaces.some(space=>space.id===LEGACY_ENGINEER_SPACE&&space.exists));}).catch(()=>{});return()=>{active=false;};},[compact]);
  const [busy,setBusy]=useState<SpaceId>(),[error,setError]=useState('');
  async function enter(space:SpaceId){
    setBusy(space);setError('');
    try{
      await enterLocalSpace(space);
    }catch(error){setError(messageOf(error));setBusy(undefined);}
  }
  const personal=current===PERSONAL_SPACE,example=isExampleSpace(current);
  return <section className={compact?'settings-example-notice':'settings-example-entry'}>
    <div>{!standalone&&<h3>{personal?t('体验示例','Explore an example'):example?t('当前为示例资料','You are viewing example data'):t('早期记录','Earlier records')}</h3>}
      <p>{personal?t('通过万叶的工作与生活体验 SecondU。','Explore SecondU through Caspian’s work and everyday life.'):example?t('示例与你的个人资料分开保存。','Examples are kept separate from your own data.'):t('这里保留了早期版本保存的内容。','Content saved in the earlier version is kept here.')}</p></div>
    <Button color="secondary" variant={compact?'ghost':'outline'} size="sm" loading={!!busy} disabled={!!busy} onClick={()=>void enter(personal?exampleSpaceForLocale(getLocale()):PERSONAL_SPACE)}>{personal?t('查看示例','View example'):t('返回我的空间','Back to my space')}<ArrowRight/></Button>
    <ErrorNotice error={error}/>
    {!compact&&current!=='main'&&<details className="settings-previous-space"><summary>{t('以前保存的内容','Previously saved content')}</summary><p>{t('早期版本中保存的对话和资料仍可查看。','Chats and data saved in an earlier version remain available.')}</p><Button color="secondary" variant="ghost" size="sm" disabled={!!busy} onClick={()=>void enter('main')}>{t('查看早期记录','View earlier records')}<ArrowRight/></Button>{hasLegacy&&current!==LEGACY_ENGINEER_SPACE&&<Button color="secondary" variant="ghost" size="sm" disabled={!!busy} onClick={()=>void enter(LEGACY_ENGINEER_SPACE)}>{t('查看旧版示例','View the previous example')}<ArrowRight/></Button>}</details>}
  </section>;
}
