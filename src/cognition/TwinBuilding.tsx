import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Button,ButtonLink} from '@openai/apps-sdk-ui/components/Button';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Badge} from '@openai/apps-sdk-ui/components/Badge';
import {ArrowRight,ArrowUp,Check,ChevronDown,CloseBold,Document,Edit,Paperclip,Reload,Chat} from '@openai/apps-sdk-ui/components/Icon';
import type {Bootstrap,Source,Task} from '../../shared/contracts';
import type {CapturePurpose,TwinBuildingSnapshot,TwinCapture,TwinCandidate,TwinCandidateValue,TwinReviewDecision,TwinSuggestion} from '../../shared/twin-building';
import {api,messageOf,write} from '../api';
import {AttachmentDrafts,MessageAttachments,useAttachments} from '../composer/attachments';
import {Dialog,ErrorNotice,when} from '../components';
import {t} from '../i18n';
import {useUnsavedChanges} from '../useUnsavedChanges';
import {TwinPortrait} from './TwinPortrait';
import {MemoryImport} from './MemoryImport';
import {ConversationFileImport} from './ConversationFileImport';
import {SourceDetail} from './SourceDetail';
import {SourceTextImport} from './SourceImport';
import {SourceMediaImport} from './SourceMediaImport';
import {MaterialGallery,type MaterialGalleryItem} from './MaterialGallery';
import {previewableVideo} from '../composer/attachmentState';
import './twin-building.css';

interface Props {
  data:Bootstrap;
  profileHref?:string;
  onRefresh:()=>Promise<void>;
  onCreateTask:(prompt:string,contextFactIds?:string[],agentIds?:string[])=>void|Promise<void>;
}
const emptySnapshot:TwinBuildingSnapshot={captures:[],suggestions:[],changes:[],proactive:{enabled:false,revision:1,updatedAt:''}};
const captureLabel=(capture:TwinCapture)=>({queued:t('已保存，等待处理','Saved, ready to process'),running:t('正在理解这份材料','Working through this material'),review:t('有理解想和你确认','Ready for your review'),completed:t('已完成审阅','Reviewed'),failed:t('处理未完成','Processing interrupted')}[capture.status]);
const candidateText=(candidate:TwinCandidate)=>'statement'in candidate.value?candidate.value.statement:'name'in candidate.value?candidate.value.name:candidate.value.title;
const candidateKind=(candidate:TwinCandidate)=>({fact:t('关于你','About you'),person:t('与你有关的人','A person in your life'),event:t('一段经历','An experience')}[candidate.kind]);
const reviewLabel=(status:TwinCandidate['status'])=>({pending:t('待你确认','Awaiting your review'),accepted:t('已确认','Confirmed'),corrected:t('已按你的表述修订','Corrected by you'),rejected:t('未采用','Not adopted')}[status]);

