import {useEffect,useRef,useState,useSyncExternalStore,type ClipboardEvent,type DragEvent,type ChangeEvent} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {LoadingIndicator} from '@openai/apps-sdk-ui/components/Indicator';
import {CloseBold,Paperclip,Reload,Download} from '@openai/apps-sdk-ui/components/Icon';
import {api,apiUrl} from '../api';
import {Dialog} from '../components';
import {t} from '../i18n';
import { useUnsavedChanges } from '../useUnsavedChanges';
import {createAttachmentDrafts,previewableImage,type AttachmentRef,type AttachmentUploader,type DraftAttachment} from './attachmentState';
import './attachments.css';
export type {AttachmentRef,DraftAttachment,AttachmentUploader} from './attachmentState';

function base64File(file:File,signal:AbortSignal):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    const abort=()=>reader.abort();
    const cleanup=()=>signal.removeEventListener('abort',abort);
    reader.onload=()=>{cleanup();if(signal.aborted)reject(new DOMException('Aborted','AbortError'));else resolve(String(reader.result).split(',')[1]||'');};
    reader.onerror=()=>{cleanup();reject(new Error(t('无法读取这个文件，请重新选择。','Could not read this file. Choose it again.')));};
    reader.onabort=()=>{cleanup();reject(new DOMException('Aborted','AbortError'));};
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    signal.addEventListener('abort',abort,{once:true});reader.readAsDataURL(file);
  });
}

export const uploadAttachment:AttachmentUploader=async(file,signal)=>{
  const data=await base64File(file,signal);
  return api<AttachmentRef>('/attachments',{method:'POST',signal,body:JSON.stringify({name:file.name,mime:file.type,data})});
};

export function useAttachments({onUpload=uploadAttachment,maxFiles,maxBytes,contextKey='default'}:{onUpload?:AttachmentUploader;maxFiles?:number;maxBytes?:number;contextKey?:string}={}){
  const uploader=useRef(onUpload);uploader.current=onUpload;
  // Each chat owns its draft and in-flight upload. Switching rooms changes the
  // subscription, while the previous draft remains available when returning.
  const [stores]=useState(()=>new Map<string,ReturnType<typeof createAttachmentDrafts>>());
  let store=stores.get(contextKey);
  if(!store){store=createAttachmentDrafts({upload:(file,signal)=>uploader.current(file,signal),maxFiles,maxBytes});stores.set(contextKey,store);}
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  useUnsavedChanges(() => {
    const items = [...stores.values()].flatMap(draft => draft.getSnapshot().items);
    return { unsaved: items.length > 0, busy: items.some(item => item.status === 'uploading') };
  });
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{for(const draft of stores.values())draft.clear();},[stores]);
  const readyAttachments=snapshot.items.flatMap(item=>item.status==='ready'&&item.attachment?[item.attachment]:[]);
  const onPaste=(event:ClipboardEvent<HTMLElement>)=>{
    const files=Array.from(event.clipboardData.files);
    if(!files.length)return false;
    event.preventDefault();void store.addFiles(files);return true;
  };
  const onFiles=(event:ChangeEvent<HTMLInputElement>)=>{const files=Array.from(event.currentTarget.files||[]);event.currentTarget.value='';void store.addFiles(files);};
  const onDragOver=(event:DragEvent<HTMLElement>)=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}};
  const onDrop=(event:DragEvent<HTMLElement>)=>{if(event.dataTransfer.files.length){event.preventDefault();void store.addFiles(event.dataTransfer.files);}};
  return {...snapshot,inputRef,onFiles,onPaste,onDragOver,onDrop,addFiles:store.addFiles,remove:store.remove,retry:store.retry,clear:store.clear,maxFiles:store.maxFiles,maxBytes:store.maxBytes,readyAttachments,attachmentIds:readyAttachments.map(item=>item.id),busy:snapshot.items.some(item=>item.status==='uploading'),hasErrors:snapshot.items.some(item=>item.status==='error')};
}
export type AttachmentsController=ReturnType<typeof useAttachments>;

