import { useState } from 'react';
import type { AgentProfile, AvatarStyle } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { ArrowLeft, ArrowRight, Search, Document, Check, Clock, ChevronRight } from '@openai/apps-sdk-ui/components/Icon';
import { Field } from '../components';
import { AgentAvatar } from '../agents/AgentIdentity';
import { ScaledAgentBadge } from '../agents/ScaledAgentBadge';
import { t } from '../i18n';
import { compactSelectProps } from '../compactSelect';
import { NETWORK_SERVICES, type NetworkService, type Localized } from './networkExamples';
import './agent-market.css';

const c = (value: Localized) => t(value[0], value[1]);
const categoryLabel = (service: NetworkService) => categories().find(item=>item.value===service.category)?.label || t('专业 Agent','Specialist agent');
type MarketView = 'browse' | 'profile' | 'brief' | 'quote' | 'orders' | 'order';
type DemoOrder = { id: number; serviceId: string; brief: string; inputs: string[]; phase: number };
const phases = () => [t('委托已确认', 'Request agreed'), t('Agent 正在处理', 'Agent working'), t('等待验收', 'Ready for review'), t('交易已完成', 'Completed')];
const categories = () => [{value:'all',label:t('全部','All')},{value:'design',label:t('设计','Design')},{value:'research',label:t('研究','Research')},{value:'writing',label:t('内容','Writing')},{value:'engineering',label:t('开发','Engineering')},{value:'life',label:t('生活','Life')}];
function agentFor(service: NetworkService, avatarStyle:AvatarStyle='pixelArt'): AgentProfile {
  return {id:`market-${service.id}`,name:c(service.agentName),role:c(service.agentRole),instructions:c(service.approach),avatarStyle,createdAt:''};
}
function MarketListingItem({service,onOpen,avatarStyle}: {service: NetworkService; onOpen:()=>void;avatarStyle:AvatarStyle}) {
  const [face,setFace] = useState<'identity'|'role'|'history'>('identity');
  return <article className="agent-market-listing" data-category={service.category}>
    <div className="agent-market-listing-pass"><ScaledAgentBadge agent={agentFor(service,avatarStyle)} headerLabel={categoryLabel(service)} face={face} onFaceChange={setFace}/></div>
    <div className="agent-market-listing-copy"><p>{t('提供方：','By ')}{service.providerUsername}</p><h3>{c(service.title)}</h3></div>
    <div className="agent-market-listing-action"><span><strong>{c(service.price)}</strong><small>{t('／次',' / request')}</small></span><Button color="secondary" variant="outline" size="sm" onClick={onOpen}>{t('查看服务','View service')}<ArrowRight/></Button></div>
  </article>;
}
function MarketParty({service,avatarStyle}: {service: NetworkService;avatarStyle:AvatarStyle}) {
  const agent = agentFor(service,avatarStyle);
  return <div className="agent-market-party"><AgentAvatar agent={agent} size={42}/><div><strong>{agent.name}</strong><p>{t('由 ', 'By ')}{c(service.providerName)} ({service.providerUsername})</p></div></div>;
}
function Deliverables({service}: {service: NetworkService}) {
  return <ul className="agent-market-list">{service.deliverables.map(item=><li key={item[1]}><Check/><span>{c(item)}</span></li>)}</ul>;
}
function WorkSample({service}: {service: NetworkService}) {
  return <article className="agent-market-sample"><header><Document/><h3>{t('交付示例', 'Example result')}</h3></header><p>{c(service.sample)}</p><small>{t('虚构案例，用于了解交付形式。', 'A fictional example showing the form of the result.')}</small></article>;
}

