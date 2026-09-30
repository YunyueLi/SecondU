import {useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import {api,messageOf} from './api';
import {ErrorNotice} from './components';
import {currentSpace,ENGINEER_SPACE,PERSONAL_SPACE,type SpaceId} from './space';
import {t} from './i18n';

export function LocalSpaces({compact=false}:{compact?:boolean}){
  const current=currentSpace();
  const [busy,setBusy]=useState<SpaceId>(),[error,setError]=useState('');
  async function enter(space:SpaceId){
    setBusy(space);setError('');
    try{
      if(space!=='main')await api('/spaces/'+space,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},true);
      const url=new URL(location.href);url.searchParams.set('space',space);url.hash='';
      location.assign(url.href);
    }catch(error){setError(messageOf(error));setBusy(undefined);}
  }
  const personal=current===PERSONAL_SPACE,example=current===ENGINEER_SPACE;
  return <section className={compact?'settings-example-notice':'settings-example-entry'}>
    <div><h3>{personal?t('体验示例','Explore an example'):example?t('当前为示例资料','You are viewing example data'):t('早期记录','Earlier records')}</h3>
      <p>{personal?t('通过一段完整的生活与工作体验 SecondU。','Explore SecondU through an example of life and work.'):example?t('示例与你的个人资料分开保存。','Examples are kept separate from your own data.'):t('这里保留了早期版本保存的内容。','Content saved in the earlier version is kept here.')}</p></div>
    <Button color="secondary" variant={compact?'ghost':'outline'} size="sm" loading={!!busy} disabled={!!busy} onClick={()=>void enter(personal?ENGINEER_SPACE:PERSONAL_SPACE)}>{personal?t('查看示例','View example'):t('返回我的空间','Back to my space')}<ArrowRight/></Button>
    <ErrorNotice error={error}/>
    {!compact&&current!=='main'&&<details className="settings-previous-space"><summary>{t('以前保存的内容','Previously saved content')}</summary><p>{t('早期版本中保存的对话和资料仍可查看。','Chats and data saved in an earlier version remain available.')}</p><Button color="secondary" variant="ghost" size="sm" disabled={!!busy} onClick={()=>void enter('main')}>{t('查看早期记录','View earlier records')}<ArrowRight/></Button></details>}
  </section>;
}
