import { useUnsavedChanges } from '../useUnsavedChanges';
import {useEffect,useRef,useState} from 'react';
import {Button,ButtonLink} from '@openai/apps-sdk-ui/components/Button';
import {Checkbox} from '@openai/apps-sdk-ui/components/Checkbox';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Select} from '@openai/apps-sdk-ui/components/Select';
import {Badge} from '@openai/apps-sdk-ui/components/Badge';
import {Menu} from '@openai/apps-sdk-ui/components/Menu';
import {ArrowLeft,ArrowRight,Brain,CheckCircle,ChevronDown,CloseBold,Document,Download,Edit,FileUpload} from '@openai/apps-sdk-ui/components/Icon';
import type {MemoryImportPreview,MemoryImportResult,MemoryImportReviewResult,MemoryLayer} from '../../shared/memory-import';
import {APIError,apiUrl,messageOf,write} from '../api';
import {Dialog,ErrorNotice,Field} from '../components';
import {ProviderMark} from '../models/providers';
import {t} from '../i18n';
import {currentSpace} from '../space';
import './memory-import.css';

const LIMIT=256*1024;
const layerLabels=():Record<MemoryLayer,string>=>({facts:t('背景与事实','Background and facts'),preferences:t('偏好','Preferences'),goals:t('目标','Goals'),constraints:t('约束与边界','Constraints'),values:t('价值与原则','Values'),capabilities:t('能力与经验','Capabilities'),decisions:t('既有决定','Decisions'),notes:t('其他记忆','Other context')});
type ReviewedResult=MemoryImportReviewResult;
type Draft={statement:string;layer:MemoryLayer};
type PrepareTask=(prompt:string,factIds?:string[])=>void|Promise<void>;
type SourceChoice='chatgpt'|'claude'|'gemini'|'file';
const sources:SourceChoice[]=['chatgpt','claude','gemini','file'];
const sourceName=(source:SourceChoice)=>({chatgpt:'ChatGPT',claude:'Claude',gemini:'Gemini',file:t('已有文件','Existing file')}[source]);
const promptForTask=()=>t('请根据我的目标、偏好和当前约束，帮我安排本周最值得推进的三件事。说明你参考了哪些背景、为什么这样取舍；信息不足时先问我。','Using my goals, preferences and current constraints, help me choose three things to focus on this week. Explain which context shaped your choices, and ask me about any missing information.');
function warningText(code:string){return ({code_blocks_skipped:t('代码块已跳过，原文件会作为来源保留。','Code blocks were skipped. The original file remains as evidence.'),heading_based_extraction:t('按标题和段落整理，请核对分类与原意。','Grouped by headings and paragraphs. Review their meaning and category.'),project_instructions_are_candidates:t('项目指令不等于个人事实。请只保留适用于你的背景、偏好和边界。','Project instructions are not personal facts. Keep only relevant background, preferences and boundaries.'),external_evidence_unverified:t('文件自带的来源信息尚未独立核实。','Evidence supplied by this file has not been independently verified.')} as Record<string,string>)[code]??code;}
function exportPrompt(){return t(
 '请仅依据我曾明确告诉你的内容，整理一份可迁移的个人记忆。不要推测、补全或把你的建议写成我的事实；不确定内容请省略。不要包含密码、API Key、验证码或他人的私密原文。请输出 JSON：{"schema":"secondu.memory","schemaVersion":1,"entries":[{"layer":"preferences","statement":"一条简短、独立、保留原意的记忆"}]}。layer 可用 facts（背景与事实）、preferences（偏好）、goals（目标）、constraints（约束与边界）、values（价值原则）、capabilities（能力经验）、decisions（已作决定）、notes（其他）。每条不超过 2000 字符，最多 200 条。不执行任何操作，不发送任何资料。我会自行核对、筛选后导入。',
 'Summarize portable personal memories using only information I explicitly shared with you. Do not infer missing details or present your suggestions as my facts; omit uncertain claims. Exclude passwords, API keys, verification codes and private quotations about other people. Return JSON: {"schema":"secondu.memory","schemaVersion":1,"entries":[{"layer":"preferences","statement":"One concise, independent memory preserving its meaning"}]}. Allowed layers: facts, preferences, goals, constraints, values, capabilities, decisions, notes. Each statement must be at most 2000 characters, with at most 200 entries. Do not take actions or send information. I will review and select the entries before importing.'
);}

