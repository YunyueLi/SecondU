import {t,getLocale} from '../i18n';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { AssetAllocation } from './AssetAllocation';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { ArrowRight, Chart, Check, ChevronDown, ChevronRight, Expand, Search } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog } from '../components';
import { AccountSourceDetails } from './AccountSourceDetails';
import { AllocationDonut, type AllocationGroup } from './AllocationDonut';
import { AssetFlow } from './AssetFlow';
import { BrandIcon } from './BrandIcon';
import { accountAmount, accountBrand, accountDescription, accountStatus, decimal, displayAccounts, money, minor, positionsFor, providerNames, summaryFor } from './model';
import type { FinanceAccount, FinanceState } from './types';
import './Panorama.css';
import './PanoramaDetails.css';

type Group = Omit<AllocationGroup, 'accounts'> & { accounts: FinanceAccount[] };
type View = 'structure' | 'allocation' | 'details' | 'all';
const groupKey = (group: AllocationGroup) => `${group.id}:${group.accounts?.[0]?.currency || ''}`;
const colors = ['blue-500', 'orange-500', 'purple-500', 'green-600', 'red-600', 'pink-600'];
const timestamp = (raw?: string) => {
  if (!raw) return t("日期待补充","Date unavailable");
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : parsed.toLocaleString(getLocale(), { timeZone: 'Asia/Shanghai', hour12: false }) : t("日期待补充","Date unavailable");
};
const positionAmount = (item: ReturnType<typeof positionsFor>[number]) => item.valuation?.valuationBasis === 'official_api' || item.valuation?.marketValue != null ? item.valuation.marketValue : item.valuation?.baselineMarketValue ?? item.market_value;
const positionCurrency = (item: ReturnType<typeof positionsFor>[number]) => item.valuation?.valuationCurrency || item.valuation?.recordedCurrency || item.currency;
function holdingGroups(items: ReturnType<typeof positionsFor>) {
  const groups = new Map<string, { label: string; currency: string; items: typeof items; amount: bigint; complete: boolean }>();
  for (const item of items) {
    const kind = item.kind || item.valuation?.kind, code = positionCurrency(item) || '';
    const label = ['stock', 'etf'].includes(kind) ? t("证券持仓","Securities") : kind === 'fund' ? t("基金","Funds") : kind === 'gold' ? t("黄金","Gold") : t("其他持仓","Other holdings");
    const key = `${label}:${code}`, value = positionAmount(item);
    const group = groups.get(key) || { label, currency: code, items: [] as typeof items, amount: 0n, complete: true };
    group.items.push(item); group.amount += minor(value); group.complete &&= value != null; groups.set(key, group);
  }
  return [...groups.values()];
}
const groupColor = (id: string) => `var(--${colors[Array.from(id).reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length]})`;

function Money({ value, currency, hidden }: { value: unknown; currency?: string; hidden: boolean }) {
  return <span className="panorama-money"><strong>{money(value, hidden)}</strong>{currency && <small>{currency}</small>}</span>;
}

function makeGroups(state: FinanceState, accounts: FinanceAccount[], currency?: string, hidden = false): Group[] {
  const groups = new Map<string, Group>();
  for (const account of accounts) {
    const brand = accountBrand(account), key = `${brand}:${account.currency}`;
    const existing = groups.get(key);
    const name = typeof account.institution === 'object' && account.institution?.name || providerNames[brand] || account.name;
    const amount = minor(currency ? accountAmount(state, account, currency) : account.amount);
    if (existing) { existing.accounts.push(account); existing.amount += amount; }
    else groups.set(key, { id: brand, name, color: groupColor(brand), amount, accounts: [account] });
  }
  return [...groups.values()].sort((a, b) => hidden ? a.name.localeCompare(b.name, 'zh-CN') || groupKey(a).localeCompare(groupKey(b)) : a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : groupKey(a).localeCompare(groupKey(b)));
}

