import { ProjectPicker } from '../ProjectWorkspace';
import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { AgentProfile, AgentRoom, Bootstrap } from '../../shared/contracts';
import { Button, CopyButton } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { ConnectionSelect } from '../models/ConnectionSelect';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { FileUpload, ArrowRight, ChevronDown, Download } from '@openai/apps-sdk-ui/components/Icon';
import { ScanIcon } from './ScanIcon';
import { Dialog, ErrorNotice, Field } from '../components';
import { write, messageOf } from '../api';
import { AgentAvatar } from './AgentIdentity';
import { AvatarPicker } from './AvatarPicker';
import { validAvatarStyle, type AvatarStyle } from './avatars';
import { encodeCard, type AgentCard } from '../cognition/qr';
import { decodeAgentQR, parseAgentImport, type AgentImportPreview } from './qrImport';
import './source-agent.css';
import QRCode from 'qrcode';

export function AgentEditor({ agent, data, onClose, onSaved }: { agent?:AgentProfile; data:Bootstrap; onClose:()=>void; onSaved:(agent:AgentProfile)=>Promise<void> }) {
  const [section,setSection]=useState<'identity'|'instructions'|'model'>('identity');const [avatarOpen,setAvatarOpen]=useState(false);
  const [name,setName]=useState(agent?.name||'');const [role,setRole]=useState(agent?.role||'');const [instructions,setInstructions]=useState(agent?.instructions||'');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [savedId,setSavedId]=useState(agent?.id);const [connectionId,setConnectionId]=useState(agent?.connectionId||'default');const [avatarStyle,setAvatarStyle]=useState<AvatarStyle>(validAvatarStyle(agent?.avatarStyle||data.defaultAgentAvatarStyle));const [avatarStyleChanged,setAvatarStyleChanged]=useState(false);const [avatarUpload,setAvatarUpload]=useState<string>();const [clearAvatar,setClearAvatar]=useState(false);
  const defaultModel=data.modelConnections?.find(connection=>connection.id===data.defaultConnectionId);

  return <Dialog className="ag-editor-dialog" title={agent?t("编辑助理", "Edit agent"):t("创建助理", "Create agent")} onClose={onClose}><form className="ag-form" onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');let profileSaved=false;try{
    let saved=await write<AgentProfile>(savedId?`/agents/${savedId}`:'/agents',{name:name.trim(),role:role.trim(),instructions:instructions.trim()||role.trim(),connectionId:connectionId==='default'?null:connectionId,...(agent||avatarStyleChanged?{avatarStyle}:{}),clearAvatar},savedId?'PUT':'POST');setSavedId(saved.id);profileSaved=true;
    if(avatarUpload)saved=await write<AgentProfile>(`/agents/${saved.id}/avatar`,{dataUrl:avatarUpload});await onSaved(saved);
  }catch(err){setError(`${profileSaved&&avatarUpload?t("角色资料已保存。头像上传或刷新未完成，重试保存即可。 ", "The agent profile was saved. The avatar upload or refresh did not finish. Save again to retry. "):''}${messageOf(err)}`);}finally{setBusy(false);}}}>
    <nav className="ag-editor-tabs" aria-label={t('编辑内容','Agent settings')}>
      {([{id:'identity',label:t('基本信息','Identity')},{id:'instructions',label:t('工作方式','Instructions')},{id:'model',label:t('模型','Model')}] as const).map(item=><button type="button" key={item.id} aria-pressed={section===item.id} onClick={()=>setSection(item.id)}>{item.label}</button>)}
    </nav>
    <div className="ag-editor-panel" hidden={section!=='identity'}>
      <div className="ag-editor-avatar-row">{avatarUpload?<img className="ag-editor-avatar-preview" src={avatarUpload} alt=""/>:<AgentAvatar agent={{id:savedId||'agent-preview',name:name||'Agent',avatarStyle,avatarImage:!clearAvatar?agent?.avatarImage:undefined}} size={56}/>}<div><strong>{name||t('新助理','New agent')}</strong></div><Button color="secondary" variant="outline" size="sm" onClick={()=>setAvatarOpen(value=>!value)} aria-expanded={avatarOpen}>{avatarOpen?t('收起头像','Done'):t('更换头像','Change avatar')}</Button></div>
      {avatarOpen&&<AvatarPicker id={savedId||'agent-preview'} name={name||t("新助理", "New agent")} value={avatarStyle} image={avatarUpload||(!clearAvatar?agent?.avatarImage:undefined)} disabled={busy} onStyle={style=>{setAvatarStyle(style);setAvatarStyleChanged(true);setAvatarUpload(undefined);setClearAvatar(true);}} onImage={value=>{setAvatarUpload(value);setClearAvatar(false);}} onClear={()=>{setAvatarUpload(undefined);setClearAvatar(true);}}/>}
      <Field label={t('名字','Name')}><Input value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder={t('例如：产品经理','For example: Product manager')}/></Field>
      <Field label={t('负责什么','Role')}><Input value={role} onChange={e=>setRole(e.target.value)} maxLength={200} placeholder={t('用一句话说清楚','Describe its role in one sentence')}/></Field>
    </div>
    <div className="ag-editor-panel" hidden={section!=='instructions'}><Field label={t('怎样与你一起工作','How it works with you')}><Textarea value={instructions} onChange={e=>setInstructions(e.target.value)} rows={7} maxLength={3000} placeholder={t('例如：先澄清要解决的问题，再拆出今天能验证的一步。','For example: clarify the problem, then find one step we can validate today.')}/></Field><small className="ag-editor-count">{instructions.length} / 3000</small></div>
    <div className="ag-editor-panel" hidden={section!=='model'}><Field label={t('使用的模型','Model')}><ConnectionSelect value={connectionId} onChange={setConnectionId} connections={data.modelConnections||[]} defaultConnection={defaultModel} inheritValue="default" disabled={busy}/></Field><p className="ag-muted">{t('更改从下一轮对话生效。','Changes apply on the next turn.')}</p></div>
    <ErrorNotice error={error}/><div className="ag-form-actions"><Button color="secondary" variant="ghost" onClick={onClose}>{t("取消", "Cancel")}</Button><Button color="primary" type="submit" loading={busy} disabled={!name.trim()||!role.trim()}>{agent?t("保存更改", "Save changes"):t("创建助理", "Create agent")}</Button></div>
  </form></Dialog>;
}