type Props={onClose:()=>void;onRefresh:()=>Promise<void>;onPrepareTask:PrepareTask;onImported?:(result:MemoryImportResult)=>void};
export function MemoryImport({onClose,onRefresh,onPrepareTask,onImported}:Props){
 const [source,setSource]=useState<SourceChoice>('chatgpt');
 const [mode,setMode]=useState<'file'|'paste'>('paste');
 const [file,setFile]=useState<File>();const [content,setContent]=useState('');
 const [preview,setPreview]=useState<MemoryImportPreview>();const [selected,setSelected]=useState<string[]>([]);
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});const [editingId,setEditingId]=useState<string>();
 const [result,setResult]=useState<ReviewedResult>();const [taskPrompt,setTaskPrompt]=useState(promptForTask);
 const [taskFactIds,setTaskFactIds]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [copied,setCopied]=useState(false);
 const [reviewAttempt,setReviewAttempt]=useState<{previewId:string;entries:Array<Draft&{id:string}>;confirmed:true}>();
 const [taskBaseline,setTaskBaseline]=useState(()=>JSON.stringify([taskPrompt,taskFactIds]));
 useUnsavedChanges({unsaved:result?JSON.stringify([taskPrompt,taskFactIds])!==taskBaseline:!!file||!!content||!!preview,busy});
 const fileInput=useRef<HTMLInputElement>(null);const headingRef=useRef<HTMLHeadingElement>(null);
 const step=result?2:preview?1:0;
 const selectable=preview?.candidates.filter(item=>!item.alreadyImported)??[];
 const labels=layerLabels();
 const confirmedFacts=result?.facts.filter(fact=>fact.status==='confirmed')??[];
 useEffect(()=>{headingRef.current?.focus();},[step]);
 function chooseFile(value?:File){
  setError('');if(!value)return;
  if(value.size>LIMIT){setError(t('文件最多 256 KiB，请先整理为简短摘要。','Files must be at most 256 KiB. Summarize larger files first.'));return;}
  if(!/\.(md|markdown|txt|json)$/i.test(value.name)){setError(t('请选择 Markdown、文本或 JSON 文件。','Choose a Markdown, text or JSON file.'));return;}
  setFile(value);
 }
 async function readPreview(){
  setBusy(true);setError('');
  try{
   const value=mode==='file'&&file?new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()):content;
   if(new TextEncoder().encode(value).length>LIMIT)throw new Error(t('内容最多 256 KiB，请先整理为简短摘要。','Content must be at most 256 KiB. Summarize larger text first.'));
   const filename=mode==='file'&&file?file.name:value.trimStart().startsWith('{')?'memory.json':'memory.md';
   const next=await write<MemoryImportPreview>('/imports/memory/preview',{filename,content:value});
   setPreview(next);setSelected(next.candidates.filter(item=>!item.alreadyImported).map(item=>item.id));
   setDrafts(Object.fromEntries(next.candidates.map(item=>[item.id,{statement:item.statement,layer:item.layer}])));setEditingId(undefined);setReviewAttempt(undefined);
  }catch(err){setError(err instanceof TypeError?t('无法读取文件，请选择 UTF-8 文本。','Unable to read this file. Choose UTF-8 text.'):messageOf(err));}finally{setBusy(false);}
 }
 async function confirmReview(){
  if(!preview||!selected.length)return;setBusy(true);setError('');
  const attempt=reviewAttempt??{previewId:preview.previewId,entries:selected.map(id=>({id,...drafts[id]})),confirmed:true as const};
  setReviewAttempt(attempt);
  try{
   const saved=await write<ReviewedResult>('/imports/memory/review',attempt);
   const confirmedIds=saved.facts.filter(fact=>fact.status==='confirmed').slice(0,32).map(fact=>fact.id);
   setResult(saved);setTaskFactIds(confirmedIds);setTaskBaseline(JSON.stringify([taskPrompt,confirmedIds]));setEditingId(undefined);
   await onRefresh();onImported?.(saved);
  }catch(err){if(err instanceof APIError&&err.status>=400&&err.status<500)setReviewAttempt(undefined);setError(messageOf(err));}finally{setBusy(false);}
 }
 async function prepareTask(){
  if(!result||!taskPrompt.trim()||!taskFactIds.length)return;setBusy(true);setError('');
  try{await onRefresh();await onPrepareTask(taskPrompt.trim(),taskFactIds);onClose();}catch(err){setError(messageOf(err));}finally{setBusy(false);}
 }
 function toggle(id:string,checked:boolean){setSelected(current=>checked?[...new Set([...current,id])]:current.filter(key=>key!==id));}
 async function copyPrompt(){try{await navigator.clipboard.writeText(exportPrompt());setCopied(true);}catch{setError(t('无法复制，请展开提示词后选择复制。','Unable to copy. Expand the prompt and select its text to copy it.'));}}
 const steps=[t('带入资料','Bring your context'),t('核对理解','Review understanding'),t('用于任务','Use it in a task')];
 const reviewLocked=busy||!!reviewAttempt;
 return <Dialog title={t('让 SecondU 了解你','Help SecondU understand you')} className="memory-import-dialog" onClose={()=>{if(!busy)onClose();}}>
  <div className="memory-import-body">
   <ol className="memory-import-steps" aria-label={t('开始步骤','Getting started')}>{steps.map((label,index)=><li key={index} aria-current={step===index?'step':undefined} className={index<step?'is-complete':''}><span>{index<step?<CheckCircle/>:index+1}</span>{label}</li>)}</ol>
   <header className="memory-import-heading"><h3 ref={headingRef} tabIndex={-1}>{step===0?t('从已经了解你的地方开始','Start with what is already known'):step===1?t('这些理解，哪些符合现在的你？','Which entries reflect who you are now?'):t('把这份理解用到一件具体的事上','Put that understanding to work')}</h3><p>{step===0?t('带入已有的背景、偏好与目标，不必重新介绍自己。','Bring the background, preferences and goals you have already shared.'):step===1?t('可以修改表述与分类，取消不适用的条目。确认后才会成为日常任务的背景。','Edit the wording and categories, and remove anything that does not apply. Only confirmed entries inform everyday tasks.'):t('写下你现在想推进的事。下一步会打开对话，发送前仍可修改。','Describe something you want to move forward. You can edit it again in the conversation before sending.')}</p></header>
   {step===0?<>
    <div className="memory-import-sources" role="group" aria-label={t('资料来自哪里','Context source')}>{sources.map(value=><Button key={value} color="secondary" variant="outline" selected={source===value} disabled={busy} onClick={()=>{setSource(value);setMode(value==='file'?'file':'paste');setCopied(false);setError('');}}>{value==='file'?<Document/>:<ProviderMark provider={value==='chatgpt'?'openai':value==='claude'?'anthropic':'gemini'} size={22}/>}<span>{sourceName(value)}</span></Button>)}</div>
    {source!=='file'&&<div className="memory-import-transfer"><p>{t(`将提示词复制到 ${sourceName(source)}，再把整理出的摘要粘贴回来。`,`Copy the prompt into ${sourceName(source)}, then paste the summary it produces here.`)}</p><Button color="secondary" variant="outline" size="sm" disabled={busy} onClick={()=>void copyPrompt()}>{copied?<CheckCircle/>:<Document/>}{copied?t('提示词已复制','Prompt copied'):t('复制整理提示词','Copy context prompt')}</Button><details className="memory-import-prompt"><summary>{t('查看提示词','View prompt')}<ChevronDown/></summary><Textarea readOnly rows={5} value={exportPrompt()} aria-label={t('记忆导出提示词','Context export prompt')}/></details></div>}
    {source==='file'&&<div className="memory-import-modes" role="group" aria-label={t('导入方式','Import method')}><Button color="secondary" variant="ghost" size="sm" selected={mode==='file'} onClick={()=>setMode('file')} disabled={busy}>{t('选择文件','Choose a file')}</Button><Button color="secondary" variant="ghost" size="sm" selected={mode==='paste'} onClick={()=>setMode('paste')} disabled={busy}>{t('粘贴内容','Paste text')}</Button></div>}
    {mode==='file'?<div className="memory-import-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!busy)chooseFile(event.dataTransfer.files[0]);}}><input ref={fileInput} hidden type="file" accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json" onChange={event=>{chooseFile(event.target.files?.[0]);event.target.value='';}}/><FileUpload/><strong>{file?.name??t('选择或拖入资料文件','Choose or drop a context file')}</strong><span>{t('支持 AGENTS.md、CLAUDE.md、Markdown 和 JSON 摘要','AGENTS.md, CLAUDE.md, Markdown and JSON summaries')}</span><Button color="secondary" variant="outline" size="sm" disabled={busy} onClick={()=>fileInput.current?.click()}>{file?t('更换文件','Change file'):t('选择文件','Choose file')}</Button></div>:<Textarea className="memory-import-paste" rows={5} value={content} disabled={busy} onChange={event=>setContent(event.target.value)} aria-label={t('已有的个人记忆','Existing personal context')} placeholder={t('把你整理过的背景、偏好、目标或约束粘贴在这里。','Paste your existing background, preferences, goals or constraints here.')}/>}
    <p className="memory-import-note">{t('仅在本机读取你选择的内容，最大 256 KiB。不会登录其他账号或自动调用模型。','Selected content is processed locally, up to 256 KiB. No account access or automatic model calls.')}</p>
   </>:step===1&&preview?<>
    <div className="memory-import-file"><Document/><span>{preview.filename}</span><Badge color="secondary" size="sm">{t('待你确认','Awaiting your confirmation')}</Badge></div>
    {preview.warnings.length>0&&<details className="memory-import-extraction"><summary>{t('整理依据与注意事项','Extraction notes')}<ChevronDown/></summary><ul>{preview.warnings.map(code=><li key={code}>{warningText(code)}</li>)}</ul></details>}
    <div className="memory-import-selection"><Checkbox disabled={reviewLocked||!selectable.length} checked={selected.length===selectable.length&&selectable.length>0?true:selected.length?'indeterminate':false} onCheckedChange={checked=>setSelected(checked?selectable.map(item=>item.id):[])} label={t('选择全部新条目','Select all new entries')}/><span>{t(`已选 ${selected.length} 条`,`${selected.length} selected`)}</span></div>
    <div className="memory-import-candidates">{Object.entries(labels).map(([layer,label])=>{const items=preview.candidates.filter(item=>drafts[item.id]?.layer===layer);return !!items.length&&<section key={layer}><h4>{label}<span>{items.length}</span></h4>{items.map(item=><article key={item.id} className={selected.includes(item.id)?'is-selected':''}><div className="memory-import-candidate-line"><Checkbox disabled={reviewLocked||item.alreadyImported} checked={selected.includes(item.id)} onCheckedChange={checked=>toggle(item.id,!!checked)} aria-label={t(`保留：${drafts[item.id].statement}`,`Keep: ${drafts[item.id].statement}`)}/><div className="memory-import-candidate-copy">{editingId===item.id?<div className="memory-import-inline-edit"><Textarea autoFocus rows={3} maxLength={2000} disabled={reviewLocked} value={drafts[item.id].statement} aria-label={t('修正这条理解','Correct this entry')} onChange={event=>setDrafts(current=>({...current,[item.id]:{...current[item.id],statement:event.target.value}}))}/><Select value={drafts[item.id].layer} disabled={reviewLocked} options={Object.entries(labels).map(([value,label])=>({value,label}))} onChange={option=>setDrafts(current=>({...current,[item.id]:{...current[item.id],layer:option.value as MemoryLayer}}))} aria-label={t('理解分类','Entry category')}/><Button color="secondary" variant="ghost" size="sm" onClick={()=>setEditingId(undefined)}>{t('完成修改','Done editing')}</Button></div>:<p>{drafts[item.id].statement}</p>}{item.alreadyImported?<small>{t('已导入，保留当前修订','Already imported; current revision preserved')}</small>:<details><summary>{item.evidence.truncated?t('查看原文摘录','View source excerpt'):t('查看原文','View original')}{item.evidence.lineStart?` (${item.evidence.lineStart}–${item.evidence.lineEnd})`:''}<ChevronDown/></summary><blockquote>{item.evidence.excerpt}</blockquote>{item.evidence.pointer&&<code>{item.evidence.pointer}</code>}</details>}</div>{!item.alreadyImported&&editingId!==item.id&&<Button color="secondary" variant="ghost" uniform size="sm" disabled={reviewLocked} aria-label={t('修改这条理解','Edit this entry')} onClick={()=>setEditingId(item.id)}><Edit/></Button>}</div></article>)}</section>;})}</div>
    {!selectable.length&&<p className="memory-import-note">{t('这些内容已经导入。已有确认与修订保持不变，可回到个人画像查看。','These entries were already imported. Your confirmations and revisions are preserved in your profile.')}</p>}
    {reviewAttempt&&!result&&<p className="memory-import-note">{t('本次确认正在等待结果。重试会沿用相同内容，不重复创建理解。','This confirmation is awaiting a result. Retrying uses the same content without creating duplicate entries.')}</p>}
   </>:result&&<>
    <div className="memory-import-confirmed"><CheckCircle/><span>{t(`${confirmedFacts.length} 条理解已确认，原文与修订记录已保留。`,`${confirmedFacts.length} entries confirmed, with original sources and revisions preserved.`)}</span></div>
    <Field label={t('你想先推进什么？','What would you like to work on first?')}><Textarea rows={4} maxLength={10000} disabled={busy} value={taskPrompt} onChange={event=>setTaskPrompt(event.target.value)} aria-label={t('第一项任务','Your first task')}/></Field>
    <details className="memory-import-task-context" open={confirmedFacts.length<=4}><summary><span>{t(`优先参考 ${taskFactIds.length} 条理解`,`Prioritize ${taskFactIds.length} context entries`)}</span><ChevronDown/></summary><div>{confirmedFacts.map(fact=><Checkbox key={fact.id} checked={taskFactIds.includes(fact.id)} disabled={busy||(!taskFactIds.includes(fact.id)&&taskFactIds.length>=32)} onCheckedChange={checked=>setTaskFactIds(current=>checked?[...current,fact.id]:current.filter(id=>id!==fact.id))} label={fact.statement}/>)}</div></details>
    {confirmedFacts.length!==result.facts.length&&<p className="memory-import-note">{t('部分条目已在其他位置更新，请在个人画像核对最新状态。','Some entries were updated elsewhere. Review their current status in your profile.')}</p>}
    <p className="memory-import-note">{t('下一步可调整背景、模型与操作权限。只有点击发送，才会开始真实任务。','Adjust context, model and permissions in the next step. A live task begins only after you press Send.')}</p>
   </>}
   <ErrorNotice error={error}/>
   <footer className="memory-import-actions">{step===1?<Button color="secondary" variant="ghost" size="sm" disabled={busy||!!reviewAttempt} onClick={()=>{setPreview(undefined);setError('');}}><ArrowLeft/>{t('返回资料','Back to source')}</Button>:<Button color="secondary" variant="ghost" size="sm" disabled={busy} onClick={onClose}>{step===2?t('稍后再用','Use it later'):t('稍后导入','Maybe later')}</Button>}<Button color="primary" loading={busy} disabled={busy||(step===0?(mode==='file'?!file:!content.trim()):step===1?!selected.length||selected.some(id=>!drafts[id]?.statement.trim()):!taskPrompt.trim()||!taskFactIds.length)} onClick={()=>void(step===0?readPreview():step===1?confirmReview():prepareTask())}>{step===0?t('整理并预览','Prepare preview'):step===1?reviewAttempt?t('重试确认','Retry confirmation'):t(`确认 ${selected.length} 条理解`,`Confirm ${selected.length} entries`):t('带入新对话','Open in a conversation')}<ArrowRight/></Button></footer>
  </div>
 </Dialog>;
}