function InstitutionSummary({ group, currency, hidden, onSelect }: { group: Group; currency: string; hidden: boolean; onSelect: (group: Group, accountId?: string) => void }) {
  return <div className="panorama-institution">
    <button type="button" className="panorama-institution-heading" onClick={() => onSelect(group)} aria-label={t(`查看${group.name} ${group.accounts[0]?.currency}资产明细`, `View ${group.name} ${group.accounts[0]?.currency} asset details`)}>
      <BrandIcon id={group.id} size={32} />
      <span className="panorama-institution-name"><strong>{group.name}</strong><small><span>{group.accounts.length === 1 ? group.accounts[0].name : t(`${group.accounts.length} 个账户`, `${group.accounts.length} accounts`)}</span>{group.accounts[0]?.currency !== currency && <span>{group.accounts[0]?.currency}</span>}</small></span>
      <Money value={decimal(group.amount)} currency={currency} hidden={hidden} /><ChevronRight aria-hidden="true" />
    </button>
    {group.accounts.length > 1 && <div className="panorama-products">{group.accounts.map(account => <button type="button" key={account.id} onClick={() => onSelect(group, account.id)}><span>{account.name}</span><Money value={account.amount} currency={account.currency} hidden={hidden} /><ChevronRight aria-hidden="true" /></button>)}</div>}
  </div>;
}

function InstitutionPicker({ groups, active, onSelect }: { groups: Group[]; active?: Group; onSelect: (group: Group) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const choicesRef = useRef<HTMLDivElement>(null);
  const term = query.trim().normalize('NFKC').toLocaleLowerCase();
  const visible = groups.filter(group => [group.name, group.accounts[0]?.currency, ...group.accounts.map(account => account.name)].join(' ').normalize('NFKC').toLocaleLowerCase().includes(term));
  function changeOpen(next: boolean) { setOpen(next); if (!next) setQuery(''); }
  function moveFocus(event: KeyboardEvent, fromSearch = false) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const buttons = [...(choicesRef.current?.querySelectorAll<HTMLButtonElement>('button') || [])];
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.findIndex(button => button === document.activeElement);
    const next = fromSearch || index < 0 ? event.key === 'ArrowDown' ? 0 : buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
  return <Popover open={open} onOpenChange={changeOpen}>
    <Popover.Trigger><Button color="secondary" variant="outline" size="lg" pill={false} className="panorama-institution-picker" aria-label={active ? t(`选择机构，当前${active.name} ${active.accounts[0]?.currency}`, `Choose an institution, current: ${active.name} ${active.accounts[0]?.currency}`) : t("选择机构","Choose an institution")} disabled={!groups.length}>
      {active && <BrandIcon id={active.id} size={22}/>}<span className="panorama-picker-current">{active?.name || t("选择机构","Choose an institution")}</span>{active && <small>{active.accounts[0]?.currency}</small>}<ChevronDown aria-hidden="true"/>
    </Button></Popover.Trigger>
    <Popover.Content width={320} minWidth="auto" align="start" alignOffset={0} className="panorama-institution-menu">
      <div className="panorama-institution-search"><Input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => moveFocus(event, true)} placeholder={t("搜索机构、账户或币种","Search institutions, accounts or currencies")} aria-label={t("搜索机构、账户或币种","Search institutions, accounts or currencies")} startAdornment={<Search aria-hidden="true"/>} size="md" autoFocus/></div>
      <div ref={choicesRef} className="panorama-institution-options" role="group" aria-label={t("机构列表","Institutions")} onKeyDown={event => moveFocus(event)}>
        {visible.map(group => <Button key={groupKey(group)} color="secondary" variant={active && groupKey(active) === groupKey(group) ? 'soft' : 'ghost'} pill={false} size="lg" className="panorama-institution-option" aria-pressed={Boolean(active && groupKey(active) === groupKey(group))} onClick={() => { onSelect(group); changeOpen(false); }}>
          <BrandIcon id={group.id} size={22}/><span className="panorama-picker-option-name">{group.name}</span><small>{group.accounts[0]?.currency}</small>{active && groupKey(active) === groupKey(group) ? <Check aria-hidden="true"/> : <span className="panorama-picker-check-space" aria-hidden="true"/>}
        </Button>)}
        {!visible.length && <p className="panorama-institution-empty" role="status">{t("没有找到匹配的机构或账户","No matching institution or account")}</p>}
      </div>
    </Popover.Content>
  </Popover>;
}