export function TwinBuilding({data,profileHref='#self',onRefresh,onCreateTask}:Props) {
  const [snapshot,setSnapshot]=useState<TwinBuildingSnapshot>(emptySnapshot);
  const [loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [text,setText]=useState(''),[purpose,setPurpose]=useState<CapturePurpose>('personal');
  const [busy,setBusy]=useState(''),[selectedId,setSelectedId]=useState<string>(),[sourceId,setSourceId]=useState<string|undefined>(()=>location.hash.startsWith('#building/')?location.hash.split('/')[1]:undefined);
  const [showAll,setShowAll]=useState(false),[recordsOpen,setRecordsOpen]=useState(false);
  const [entryMode,setEntryMode]=useState<'write'|null>(null);
  const [importMode,setImportMode]=useState<'chat'|'memory'|'text'|'media'|null>(null);
  const composer=useRef<HTMLTextAreaElement>(null),detail=useRef<HTMLDivElement>(null),sequence=useRef(0),mounted=useRef(true);
  const captureSubmission=useRef<{fingerprint:string;key:string}|undefined>(undefined);
  const exploreKeys=useRef(new Map<string,string>());
  const attachments=useAttachments({contextKey:'twin-building',maxFiles:6});
  const model=data.modelConnections.find(connection=>connection.id===data.defaultConnectionId)||data.settings;
  const modelConfigured=!!model.hasKey;
  const canProcess=modelConfigured&&data.computer.codexAvailable&&!data.profile.demo;
  const captures=useMemo(()=>[...snapshot.captures].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),[snapshot.captures]);
  const active=!!captures.find(capture=>capture.status==='running');
  const selected=captures.find(capture=>capture.id===selectedId);
  const sourceCapture=sourceId?captures.find(capture=>capture.sourceId===sourceId||capture.upstreamSourceId===sourceId):undefined;
  const selectedSource=data.sources.find(source=>source.id===sourceId)||(sourceCapture?{id:sourceCapture.sourceId,title:sourceCapture.title,text:sourceCapture.text,kind:'note' as const,createdAt:sourceCapture.createdAt,demo:false,attachmentIds:sourceCapture.attachmentIds}:undefined);
  const confirmedFacts=data.facts.filter(fact=>fact.status==='confirmed');
  const pendingSuggestions=snapshot.suggestions.filter(suggestion=>suggestion.status==='pending');
  const readSource=(id:string)=>setSourceId(id);
  const closeSource=()=>{setSourceId(undefined);if(location.hash.startsWith('#building/'))history.replaceState(null,'',location.pathname+location.search+'#building');};
  useEffect(()=>{const read=()=>{if(location.hash.startsWith('#building/'))setSourceId(location.hash.split('/')[1]);};addEventListener('hashchange',read);return()=>removeEventListener('hashchange',read);},[]);
  const openMaterial=(id:string)=>{
    if(id==='sources'){location.hash='artifacts';return;}
    if(id==='connector'){location.hash='settings/connectors';return;}
    if(id==='write'){setEntryMode('write');requestAnimationFrame(()=>composer.current?.focus());return;}
    setImportMode(id as 'chat'|'memory'|'text'|'media');
  };
  const mediaIds=new Set((data.attachments||[]).filter(item=>item.mime.startsWith('image/')||item.mime.startsWith('video/')).map(item=>item.id));
  const hasMedia=(source:Source)=>source.attachmentIds?.some(id=>mediaIds.has(id))===true;
  const added=(value:boolean):MaterialGalleryItem['availability']=>value?'material':undefined;
  const galleryItems:MaterialGalleryItem[]=[
    {id:'sources',title:t('已有资料','Existing sources'),description:t('从同一资料库继续，保留每份原文。','Continue from your library, with every original preserved.'),kind:'sources',availability:added(data.sources.length>0)},
    {id:'text',title:t('文字与笔记','Text and notes'),description:t('导入文字文件，或粘贴一段笔记。','Import a text file or paste a note.'),kind:'text',availability:added(data.sources.some(source=>(source.kind==='note'||source.kind==='document')&&!source.memoryImport&&!hasMedia(source)))},
    {id:'media',title:t('相册','Photos and videos'),description:t('保存真实照片、截图与视频原件。','Save original photos, screenshots and videos.'),kind:'media',availability:added(data.sources.some(hasMedia))},
    {id:'chat',title:t('聊天记录','Conversations'),description:t('导入已有聊天，先预览，再保存。','Preview exported conversations before saving.'),kind:'conversation',availability:added(data.sources.some(source=>source.kind==='conversation')||data.conversations.length>0)},
    {id:'memory',title:t('已有记忆','Existing memory'),description:t('带入背景与偏好，由你核对后采用。','Bring existing context and review what to keep.'),kind:'memory',availability:added(data.sources.some(source=>!!source.memoryImport))},
    {id:'connector',title:t('连接资料','Connect sources'),description:t('管理已连接的资料与通信工具。','Manage connected sources and messaging tools.'),kind:'connector',availability:(data.connectors||[]).some(item=>item.enabled&&item.status==='ready')?'connected':undefined},
    {id:'write',title:t('说说自己','Tell me about you'),description:t('留下一段经历、想法，或最近的变化。','Share an experience, a thought or a recent change.'),kind:'write'},
  ];
  useUnsavedChanges({unsaved:!!text.trim()||attachments.items.length>0,busy:busy==='capture'});

  const load=useCallback(async(signal?:AbortSignal)=>{
    const current=++sequence.current;
    try{
      const result=await api<TwinBuildingSnapshot>('/twin-building',{signal});
      if(mounted.current&&current===sequence.current){setSnapshot(result);setLoaded(true);setLoadError('');}
    }catch(cause){if(signal?.aborted||!mounted.current||current!==sequence.current)return;setLoadError(messageOf(cause));setLoaded(true);}
  },[]);
  useEffect(()=>{mounted.current=true;const controller=new AbortController();void load(controller.signal);return()=>{mounted.current=false;++sequence.current;controller.abort();};},[load]);
  useEffect(()=>{const controller=new AbortController();const timer=setInterval(()=>{if(!document.hidden)void load(controller.signal);},active?1800:10000);return()=>{clearInterval(timer);controller.abort();};},[active,load]);
  const refresh=async()=>{await load();await onRefresh();};
  const run=async(key:string,action:()=>Promise<void>)=>{
    if(busy)return;setBusy(key);setError('');setNotice('');
    try{await action();}catch(cause){setError(messageOf(cause));}finally{if(mounted.current)setBusy('');}
  };
  const select=(id:string)=>{setSelectedId(id);setRecordsOpen(true);requestAnimationFrame(()=>detail.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'}));};
  async function saveCapture(){
    if((!text.trim()&&!attachments.attachmentIds.length)||attachments.busy||attachments.hasErrors)return;
    const submittedText=text.trim(),submittedDrafts=attachments.items.map(item=>item.id);
    const title=submittedText.split(/[\n。！？]/)[0]?.slice(0,48)||attachments.readyAttachments[0]?.name||t('新材料','New material');
    const payload={title,text:submittedText,attachmentIds:attachments.attachmentIds,purpose,origin:'manual'};
    const fingerprint=JSON.stringify(payload);
    if(captureSubmission.current?.fingerprint!==fingerprint)captureSubmission.current={fingerprint,key:crypto.randomUUID()};
    const idempotencyKey=captureSubmission.current.key;
    await run('capture',async()=>{
      const capture=await write<TwinCapture>('/twin-building/captures',{...payload,idempotencyKey});
      captureSubmission.current=undefined;setText('');submittedDrafts.forEach(attachments.remove);setSelectedId(capture.id);setRecordsOpen(true);
      setSnapshot(current=>({...current,captures:[capture,...current.captures.filter(item=>item.id!==capture.id)]}));
      if(canProcess){const result=await write<TwinCapture>(`/twin-building/captures/${capture.id}/process`);setNotice(result.status==='failed'?t('材料已保存，这次处理未完成。可以在下方查看原因。','Saved. Processing did not finish; the details are below.'):t('材料已保存，SecondU 正在处理。','Saved. SecondU is working through your material.'));}
      else setNotice(t('材料已保存。准备好模型后，可以从这里继续。','Saved. You can continue here after connecting a model.'));
      await refresh();
    });
  }
  async function processCapture(capture:TwinCapture){await run(capture.id,async()=>{await write(`/twin-building/captures/${capture.id}/${capture.status==='failed'?'retry':'process'}`);await refresh();});}
  async function exploreSource(source:Source){
    if(!canProcess)return;
    if(!exploreKeys.current.has(source.id))exploreKeys.current.set(source.id,crypto.randomUUID());
    await run(source.id,async()=>{const capture=await write<TwinCapture>(`/twin-building/sources/${source.id}/explore`,{idempotencyKey:exploreKeys.current.get(source.id)});closeSource();setSelectedId(capture.id);setRecordsOpen(true);await refresh();});
  }
  async function reviewCapture(capture:TwinCapture,decisions:TwinReviewDecision[]){await run(capture.id,async()=>{await write(`/twin-building/captures/${capture.id}/review`,{baseRevision:capture.revision,decisions});await refresh();setNotice(capture.purpose==='personal'?t('你的确认已保存，可以用于之后的任务。','Your review is saved and available for future tasks.'):t('审阅已保存，仅用于这次材料。','Your review is saved for this material only.'));});}
  async function respond(suggestion:TwinSuggestion,action:'accept'|'dismiss'|'correct',feedback?:string){await run(suggestion.id,async()=>{const result=await write<{suggestion:TwinSuggestion;capture?:TwinCapture;task?:Task}>(`/twin-building/suggestions/${suggestion.id}/respond`,{baseRevision:suggestion.revision,action,...(feedback?{text:feedback}:{})});if(result.capture)setSelectedId(result.capture.id);await refresh();setNotice(action==='dismiss'?t('已收起这条建议。','Suggestion dismissed.'):result.task?t('已创建帮助任务，可以在建议记录里打开查看。','A task has been created. Open it from the suggestion history.'):t('已保存你的选择，材料进展显示在左侧。','Your choice is saved. Follow the material below.'));});}
  async function useInTask(capture?:TwinCapture){
    const facts=capture?capture.candidates.filter(candidate=>candidate.kind==='fact'&&(candidate.status==='accepted'||candidate.status==='corrected')).map(candidate=>candidate.entityId).filter((id):id is string=>!!id):confirmedFacts.map(fact=>fact.id);
    const reviewed=capture?.candidates.filter(candidate=>candidate.status==='accepted'||candidate.status==='corrected').map(candidate=>`${candidateText(candidate)}${'description'in candidate.value&&candidate.value.description?` — ${candidate.value.description}`:''}${'date'in candidate.value?` (${candidate.value.date})`:''}`).join('\n');
    const prompt=capture?t(`请结合我刚审阅的材料，帮我推进一件事。材料：${capture.title}\n以下内容作为本次任务背景：\n${reviewed}\n\n我想做的是：`,`Use the material I just reviewed to help with a task. Material: ${capture.title}\nContext for this task:\n${reviewed}\n\nWhat I want to do:`):t('请结合你对我的了解，帮我把接下来的一件事做好。\n\n我想做的是：','Use what you know about me to help with my next task.\n\nWhat I want to do:');
    await run('task',async()=>{await onCreateTask(prompt,facts);});
  }
  const evidence=useMemo(()=>{
    const confirmed=new Set(confirmedFacts.map(fact=>`fact:${fact.id}`));
    for(const capture of captures.filter(item=>item.purpose==='personal'))for(const candidate of capture.candidates){
      if(!candidate.entityId||!['accepted','corrected'].includes(candidate.status)||candidate.kind==='fact')continue;
      const exists=candidate.kind==='person'?data.people.some(person=>person.id===candidate.entityId):data.events.some(event=>event.id===candidate.entityId);
      if(exists)confirmed.add(`${candidate.kind}:${candidate.entityId}`);
    }
    return {sources:data.sources.length,confirmed:confirmed.size,processing:active,eventKey:captures.map(capture=>`${capture.id}:${capture.revision}:${capture.status}`).join('|')};
  },[data.sources.length,data.people,data.events,confirmedFacts,captures,active]);
  const runningCapture=captures.find(capture=>capture.status==='running');
  const reviewCaptures=captures.filter(capture=>capture.status==='review');
  const pendingCount=reviewCaptures.reduce((count,capture)=>count+capture.candidates.filter(candidate=>candidate.status==='pending').length,0);
  const progress=runningCapture?'processing':pendingCount?'review':evidence.confirmed?'confirmed':evidence.sources?'connected':'empty';
  const portraitCaption=runningCapture?t(`正在理解《${runningCapture.title}》`,`Understanding “${runningCapture.title}”`):pendingCount?t(`${pendingCount} 条新理解待确认`,`${pendingCount} new insights to review`):evidence.confirmed?t(`已接入 ${evidence.sources} 份资料，已确认 ${evidence.confirmed} 条理解。`,`Added ${evidence.sources} sources and confirmed ${evidence.confirmed} insights.`):evidence.sources?t(`已接入 ${evidence.sources} 份资料`,`${evidence.sources} sources added`):t('从第一份资料开始','Begin with your first source');


  return <section className="twin-building" aria-label={t('分身建设','Grow your twin')}>
    <ButtonLink className="twin-profile-link" as="a" href={profileHref} color="secondary" variant="ghost" size="sm">{t('查看完整画像','View full profile')}<ArrowRight/></ButtonLink>
    <div className="twin-building-stage">
      <TwinPortrait evidence={evidence} caption={portraitCaption} progress={progress} onProgressClick={progress==='review'?()=>select(reviewCaptures[0].id):undefined}/>
      <div className="twin-entry-dock"><MaterialGallery items={galleryItems} onOpen={openMaterial}/></div>
    </div>
    {entryMode&&<section className="twin-entry-panel" aria-label={t('添加材料','Add material')}><div className="twin-entry-panel-heading"><h2>{t('最近，有什么想让我知道的？','What would you like me to know?')}</h2><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('收起接入面板','Close entry panel')} onClick={()=>setEntryMode(null)}><CloseBold/></Button></div>
      <div className="twin-capture-area">

        <form className="twin-capture-composer" onSubmit={event=>{event.preventDefault();void saveCapture();}} onDragOver={attachments.onDragOver} onDrop={event=>{if(!busy)attachments.onDrop(event);else event.preventDefault();}}>
          <AttachmentDrafts controller={attachments} disabled={!!busy}/>
          <Textarea ref={composer} variant="soft" rows={3} maxRows={9} autoResize aria-label={t('想让 SecondU 了解的材料','Material for SecondU')} placeholder={t('写下或粘贴一段经历、想法……','Write or paste an experience or thought…')} value={text} disabled={!!busy} onChange={event=>setText(event.target.value)} onPaste={event=>{if(!busy)attachments.onPaste(event);}}/>
          <div className="twin-capture-toolbar"><Button type="button" color="secondary" variant="ghost" size="sm" disabled={!!busy} onClick={()=>attachments.inputRef.current?.click()}><Paperclip/>{t('图片或文件','Photo or file')}</Button><Button type="submit" color="primary" size="md" loading={busy==='capture'} disabled={!!busy||data.profile.demo||(!text.trim()&&!attachments.attachmentIds.length)||attachments.busy||attachments.hasErrors}>{canProcess?t('交给 SecondU','Bring to SecondU'):t('保存材料','Save material')}<ArrowUp/></Button></div>
        </form>
        <div className="twin-capture-purpose" role="group" aria-label={t('材料用途','How to use this material')}><button type="button" aria-pressed={purpose==='personal'} onClick={()=>setPurpose('personal')} disabled={!!busy}>{purpose==='personal'&&<Check/>}{t('用于了解我','Help understand me')}</button><button type="button" aria-pressed={purpose==='session'} onClick={()=>setPurpose('session')} disabled={!!busy}>{purpose==='session'&&<Check/>}{t('只用于这次','Only this time')}</button></div>
        <p className="twin-capture-footnote">{purpose==='personal'?t('新的理解先交给你确认，再进入个人画像。','New understanding goes to you for review before joining your profile.'):t('保留这次材料和审阅，不加入长期个人画像。','Keep this material and review without adding it to your personal profile.')}</p>
        {data.profile.demo?<p className="twin-capture-footnote">{t('进入个人空间后，可以保存这些经历并开始理解。','Enter your personal space to save these experiences and begin understanding.')} <a href={`${location.pathname}?space=personal#building`}>{t('进入个人空间','Open personal space')}</a></p>:!canProcess&&<div className="twin-model-entry"><span>{!modelConfigured?t('材料可以先存下，连接模型后开始理解。','Save now and connect a model when you are ready.'):t('启用本机运行环境后，即可处理材料。','Enable the local runtime to process your material.')}</span><a href={!modelConfigured?'#settings/model':'#settings/computer'}>{!modelConfigured?t('连接模型','Connect model'):t('查看运行环境','Open runtime settings')}<ArrowRight/></a></div>}
      </div>
    </section>}

    <div className="twin-feedback"><ErrorNotice error={error}/>{notice&&<p role="status">{notice}</p>}{loadError&&<div className="twin-load-error" role="alert"><span>{loadError}</span><Button color="secondary" variant="ghost" size="sm" onClick={()=>void load()}><Reload/>{t('重新读取','Reload')}</Button></div>}</div>
    {!data.profile.demo&&<><button type="button" className="twin-records-toggle" aria-expanded={recordsOpen} onClick={()=>setRecordsOpen(value=>!value)}>{t('材料与理解记录','Materials and understanding')}<span>{captures.length}</span><ChevronDown/></button>{recordsOpen&&<div className="twin-building-body">
      <div className="twin-materials">
        <div className="twin-section-heading"><h2>{t('最近带来的','What you have brought')}</h2>{captures.length>4&&<Button color="secondary" variant="ghost" size="sm" onClick={()=>setShowAll(value=>!value)}>{showAll?t('收起','Show less'):t('全部材料','All materials')}</Button>}</div>
        {!loaded?<p className="twin-empty-copy" role="status">{t('正在读取本机材料……','Reading local materials…')}</p>:!captures.length&&!loadError?<div className="twin-empty-material"><Document/><p>{t('第一份材料，可以很小。','Your first piece can be small.')}<span>{t('保存后，你可以在这里查看处理进展和理解依据。','Once saved, follow its progress and review the evidence here.')}</span></p><Button color="secondary" variant="ghost" size="sm" onClick={()=>openMaterial('write')}>{t('写一点','Add a thought')}<ArrowRight/></Button></div>:null}
        <div className="twin-capture-list">{(showAll?captures:captures.slice(0,4)).map(capture=><button key={capture.id} type="button" className={`twin-capture-row ${selectedId===capture.id?'is-selected':''}`} onClick={()=>select(capture.id)} aria-expanded={selectedId===capture.id}><span className={`twin-state-mark is-${capture.status}`} aria-hidden="true">{capture.status==='completed'?<Check/>:<Document/>}</span><span className="twin-capture-row-copy"><strong>{capture.title}</strong><span>{captureLabel(capture)}{t('。','.')}{' '}<time dateTime={capture.createdAt}>{t(`资料保存于 ${when(capture.createdAt)}。`,`Saved on ${when(capture.createdAt)}.`)}</time></span></span><ArrowRight/></button>)}</div>
        <div ref={detail}>{selected&&<CaptureDetail key={`${selected.id}:${selected.revision}`} capture={selected} data={data} busy={!!busy} canProcess={canProcess} onClose={()=>setSelectedId(undefined)} onProcess={()=>void processCapture(selected)} onReview={decisions=>reviewCapture(selected,decisions)} onSource={readSource} onUse={()=>void useInTask(selected)}/>}</div>
        {!!confirmedFacts.length&&<section className="twin-understanding"><div className="twin-section-heading"><h2>{t('已经确认的理解','What you have confirmed')}</h2><a href="#self">{t('查看画像','View profile')}<ArrowRight/></a></div>{confirmedFacts.slice(0,3).map(fact=><article key={fact.id}><p>{fact.statement}</p><div><span><Check/>{t('已确认','Confirmed')}</span>{fact.sourceIds[0]&&<button type="button" onClick={()=>readSource(fact.sourceIds[0])}>{t('查看依据','View evidence')}</button>}</div></article>)}<Button color="secondary" variant="outline" size="sm" disabled={!!busy||data.profile.demo} onClick={()=>void useInTask()}>{t('带着这些理解，做一件事','Put this understanding to work')}<ArrowRight/></Button></section>}
      </div>
      <aside className="twin-help-inbox" aria-labelledby="twin-help-title"><div className="twin-section-heading"><h2 id="twin-help-title">{t('想到一件可以帮你的事','A thought that could help')}</h2></div><p className="twin-inbox-intro">{t('从资料里的变化出发，先把建议带给你。','A useful next step, grounded in what has changed.')}</p>
        {pendingSuggestions.length?pendingSuggestions.slice(0,4).map(suggestion=><Suggestion key={`${suggestion.id}:${suggestion.revision}`} suggestion={suggestion} disabled={!!busy||data.profile.demo} canProcess={canProcess} onRespond={(action,feedback)=>respond(suggestion,action,feedback)} onSource={()=>readSource(suggestion.sourceId)}/>):!loaded||loadError?<p className="twin-empty-copy">{loadError?t('建议暂时未能载入，请重新读取。','Suggestions could not load. Please reload.'):t('正在读取建议……','Loading suggestions…')}</p>:<div className="twin-inbox-empty"><span className="twin-inbox-thread" aria-hidden="true"/><p>{t('目前没有待处理建议。','There are no pending suggestions.')}<span>{t('你可以先带来一份材料。','You can bring a piece of material to start.')}</span></p></div>}
        {!!snapshot.suggestions.find(suggestion=>suggestion.status!=='pending')&&<details className="twin-suggestion-history"><summary>{t('看过的建议','Previous suggestions')}<ChevronDown/></summary>{snapshot.suggestions.filter(suggestion=>suggestion.status!=='pending').slice(0,5).map(suggestion=><div key={suggestion.id}><p>{suggestion.title}</p><small>{suggestion.status==='dismissed'?t('已收起','Dismissed'):suggestion.status==='corrected'?t('已纠正','Corrected'):t('已接受','Accepted')}</small>{suggestion.captureId&&<button type="button" onClick={()=>select(suggestion.captureId!)}>{t('查看材料','View material')}<ArrowRight/></button>}{suggestion.followUpTaskId&&<a href={`#task/${suggestion.followUpTaskId}`}>{t('打开帮助任务','Open the task')}<ArrowRight/></a>}</div>)}</details>}
      </aside>
    </div>
    }</>}
    {importMode==='text'&&<SourceTextImport onClose={()=>setImportMode(null)} onRefresh={onRefresh} onImported={source=>readSource(source.id)}/>}
    {importMode==='media'&&<SourceMediaImport onClose={()=>setImportMode(null)} onRefresh={onRefresh} onImported={source=>readSource(source.id)}/>}
    {importMode==='memory'&&<MemoryImport onClose={()=>setImportMode(null)} onRefresh={onRefresh} onPrepareTask={onCreateTask}/>}
    {importMode==='chat'&&<ConversationFileImport onClose={()=>setImportMode(null)} onSaved={onRefresh} onImported={()=>setNotice(t('聊天原文已保存到同一资料库。','Original conversations are saved in your library.'))}/>}
    {selectedSource&&<SourceDetail source={selectedSource} attachments={data.attachments} facts={data.facts} onClose={closeSource} action={data.profile.demo?<ButtonLink as="a" href={profileHref} color="primary">{t('查看个人画像','View personal profile')}<ArrowRight/></ButtonLink>:<SourceAction source={selectedSource} attachments={data.attachments||[]} alreadyCaptured={!!sourceCapture} canProcess={canProcess} disabled={!!busy} onExplore={()=>void exploreSource(selectedSource)}/>}/>}

  </section>;
}

function SourceAction({source,attachments,alreadyCaptured,canProcess,disabled,onExplore}:{source:Source;attachments:NonNullable<Bootstrap['attachments']>;alreadyCaptured:boolean;canProcess:boolean;disabled:boolean;onExplore:()=>void}) {
  if(alreadyCaptured)return null;
  const originals=attachments.filter(item=>source.attachmentIds?.includes(item.id));
  if(originals.some(item=>previewableVideo(item.mime)))return <span className="source-detail-note">{t('视频原件已保存，暂不支持视频理解。','The original video is saved. Video understanding is not yet supported.')}</span>;
  if(originals.some(item=>item.size>8*1024*1024))return <span className="source-detail-note">{t('原件已保存。用于理解的单份附件需小于 8 MiB。','Originals are saved. Each attachment for understanding must be at most 8 MiB.')}</span>;
  return <div>{canProcess?<Button color="primary" disabled={disabled} onClick={onExplore}>{t('从这份材料继续了解','Explore this material')}<ArrowRight/></Button>:<a href="#settings/model">{t('连接模型后探索这份材料','Connect a model to explore this material')}<ArrowRight/></a>}</div>;
}

function CaptureDetail({capture,data,busy,canProcess,onClose,onProcess,onReview,onSource,onUse}:{capture:TwinCapture;data:Bootstrap;busy:boolean;canProcess:boolean;onClose:()=>void;onProcess:()=>void;onReview:(decisions:TwinReviewDecision[])=>Promise<void>;onSource:(id:string)=>void;onUse:()=>void}) {
  const [decisions,setDecisions]=useState<Record<string,TwinReviewDecision>>({});
  const pending=capture.candidates.filter(candidate=>candidate.status==='pending');
  const decided=pending.filter(candidate=>decisions[candidate.id]).length;
  const attachments=(data.attachments||[]).filter(item=>capture.attachmentIds.includes(item.id));
  const needsReview=capture.status==='review';
  useUnsavedChanges({unsaved:needsReview&&Object.keys(decisions).length>0,busy});
  const hasAccepted=capture.candidates.some(candidate=>candidate.status==='accepted'||candidate.status==='corrected');
  return <section className="twin-capture-detail" aria-label={capture.title}>
    <header><div><Badge color={capture.status==='failed'?'danger':capture.status==='review'?'warning':'secondary'} size="sm">{captureLabel(capture)}</Badge><h3>{capture.title}</h3></div><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('收起材料详情','Close material details')} onClick={onClose}><CloseBold/></Button></header>
    {capture.text&&<details className="twin-original"><summary>{t('你带来的原文','Your original words')}<ChevronDown/></summary><p>{capture.text}</p></details>}
    {capture.textTruncated&&<p className="twin-detail-note">{t('本轮整理正文前 40000 字，全文仍保留。','This pass reads the first 40,000 characters. The full original is retained.')}</p>}
    {!!attachments.length&&<MessageAttachments attachments={attachments}/>}
    {capture.summary&&<p className="twin-capture-summary">{capture.summary}</p>}
    {capture.status==='running'&&<p className="twin-processing-copy" role="status"><span aria-hidden="true"/>{t('正在结合原文梳理。完成后，新的理解会先停在这里等你确认。','Working through the original material. New understanding will wait here for your review.')}</p>}
    {capture.status==='queued'&&<p className="twin-detail-note">{t('原始材料已经保存，还没有运行模型。','The original material is saved. The model has not run yet.')}</p>}
    {capture.error&&<div className="twin-capture-error" role="alert"><strong>{t('这次处理没有完成','This attempt did not finish')}</strong><p>{capture.error}</p><small>{t('材料与之前的处理记录仍然保留。','Your material and previous attempts are still here.')}</small></div>}
    {(capture.status==='queued'||capture.status==='failed')&&<div className="twin-detail-actions">{canProcess?<Button color="primary" size="sm" disabled={busy} onClick={onProcess}>{capture.status==='failed'?<Reload/>:<ArrowRight/>}{capture.status==='failed'?t('重新处理','Try again'):t('开始理解','Explore this material')}</Button>:<ButtonLink as="a" href="#settings/model" color="secondary" variant="outline" size="sm">{t('配置后继续','Set up to continue')}<ArrowRight/></ButtonLink>}</div>}
    {needsReview&&<div className="twin-review-intro"><h4>{t('这样理解，准确吗？','Does this sound right?')}</h4><p>{capture.purpose==='personal'?t('逐条看一看。只有你确认的内容会进入个人画像。','Review each point. Only what you confirm joins your profile.'):t('逐条看一看。这次审阅不会加入长期个人画像。','Review each point. This review will stay outside your long-term profile.')}</p></div>}
    <div className="twin-candidates">{capture.candidates.map(candidate=><Candidate key={candidate.id} candidate={candidate} decision={decisions[candidate.id]} editable={needsReview&&candidate.status==='pending'} disabled={busy} data={data} onSource={onSource} onDecision={decision=>setDecisions(current=>({...current,[candidate.id]:decision}))}/>)}</div>
    {needsReview&&<div className="twin-review-submit"><span>{pending.length?t(`已选择 ${decided} / ${pending.length} 条`,`Reviewed ${decided} of ${pending.length}`):t('没有需要添加的个人理解','No personal context to add')}</span><Button color="primary" size="sm" disabled={busy||decided!==pending.length} onClick={()=>void onReview(pending.map(candidate=>decisions[candidate.id]))}>{t('保存我的确认','Save my review')}<Check/></Button></div>}
    {capture.status==='completed'&&hasAccepted&&<div className="twin-detail-actions"><Button color="secondary" variant="outline" size="sm" disabled={busy||data.profile.demo} onClick={onUse}>{t('用于接下来的一件事','Use in my next task')}<ArrowRight/></Button></div>}
    {!!capture.events.length&&<details className="twin-processing-history"><summary>{t('处理记录','Processing history')}<ChevronDown/></summary><ol>{capture.events.map(event=><li key={event.id}><span>{({received:t('原始材料已保存','Original material saved'),started:t('已开始真实模型任务','Model task started'),review_ready:t('理解已生成，等待审阅','Understanding ready for review'),failed:t('处理未完成','Processing did not finish'),reviewed:t('用户审阅已保存','Your review saved'),corrected:t('用户纠正已保存','Your correction saved')}[event.type])}</span><time>{when(event.at)}</time>{event.taskId&&<a href={`#task/${event.taskId}`}>{t('查看任务','View task')}<ArrowRight/></a>}</li>)}</ol></details>}
    {capture.activeTaskId&&<a className="twin-running-task" href={`#task/${capture.activeTaskId}`}>{t('打开真实任务，查看过程','Open the task to see its progress')}<ArrowRight/></a>}
  </section>;
}