export function MemoryImportEntry({onRefresh,onPrepareTask,compact=false}:{onRefresh:()=>Promise<void>;onPrepareTask?:PrepareTask;compact?:boolean}){
 const [open,setOpen]=useState(()=>!!onPrepareTask&&location.hash==='#self/import');
 useEffect(()=>{if(!onPrepareTask)return;const listener=()=>{if(location.hash==='#self/import')setOpen(true);};window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener);},[onPrepareTask]);
 function close(){setOpen(false);if(location.hash==='#self/import')location.hash='self';}
 return <><div className={`memory-import-entry ${compact?'is-compact':''}`}>{!compact&&<div><strong>{t('从已有理解开始','Start with context you already have')}</strong><p>{t('带入记忆，核对理解，再用于第一项任务。','Bring your context, review it, then use it in your first task.')}</p></div>}<div className="memory-import-entry-actions"><Button color="secondary" variant="outline" size="sm" onClick={()=>{if(onPrepareTask)setOpen(true);else location.hash='self/import';}}><FileUpload/>{t('导入已有记忆','Import existing context')}</Button><Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="sm"><Download/>{t('导出','Export')}</Button></Menu.Trigger><Menu.Content align="end" minWidth={180}><Menu.Item onSelect={()=>{window.location.href=apiUrl('/digital-twin/export?format=json');}}>{t('标准 JSON','Standard JSON')}</Menu.Item><Menu.Item onSelect={()=>{window.location.href=apiUrl('/digital-twin/export?format=markdown');}}>Markdown</Menu.Item></Menu.Content></Menu></div></div>{open&&onPrepareTask&&<MemoryImport onClose={close} onRefresh={onRefresh} onPrepareTask={onPrepareTask}/>}</>;
}

/** A dismissible value entry for an empty personal workspace; it never opens itself. */
export function MemoryImportWelcome(){
 const key=`secondu-context-intro-dismissed-v1:${currentSpace()}`;
 const [hidden,setHidden]=useState(()=>{try{return localStorage.getItem(key)==='1';}catch{return false;}});
 if(hidden)return null;
 return <section className="memory-import-welcome" aria-label={t('从已有理解开始','Start with your existing context')}><Brain aria-hidden="true"/><div><strong>{t('不必从头介绍自己','You do not have to start from scratch')}</strong><p>{t('带入已有的偏好与目标，核对后就能用于对话。','Bring your preferences and goals into the conversation, after a quick review.')}</p></div><ButtonLink as="a" href="#self/import" color="secondary" variant="outline" size="sm">{t('导入已有记忆','Import context')}<ArrowRight/></ButtonLink><Button uniform color="secondary" variant="ghost" size="sm" aria-label={t('暂时跳过，可从个人画像重新打开','Skip for now. Reopen from your personal profile.')} onClick={()=>{setHidden(true);try{localStorage.setItem(key,'1');}catch{}}}><CloseBold/></Button></section>;
}
