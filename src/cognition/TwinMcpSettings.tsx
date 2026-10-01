import { useEffect, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { api, write, messageOf } from '../api';
import { ErrorNotice, Field, when } from '../components';
import { t } from '../i18n';
import type { DigitalTwinPackage, MemoryLayer } from '../../shared/memory-import';
import type { TwinMcpGrant } from '../../shared/twin-mcp';
import './twin-mcp-settings.css';

const layers = (): Record<MemoryLayer,string> => ({facts:t('背景与事实','Background'),preferences:t('偏好','Preferences'),goals:t('目标','Goals'),constraints:t('约束','Constraints'),values:t('价值取向','Values'),capabilities:t('能力','Capabilities'),decisions:t('决定','Decisions'),notes:t('补充记录','Notes')});

export function TwinMcpSettings({active,showcase}:{active:boolean;showcase:boolean}) {
  const [grants,setGrants]=useState<TwinMcpGrant[]>([]),[pack,setPack]=useState<DigitalTwinPackage>();
  const [editing,setEditing]=useState(false),[clientName,setClientName]=useState(''),[selected,setSelected]=useState<string[]>([]);
  const [includeName,setIncludeName]=useState(false),[includeEvidence,setIncludeEvidence]=useState(false),[ack,setAck]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState('');
  useEffect(()=>{let current=true;if(active&&!showcase)api<TwinMcpGrant[]>('/digital-twin/mcp-grants').then(value=>{if(current)setGrants(value);}).catch(error=>{if(current)setError(messageOf(error));});return()=>{current=false;};},[active,showcase]);
  async function begin(){setBusy(true);setError('');try{setPack(await api<DigitalTwinPackage>('/digital-twin/export'));setSelected([]);setClientName('');setIncludeName(false);setIncludeEvidence(false);setEditing(true);}catch(error){setError(messageOf(error));}finally{setBusy(false);}}
  async function save(){if(!pack)return;setBusy(true);setError('');try{const scopes=[...new Set(pack.entries.filter(entry=>selected.includes(entry.id)).map(entry=>entry.layer))];const grant=await write<TwinMcpGrant>('/digital-twin/mcp-grants',{clientName,baseRevision:pack.revision,scopes,entryIds:selected,includeName:includeName&&scopes.includes('facts'),includeEvidence});setGrants(previous=>[...previous,grant]);setEditing(false);setPack(undefined);}catch(error){setError(messageOf(error));}finally{setBusy(false);}}
  async function toggle(grant:TwinMcpGrant){setBusy(true);setError('');try{const saved=await write<TwinMcpGrant>(`/digital-twin/mcp-grants/${grant.id}`,{revision:grant.revision,enabled:!grant.enabled,acknowledgeExternal:ack[grant.id]===true},'PUT');setGrants(previous=>previous.map(row=>row.id===saved.id?saved:row));setAck(previous=>({...previous,[grant.id]:false}));}catch(error){setError(messageOf(error));}finally{setBusy(false);}}
  const confirmed=pack?.entries.filter(entry=>entry.status==='confirmed')??[];
  const hasFacts=confirmed.some(entry=>entry.layer==='facts'&&selected.includes(entry.id));
  return <section className="twin-mcp-settings" aria-labelledby="twin-mcp-heading">
    <header><div><h3 id="twin-mcp-heading">{t('让其他 AI 使用个人上下文','Personal context for other AI apps')}</h3><p>{t('选择已确认的内容，为指定客户端创建只读 MCP 授权。','Choose confirmed entries and create a read-only MCP grant for a client.')}</p></div>{!showcase&&!editing&&<Button color="secondary" variant="outline" size="sm" loading={busy} onClick={()=>void begin()}>{t('创建授权','Create grant')}</Button>}</header>
    {showcase?<p className="twin-mcp-note">{t('请进入个人空间，选择要提供给其他 AI 的资料。示例空间不会创建外部授权。','Use your personal space to select context for another AI app. Examples do not create external grants.')}</p>:<>
      {!editing&&!grants.length&&<p className="twin-mcp-note">{t('尚未授权任何客户端。MCP 默认关闭，不随应用启动。','No clients are authorized. MCP is off by default and does not start with the app.')}</p>}
      {editing&&pack&&<form className="twin-mcp-form" onSubmit={event=>{event.preventDefault();void save();}}>
        <Field label={t('客户端名称','Client name')}><Input required maxLength={100} disabled={busy} value={clientName} onChange={event=>setClientName(event.target.value)} placeholder={t('例如 Claude Desktop 或 Cursor','For example, Claude Desktop or Cursor')} aria-label={t('客户端名称','Client name')}/></Field>
        <p className="twin-mcp-note">{t('逐条核对本次范围。未确认内容不会提供；后续新增与修正需要重新创建授权包。','Review this scope. Unconfirmed entries are excluded; later additions and corrections require a new grant.')}</p>
        <div className="twin-mcp-selection">{Object.entries(layers()).map(([layer,label])=>{const entries=confirmed.filter(entry=>entry.layer===layer),count=entries.filter(entry=>selected.includes(entry.id)).length;return entries.length>0&&<details key={layer}><summary><span>{label}</span><small>{count} / {entries.length}</small></summary><Checkbox disabled={busy} label={t('选择此分类','Select this category')} checked={count===entries.length?true:count?'indeterminate':false} onCheckedChange={checked=>setSelected(previous=>checked?[...new Set([...previous,...entries.map(entry=>entry.id)])]:previous.filter(id=>!entries.some(entry=>entry.id===id)))}/>{entries.map(entry=><div key={entry.id}><Checkbox disabled={busy} label={entry.statement} checked={selected.includes(entry.id)} onCheckedChange={checked=>setSelected(previous=>checked?[...previous,entry.id]:previous.filter(id=>id!==entry.id))}/><small>{t(`第 ${entry.revision} 版`,`Revision ${entry.revision}`)}</small></div>)}</details>;})}{!confirmed.length&&<p>{t('暂无已确认条目。请先在个人画像中核对导入内容。','No confirmed entries. Review imported context in your personal profile first.')}</p>}</div>
        <div className="twin-mcp-options"><Checkbox disabled={busy||!hasFacts} checked={includeName&&hasFacts} label={t('包含我的称呼','Include my name')} onCheckedChange={checked=>setIncludeName(checked===true)}/><Checkbox disabled={busy} checked={includeEvidence} label={t('包含来源摘录','Include source excerpts')} onCheckedChange={checked=>setIncludeEvidence(checked===true)}/></div>
        <p className="twin-mcp-note">{t('创建后仍为关闭状态。启用前会提示所选资料可能由客户端传给其模型。','The grant remains off after creation. Enabling it requires acknowledging that the client may send selected data to its model.')}</p>
        <footer><span>{t(`已选 ${selected.length} 条`,`${selected.length} selected`)}</span><Button color="secondary" variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>{t('取消','Cancel')}</Button><Button color="primary" type="submit" size="sm" loading={busy} disabled={busy||!selected.length||!clientName.trim()}>{t('保存授权包','Save grant')}</Button></footer>
      </form>}
      <div className="twin-mcp-grants">{grants.map(grant=><article key={grant.id}><header><div><strong>{grant.clientName}</strong><span>{t(`${grant.entryIds.length} 条内容`,`${grant.entryIds.length} entries`)}</span></div><Badge color={grant.enabled?'success':'secondary'} size="sm">{grant.enabled?t('已启用','Enabled'):t('已关闭','Off')}</Badge></header><p>{grant.scopes.map(scope=>layers()[scope]).join(t('、',', '))}</p><small>{t('创建于 ','Created ')}{when(grant.createdAt)}</small>
        <details className="twin-mcp-configuration"><summary>{t('客户端配置','Client configuration')}</summary><p>{t('将此配置加入客户端的 MCP 设置。客户端自行启动本地进程，只能读取这份授权包。','Add this to the client’s MCP settings. It starts a local process that can read only this grant.')}</p><Textarea readOnly rows={7} value={JSON.stringify(grant.configuration,null,2)} aria-label={t(`${grant.clientName} 的 MCP 配置`,`MCP configuration for ${grant.clientName}`)}/><Button color="secondary" variant="outline" size="sm" onClick={async()=>{try{await navigator.clipboard.writeText(JSON.stringify(grant.configuration,null,2));setCopied(grant.id);}catch{setError(t('无法复制，请选择上方配置复制。','Unable to copy. Select the configuration above.'));}}}>{copied===grant.id?t('已复制','Copied'):t('复制配置','Copy configuration')}</Button></details>
        {!grant.enabled&&<Checkbox disabled={busy} checked={ack[grant.id]===true} label={t('我允许此客户端及其模型读取上述范围。','I allow this client and its model to read the scope above.')} onCheckedChange={checked=>setAck(previous=>({...previous,[grant.id]:checked===true}))}/>}
        <div className="twin-mcp-grant-actions"><Button color="secondary" variant="outline" size="sm" disabled={busy||(!grant.enabled&&!ack[grant.id])} loading={busy} onClick={()=>void toggle(grant)}>{grant.enabled?t('停用','Disable'):t('启用授权','Enable grant')}</Button></div>
      </article>)}</div>
      {grants.length>0&&<p className="twin-mcp-note">{t('客户端名称是授权备注，不是身份认证。停用会阻止后续读取，但无法撤回客户端已经取得的内容。','The client name is a grant label, not identity verification. Disabling blocks future reads; previously received data cannot be recalled.')}</p>}
    </>}
    <ErrorNotice error={error}/>
  </section>;
}