/** Local marketplace preview. It never calls providers or creates a payment. */
export function ProfessionalNetwork({avatarStyle='pixelArt'}:{avatarStyle?:AvatarStyle}={}) {
  const [view,setView] = useState<MarketView>('browse');
  const [selectedId,setSelectedId] = useState(NETWORK_SERVICES[0].id);
  const [query,setQuery] = useState(''), [category,setCategory] = useState('all');
  const [brief,setBrief] = useState(''), [materials,setMaterials] = useState<string[]>([]);
  const [orders,setOrders] = useState<DemoOrder[]>([]), [orderId,setOrderId] = useState<number>();
  const [face,setFace] = useState<'identity'|'role'|'history'>('identity');
  const service = NETWORK_SERVICES.find(item=>item.id===selectedId)!;
  const order = orders.find(item=>item.id===orderId);
  const agent = agentFor(service,avatarStyle);
  const visible = NETWORK_SERVICES.filter(item=>(category==='all'||item.category===category) && [c(item.agentName),c(item.agentRole),c(item.providerName),item.providerUsername,c(item.title),c(item.summary)].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const showOrders = view==='orders'||view==='order';
  function openProfile(item: NetworkService) { setSelectedId(item.id); setFace('identity'); setView('profile'); }
  function startBrief() { setBrief(c(service.request)); setMaterials([]); setView('brief'); }
  function createOrder() {
    const next: DemoOrder = {id:Date.now(),serviceId:service.id,brief:brief.trim(),inputs:[...materials],phase:0};
    setOrders(current=>[next,...current]); setOrderId(next.id); setView('order');
  }
  function openOrder(item: DemoOrder) { setSelectedId(item.serviceId); setOrderId(item.id); setView('order'); }
  function advance() { setOrders(current=>current.map(item=>item.id===orderId?{...item,phase:Math.min(item.phase+1,3)}:item)); }
  return <div className="agent-market">
    <div className="agent-market-toolbar">
      <div className="agent-market-views" aria-label={t('市场视图','Marketplace view')}>
        <Button color="secondary" variant={showOrders?'ghost':'soft'} size="sm" aria-pressed={!showOrders} onClick={()=>setView('browse')}>{t('浏览市场','Explore agents')}</Button>
        <Button color="secondary" variant={showOrders?'soft':'ghost'} size="sm" aria-pressed={showOrders} onClick={()=>setView('orders')}>{t('我的委托','My requests')}{orders.length>0&&<span className="agent-market-count">{orders.length}</span>}</Button>
      </div>
      {view==='browse'&&<><div className="agent-market-categories"><Select {...compactSelectProps} size="sm" value={category} options={categories()} onChange={option=>setCategory(option.value)} aria-label={t('专业分类','Service categories')}/></div><Input size="sm" variant="soft" value={query} onChange={event=>setQuery(event.target.value)} startAdornment={<Search/>} aria-label={t('搜索 Agent、服务或提供方','Search agents, services, or providers')} placeholder={t('搜索 Agent 或服务','Search agents or services')}/></>}
    </div>

    {view==='browse'&&<>
      <div className="agent-market-catalogue-heading"><h2>{t('专业 Agent','Specialist agents')}</h2><span>{t(`${visible.length} 个服务`,`${visible.length} services`)}</span><span className="agent-market-dev-note">{t('示例 Agent 与报价，仅供体验。','Example agents and prices for this preview.')}</span></div>
      <div className="agent-market-grid">{visible.map(item=><MarketListingItem key={item.id} service={item} avatarStyle={avatarStyle} onOpen={()=>openProfile(item)}/>)}</div>
      {!visible.length&&<div className="agent-market-empty"><Search/><h3>{t('没有符合条件的 Agent','No matching agents')}</h3><p>{t('换一个服务关键词，或查看全部专业方向。','Try another service keyword, or explore every category.')}</p><Button color="secondary" variant="outline" size="sm" onClick={()=>{setQuery('');setCategory('all');}}>{t('清除筛选','Clear filters')}</Button></div>}
    </>}

    {view==='profile'&&<>
      <div className="agent-market-back"><Button color="secondary" variant="ghost" size="sm" onClick={()=>setView('browse')}><ArrowLeft/>{t('返回市场','Back to marketplace')}</Button></div>
      <div className="agent-market-detail">
        <aside><div className="agent-market-pass" data-category={service.category}><ScaledAgentBadge agent={agent} headerLabel={categoryLabel(service)} face={face} onFaceChange={setFace}/></div><div className="agent-market-publisher"><p>{t('提供方：','Provider: ')}{c(service.providerName)}</p><p>{t('示例 Agent，未连接外部服务。','Example agent. No external service is connected.')}</p></div></aside>
        <div className="agent-market-detail-copy"><header><h2>{c(service.title)}</h2><p>{c(service.summary)}</p></header>
          <section><h3>{t('Agent 如何完成这件事','How the agent handles this')}</h3><p>{c(service.approach)}</p></section>
          <section><h3>{t('你会收到','What you receive')}</h3><Deliverables service={service}/></section>
          <section><WorkSample service={service}/></section>
          <section className="agent-market-offering"><div><strong>{c(service.price)}</strong><span>{t('每次委托预计用时：','Estimated time per request: ')}{c(service.duration)}</span></div><Button color="primary" onClick={startBrief}>{t('发起委托','Start a request')}<ArrowRight/></Button></section>
          <details className="agent-market-boundaries"><summary>{t('资料权限与服务范围','Data access and service scope')}</summary><ul>{service.boundaries.map(item=><li key={item[1]}>{c(item)}</li>)}</ul></details>
        </div>
      </div>
    </>}

    {(view==='brief'||view==='quote')&&<>
      <div className="agent-market-back"><Button color="secondary" variant="ghost" size="sm" onClick={()=>setView(view==='brief'?'profile':'brief')}><ArrowLeft/>{view==='brief'?t('返回服务详情','Back to service'):t('修改需求','Edit request')}</Button></div>
      <div className="agent-market-form-layout"><div className="agent-market-form-main">
        <div className="agent-market-form-heading"><AgentAvatar agent={agent} size={48}/><div><h2>{view==='brief'?t('创建服务委托','Create a service request'):t('确认方案与报价','Review proposal and price')}</h2><p>{t(`${agent.name}，由 ${c(service.providerName)} 提供`, `${agent.name}, by ${c(service.providerName)}`)}</p></div></div>
        {view==='brief'?<>
          <Field label={t('需要完成什么','What should get done')}><Textarea rows={5} value={brief} onChange={event=>setBrief(event.target.value)} maxLength={4000}/></Field>
          <fieldset className="agent-market-materials"><legend>{t('本次开放的材料','Materials shared for this request')}</legend>{service.inputs.map(item=><Checkbox key={item[1]} checked={materials.includes(item[1])} onCheckedChange={checked=>setMaterials(current=>checked?[...new Set([...current,item[1]])]:current.filter(value=>value!==item[1]))} label={c(item)}/>)}</fieldset>
          <span className="agent-market-dev-note">{t('选择的是示例文件，仅用于展示本次委托的开放范围。','These example files illustrate the access scope for this request.')}</span>
          <Button color="primary" disabled={!brief.trim()||!materials.length} onClick={()=>setView('quote')}>{t('查看示例报价','View example proposal')}<ArrowRight/></Button>
        </>:<>
          <h3>{t('你的需求','Your request')}</h3><p className="agent-market-request-text">{brief}</p>
          <h3>{t('约定交付','Agreed deliverables')}</h3><Deliverables service={service}/>
          <dl className="agent-market-facts"><div><dt>{t('交付时间','Delivery')}</dt><dd>{c(service.duration)}</dd></div><div><dt>{t('总费用','Total')}</dt><dd>{c(service.price)}</dd></div><div><dt>{t('修改次数','Revisions')}</dt><dd>{t('范围内一次','One within scope')}</dd></div></dl>
          <span className="agent-market-dev-note">{t('确认后创建本页示例订单，不会付款或联系提供方。','Confirmation creates a demo order. No payment or provider contact occurs.')}</span>
          <Button color="primary" onClick={createOrder}>{t('确认示例委托','Confirm example request')}<ArrowRight/></Button>
        </>}
      </div><aside className="agent-market-form-aside"><h3>{t('服务提供方','Service provider')}</h3><MarketParty service={service} avatarStyle={avatarStyle}/><p>{c(service.title)}</p><details className="agent-market-boundaries" open><summary>{t('本次开放的材料','Shared materials')}</summary><ul>{materials.length?materials.map(id=><li key={id}>{c(service.inputs.find(item=>item[1]===id)!)}</li>):<li>{t('尚未选择','Nothing selected yet')}</li>}</ul></details></aside></div>
    </>}

    {view==='orders'&&<section className="agent-market-order-list">
      <header><h2>{t('我的委托','My requests')}</h2><p>{t('在这里查看本页创建的示例订单与交付。','Review the example orders and results created in this preview.')}</p></header>
      {orders.map(item=>{const provider=NETWORK_SERVICES.find(value=>value.id===item.serviceId)!;return <button type="button" className="agent-market-order-row" key={item.id} onClick={()=>openOrder(item)}><AgentAvatar agent={agentFor(provider,avatarStyle)} size={44}/><div><h3>{c(provider.title)}</h3><p>{c(provider.agentName)}{t('，提供方：',', by ')}{c(provider.providerName)}</p></div><span>{phases()[item.phase]}</span><ChevronRight/></button>;})}
      {!orders.length&&<div className="agent-market-empty"><Document/><h3>{t('还没有委托','No requests yet')}</h3><p>{t('找到适合的 Agent，确认服务范围后发起第一份委托。','Find an agent and review its service scope before starting a request.')}</p><Button color="secondary" variant="outline" size="sm" onClick={()=>setView('browse')}>{t('浏览市场','Explore agents')}</Button></div>}
    </section>}

    {view==='order'&&order&&<>
      <div className="agent-market-back"><Button color="secondary" variant="ghost" size="sm" onClick={()=>setView('orders')}><ArrowLeft/>{t('返回我的委托','Back to my requests')}</Button></div>
      <header className="agent-market-order-title"><div><h2>{c(service.title)}</h2><p>{t('示例订单，离开页面后清除。','Demo order, cleared when you leave this page.')}</p></div><span className="agent-market-order-status">{order.phase===3?<Check/>:<Clock/>}{phases()[order.phase]}</span></header>
      <div className="agent-market-form-layout"><div className="agent-market-order-main"><MarketParty service={service} avatarStyle={avatarStyle}/><p className="agent-market-request-text">{order.brief}</p>
        <ol className="agent-market-progress">{phases().map((label,index)=><li key={label} data-reached={index<=order.phase}><span>{index<order.phase?<Check/>:index+1}</span><div><h3>{label}</h3><p>{index===0?t('需求、资料范围和费用已确认。','Scope, shared materials, and price agreed.'):index===1?t('按约定范围处理选定材料。','Work uses the materials shared for this request.'):index===2?t('查看结果，再决定是否验收。','Review the result before accepting it.'):t('验收后完成本次示例交易。','Acceptance completes this example transaction.')}</p></div></li>)}</ol>
        {order.phase>=2&&<WorkSample service={service}/>}
      </div><aside className="agent-market-form-aside agent-market-order-summary"><h3>{t('交易摘要','Order summary')}</h3><dl className="agent-market-facts"><div><dt>{t('约定费用','Agreed price')}</dt><dd>{c(service.price)}</dd></div><div><dt>{t('实际支付','Paid')}</dt><dd>{t('未支付','No payment')}</dd></div><div><dt>{t('交付周期','Delivery')}</dt><dd>{c(service.duration)}</dd></div></dl><p>{t('按下面的步骤体验状态变化，未调用外部 Agent。','Step through the demo below. No external agent is called.')}</p>
        {order.phase<3?<Button color={order.phase===2?'primary':'secondary'} variant={order.phase===2?'solid':'outline'} onClick={advance}>{order.phase===0?t('演示开始处理','Simulate starting work'):order.phase===1?t('查看交付示例','View example result'):t('验收示例成果','Accept example result')}</Button>:<Button color="secondary" variant="outline" onClick={()=>setView('orders')}>{t('返回我的委托','Back to my requests')}</Button>}
        <details className="agent-market-boundaries"><summary>{t('本次开放的材料','Shared materials')}</summary><ul>{order.inputs.map(id=><li key={id}>{c(service.inputs.find(item=>item[1]===id)!)}</li>)}</ul></details>
      </aside></div>
    </>}
  </div>;
}
