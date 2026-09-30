import { t } from '../i18n';
import type { ProviderSettings, ModelConnection } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { ChevronDown, Settings, Code, Group, Check } from '@openai/apps-sdk-ui/components/Icon';
import { ProviderMark } from '../models/providers';
import './composer.css';

export interface ModelPickerProps {
  settings: ProviderSettings;
  mode: 'demo'|'live';
  onMode: (mode:'demo'|'live') => void | boolean | Promise<void | boolean>;
  onSettings: () => void;
  disabled?: boolean;
  example?: boolean;
  connections?: ModelConnection[];
  defaultConnectionId?: string;
  connectionId?: string;
  onConnection?: (id:string|undefined) => void | boolean | Promise<void | boolean>;
  agentModels?: Array<{id:string;name:string;model:string;connectionName:string;hasKey:boolean;provider?:ProviderSettings['provider']}>;
  onAgent?: (id:string) => void;
}

export function ModelPicker({settings,mode,onMode,onSettings,disabled=false,example=false,connections,defaultConnectionId,connectionId,onConnection,agentModels,onAgent}:ModelPickerProps) {
  if(example||mode==='demo')return <span className="composer-example-label">{t('示例','Example')}</span>;
  const grouped=!!agentModels?.length;
  const selected=connections?.find(connection=>connection.id===(connectionId||defaultConnectionId))||settings;
  const label=grouped?t('按角色模型','Each agent’s model'):selected.model.trim()||t('尚未选择模型','No model selected');
  // A long model ID stays complete in the menu and accessible name, rather than stretching the composer.
  const triggerLabel=!grouped&&label.length>28?t('已选模型','Selected model'):label;
  const explicitConnection=connectionId&&connectionId!==defaultConnectionId?connectionId:undefined;
  const value=grouped?'agents':explicitConnection||'default';
  const alternatives=connections?.filter(connection=>connection.id!==defaultConnectionId)||[];
  async function choose(next:string){
    if(!grouped&&onConnection){const updated=await onConnection(next==='default'?undefined:next);if(updated===false)return;}
    await onMode('live');
  }
  const connectionDetail=(connection:ProviderSettings)=>connection.hasKey?connection.model||t('尚未选择模型','No model selected'):t(`${connection.model||'未选择模型'}，待连接`,`${connection.model||'No model selected'} — not connected`);
  return <Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="sm" className="composer-model-picker" disabled={disabled} title={label} aria-label={t(`选择模型，当前${label}`,`Choose model, currently ${label}`)}>
    {grouped?<Group/>:<ProviderMark provider={selected.provider} size={16}/>}<span className="composer-model-name">{triggerLabel}</span><ChevronDown/>
  </Button></Menu.Trigger><Menu.Content side="top" align="end" width={300} minWidth="auto">
    <Menu.RadioGroup value={value} onChange={next=>void choose(next)}>
      {grouped?<Menu.RadioItem value="agents" className="composer-model-option"><span className="composer-option-icon"><Group/></span><span className="composer-option-copy"><strong>{t('使用各位助理的模型','Use each agent’s model')}</strong><small>{agentModels.every(agent=>agent.hasKey)?t(`${agentModels.length} 位助理分别运行`,`${agentModels.length} agents, individual connections`):t('部分助理还未连接模型','Some agents are not connected')}</small></span><span className="composer-option-check" aria-hidden="true">{value==='agents'&&<Check/>}</span></Menu.RadioItem>:<>
        <Menu.RadioItem value="default" className="composer-model-option"><ProviderMark provider={settings.provider} size={22}/><span className="composer-option-copy"><strong>{t('继承默认','Use default')}</strong><small>{connectionDetail(settings)}</small></span><span className="composer-option-check" aria-hidden="true">{value==='default'&&<Check/>}</span></Menu.RadioItem>
        {onConnection&&alternatives.map(connection=><Menu.RadioItem key={connection.id} value={connection.id} className="composer-model-option"><ProviderMark provider={connection.provider} size={22}/><span className="composer-option-copy"><strong>{connection.model||connection.name}</strong><small>{connection.name}{connection.hasKey?'':t('，待连接',' — not connected')}</small></span><span className="composer-option-check" aria-hidden="true">{value===connection.id&&<Check/>}</span></Menu.RadioItem>)}
      </>}
    </Menu.RadioGroup>
    {grouped&&<><Menu.Separator/>{agentModels.map(agent=><Menu.Item key={agent.id} className="composer-agent-model" disabled={!onAgent} onSelect={()=>onAgent?.(agent.id)}>{agent.provider&&<ProviderMark provider={agent.provider} size={18}/>}<span className="composer-agent-model-copy"><strong>{agent.name}</strong><small>{agent.model}{agent.hasKey?'':t('，待连接',' — not connected')}</small></span></Menu.Item>)}</>}
    <Menu.Separator/><Menu.Item onSelect={onSettings}><Settings/>{t('管理模型','Manage models')}</Menu.Item>
  </Menu.Content></Menu>;
}
