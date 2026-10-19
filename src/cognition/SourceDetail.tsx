import type {ReactNode} from 'react';
import type {Attachment,Fact,Source} from '../../shared/contracts';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Document,Play} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog,when} from '../components';
import {MessageAttachments,attachmentUrl} from '../composer/attachments';
import {previewableVideo} from '../composer/attachmentState';
import {t} from '../i18n';
import {PlatformIcon} from './PlatformIcon';
import './source-detail.css';

type SourceContentProps={source:Source;attachments?:Attachment[];facts?:Fact[]};
const sourceAttachments=(source:Source,attachments:Attachment[])=>(source.attachmentIds||[]).flatMap(id=>{const item=attachments.find(value=>value.id===id);return item?[item]:[];});

export function SourcePreview({source,attachments=[]}:{source:Source;attachments?:Attachment[]}){
  const media=sourceAttachments(source,attachments).find(item=>item.kind==='image'||previewableVideo(item.mime));
  const url=media&&attachmentUrl(media);
  if(media&&url)return <div className="source-media-thumbnail">{previewableVideo(media.mime)?<><video src={url} muted playsInline preload="metadata"/><span><Play/></span></>:<img src={url} alt="" loading="lazy"/>}</div>;
  return <div className="library-paper"><strong>{source.title}</strong><p>{source.text.replace(/[#*>`]/g,'').slice(0,380)}</p></div>;
}

/** The same saved source is read from the library, personal context and growth. */
export function SourceContent({source,attachments=[],facts=[]}:SourceContentProps){
  const originals=sourceAttachments(source,attachments);
  const related=facts.filter(fact=>fact.sourceIds.includes(source.id)&&fact.status!=='superseded');
  return <div className="source-detail-content">
    <div className="source-detail-meta">{source.import?<PlatformIcon platform={source.import.platform}/>:<Document/>}<time dateTime={source.createdAt}>{when(source.createdAt)}</time><span>{source.demo?t('虚构示例资料','Fictional sample'):t('本机资料','Local source')}</span></div>
    {!!originals.length&&<MessageAttachments attachments={originals}/>}
    {!!source.text&&<pre className="source-detail-text">{source.text}</pre>}
    {!!related.length&&<section className="source-detail-insights"><h3>{t('相关理解','Related understanding')}</h3>{related.map(fact=><article key={fact.id}><span>{fact.status==='confirmed'?t('已确认','Confirmed'):fact.status==='inferred'?t('推断','Inferred'):t('待确认','To confirm')}</span><p>{fact.statement}</p></article>)}</section>}
    <p className="source-detail-note">{t('来源保留原始表述。引用它的理解需要分别确认。','Original wording is preserved. Interpretations need separate confirmation.')}</p>
  </div>;
}

export function SourceDetail({source,attachments,facts,action,onClose}:{source:Source;attachments?:Attachment[];facts?:Fact[];action?:ReactNode;onClose:()=>void}){
  return <Dialog title={source.title} className="source-detail-dialog" onClose={onClose}>
    <div className="source-detail-scroll"><SourceContent source={source} attachments={attachments} facts={facts}/></div>
    <footer className="source-detail-actions"><Button color="secondary" variant="ghost" onClick={onClose}>{t('完成','Done')}</Button>{action}</footer>
  </Dialog>;
}
