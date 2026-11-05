import {Select} from '@openai/apps-sdk-ui/components/Select';
import {Group,Code} from '@openai/apps-sdk-ui/components/Icon';
import type {ModelConnection} from '../../shared/contracts';
import {ProviderMark,providerName,type Provider} from '../models/providers';
import {t} from '../i18n';
import type {WorkflowModel,WorkflowModelSource} from './workflowModel';
import '../models/models.css';
import './workflow-models.css';

export function workflowModelSource(source:WorkflowModelSource){
  const labels:Record<WorkflowModelSource,[string,string]>={assignment:['单独指定','Assignment override'],workflow:['工作流默认','Workflow default'],agent:['助理设置','Agent setting'],conversation:['会话默认','Conversation default'],default:['全局默认','Global default'],recorded:['实际使用','Used for this assignment'],unrecorded:['未记录模型','Model not recorded']};
  return t(...labels[source]);
}
export function WorkflowModelBadge({value,compact=false}:{value:WorkflowModel;compact?:boolean}){
  return <span className={`workflow-model-badge${compact?' is-compact':''}`} title={[value.model,value.name,workflowModelSource(value.source)].filter(Boolean).join('；')}>{value.provider?<ProviderMark provider={value.provider} size={compact?13:18}/>:<Code/>}<span>{value.model||t('未记录','Not recorded')}</span></span>;
}
type Option={value:string;label:string;detail:string;provider?:Provider;scope?:string;inherited?:boolean;unavailable?:boolean;disabled?:boolean;triggerLabel?:string};
function OptionView(option:Option){return <span className="workflow-model-option" data-unavailable={option.unavailable||undefined}><span className="workflow-model-mark">{option.provider?<ProviderMark provider={option.provider} size={20}/>:<Group/>}</span><span className="workflow-model-copy"><strong>{option.label}</strong><small>{option.detail}</small></span></span>;}
function TriggerView(option:Option){return <span className="workflow-model-trigger" title={[option.label,option.detail].join('；')}>{option.provider?<ProviderMark provider={option.provider} size={16}/>:<Group/>}<span>{option.triggerLabel??option.label}</span>{option.scope&&<small>{option.scope}</small>}</span>;}

/** A model is the primary label; connection and inheritance remain explicit. */
export function WorkflowModelSelect({id,value,onChange,connections,inherited,scope='default',disabled}:{id?:string;value:string;onChange:(id:string)=>void;connections:ModelConnection[];inherited:WorkflowModel[];scope?:'default'|'assignment';disabled?:boolean}){
  const models=[...new Map(inherited.map(model=>[`${model.connection?.id??''}:${model.model}`,model])).values()];
  const only=models.length===1?models[0]:undefined;
  const inheritedLabel=scope==='default'?t('沿用各成员设置','Use member settings'):t('继承默认模型','Inherit default model');
  const inheritedDetail=models.length?models.map(model=>model.model||t('未连接','Not connected')).join('；'):t('尚未配置可用模型','No model configured');
  const inheritedTrigger:Option={value:'inherit',label:only?.model||(models.length>1?t('按成员模型','Member models'):t('尚未配置','Not configured')),detail:inheritedDetail,provider:only?.provider,scope:scope==='default'?t('成员默认','Member default'):t('继承','Inherited'),inherited:true};
  const options:Option[]=[{...inheritedTrigger,label:inheritedLabel,triggerLabel:inheritedTrigger.label},...connections.map(connection=>({value:connection.id,label:connection.model||connection.name,detail:`${connection.name}：${providerName(connection.provider)}${connection.hasKey?'':t('，未连接',', Not connected')}`,provider:connection.provider,scope:scope==='assignment'?t('单独指定','Override'):undefined,unavailable:!connection.hasKey,disabled:!connection.hasKey||!['responses','chat_completions','messages'].includes(connection.api)}))];
  if(value!=='inherit'&&!options.some(option=>option.value===value))options.push({value,label:t('模型连接不可用','Model unavailable'),detail:t('连接已移除，请重新选择','Connection removed; choose another model'),unavailable:true,disabled:true});
  return <Select<Option> id={id} value={value} options={options} onChange={option=>onChange(option.value)} disabled={disabled} size="sm" block={false} align="start" listWidth="auto" listMinWidth={260} listMaxWidth={340} triggerClassName="workflow-model-select" OptionView={OptionView} TriggerView={TriggerView} searchPlaceholder={t('搜索模型或连接','Search models or connections')}/>;
}