function Candidate({candidate,decision,editable,disabled,data,onSource,onDecision}:{candidate:TwinCandidate;decision?:TwinReviewDecision;editable:boolean;disabled:boolean;data:Bootstrap;onSource:(id:string)=>void;onDecision:(decision:TwinReviewDecision)=>void}) {
  const [editing,setEditing]=useState(false),[value,setValue]=useState<TwinCandidateValue>(candidate.value);
  useUnsavedChanges({unsaved:editable&&editing&&JSON.stringify(value)!==JSON.stringify(candidate.value),busy:disabled});
  const valueValid='statement'in value?!!value.statement.trim():'name'in value?!!value.name.trim():!!value.title.trim()&&!!value.date.trim();
  return <article className={`twin-candidate ${decision?`has-${decision.action}`:''}`}>
    <div className="twin-candidate-meta"><span>{candidateKind(candidate)}</span><span>{editable?(decision?decision.action==='accept'?t('将确认','Will confirm'):decision.action==='correct'?t('将按修改保存','Will save correction'):t('将不采用','Will not adopt'):t('待你确认','Awaiting your review')):reviewLabel(candidate.status)}</span></div>
    {!editing?<><h4>{decision?.action==='correct'&&decision.value?('statement'in decision.value?decision.value.statement:'name'in decision.value?decision.value.name:decision.value.title):candidateText(candidate)}</h4>{'description'in candidate.value&&candidate.value.description&&<p>{decision?.value&&'description'in decision.value?decision.value.description:candidate.value.description}</p>}{'date'in candidate.value&&<time>{decision?.value&&'date'in decision.value?decision.value.date:candidate.value.date}</time>}</>:<div className="twin-candidate-editor">{'statement'in value?<Textarea aria-label={t('修正这条理解','Correct this understanding')} rows={3} autoResize value={value.statement} disabled={disabled} onChange={event=>setValue({...value,statement:event.target.value})}/>:<>{'name'in value?<Input aria-label={t('人物姓名','Person name')} value={value.name} disabled={disabled} onChange={event=>setValue({...value,name:event.target.value})}/>:<><Input aria-label={t('经历标题','Experience title')} value={value.title} disabled={disabled} onChange={event=>setValue({...value,title:event.target.value})}/><Input aria-label={t('日期','Date')} value={value.date} disabled={disabled} onChange={event=>setValue({...value,date:event.target.value})}/></>}<Textarea aria-label={t('修正描述','Correct description')} rows={3} autoResize value={value.description} disabled={disabled} onChange={event=>setValue({...value,description:event.target.value})}/></>}<div><Button color="primary" size="sm" disabled={disabled||!valueValid} onClick={()=>{onDecision({candidateId:candidate.id,action:'correct',value});setEditing(false);}}>{t('使用我的表述','Use my wording')}</Button><Button color="secondary" variant="ghost" size="sm" disabled={disabled} onClick={()=>setEditing(false)}>{t('取消修改','Cancel edit')}</Button></div></div>}
    <div className="twin-candidate-evidence">{candidate.evidence.map((evidence,index)=><div key={`${evidence.sourceId}:${index}`}>{evidence.excerpt&&<blockquote>{evidence.excerpt}</blockquote>}<button type="button" onClick={()=>onSource(evidence.sourceId)}><Document/><span>{data.sources.find(source=>source.id===evidence.sourceId)?.title||t('查看原始材料','View original material')}</span><ArrowRight/></button></div>)}</div>
    {editable&&!editing&&<div className="twin-candidate-actions"><Button color="secondary" variant={decision?.action==='accept'?'soft':'ghost'} selected={decision?.action==='accept'} size="sm" disabled={disabled} onClick={()=>onDecision({candidateId:candidate.id,action:'accept'})}><Check/>{t('准确','That is right')}</Button><Button color="secondary" variant={decision?.action==='correct'?'soft':'ghost'} selected={decision?.action==='correct'} size="sm" disabled={disabled} onClick={()=>{setValue(decision?.value||candidate.value);setEditing(true);}}><Edit/>{t('改一下','Adjust')}</Button><Button color="secondary" variant={decision?.action==='reject'?'soft':'ghost'} selected={decision?.action==='reject'} size="sm" disabled={disabled} onClick={()=>onDecision({candidateId:candidate.id,action:'reject'})}>{t('不采用','Do not adopt')}</Button></div>}
  </article>;
}

