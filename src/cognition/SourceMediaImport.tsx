import {useState} from 'react';
import type {Source} from '../../shared/contracts';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Images} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog,ErrorNotice,Field} from '../components';
import {AttachmentDrafts,uploadAttachment,useAttachments} from '../composer/attachments';
import {previewableImage,previewableVideo} from '../composer/attachmentState';
import {write} from '../api';
import {useSourceCommit} from './SourceImport';
import {t} from '../i18n';
import {useUnsavedChanges} from '../useUnsavedChanges';

const MEDIA_ACCEPT='image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm';

/** Library and growth use one media import. Saving originals does not analyze them. */
export function SourceMediaImport({onClose,onRefresh,onImported}:{onClose:()=>void;onRefresh:()=>Promise<void>;onImported?:(source:Source)=>void}){
  const [title,setTitle]=useState(''),[text,setText]=useState('');
  const submission=useSourceCommit({onRefresh,onImported:source=>{onImported?.(source);onClose();}});
  const {busy,error,committed}=submission,locked=busy||!!committed;
  const attachments=useAttachments({contextKey:'source-media',maxFiles:6,maxBytes:64*1024*1024,onUpload:async(file,signal)=>{
    if(!previewableImage(file.type)&&!previewableVideo(file.type))throw new Error(t('请选择 PNG、JPEG、WebP、GIF 图片，或 MP4、MOV、WebM 视频。','Choose PNG, JPEG, WebP or GIF images, or MP4, MOV or WebM videos.'));
    return uploadAttachment(file,signal);
  }});
  useUnsavedChanges({unsaved:!committed&&(!!title||!!text||attachments.items.length>0),busy:busy||attachments.busy});
  return <Dialog title={t('导入照片与视频','Import photos and videos')} className="record-dialog source-media-import" onClose={()=>{if(!busy)onClose();}}><form className="cog-stack record-form" onDragOver={attachments.onDragOver} onDrop={event=>{if(!locked)attachments.onDrop(event);else event.preventDefault();}} onSubmit={async event=>{
    event.preventDefault();if(busy)return;
    if(committed){await submission.retryRefresh();return;}
    if(attachments.busy||attachments.hasErrors||!attachments.attachmentIds.length)return;
    await submission.save(()=>write<Source>('/sources',{title:title.trim()||attachments.readyAttachments[0]?.name||t('照片与视频','Photos and videos'),text,kind:'document',attachmentIds:attachments.attachmentIds}));
  }}>
    <p className="cog-muted">{t('选择本机原件，确认后保存到同一资料库。每份最多 64 MiB，一次最多 6 份。','Choose local originals to save in your library. Up to 64 MiB each, six at a time.')}</p>
    <AttachmentDrafts controller={attachments} disabled={locked} accept={MEDIA_ACCEPT} media/>
    <Button type="button" color="secondary" variant="outline" disabled={locked||attachments.items.length>=6} onClick={()=>attachments.inputRef.current?.click()}><Images/>{t('选择照片或视频','Choose photos or videos')}</Button>
    <Field label={t('资料标题（可选）','Title (optional)')}><Input value={title} maxLength={300} disabled={locked} placeholder={attachments.readyAttachments[0]?.name||t('为这些原件起个名字','A name for these originals')} onChange={event=>setTitle(event.target.value)}/></Field>
    <Field label={t('补充背景（可选）','Context (optional)')}><Textarea rows={3} maxLength={200000} value={text} disabled={locked} placeholder={t('这是什么时候、什么地方的记录？不知道也可以留空。','When and where was this recorded? Leave blank if unknown.')} onChange={event=>setText(event.target.value)}/></Field>
    <p className="cog-muted">{t('保存原件不会自动生成个人理解。视频可在资料库回看，目前暂不支持视频理解。','Saving originals does not create personal insights. Videos can be played in the library; video understanding is not yet supported.')}</p>
    <ErrorNotice error={error}/><Button type="submit" color="primary" loading={busy} disabled={busy||(!committed&&(attachments.busy||attachments.hasErrors||!attachments.attachmentIds.length))}>{committed?t('重试刷新资料库','Retry library refresh'):t('保存到资料库','Save to library')}</Button>
  </form></Dialog>;
}