export function RoomEditor({ data, room, initialAgentId, initialKind, onClose, onSaved }: {data:Bootstrap;room?:AgentRoom;initialAgentId?:string;initialKind?:'direct'|'group';onClose:()=>void;onSaved:(room:AgentRoom)=>Promise<void>}) {
  const [kind,setKind]=useState<'direct'|'group'>(room?.kind||initialKind||'direct'); const [title,setTitle]=useState(room?.title||''); const [ids,setIds]=useState<string[]>(room?.agentIds||(initialAgentId?[initialAgentId]:[])); const mode=room?.mode||'live'; const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [projectId,setProjectId]=useState<string|undefined>(room?.projectId);const [savedId,setSavedId]=useState(room?.id);
  const projectLocked=!!room&&data.tasks.find(task=>task.id===room.taskIds.at(-1))?.status==='interrupted';
  const valid=kind==='direct'?ids.length===1:ids.length>=2&&ids.length<=12;
  function choose(id:string){setIds(previous=>kind==='direct'?[id]:previous.includes(id)?previous.filter(value=>value!==id):previous.length<12?[...previous,id]:previous);}
  return <Dialog title={room?t("会话设置", "Chat settings"):t("新的会话", "New chat")} onClose={()=>{if(!busy)onClose();}}><form className="ag-form" onSubmit={async event=>{event.preventDefault();if(!valid||busy||data.profile.demo)return;setBusy(true);setError('');try{const result=await write<AgentRoom>(savedId?`/agent-rooms/${savedId}`:'/agent-rooms',{title:title.trim()||undefined,kind,agentIds:ids,mode,projectId:projectId||null},savedId?'PUT':'POST');setSavedId(result.id);await onSaved(result);}catch(err){setError(messageOf(err));}finally{setBusy(false);}}}><fieldset disabled={busy} style={{display:'contents'}}>
    {!room&&<SegmentedControl value={kind} onChange={value=>{setKind(value);if(value==='direct')setIds(ids.slice(0,1));}} aria-label={t("会话类型", "Chat type")}><SegmentedControl.Option value="direct">{t("私聊", "Direct chat")}</SegmentedControl.Option><SegmentedControl.Option value="group">{t("群聊", "Group chat")}</SegmentedControl.Option></SegmentedControl>}
    {(kind==='group'||room)&&<Field label={t("会话名称", "Chat name")}><Input value={title} onChange={e=>setTitle(e.target.value)} placeholder={kind==='group'?t("这次一起做什么？", "What are we working on?"):t("会话名称", "Chat name")} size="lg" maxLength={120}/></Field>}
    <fieldset className="ag-member-field"><legend>{kind==='direct'?t("选择一位助理", "Choose an agent"):t("选择群聊成员", "Choose group members")}</legend>{kind==='group'&&<p>{t('选择 2 至 12 位','Choose 2–12 agents')}</p>}<div className="ag-member-choices">{data.agents.map(agent=><div className={`ag-member-choice ${ids.includes(agent.id)?'is-selected':''}`} key={agent.id}><AgentAvatar agent={agent} size={34}/><Checkbox checked={ids.includes(agent.id)} onCheckedChange={()=>choose(agent.id)} label={<span><strong>{agent.name}</strong><small>{agent.role}</small></span>}/></div>)}</div><small>{t(`已选 ${ids.length} 位`, `${ids.length} selected`)}</small></fieldset>
    <Field label={t("所属项目", "Project")} hint={projectLocked?t("中断的任务继续沿用原项目，请新建会话使用另一项目。", "This interrupted task keeps its project. Start a new chat to use another project."):undefined}><ProjectPicker data={data} value={projectId} onChange={setProjectId} disabled={projectLocked}/></Field><ErrorNotice error={error}/><div className="ag-form-actions"><Button color="secondary" variant="ghost" onClick={onClose}>{t("取消", "Cancel")}</Button><Button color="primary" type="submit" loading={busy} disabled={!valid||data.profile.demo}>{room?t("保存会话", "Save chat"):t("开始会话", "Start a chat")}</Button></div>
  </fieldset></form></Dialog>;
}