function Suggestion({suggestion,disabled,canProcess,onRespond,onSource}:{suggestion:TwinSuggestion;disabled:boolean;canProcess:boolean;onRespond:(action:'accept'|'dismiss'|'correct',text?:string)=>Promise<void>;onSource:()=>void}) {
  const [editing,setEditing]=useState(false),[feedback,setFeedback]=useState('');
  return <article className="twin-suggestion"><h3>{suggestion.title}</h3><p>{suggestion.description}</p><button className="twin-suggestion-source" type="button" onClick={onSource}><Document/>{t('为什么想到这件事','What prompted this')}<ArrowRight/></button>{suggestion.taskId&&<a className="twin-suggestion-context" href={`#task/${suggestion.taskId}`}>{t('相关任务','Related task')}<ArrowRight/></a>}{suggestion.goalId&&<a className="twin-suggestion-context" href="#life">{t('相关待办','Related goal')}<ArrowRight/></a>}{editing?<div className="twin-suggestion-correction"><Textarea aria-label={t('纠正这条建议','Correct this suggestion')} placeholder={suggestion.kind==='review_source'?t('修正这份材料的表述……','Correct the wording of this material…'):t('这次我真正需要的帮助是……','What I actually need help with…')} rows={3} autoResize value={feedback} disabled={disabled} onChange={event=>setFeedback(event.target.value)}/><div><Button color="primary" size="sm" disabled={disabled||!canProcess||!feedback.trim()} onClick={()=>void onRespond('correct',feedback.trim())}>{t('按我的意思继续','Continue with my correction')}</Button><Button color="secondary" variant="ghost" size="sm" disabled={disabled} onClick={()=>setEditing(false)}>{t('取消','Cancel')}</Button></div></div>:<div className="twin-suggestion-actions"><Button color="secondary" variant="outline" size="sm" disabled={disabled||!canProcess} onClick={()=>void onRespond('accept')}>{suggestion.kind==='review_source'?t('一起看看','Explore together'):t('帮我推进','Help me move forward')}<ArrowRight/></Button><Button color="secondary" variant="ghost" size="sm" disabled={disabled} onClick={()=>setEditing(true)}>{t('情况有变','Things changed')}</Button><Button color="secondary" variant="ghost" size="sm" disabled={disabled} onClick={()=>void onRespond('dismiss')}>{t('暂时不用','Not now')}</Button></div>}{!canProcess&&!disabled&&<a className="twin-suggestion-context" href="#settings/model">{t('连接模型后继续','Connect a model to continue')}<ArrowRight/></a>}</article>;
}