function HoldingRow({ item, hidden, expanded, onExpand }: { item: ReturnType<typeof positionsFor>[number]; hidden: boolean; expanded: boolean; onExpand: () => void }) {
  const valuation = item.valuation;
  const official = valuation?.valuationBasis === 'official_api';
  const projected = valuation?.marketValue != null;
  const currency = valuation?.valuationCurrency || valuation?.recordedCurrency || item.currency;
  const value = positionAmount(item);
  const quoteAvailable = valuation?.quote?.status !== 'unmapped' && valuation?.quote?.currency && Number(valuation?.quote?.price) > 0;
  const price = official ? valuation.price : quoteAvailable ? valuation.quote.price : valuation?.baselinePrice ?? item.last_price;
  const quantity = valuation?.quantity ?? item.quantity;
  const pnl = official || projected ? valuation.holdingPnl : valuation?.recordedHoldingPnl ?? item.holding_pnl;
  const status = official ? valuation.readStatus === 'stale' ? t("上次官方读取","Previous provider record") : t("官方读取","Provider record") : valuation?.positionCurrent === false && !valuation?.latestPositionUpdateId ? t("数量待更新","Quantity needs updating") : valuation?.quote?.status === 'stale' ? t("旧报价估值","Previous quote estimate") : projected ? t("行情估值","Quote estimate") : t("记录值","Recorded value");
  const pnlPct = valuation?.holdingPnlPct ?? item.holding_pnl_pct ?? item.holdingPnlPct;
  const observedAt = official ? valuation?.fetchedAt : valuation?.quote?.asOf || valuation?.quoteAsOf || valuation?.baselineAsOf || item.asOf;
  const quoteChange = !official && quoteAvailable ? valuation?.quote : null;
  return <details className="panorama-holding" open={expanded}>
    <summary onClick={event => { event.preventDefault(); onExpand(); }}><BrandIcon id={item.symbol} size={24} /><span className="panorama-holding-name"><strong>{item.name_display || item.symbol}</strong><small><span>{item.symbol}</span><span>{status}</span></small></span><Money value={value} currency={currency} hidden={hidden} /><ChevronRight aria-hidden="true" /></summary>
    <dl className="panorama-holding-facts">
      <div><dt>{t("持有数量","Quantity held")}</dt><dd>{hidden ? '••••' : quantity ?? '—'}</dd></div>
      <div><dt>{official ? t("读取价格","Provider price") : quoteAvailable ? t("报价","Quote") : t("记录价格","Recorded price")}</dt><dd><Money value={price} currency={official || !quoteAvailable ? currency : valuation.quote.currency} hidden={hidden} /></dd></div>
      <div><dt>{t("成本价","Cost price")}</dt><dd><Money value={valuation?.costPrice ?? item.cost_price} currency={currency} hidden={hidden} /></dd></div>
      <div><dt>{t("持仓盈亏","Holding gain/loss")}</dt><dd><Money value={pnl} currency={currency} hidden={hidden} /></dd></div>
      {pnlPct != null && <div><dt>{t("持仓收益率","Holding return")}</dt><dd>{money(pnlPct, hidden)}{!hidden && '%'}</dd></div>}
      {quoteChange?.change != null && <div><dt>{t("当日涨跌额","Daily change")}</dt><dd><Money value={quoteChange.change} currency={quoteChange.currency} hidden={hidden} /></dd></div>}
      {quoteChange?.changePct != null && <div><dt>{t("当日涨跌幅","Daily change (%)")}</dt><dd>{money(quoteChange.changePct, hidden)}{!hidden && '%'}</dd></div>}
      {observedAt && <div><dt>{official ? t("读取时间","Retrieved at") : quoteAvailable ? t("报价时间","Quote time") : t("记录时间","Recorded at")}</dt><dd><time dateTime={observedAt}>{timestamp(observedAt)}</time></dd></div>}
    </dl>
  </details>;
}

