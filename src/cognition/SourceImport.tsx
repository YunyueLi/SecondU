import {useRef,useState} from 'react';
import type {Source} from '../../shared/contracts';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Select} from '@openai/apps-sdk-ui/components/Select';
import {Download} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog,ErrorNotice,Field} from '../components';
import {messageOf,write} from '../api';
import {t} from '../i18n';
import {useUnsavedChanges} from '../useUnsavedChanges';
import {createSourceImportTransaction} from './sourceImportState';

export const SOURCE_FILE_ACCEPT='.txt,.md,.markdown,.csv,.json';
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

/** Reuses the library's text-file import contract and saves to /sources. */
export function useSourceFileImport(callbacks:ImportCallbacks){
  const inputRef=useRef<HTMLInputElement>(null);
  const submission=useSourceCommit(callbacks);
  async function importFile(file?:File){
    if(!file||submission.busy)return;
    await submission.save(async()=>{
      if(file.size>1024*1024)throw new Error(t('请选择小于 1 MiB 的文字文件。','Choose a text file smaller than 1 MiB.'));
      if(!/\.(txt|md|markdown|csv|json)$/i.test(file.name))throw new Error(t('支持 TXT、Markdown、CSV 和 JSON 文字文件。','Supported formats: TXT, Markdown, CSV, and JSON.'));
      let text:string;
      try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error(t('请选择有效的 UTF-8 文字文件。','Choose a valid UTF-8 text file.'));}
      if(text.includes('\0'))throw new Error(t('这个文件不是可读取的文字文件。','This file is not readable text.'));
      return write<Source>('/sources',{title:file.name,text,kind:'document'});
    });
    if(inputRef.current)inputRef.current.value='';
  }
  return {inputRef,...submission,importFile};
}

export function SourceTextImport({onClose,onRefresh,onImported}:ImportCallbacks&{onClose:()=>void}){
  const [title,setTitle]=useState(''),[text,setText]=useState(''),[kind,setKind]=useState<Source['kind']>('note');
  const complete=(source:Source)=>{onImported?.(source);onClose();};
  const submission=useSourceCommit({onRefresh,onImported:complete});
  const fileImport=useSourceFileImport({onRefresh,onImported:complete});
  const working=submission.busy||fileImport.busy,committed=submission.committed||fileImport.committed,locked=working||!!committed;
  useUnsavedChanges({unsaved:!committed&&(!!title||!!text||kind!=='note'),busy:working});
  return <Dialog className="record-dialog" title={t('导入文字资料','Import text')} onClose={()=>{if(!working)onClose();}}><form className="cog-stack record-form" onSubmit={event=>{
    event.preventDefault();if(working)return;
    if(fileImport.committed){void fileImport.retryRefresh();return;}
    void submission.save(()=>write<Source>('/sources',{title,text,kind}));
  }}>
    <input ref={fileImport.inputRef} type="file" hidden accept={SOURCE_FILE_ACCEPT} disabled={locked} onChange={event=>void fileImport.importFile(event.target.files?.[0])}/>
    <Button type="button" color="secondary" variant="outline" disabled={locked} loading={fileImport.busy} onClick={()=>fileImport.inputRef.current?.click()}><Download/>{t('导入文字文件','Import a text file')}</Button><p className="cog-muted">{t('TXT、Markdown、CSV 或 JSON，最大 1 MiB；也可以在下方粘贴文字。','TXT, Markdown, CSV or JSON, up to 1 MiB. You can also paste text below.')}</p>
    <Field label={t('资料标题','Source title')}><Input aria-label={t('资料标题','Source title')} required maxLength={300} value={title} disabled={locked} onChange={event=>setTitle(event.target.value)}/></Field>
    <Field label={t('资料类型','Source type')}><Select align="start" listMinWidth={180} listMaxWidth={260} value={kind} disabled={locked} options={[{value:'note',label:t('笔记','Note')},{value:'conversation',label:t('对话记录','Conversation records')},{value:'document',label:t('文档','Document')},{value:'feedback',label:t('我的反馈','My feedback')}]} onChange={option=>setKind(option.value as Source['kind'])}/></Field>
    <Field label={t('原始文字','Original text')}><Textarea aria-label={t('原始文字','Original text')} required rows={9} maxLength={200000} value={text} disabled={locked} onChange={event=>setText(event.target.value)}/></Field>
    <p className="cog-muted">{t('资料保存在这台电脑。导入不会自动生成已确认的事实。','Saved on this computer. Importing does not confirm facts automatically.')}</p>
    <ErrorNotice error={submission.error||fileImport.error}/><Button color="primary" type="submit" loading={working} disabled={working}>{committed?t('重试刷新资料库','Retry library refresh'):t('保存资料','Save source')}</Button>
  </form></Dialog>;
}
