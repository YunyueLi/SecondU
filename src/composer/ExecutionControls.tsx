import {useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Menu} from '@openai/apps-sdk-ui/components/Menu';
import {Popover} from '@openai/apps-sdk-ui/components/Popover';
import {ShieldCheck,HandRaised,SettingsSlider,ChevronDown,Check} from '@openai/apps-sdk-ui/components/Icon';
import type {ApprovalMode,TaskContextUsage} from '../../shared/contracts';
import {t,getLocale} from '../i18n';

export function approvalOptions(){return [
  {value:'ask' as const,label:t('每次询问','Ask for approval'),description:t('扩展权限前询问。','Ask before expanding access.')},
  {value:'auto' as const,label:t('自动批准','Auto review'),description:t('运行时自动审核权限请求。','The runtime reviews access requests.')},
  {value:'full' as const,label:t('完全访问','Full access'),description:t('访问文件和网络，不再询问。','Access files and network without asking.')},
];}

function FullAccessIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 8 3v6c0 5-5 8-8 9-3-1-8-4-8-9V6z"/><path d="M12 8v5m0 3h.01"/></svg>;}
function PermissionIcon({mode}:{mode:ApprovalMode}){return mode==='ask'?<HandRaised/>:mode==='auto'?<ShieldCheck/>:<FullAccessIcon/>;}

export function ApprovalPicker({value,defaultValue='ask',onChange,disabled=false}:{value?:ApprovalMode|null;defaultValue?:ApprovalMode;onChange:(value:ApprovalMode|null)=>void;disabled?:boolean}){
  const options=approvalOptions();
  const effective=value||defaultValue;
  const selected=options.find(option=>option.value===effective)!;
  return <Menu><Menu.Trigger><Button type="button" color="secondary" variant="ghost" size="sm" className={`composer-approval-picker permission-${effective}`} disabled={disabled} aria-label={t(`操作权限：${selected.label}${value?'':'，继承默认'}`,`Permissions: ${selected.label}${value?'':', use default'}`)} title={selected.label}><PermissionIcon mode={effective}/><span className="composer-approval-label">{selected.label}</span><ChevronDown/></Button></Menu.Trigger><Menu.Content side="top" align="end" width={248} minWidth="auto"><div className="execution-permission-menu"><div className="execution-permission-heading">{t('操作权限','Agent permissions')}</div><Menu.RadioGroup value={value||'default'} onChange={next=>onChange(next==='default'?null:next as ApprovalMode)}>{options.map(option=><Menu.RadioItem key={option.value} value={option.value} className={`execution-mode-option permission-${option.value}`}><span className="execution-mode-icon"><PermissionIcon mode={option.value}/></span><span className="execution-mode-copy"><strong>{option.label}</strong><small>{option.description}</small></span><span className="execution-mode-check" aria-hidden="true">{value===option.value&&<Check/>}</span></Menu.RadioItem>)}<Menu.Separator/><Menu.RadioItem value="default" className="execution-mode-option execution-default-option"><span className="execution-mode-icon"><SettingsSlider/></span><span className="execution-mode-copy"><strong>{t('继承默认','Use default')}</strong><small>{options.find(option=>option.value===defaultValue)?.label}</small></span><span className="execution-mode-check" aria-hidden="true">{!value&&<Check/>}</span></Menu.RadioItem></Menu.RadioGroup></div></Menu.Content></Menu>;
}

export function ContextUsage({usage}:{usage?:TaskContextUsage}){
  const [open,setOpen]=useState(false);
  if(!usage)return null;
  const used=usage.usedTokens??null,capacity=usage.contextWindow??null;
  const measured=used!==null&&Number.isFinite(used)&&used>=0&&capacity!==null&&Number.isFinite(capacity)&&capacity>0;
  if(!measured)return null;
  const ratio=measured?Math.max(0,Math.min(1,used/capacity)):null;
  const percent=ratio===null?null:Math.round(ratio*100);
  const number=(value:number|null|undefined)=>value==null?'—':value.toLocaleString(getLocale());
  const label=percent===null?t('上下文用量：暂无运行数据','Context usage: no runtime measurement'):t(`上下文已用 ${percent}%`,`Context usage: ${percent}%`);
  return <Popover open={open} onOpenChange={setOpen}><Popover.Trigger><Button type="button" color="secondary" variant="ghost" uniform size="sm" className="composer-context-usage" aria-label={label} title={label}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" className="context-usage-track"/><circle cx="12" cy="12" r="8" pathLength="100" className="context-usage-fill" strokeDasharray={`${percent??0} 100`} transform="rotate(-90 12 12)"/></svg></Button></Popover.Trigger><Popover.Content side="top" align="end" width={280} minWidth="auto" className="context-usage-popover"><header><strong>{t('上下文用量','Context usage')}</strong><span>{percent===null?'—':`${percent}%`}</span></header><p>{measured?t(`当前 ${number(used)} / ${number(capacity)} tokens`,`Current ${number(used)} / ${number(capacity)} tokens`):t('运行时尚未返回上下文容量与用量。','The runtime has not reported context usage and capacity yet.')}</p>{usage&&<dl><div><dt>{t('累计输入','Total input')}</dt><dd>{number(usage.inputTokens)}</dd></div><div><dt>{t('累计输出','Total output')}</dt><dd>{number(usage.outputTokens)}</dd></div><div><dt>{t('累计用量','Total tokens')}</dt><dd>{number(usage.totalTokens)}</dd></div></dl>}<footer>{t('仅显示运行时实际返回的数据。','Based on measurements reported by the runtime.')}</footer></Popover.Content></Popover>;
}