function publicCard(agent:AgentProfile):AgentCard{return {name:agent.name,role:agent.role,instructions:agent.instructions,...(agent.sourceUrl?{sourceUrl:agent.sourceUrl}:{})};}

export function AgentCardDialog({ agent, onClose, onImported }: {agent?:AgentProfile;onClose:()=>void;onImported:(agent:AgentProfile)=>Promise<void>}) {
  const [qr,setQR]=useState('');const [pasted,setPasted]=useState('');const [preview,setPreview]=useState<AgentImportPreview>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [sourceName,setSourceName]=useState('');const [sourceRole,setSourceRole]=useState('');const [sourceInstructions,setSourceInstructions]=useState('');const [created,setCreated]=useState<AgentProfile>();
  const [pasteOpen,setPasteOpen]=useState(false);const [dragging,setDragging]=useState(false);const [filename,setFilename]=useState('');const readSequence=useRef(0);const fileInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{let active=true;if(agent)QRCode.toDataURL(encodeCard(publicCard(agent)),{width:320,margin:2}).then(value=>{if(active)setQR(value);}).catch(err=>{if(active)setError(messageOf(err));});return()=>{active=false;readSequence.current++;};},[agent]);
  function acceptPreview(value:AgentImportPreview){setPreview(value);setCreated(undefined);setSourceName('');setSourceRole('');setSourceInstructions('');}
  async function scan(file?:File){
    if(!file||busy)return;const sequence=++readSequence.current;setBusy(true);setError('');setPreview(undefined);setCreated(undefined);setFilename(file.name);
    try{
      if(!file.type.startsWith('image/')||file.size>10*1024*1024)throw new Error(t('请选择 10 MB 以内的二维码图片。','Choose a QR code image under 10 MB.'));
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d');
      if(!context){bitmap.close();throw new Error(t('无法读取图片，请改为粘贴链接。','Could not read the image. Try pasting its link.'));}
      try{context.drawImage(bitmap,0,0,canvas.width,canvas.height);}finally{bitmap.close();}
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);const decoded=decodeAgentQR(pixels.data,pixels.width,pixels.height);
      if(sequence===readSequence.current){setPasted(decoded.text);acceptPreview(decoded.preview);}
    }catch(err){if(sequence===readSequence.current)setError(messageOf(err));}finally{if(sequence===readSequence.current)setBusy(false);if(fileInput.current)fileInput.current.value='';}
  }
  function readPasted(){if(busy)return;setError('');setFilename('');try{acceptPreview(parseAgentImport(pasted));}catch(err){setError(messageOf(err));}}
  const draft:AgentCard|undefined=preview?.kind==='card'?preview.card:preview?.kind==='source'?{name:sourceName.trim(),role:sourceRole.trim(),instructions:sourceInstructions.trim(),sourceUrl:preview.sourceUrl}:undefined;
  const valid=!!draft?.name&&!!draft.instructions&&(preview?.kind==='card'||!!draft.role);
  async function addAgent(){
    if(busy||!draft||(!created&&!valid))return;setBusy(true);setError('');
    try{const saved=created||await write<AgentProfile>('/agents',draft);setCreated(saved);await onImported(saved);}
    catch(err){setError(messageOf(err));}finally{setBusy(false);}
  }
  function chooseAnother(){if(busy)return;setPreview(undefined);setCreated(undefined);setError('');}
  const card=preview?.kind==='card'?preview.card:undefined;
  return <Dialog className="ag-card-dialog" title={agent?t('分享助理名片','Share agent card'):t('扫码创建助理','Create from QR code')} onClose={()=>{if(!busy)onClose();}}><div className="ag-card-body">
    {agent?<>
      <div className="ag-share-person"><AgentAvatar agent={agent} size={42}/><div><h3>{agent.name}</h3><p>{agent.role}</p></div></div>
      {qr&&<img className="ag-qr" src={qr} alt={t(`${agent.name}的导入二维码`,`Import QR code for ${agent.name}`)}/>}
      <p className="ag-muted">{t('分享名字、职责、角色说明和来源链接。','Shares the name, role, instructions and source link.')}</p>
      <div className="ag-card-share-actions"><CopyButton copyValue={encodeCard(publicCard(agent))} color="secondary" variant="outline">{t('复制名片链接','Copy card link')}</CopyButton>{qr&&<a className="ag-card-download" href={qr} download={`${agent.name}-agent.png`}><Download/>{t('下载二维码','Download QR code')}</a>}</div>
    </>:<>
      {!preview?<>
        <p className="ag-card-intro">{t('导入助理名片，或从物品、场所的网站链接创建自己的助理。','Import an agent card, or create your own agent from a website linked to a place or object.')}</p>
        <input ref={fileInput} hidden type="file" accept="image/*" onChange={event=>void scan(event.target.files?.[0])}/>
        <div className={`ag-card-drop ${dragging?'is-dragging':''}`} onDragOver={event=>{event.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);void scan(event.dataTransfer.files[0]);}}>
          <span className="ag-card-scan-icon"><ScanIcon/></span><strong>{t('选择或拖入二维码图片','Choose or drop a QR image')}</strong><span>{t('最大 10 MB','Up to 10 MB')}</span>
          <Button color="secondary" variant="outline" loading={busy} disabled={busy} onClick={()=>fileInput.current?.click()}><FileUpload/>{t('选择图片','Choose image')}</Button>
        </div>
        <div className="ag-card-paste"><Button color="secondary" variant="ghost" size="sm" disabled={busy} onClick={()=>setPasteOpen(value=>!value)} aria-expanded={pasteOpen}>{t('也可以粘贴链接或名片','Or paste a link or agent card')}<ChevronDown/></Button>{pasteOpen&&<form onSubmit={event=>{event.preventDefault();if(pasted.trim())readPasted();}}><Input variant="soft" size="md" aria-label={t('网站链接或助理名片','Website link or agent card')} value={pasted} disabled={busy} onChange={event=>{setPasted(event.target.value);setError('');}} placeholder="https://example.com"/><Button color="primary" type="submit" uniform disabled={!pasted.trim()||busy} aria-label={t('查看预览','Preview')}><ArrowRight/></Button></form>}</div>
      </>:<form className="ag-card-preview" onSubmit={event=>{event.preventDefault();void addAgent();}}>
        {card?<>
          <Badge color="secondary" variant="outline" size="sm">{t('待你确认','Review before adding')}</Badge><div className="ag-card-preview-person"><AgentAvatar agent={{id:`card:${card.name}`,name:card.name}} size={48}/><div><h3>{card.name}</h3><p>{card.role}</p></div></div>
          <details open><summary>{t('工作说明','Instructions')}</summary><p>{card.instructions}</p></details>
          {card.sourceUrl&&<p className="ag-card-source"><span>{t('来源','Source')}</span>{card.sourceUrl}</p>}
        </>:preview.kind==='source'&&<div className="ag-source-preview">
          <div className="ag-source-heading"><Badge color="secondary" variant="outline" size="sm">{t('网站链接','Website link')}</Badge><h3>{t('由这个来源创建助理','Create an agent for this source')}</h3></div>
          <div className="ag-source-address"><strong>{preview.hostname}</strong><span>{preview.sourceUrl}</span></div>
          <p className="ag-source-note">{t('此链接用作参考来源，网站服务未连接。','This link is a reference source. The website service is not connected.')}</p>
          <Field label={t('助理名字','Agent name')}><Input size="md" value={sourceName} maxLength={80} disabled={busy||!!created} onChange={event=>setSourceName(event.target.value)} placeholder={t('例如：我的植物养护助理','For example: My plant care guide')}/></Field>
          <Field label={t('负责什么','Role')}><Input size="md" value={sourceRole} maxLength={200} disabled={busy||!!created} onChange={event=>setSourceRole(event.target.value)} placeholder={t('用一句话说明你想让它帮什么忙','Describe the help you want in one sentence')}/></Field>
          <Field label={t('工作说明','Instructions')}><Textarea rows={3} size="md" value={sourceInstructions} maxLength={3000} disabled={busy||!!created} onChange={event=>setSourceInstructions(event.target.value)} placeholder={t('例如：这是家中绿植的养护说明来源。根据我补充的品种和环境，帮我整理养护计划；信息不足时先问我。','For example: this source relates to my houseplants. Help plan their care using the species and conditions I provide. Ask when information is missing.')}/></Field>
        </div>}
        {filename&&<small className="ag-card-filename">{filename}</small>}
        {created&&<p className="ag-source-saved" role="status">{t('已保存，正在刷新列表。','Saved. Refreshing the list.')}</p>}
        <div className="ag-card-preview-actions"><Button color="secondary" variant="ghost" disabled={busy} onClick={chooseAnother}>{t('重新选择','Choose another')}</Button><Button color="primary" type="submit" loading={busy} disabled={!created&&!valid}>{created?t('重试刷新','Retry refresh'):preview.kind==='source'?t('创建助理','Create agent'):t('添加助理','Add agent')}<ArrowRight/></Button></div>
      </form>}

    </>}
    <ErrorNotice error={error}/>
  </div></Dialog>;
}
