import { t } from '../i18n';
import { useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Dialog, ErrorNotice, Field } from '../components';
import { write, messageOf } from '../api';
import type { Bootstrap, Person, Relationship } from '../../shared/contracts';
import { displayRole } from './display';
import { PortraitEditor } from './PortraitEditor';
import { portraitDraft } from './portrait';
import { SourceSelectField } from './SourceSelectField';
import './record-forms.css';

export function PersonForm({ person, data, onClose, onSaved }: { person?: Person; data: Bootstrap; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name,setName]=useState(person?.name||''),[role,setRole]=useState(person?.role||''),[description,setDescription]=useState(person?.description||''),[sources,setSources]=useState(person?.sourceIds||[]),[entries,setEntries]=useState(person?.portrait?.entries||[]),[jsonEditing,setJsonEditing]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <Dialog title={person?t('编辑人物画像','Edit person profile'):t('添加人物','Add person')} onClose={()=>{if(!busy)onClose();}} className="record-dialog person-portrait-form"><form className="cog-stack record-form" onSubmit={async event=>{event.preventDefault();if(jsonEditing||busy)return;setBusy(true);setError('');try{await write(person?`/people/${person.id}`:'/people',{name,role,description,sourceIds:sources,portrait:portraitDraft(entries),basePortraitVersion:person?.portrait?.version??0},person?'PUT':'POST');await onSaved();onClose();}catch(err){setError(messageOf(err));}finally{setBusy(false);}}}>
    <fieldset disabled={busy}><div className="record-field-pair"><Field label={t('姓名','Name')}><Input size="md" variant="soft" aria-label={t('人物姓名','Person name')} required value={name} onChange={event=>setName(event.target.value)}/></Field><Field label={t('与你的关系或角色','Relationship or role')}><Input size="md" variant="soft" aria-label={t('人物角色','Person role')} value={displayRole(role)} onChange={event=>setRole(event.target.value)}/></Field></div><Field label={t('人物概况','Overview')}><Textarea variant="soft" aria-label={t('人物背景','Person context')} rows={3} value={description} onChange={event=>setDescription(event.target.value)}/></Field><SourceSelectField label={t('概况来源','Overview sources')} disabled={busy} value={sources} sources={data.sources} onChange={setSources}/>
    <PortraitEditor entries={entries} onChange={setEntries} sources={data.sources} disabled={busy} onJsonEditing={setJsonEditing}/>
    <p className="portrait-editor-note">{t('人物之间的关系在关系图中单独维护。画像不会自动写入你的已确认认知，也不会发送给模型。','Relationships between people remain in the relationship graph. This profile does not automatically become your confirmed context and is not sent to a model.')}</p></fieldset>
    <ErrorNotice error={error}/><div className="record-actions"><Button type="button" color="secondary" variant="ghost" disabled={busy} onClick={onClose}>{t('取消','Cancel')}</Button><Button type="submit" color="primary" disabled={busy||jsonEditing} loading={busy}>{t('保存人物','Save person')}</Button></div>
  </form></Dialog>;
}

export function RelationshipForm({ relationship, data, onClose, onSaved }: { relationship?: Relationship; data: Bootstrap; onClose: () => void; onSaved: () => Promise<void> }) {
  const [from, setFrom] = useState(relationship?.from || data.people[0]?.id || ''); const [to, setTo] = useState(relationship?.to || data.people[1]?.id || ''); const [label, setLabel] = useState(relationship?.label || ''); const [description, setDescription] = useState(relationship?.description || ''); const [sources, setSources] = useState(relationship?.sourceIds || []); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const peopleOptions = data.people.map(p => ({ value: p.id, label: p.role ? t(`${p.name}（${displayRole(p.role)}）`, `${p.name} (${displayRole(p.role)})`) : p.name }));
  return <Dialog title={relationship ? t("修正关系背景", "Edit relationship context") : t("添加人物关系", "Add relationship")} onClose={onClose} className="record-dialog"><form className="cog-stack record-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { if (from === to) throw new Error(t("请选择两个不同的人物。", "Choose two different people.")); await write(relationship ? `/relationships/${relationship.id}` : '/relationships', { from, to, label, description, sourceIds: sources }, relationship ? 'PUT' : 'POST'); await onSaved(); onClose(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }}><Field label={t("人物一", "First person")}><Select align="start" listMinWidth={240} listMaxWidth={420} value={from} options={peopleOptions} onChange={o => setFrom(o.value)} /></Field><Field label={t("人物二", "Second person")}><Select align="start" listMinWidth={240} listMaxWidth={420} value={to} options={peopleOptions} onChange={o => setTo(o.value)} /></Field><Field label={t("关系描述", "Relationship label")}><Input size="md" variant="soft" aria-label={t("关系名称", "Relationship name")} required value={label} onChange={e => setLabel(e.target.value)} /></Field><Field label={t("具体背景", "Details")}><Textarea variant="soft" aria-label={t("关系背景", "Relationship context")} value={description} onChange={e => setDescription(e.target.value)} /></Field><SourceSelectField label={t("来源依据", "Sources")} disabled={busy} value={sources} sources={data.sources} onChange={setSources}/><ErrorNotice error={error} /><div className="record-actions"><Button type="button" color="secondary" variant="ghost" disabled={busy} onClick={onClose}>{t("取消", "Cancel")}</Button><Button type="submit" color="primary" loading={busy}>{t("保存关系", "Save relationship")}</Button></div></form></Dialog>;
}