const fileSize=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1024*1024?`${Math.ceil(bytes/1024)} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;
function draftError(item:DraftAttachment,maxBytes:number){
  if(item.error?.code==='too_large')return t(`文件超过 ${fileSize(maxBytes)}，请换一个较小的文件。`,`This file exceeds ${fileSize(maxBytes)}. Choose a smaller file.`);
  if(item.error?.code==='empty')return t('文件为空，请重新选择。','This file is empty. Choose another file.');
  return item.error?.message||t('附件未保存，请重试。','The attachment was not saved. Try again.');
}

/** Put beside the shared input. Sending must wait while busy or hasErrors. */
export function AttachmentDrafts({controller,disabled=false}:{controller:AttachmentsController;disabled?:boolean}){
  return <><input type="file" multiple hidden ref={controller.inputRef} onChange={controller.onFiles} disabled={disabled} aria-label={t('选择附件','Choose attachments')}/>
    {!!controller.items.length&&<div className="attachment-drafts" aria-label={t('待发送附件','Attachments to send')}>
      {controller.items.map(item=><div key={item.id} className={`attachment-draft ${item.previewUrl?'has-image':''} is-${item.status}`}>
        {item.previewUrl?<img src={item.previewUrl} alt={item.file.name}/>:<span className="attachment-file-icon"><Paperclip/></span>}
        <div className="attachment-draft-description"><strong title={item.file.name}>{item.file.name}</strong><span className="attachment-draft-meta"><span>{fileSize(item.file.size)}</span>{item.status==='uploading'&&<span>{t('正在保存','Saving')}</span>}</span>{item.error&&<p role="alert">{draftError(item,controller.maxBytes)}</p>}</div>
        {item.status==='uploading'&&<LoadingIndicator/>}
        {item.error?.code==='upload_failed'&&<Button type="button" color="secondary" variant="ghost" size="sm" uniform disabled={disabled} aria-label={t(`重试 ${item.file.name}`,`Retry ${item.file.name}`)} onClick={()=>void controller.retry(item.id)}><Reload/></Button>}
        <Button type="button" color="secondary" variant="ghost" size="sm" uniform disabled={disabled} aria-label={t(`移除 ${item.file.name}`,`Remove ${item.file.name}`)} onClick={()=>controller.remove(item.id)}><CloseBold/></Button>
      </div>)}
    </div>}
    {controller.limitReached&&<p className="attachment-limit" role="alert">{t(`每条消息最多添加 ${controller.maxFiles} 个附件，超出的文件未添加。`,`Each message accepts up to ${controller.maxFiles} attachments. Extra files were not added.`)}</p>}
  </>;
}

function attachmentUrl(attachment:AttachmentRef):string|undefined{
  // Attachment rendering may only address the local blob API, including the
  // current demo space. A model-provided remote URL cannot initiate a request.
  if(/^\/api\/attachments\/[a-zA-Z0-9_-]+$/.test(attachment.url))return apiUrl(attachment.url);
  if(/^\/api\/spaces\/[a-zA-Z0-9_-]+\/attachments\/[a-zA-Z0-9_-]+$/.test(attachment.url))return attachment.url;
}

export function MessageAttachments({attachments}:{attachments:AttachmentRef[]}){
  const [preview,setPreview]=useState<AttachmentRef>();
  return <><div className="message-attachments" aria-label={t('消息附件','Message attachments')}>
    {attachments.map(attachment=>{
      const url=attachmentUrl(attachment);if(!url)return <span className="message-file" key={attachment.id}><Paperclip/>{attachment.name}</span>;
      return attachment.kind==='image'&&previewableImage(attachment.mime)?<button type="button" className="message-image" key={attachment.id} aria-label={t(`预览 ${attachment.name}`,`Preview ${attachment.name}`)} title={attachment.name} onClick={()=>setPreview(attachment)}><img src={url} alt={attachment.name} loading="lazy"/></button>:<a className="message-file" key={attachment.id} href={url} download={attachment.name}><Paperclip/><span>{attachment.name}<small>{fileSize(attachment.size)}</small></span><Download/></a>;
    })}
  </div>{preview&&<Dialog title={preview.name} className="attachment-preview" onClose={()=>setPreview(undefined)}><img src={attachmentUrl(preview)} alt={preview.name}/><a href={attachmentUrl(preview)} download={preview.name}>{t('下载原图','Download original')}</a></Dialog>}</>;
}
