import {useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Dialog,ErrorNotice} from './components';
import {api,messageOf} from './api';
import {t} from './i18n';
import {PERSONAL_SPACE} from './space';

/** Configuration stays interactive; only the final execution action opens this notice. */
export function ExampleExecutionNotice({onClose}:{onClose:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function openPersonal(){
    setBusy(true);setError('');
    try{
      await api(`/spaces/${PERSONAL_SPACE}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},true);
      const url=new URL(location.href);url.searchParams.set('space',PERSONAL_SPACE);url.hash='assistant';location.assign(url.href);
    }catch(error){setError(messageOf(error));setBusy(false);}
  }
  return <Dialog title={t('当前为示例模式','You are in example mode')} onClose={()=>{if(!busy)onClose();}} className="example-execution-dialog">
    <p>{t('你可以调整模型、编辑内容和修改配置。实际发送与任务执行需要进入个人空间。','You can choose models, edit content and change settings. Open your personal workspace to send messages or run tasks.')}</p>
    <ErrorNotice error={error}/>
    <div className="dialog-actions"><Button color="secondary" variant="ghost" disabled={busy} onClick={onClose}>{t('继续体验','Continue exploring')}</Button><Button color="primary" loading={busy} onClick={()=>void openPersonal()}>{t('进入个人空间','Open personal workspace')}</Button></div>
  </Dialog>;
}