export function Panorama({ state, currency, nativeCurrency, hidden, onAccount, onHolding }: {
  state: FinanceState; currency: string; nativeCurrency?: string; hidden: boolean;
  onAccount: (id: string) => void; onHolding: (id: string) => void;
}) {
  const [mode, setMode] = useState<View>('structure');
  const [allocationBy,setAllocationBy]=useState('type');
  const [selected, setSelected] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [expandedHolding, setExpandedHolding] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== 'details' || !selectedAccount) return;
    const candidates = [...document.querySelectorAll<HTMLElement>('[data-panorama-account]')].filter(element => element.dataset.panoramaAccount === selectedAccount);
    const target = candidates.find(element => Boolean(element.closest('[role="dialog"]')) === full);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }, [selectedAccount, mode, full]);
  useEffect(() => {
    if (!full) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [full]);
  const allAccounts = useMemo(() => displayAccounts(state), [state]);
  const accounts = allAccounts.filter(account => !nativeCurrency || account.currency === nativeCurrency);
  const positions = useMemo(() => positionsFor(state), [state]);
  const summary = summaryFor(state, currency, nativeCurrency);
  const rows = makeGroups(state, accounts, currency, hidden);
  const allGroups = makeGroups(state, allAccounts, undefined, hidden);
  const active = allGroups.find(group => groupKey(group) === selected) || allGroups.find(group => rows.some(row => groupKey(row) === groupKey(group)));
  const select = (group: Group, accountId?: string) => { setSelected(groupKey(group)); setSelectedAccount(accountId || null); setExpandedHolding(null); setMode('details'); };
  const openAccount = (id: string) => { setFull(false); onAccount(id); };
  const openHolding = (id: string) => { setFull(false); onHolding(id); };
  const nativeCurrencies = [...new Set(allAccounts.map(account => account.currency))].sort();
  const renderInstitution = (group: AllocationGroup) => <InstitutionSummary group={group as Group} currency={currency} hidden={hidden} onSelect={select} />;

  const controls = <div className="panorama-controls"><SegmentedControl data-finance-panorama-views="" value={mode} onChange={setMode} size="md" pill={false} aria-label={t("资产全景视图","Asset overview views")}><SegmentedControl.Option data-finance-panorama-view="structure" value="structure">{t("结构","Structure")}</SegmentedControl.Option><SegmentedControl.Option data-finance-panorama-view="allocation" value="allocation">{t("占比","Allocation")}</SegmentedControl.Option><SegmentedControl.Option data-finance-panorama-view="details" value="details">{t("明细","Details")}</SegmentedControl.Option><SegmentedControl.Option data-finance-panorama-view="all" value="all">{t("全部","All")}</SegmentedControl.Option></SegmentedControl>{mode==='allocation'&&<Select value={allocationBy} options={[{value:'type',label:t("按资产类型","By asset type")},{value:'account',label:t("按账户","By account")},{value:'institution',label:t("按机构","By institution")},{value:'currency',label:t("按币种","By currency")}]} onChange={option=>setAllocationBy(option.value)} size="sm" pill={false} block={false} aria-label={t("资产占比分组","Group asset allocation")}/>}</div>;
  const content = <>{mode === 'all' ? <div className="panorama-all"><p className="panorama-note">{t(`${nativeCurrencies.length} 种币种，${new Set(allGroups.map(group => group.id)).size} 家机构，${allAccounts.length} 个账户`, `${nativeCurrencies.length} currencies, ${new Set(allGroups.map(group => group.id)).size} institutions, ${allAccounts.length} accounts`)}</p>{nativeCurrencies.map(code => <section key={code} className="panorama-currency-section"><header><h3>{code}</h3><Money value={decimal(allGroups.filter(group => group.accounts[0]?.currency === code).reduce((sum, group) => sum + group.amount, 0n))} currency={code} hidden={hidden} /></header><div>{allGroups.filter(group => group.accounts[0]?.currency === code).map(group => <InstitutionSummary key={groupKey(group)} group={group} currency={code} hidden={hidden} onSelect={select} />)}</div></section>)}</div>
      : mode === 'details' ? <div className="panorama-drilldown panorama-details-view">
        <header className="panorama-details-overview">
          <InstitutionPicker groups={allGroups} active={active} onSelect={group => select(group)}/>
          {active && <div className="panorama-details-total"><span>{t(`${active.accounts.length} 个账户的原币资产`, `Assets in original currencies across ${active.accounts.length} account${active.accounts.length===1?'':'s'}`)}</span><Money value={decimal(active.amount)} currency={active.accounts[0]?.currency} hidden={hidden}/></div>}
        </header>
        {active ? <div className="panorama-inline-details" aria-label={t(`${active.name}账户明细`, `${active.name} account details`)}>
          {active.accounts.map(account => {
            const holdings = positions.filter(item => item.accountId === account.id);
            return <section className="panorama-account panorama-detail-account" key={account.id} data-panorama-account={account.id} aria-label={account.name} tabIndex={-1}>
              <Button color="secondary" variant="ghost" pill={false} size="lg" className="panorama-detail-account-row" onClick={() => openAccount(account.id)}>
                <span className="panorama-detail-account-copy"><strong>{account.name}</strong><span className="panorama-detail-account-meta"><span>{accountDescription(account)}</span>{(account.readStatus === 'stale' || account.projection?.status === 'stale' || account.projection?.reconciliationRequired) && <span>{accountStatus(account)}</span>}<time dateTime={account.providerAsOf || account.asOf}>{timestamp(account.providerAsOf || account.asOf)}</time></span></span>
                <Money value={account.amount} currency={account.currency} hidden={hidden}/><span className="panorama-detail-account-link"><span>{t("账户详情","Account details")}</span><ChevronRight aria-hidden="true"/></span>
              </Button>
              {holdings.length > 0 && <div className="panorama-account-actions"><Button color="secondary" variant="ghost" pill={false} size="sm" onClick={() => openHolding(account.id)}>{t("查看持仓","View holdings")}<ArrowRight /></Button></div>}
              {account.detailCurrent === false && <p className="panorama-detail-account-note">{t("部分持仓明细待更新。","Some holding details need updating.")}</p>}
              {holdingGroups(holdings).map(group => <section className="panorama-holdings" key={`${group.label}:${group.currency}`}><header><h5>{group.label}</h5>{group.complete && <Money value={decimal(group.amount)} currency={group.currency} hidden={hidden} />}</header>{group.items.map(item => <HoldingRow key={item.id} item={item} hidden={hidden} expanded={expandedHolding === item.id} onExpand={() => setExpandedHolding(expandedHolding === item.id ? null : item.id)} />)}</section>)}
              <AccountSourceDetails state={state} account={account} hidden={hidden} />
            </section>;
          })}
        </div> : <p className="panorama-note">{t("暂无账户明细。","No account details yet.")}</p>}
      </div> : rows.length === 0 ? <p className="panorama-note">{t("暂无该币种资产。","No assets in this currency.")}</p> : summary.assets === null && !(mode==='allocation'&&allocationBy==='type') ? <div className="panorama-incomplete"><p>{t("部分账户缺少折算汇率，可按原币查看。","Some accounts have no exchange rate. View their original currencies.")}</p><Button color="secondary" variant="ghost" pill={false} size="sm" onClick={() => setMode('all')}>{t("查看全部账户","View all accounts")}<ArrowRight /></Button></div>
      : mode === 'allocation' ? allocationBy==='type'?<AssetAllocation embedded state={state} currency={currency} nativeCurrency={nativeCurrency} hidden={hidden} onAccount={openAccount} onHolding={openHolding}/>:<AllocationDonut embedded groups={allocationBy==='account'?accounts.map(account=>({id:account.id,name:account.name,color:'',amount:minor(accountAmount(state,account,currency)),accounts:[]})):allocationBy==='currency'?nativeCurrencies.filter(code=>accounts.some(account=>account.currency===code)).map(code=>({id:code,name:code,color:'',amount:accounts.filter(account=>account.currency===code).reduce((n,account)=>n+minor(accountAmount(state,account,currency)),0n),accounts:[]})):rows} label={allocationBy==='account'?t("按账户","By account"):allocationBy==='currency'?t("按币种","By currency"):t("按机构","By institution")} currency={currency} hidden={hidden} onSelect={(id, code) => {if(allocationBy==='account'){openAccount(id);return;}if(allocationBy==='currency'){setMode('all');return;}setSelected(`${id}:${code || ''}`);setMode('details');}} />
      : <><AssetFlow groups={rows} currency={currency} assets={minor(summary.assets)} debt={summary.liabilities === null ? null : minor(summary.liabilities)} hidden={hidden} renderInstitution={renderInstitution} renderAmount={(value, code) => <Money value={value} currency={code} hidden={hidden} />} />{summary.liabilities === null && <p className="panorama-note">{t("负债折算汇率待补充，净资产暂不展示。","Liability exchange rates are missing, so net assets are unavailable.")}</p>}{!hidden && rows.some(group => group.amount < 0n) && <p className="panorama-note">{t("流向宽度仅包含正值资产；总资产保留负值账户。","Flow widths use positive assets. Total assets include negative accounts.")}</p>}</>}
  </>;
  return <section className="finance-panorama" aria-label={t("资产全景","Asset overview")}>
    <div className="finance-section-heading"><h2><Chart aria-hidden="true" />{t("资产全景","Asset overview")}</h2><div className="panorama-header-actions"><span className="panorama-summary muted"><span>{t(`${accounts.length} 个账户`, `${accounts.length} accounts`)}</span><span>{currency}</span></span><Button color="secondary" variant="ghost" pill={false} size="sm" onClick={() => setFull(true)}><Expand aria-hidden="true" />{t("全屏查看","Full screen")}</Button></div></div>
    {controls}{content}
    {full && <Dialog title={t("资产全景","Asset overview")} className="finance-panorama-fullscreen" onClose={() => setFull(false)}><div className="finance-workspace panorama-fullscreen-workspace"><section className="finance-panorama"><div className="panorama-fullscreen-controls">{controls}<span>{mode === 'all' ? t("全部币种","All currencies") : mode === 'details' ? t("原币","Original currency") : currency}</span></div><div key={mode} className="panorama-fullscreen-content">{content}</div></section></div></Dialog>}
  </section>;
}
