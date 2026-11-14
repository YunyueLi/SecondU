import {useRef,useState} from 'react';
import type {Source} from '../../shared/contracts';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Select} from '@openai/apps-sdk-ui/components/Select';
import {LibraryImportDialog} from '../LibraryImportDialog';
import {Dialog,ErrorNotice,Field} from '../components';
import {messageOf,write} from '../api';
import {t} from '../i18n';
import {useUnsavedChanges} from '../useUnsavedChanges';
import {createSourceImportTransaction} from './sourceImportState';

type ImportCallbacks={onRefresh:()=>Promise<void>;onImported?:(source:Source)=>void};

/** Keeps a successful write distinct from loading its updated library. */
export function useSourceCommit({onRefresh,onImported}:ImportCallbacks){
  const transaction=useRef(createSourceImportTransaction()),working=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[committed,setCommitted]=useState<Source>();
  async function save(create?:()=>Promise<Source>){
    if(working.current)return;
    working.current=true;setBusy(true);setError('');
    try{
      let source=transaction.current.committed;
      if(!source){
        if(!create)return;
        try{source=await transaction.current.commit(create);setCommitted(source);}
        catch(cause){setError(messageOf(cause));return;}
      }
      try{await transaction.current.refresh(onRefresh);}
      catch(cause){setError(`${t('资料已保存，资料库暂未刷新。请重试刷新，无需再次保存。','The source is saved, but the library could not refresh. Retry the refresh without saving again.')} ${messageOf(cause)}`);return;}
      onImported?.(source);
      transaction.current.reset();setCommitted(undefined);
    }finally{working.current=false;setBusy(false);}
  }
  return {busy,error,committed,save,retryRefresh:()=>save()};
}

export function SourceTextImport({onClose,onRefresh,onImported,noteOnly=false}:ImportCallbacks&{onClose:()=>void;noteOnly?:boolean}){
  const [note,setNote]=useState(noteOnly);
  const [title,setTitle]=useState(''),[text,setText]=useState(''),[kind,setKind]=useState<Source['kind']>('note');
  const complete=(source:Source)=>{onImported?.(source);onClose();};
  const submission=useSourceCommit({onRefresh,onImported:complete});
  const working=submission.busy,committed=submission.committed,locked=working||!!committed;
  useUnsavedChanges({unsaved:!committed&&(!!title||!!text||kind!=='note'),busy:working});
  if(!note)return <LibraryImportDialog onClose={onClose} onNote={()=>setNote(true)} onDone={root=>{location.hash=`artifacts/${root.id}`;}}/>;
  return <Dialog className="record-dialog" title={t('粘贴短笔记','Paste a note')} onClose={()=>{if(!working)onClose();}}><form className="cog-stack record-form" onSubmit={event=>{
    event.preventDefault();if(working)return;
    void submission.save(()=>write<Source>('/sources',{title,text,kind}));
  }}>
    <Field label={t('资料标题','Source title')}><Input aria-label={t('资料标题','Source title')} required maxLength={300} value={title} disabled={locked} onChange={event=>setTitle(event.target.value)}/></Field>
    <Field label={t('资料类型','Source type')}><Select align="start" listMinWidth={180} listMaxWidth={260} value={kind} disabled={locked} options={[{value:'note',label:t('笔记','Note')},{value:'conversation',label:t('对话记录','Conversation records')},{value:'document',label:t('文档','Document')},{value:'feedback',label:t('我的反馈','My feedback')}]} onChange={option=>setKind(option.value as Source['kind'])}/></Field>
    <Field label={t('原始文字','Original text')}><Textarea aria-label={t('原始文字','Original text')} required rows={9} maxLength={200000} value={text} disabled={locked} onChange={event=>setText(event.target.value)}/></Field>
    <p className="cog-muted">{t('资料保存在这台电脑。导入不会自动生成已确认的事实。','Saved on this computer. Importing does not confirm facts automatically.')}</p>
    <ErrorNotice error={submission.error}/><Button color="primary" type="submit" loading={working} disabled={working}>{committed?t('重试刷新资料库','Retry library refresh'):t('保存资料','Save source')}</Button>
  </form></Dialog>;
}
