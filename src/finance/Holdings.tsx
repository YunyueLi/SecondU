import { getLocale, t, useLocale } from '../i18n';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Chart, ChevronDown, ChevronUp, Document, Search, ArrowDown, ArrowUp } from '@openai/apps-sdk-ui/components/Icon';
import { BrandIcon } from './BrandIcon';
import { accountStatus, money, positionsFor } from './model';
import { accountSummaryFor, positionQuantityUnit } from './account-summary';
import type { FinanceState } from './types';
import './Holdings.css';
import './finance-data-view.css';
type Value = string | number | null | undefined;
function quantityUnit(item: any) {
  const unit = positionQuantityUnit(item);
  return ({ '克': t('克', 'g'), '股': t('股', 'shares'), '份': t('份', 'units'), '盎司': t('盎司', 'oz') } as Record<string, string>)[unit] || unit;
}
function summaryLabel(label: string) {
  return ({ '净资产': t('净资产', 'Net assets'), '账户总额': t('账户总额', 'Account total'), '证券市值': t('证券市值', 'Securities value'), '证券资产': t('证券资产', 'Securities assets'), '基金资产': t('基金资产', 'Fund assets'), '现金': t('现金', 'Cash'), '购买力': t('购买力', 'Buying power') } as Record<string, string>)[label] || label;
}
function StockIdentity({ item, quantity, hidden }: { item: any; quantity: Value; hidden: boolean }) {
  return <span className="holdings-stock-identity">
    <BrandIcon id={item.symbol} size={28} />
    <span className="holdings-stock-name"><strong className="finance-data-name">{item.symbol}</strong><span className="holdings-stock-ticker finance-data-meta" title={item.name_display || item.symbol}>{quantityText(quantity, hidden, quantityUnit(item) ? ` ${quantityUnit(item)}` : '')}</span></span>
  </span>;
}


function currentQuote(item: any, market: any) {
  const symbol = item.exchange === 'SEHK' ? `${item.symbol}.HK` : item.symbol;
  return market?.quotes?.find((quote: any) => quote.positionIds?.includes(item.id)) || market?.quotes?.find((quote: any) => quote.symbol === symbol && ['stock', 'etf'].includes(quote.kind));
}

function quoteTime(raw?: string) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString(getLocale(), { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

type PositionSort = 'symbol' | 'price' | 'changePct' | 'allocation' | 'quantity' | 'marketValue' | 'costPrice' | 'holdingPnl';
const positionSortOptions = (): { value: PositionSort; label: string }[] => [
  { value: 'marketValue', label: t("持仓市值", "Holding value") }, { value: 'holdingPnl', label: t("持仓盈亏", "Unrealized P&L") },
  { value: 'changePct', label: t("当日涨跌", "Daily change") }, { value: 'allocation', label: t("占本账户", "Account weight") }, { value: 'price', label: t("现价", "Price") },
  { value: 'quantity', label: t("数量", "Quantity") }, { value: 'costPrice', label: t("成本价", "Cost basis") }, { value: 'symbol', label: t("代码", "Symbol") },
];
const hasNumber = (value: Value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const pricePrecision = (value: Value) => Math.min(3, Math.max(2, String(value ?? '').split('.')[1]?.length || 0));
type ExactDecimal = { n: bigint; d: bigint };
function exactDecimal(value: Value): ExactDecimal | null {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const fraction = match[3] || '';
  return { n: BigInt(match[2] + fraction) * (match[1] === '-' ? -1n : 1n), d: 10n ** BigInt(fraction.length) };
}
function exactFixed(value: ExactDecimal, places: number) {
  const scale = 10n ** BigInt(places), magnitude = value.n < 0n ? -value.n : value.n;
  const rounded = (magnitude * scale * 2n + value.d) / (value.d * 2n);
  return `${value.n < 0n && rounded ? '-' : ''}${rounded / scale}${places ? `.${String(rounded % scale).padStart(places, '0')}` : ''}`;
}
function summaryAmount(value: Value) {
  const exact = exactDecimal(value);
  return exact ? exactFixed(exact, 2) : value;
}
function ratioPercent(numerator: Value, denominator: Value) {
  const top = exactDecimal(numerator), bottom = exactDecimal(denominator);
  return top && bottom && bottom.n > 0n ? exactFixed({ n: top.n * bottom.d * 100n, d: top.d * bottom.n }, 4) : null;
}
function percentageText(value: Value, hidden: boolean, signed = false) {
  if (hidden) return '••••';
  const exact = exactDecimal(value);
  if (!exact) return '—';
  const rounded = exactFixed(exact, 2);
  return `${signed && exact.n > 0n && rounded !== '0.00' ? '+' : ''}${rounded}%`;
}
function recordedCostValue(quantity: Value, costPrice: Value) {
  const quantityValue = exactDecimal(quantity), priceValue = exactDecimal(costPrice);
  return quantityValue && priceValue && quantityValue.n > 0n && priceValue.n > 0n ? exactFixed({ n: quantityValue.n * priceValue.n, d: quantityValue.d * priceValue.d }, 2) : null;
}
function holdingReturnPct(valuation: any, quantity: Value, costPrice: Value, holdingPnl: Value, estimated: boolean) {
  const costValue = valuation ? valuation.costValue : recordedCostValue(quantity, costPrice);
  if (!hasNumber(quantity) || Number(quantity) <= 0 || !hasNumber(costPrice) || Number(costPrice) <= 0 || !hasNumber(costValue) || Number(costValue) <= 0) return null;
  if (estimated) return hasNumber(valuation?.holdingPnlPct) ? valuation.holdingPnlPct : null;
  return ratioPercent(holdingPnl, costValue);
}
function accountAllocation(valuation: any, portfolio: any) {
  if (!valuation?.linkedToAccount || !hasNumber(valuation.marketValueInAccountCurrency)) return null;
  const account = portfolio?.accounts?.find((row: any) => row.accountId === valuation.accountId);
  if (!account || account.status === 'reconciliation_required' || account.reconciliationRequired || account.currency !== valuation.accountCurrency) return null;
  const value = ratioPercent(valuation.marketValueInAccountCurrency, account.estimatedAmount);
  return value === null ? null : { value, amount: account.estimatedAmount, currency: account.currency, partial: account.status === 'partial', stale: account.status === 'stale' };
}
function quantityText(value: Value, hidden: boolean, suffix = '') {
  if (hidden) return '••••';
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value), match = raw.match(/^([+-]?)(\d+)(\.\d+)?$/);
  return match ? `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${match[3] || ''}${suffix}` : '—';
}
const directionClass = (value: Value, hidden: boolean) => !hidden && hasNumber(value) ? Number(value) > 0 ? 'is-up' : Number(value) < 0 ? 'is-down' : '' : '';
function positionNumber(value: Value, hidden: boolean, decimals = 2, signed = false) {
  if (hidden) return '••••';
  if (!hasNumber(value)) return '—';
  const numeric = Number(value);
  return `${signed && numeric > 0 ? '+' : ''}${numeric.toLocaleString(getLocale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function positionRow(item: any, accountId: string, market: any, portfolio: any, detailDate: string) {
  const valuation = item.valuation || portfolio?.holdings?.find((row: any) => row.accountId === accountId && row.symbol === item.symbol);
  const official = valuation?.valuationBasis === 'official_api';
  const accountPending = !official && portfolio?.accounts?.some((account: any) => account.accountId === accountId && account.status === 'reconciliation_required');
  const quote = valuation?.quote || currentQuote(item, market);
  const quotePrice = official ? valuation.price : quote?.price;
  const quoteCurrency = official ? valuation.valuationCurrency || valuation.recordedCurrency || item.currency : quote?.currency;
  const priceAvailable = quote?.status !== 'unmapped' && quoteCurrency && hasNumber(quotePrice) && Number(quotePrice) > 0;
  const estimated = !official && hasNumber(valuation?.marketValue);
  const currency = valuation ? valuation.valuationCurrency || valuation.recordedCurrency || null : item.quote_currency || item.currency || null;
  const baselinePrice = valuation ? valuation.baselinePrice : item.last_price;
  const baselineMarketValue = valuation ? valuation.baselineMarketValue : item.market_value;
  const marketValue = official || estimated ? valuation.marketValue : baselineMarketValue;
  const holdingPnl = valuation ? official || estimated ? valuation.holdingPnl : valuation.recordedHoldingPnl : item.holding_pnl;
  const quantity = valuation ? valuation.quantity : item.quantity, costPrice = valuation ? valuation.costPrice : item.cost_price;
  const holdingPnlPct = official ? valuation.holdingPnlPct : holdingReturnPct(valuation, quantity, costPrice, holdingPnl, estimated);
  const allocation = accountAllocation(valuation, portfolio);
  const rate = currency === 'CNY' ? 1 : Number(portfolio?.rates?.find((row: any) => row.currency === currency)?.rate);
  const comparable = (value: Value) => hasNumber(value) && Number.isFinite(rate) && rate > 0 ? Number(value) * rate : null;
  return { item, valuation, quote, symbol: item.symbol, accountId, accountPending, currency, official, estimated, marketValue, holdingPnl, holdingPnlPct, allocation,
    price: priceAvailable ? quotePrice : null, quoteCurrency: priceAvailable ? quoteCurrency : null,
    changePct: official ? null : priceAvailable ? quote.changePct : null, change: official ? null : priceAvailable ? quote.change : null,
    quantity, costPrice, baselinePrice, baselineMarketValue, quantityDate: official ? valuation.fetchedAt : valuation ? valuation.baselineAsOf : detailDate,
    sortValue: comparable(marketValue), sortPnl: comparable(holdingPnl),
    status: official ? valuation.readStatus === 'stale' ? t("上次官方读取", "Last provider read") : '' : valuation?.currencyBasis === 'unconfirmed' ? t("身份待确认", "Identity unconfirmed") : quote?.status === 'unmapped' ? item.kind === 'gold' && quote.sourceName ? t("报价未接入", "Quote unavailable") : t("身份待确认", "Identity unconfirmed") : valuation?.positionCurrent === false && !valuation?.latestPositionUpdateId ? t("数量待更新", "Quantity needs updating") : accountPending ? t("账户待核对", "Account needs review") : valuation?.positionCurrent === false ? t("账户基准待核对", "Account baseline needs review") : estimated && quote?.status === 'stale' ? t("旧报价估值", "Valued at previous quote") : !estimated ? t("记录值", "Recorded value") : '',
  };
}
function PositionMoney({ value, currency, hidden, signed = false, decimals = 2 }: { value: Value; currency?: string | null; hidden: boolean; signed?: boolean; decimals?: number }) {
  return <span className="holdings-position-money finance-data-amount"><span>{positionNumber(value, hidden, decimals, signed)}</span>{currency && <small className="finance-data-meta">{currency}</small>}</span>;
}
function PositionDetails({ row, hidden, id, onEdit }: { row: any; kind: string; hidden: boolean; id: string; onEdit?: (positionId: string) => void }) {
  const { item, valuation } = row;
  const updatedAt = row.official ? valuation?.fetchedAt : row.quote?.asOf || row.quantityDate;
  return <div id={id} className="holdings-position-detail finance-data-expansion">
    <div className="holdings-position-detail-heading"><strong className="finance-data-name">{item.name_display || item.symbol}</strong><span className="finance-data-meta">{item.symbol}{item.exchange ? ` ${item.exchange}` : ''}</span>{onEdit && item.editable !== false && !row.official && !valuation?.readOnly && <Button pill={false} color="secondary" variant="outline" size="sm" onClick={() => onEdit(valuation?.id || `${row.accountId}:${encodeURIComponent(row.item.id)}`)}>{t("更新持仓", "Update holding")}</Button>}</div>
    <dl className="holdings-position-detail-facts">
      <div><dt>{t("成本价", "Cost basis")}</dt><dd><PositionMoney value={row.costPrice} currency={row.currency} hidden={hidden} decimals={pricePrecision(row.costPrice)} /></dd></div>
      {!row.official && hasNumber(row.changePct) && <div><dt>{t("当日涨跌", "Daily change")}</dt><dd className={directionClass(row.changePct, hidden)}>{percentageText(row.changePct, hidden, true)}</dd></div>}
      {updatedAt && <div><dt>{row.official ? t("更新时间", "Updated") : row.quote?.asOf ? t("报价时间", "Quote time") : t("记录时间", "Recorded")}</dt><dd><time dateTime={updatedAt}>{quoteTime(updatedAt) || updatedAt}</time></dd></div>}
    </dl>
  </div>;
}

function SecuritiesList({ items, kind, hidden, market, portfolio, detailDate, onEdit }: { items: any[]; market?: any; portfolio?: any; detailDate: string; kind: string; hidden: boolean; onEdit?: (positionId: string) => void }) {
  const locale = useLocale();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<PositionSort>('marketValue');
  const [ascending, setAscending] = useState(false);
  useEffect(() => { setExpanded(null); setSort('marketValue'); setAscending(false); }, [kind]);
  const rows = useMemo(() => {
    const positions = items.map(item => positionRow(item, kind, market, portfolio, detailDate));
    const sameCurrency = positions.every(row => row.currency && row.currency === positions[0]?.currency);
    const valueOf = (row: any): Value => sort === 'marketValue' ? row.sortValue ?? (sameCurrency ? row.marketValue : null)
      : sort === 'holdingPnl' ? row.sortPnl ?? (sameCurrency ? row.holdingPnl : null) : sort === 'allocation' ? row.allocation?.value : row[sort];
    return positions.sort((a, b) => {
      if (sort === 'symbol') return a.symbol.localeCompare(b.symbol) * (ascending ? 1 : -1);
      const aValue = valueOf(a), bValue = valueOf(b);
      if (!hasNumber(aValue)) return hasNumber(bValue) ? 1 : a.symbol.localeCompare(b.symbol);
      if (!hasNumber(bValue)) return -1;
      return (Number(aValue) - Number(bValue)) * (ascending ? 1 : -1) || a.symbol.localeCompare(b.symbol);
    });
  }, [items, kind, market, portfolio, detailDate, sort, ascending, locale]);
  const allOfficial = rows.length > 0 && rows.every(row => row.official);
  useEffect(() => { setSort(current => allOfficial && current === 'changePct' ? 'marketValue' : current); }, [allOfficial]);
  const visibleSortOptions = positionSortOptions().filter(option => !allOfficial || option.value !== 'changePct');
  const chooseSort = (value: PositionSort) => { if (sort === value) setAscending(value => !value); else { setSort(value); setAscending(value === 'symbol'); } };
  const SortIcon = ascending ? ArrowUp : ArrowDown;
  const header = (key: PositionSort, label: string, numeric = true) => <th scope="col" className={numeric ? 'holdings-number' : undefined} aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}><button type="button" className="holdings-sort-heading" title={key === 'allocation' ? t("占账户净资产", "Share of account net assets") : undefined} onClick={() => chooseSort(key)} aria-label={t(`按${label}${sort === key ? ascending ? '降序' : '升序' : key === 'symbol' ? '升序' : '降序'}排序`, `Sort by ${label}, ${sort === key ? ascending ? 'descending' : 'ascending' : key === 'symbol' ? 'ascending' : 'descending'}`)}><span>{label}</span>{sort === key ? <SortIcon aria-hidden="true" /> : <ChevronDown className="holdings-sort-idle" aria-hidden="true" />}</button></th>;
  return <div className="holdings-positions">
    <div className="holdings-heading holdings-position-controls finance-data-section-heading"><h2 id={`holdings-title-${kind}`}><Chart className="holdings-icon" aria-hidden="true" />{t("持仓明细", "Holdings")} <span className="holdings-count finance-data-meta">{rows.length}</span></h2><div><Select pill={false} block={false} value={sort} options={visibleSortOptions} size="sm" aria-label={t("持仓排序字段", "Sort holdings by")} onChange={option => { setSort(option.value as PositionSort); setAscending(option.value === 'symbol'); }} /><Button pill={false} variant="ghost" color="secondary" size="sm" onClick={() => setAscending(value => !value)} aria-label={ascending ? t("切换为降序", "Sort descending") : t("切换为升序", "Sort ascending")}><SortIcon aria-hidden="true" /></Button></div></div>
    <div className="holdings-desktop table-wrap"><table className="data-table holdings-securities-table finance-data-table">
      <thead><tr>{header('symbol', t("产品 / 数量", "Product / quantity"), false)}{header('price', t("现价", "Price"))}{header('marketValue', t("市值", "Value"))}{header('holdingPnl', t("盈亏", "P&L"))}{header('allocation', t("仓位", "Weight"))}</tr></thead>
      <tbody>{rows.map(row => {
        const open = expanded === row.item.id, detailId = `holdings-detail-${kind}-${encodeURIComponent(row.item.id)}`, Chevron = open ? ChevronUp : ChevronDown;
        return <Fragment key={row.item.id}><tr className={open ? 'is-expanded' : undefined}>
          <th scope="row"><Button pill={false} className="holdings-stock-open" color="secondary" variant="ghost" size="lg" aria-expanded={open} aria-controls={detailId} aria-label={t(`${open ? '收起' : '展开'} ${row.item.name_display || row.symbol} 持仓详情`, `${open ? 'Collapse' : 'Expand'} holding details for ${row.item.name_display || row.symbol}`)} onClick={() => setExpanded(open ? null : row.item.id)}><StockIdentity item={row.item} quantity={row.quantity} hidden={hidden} /><Chevron className="holdings-icon" aria-hidden="true" /></Button>{row.status && <span className="holdings-position-status finance-data-meta">{row.status}</span>}</th>
          <td className="holdings-number"><PositionMoney value={row.price} currency={row.quoteCurrency !== row.currency ? row.quoteCurrency : undefined} hidden={hidden} decimals={pricePrecision(row.price)} /></td>
          <td className="holdings-number"><PositionMoney value={row.marketValue} currency={row.currency} hidden={hidden} /></td>
          <td className={`holdings-number ${directionClass(row.holdingPnl, hidden)}`}><PositionMoney value={row.holdingPnl} hidden={hidden} signed />{hasNumber(row.holdingPnlPct) && <span className="holdings-position-subvalue finance-data-meta">{percentageText(row.holdingPnlPct, hidden, true)}</span>}</td>
          <td className="holdings-number">{percentageText(row.allocation?.value, hidden)}</td>
        </tr>{open && <tr className="holdings-detail-row finance-data-detail-row"><td colSpan={5}><PositionDetails row={row} kind={kind} hidden={hidden} id={detailId} onEdit={onEdit} /></td></tr>}</Fragment>;
      })}</tbody>
    </table></div>
    <div className="holdings-mobile holdings-position-list">
      <div className="holdings-position-list-head finance-data-columns" aria-hidden="true"><span>{t("产品 / 数量", "Product / quantity")}</span><span>{t("现价 / 仓位", "Price / weight")}</span><span>{t("市值 / 持仓盈亏", "Value / P&L")}</span></div>
      {rows.map(row => {
        const open = expanded === row.item.id, detailId = `holdings-mobile-detail-${kind}-${encodeURIComponent(row.item.id)}`;
        return <div key={row.item.id} className={`holdings-position-item${open ? ' is-expanded' : ''}`}>
          <button type="button" className="holdings-position-row finance-data-row" aria-expanded={open} aria-controls={detailId} aria-label={t(`${open ? '收起' : '展开'} ${row.item.name_display || row.symbol} 持仓详情`, `${open ? 'Collapse' : 'Expand'} holding details for ${row.item.name_display || row.symbol}`)} onClick={() => setExpanded(open ? null : row.item.id)}>
            <span className="holdings-position-mobile-identity"><span><strong className="finance-data-name">{row.symbol}<ChevronDown aria-hidden="true" /></strong><span className="holdings-position-subvalue finance-data-meta">{quantityText(row.quantity, hidden, quantityUnit(row.item) ? ` ${quantityUnit(row.item)}` : '')}</span>{row.status && <span className="holdings-position-mobile-status finance-data-meta">{row.status}</span>}</span></span>
            <span className="holdings-position-cell"><PositionMoney value={row.price} currency={row.quoteCurrency !== row.currency ? row.quoteCurrency : undefined} hidden={hidden} decimals={pricePrecision(row.price)} /><span className="holdings-position-subvalue finance-data-meta">{percentageText(row.allocation?.value, hidden)}</span></span>
            <span className="holdings-position-cell"><PositionMoney value={row.marketValue} currency={row.currency} hidden={hidden} /><span className={`holdings-position-return ${directionClass(row.holdingPnl, hidden)}`}><span>{positionNumber(row.holdingPnl, hidden, 2, true)}</span>{hasNumber(row.holdingPnlPct) && <span aria-label={t(`持仓盈亏率 ${percentageText(row.holdingPnlPct, hidden, true)}`, `Holding return ${percentageText(row.holdingPnlPct, hidden, true)}`)}>({percentageText(row.holdingPnlPct, hidden, true)})</span>}</span></span>
          </button>
          {open && <PositionDetails row={row} kind={kind} hidden={hidden} id={detailId} onEdit={onEdit} />}
        </div>;
      })}
    </div>
  </div>;
}


export function Holdings({ state, hidden, initialAccount, onAccountChange, onEdit }: {
  state: FinanceState; hidden: boolean; initialAccount?: string; onAccountChange?: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  useLocale();
  const items = useMemo(() => positionsFor(state), [state]);
  const accounts = state.accounts;
  const [selected, setSelected] = useState(initialAccount || accounts.find(account => items.some(item => item.accountId === account.id))?.id || accounts[0]?.id || '');
  const [query, setQuery] = useState('');
  useEffect(() => { if (initialAccount && accounts.some(account => account.id === initialAccount)) setSelected(initialAccount); }, [initialAccount, accounts]);
  useEffect(() => { if (!accounts.some(account => account.id === selected)) setSelected(accounts[0]?.id || ''); }, [accounts, selected]);
  const account = accounts.find(item => item.id === selected);
  const summary = accountSummaryFor(state, selected);
  const accountWarning = account && (account.readStatus === 'stale' || account.projection?.status === 'stale' || account.projection?.reconciliationRequired) ? accountStatus(account) : null;
  const officialAccount = Boolean(account?.readOnly && (account.valuationBasis === 'official_api' || state.portfolio?.accounts?.some((item: any) => item.accountId === selected && item.valuationBasis === 'official_api')));
  const matches = (item: any) => !query.trim() || [item.symbol, item.name_display, item.kind, item.currency].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const selectedItems = items.filter(item => item.accountId === selected && matches(item));
  const historical = selectedItems.filter(item => officialAccount && item.kind === 'fund' && item.valuation?.valuationBasis !== 'official_api');
  const visible = selectedItems.filter(item => !historical.includes(item));
  const options = accounts.map(item => ({ value: item.id, label: item.name }));
  const choose = (id: string) => { setSelected(id); setQuery(''); onAccountChange?.(id); };
  return <div className="holdings-page finance-data-view">
    <div className="finance-page-toolbar finance-filter-toolbar holdings-toolbar">
      <div className="finance-toolbar-filter"><Select pill={false} aria-label={t("持仓账户", "Investment account")} value={selected} options={options} onChange={option => choose(option.value)} size="md" placeholder={t("选择账户", "Select an account")} disabled={!options.length} /></div>
      <div className="finance-toolbar-search"><Input value={query} onChange={event => setQuery(event.target.value)} startAdornment={<Search />} placeholder={t("名称或代码", "Name or symbol")} aria-label={t("搜索持仓名称或代码", "Search holdings by name or symbol")} size="md" /></div>
    </div>
    {summary.length > 0 && !query.trim() && <dl className="holdings-facts holdings-account-summary">{summary.map((fact, index) => <div key={fact.label}><dt>{summaryLabel(fact.label)}</dt><dd><span className="holdings-position-money finance-data-amount"><span>{money(fact.amount, hidden)}</span><small className="finance-data-meta">{fact.currency}</small>{index === 0 && accountWarning && <small className="finance-data-meta" role="status">{accountWarning}</small>}</span></dd></div>)}</dl>}
    {visible.length ? <SecuritiesList items={visible} kind={selected} hidden={hidden} market={state.market} portfolio={state.portfolio} detailDate={account?.detailAsOf || account?.asOf || ''} onEdit={account?.readOnly ? undefined : onEdit} /> : <EmptyMessage fill="none" className="holdings-empty-state"><EmptyMessage.Icon><Document /></EmptyMessage.Icon><EmptyMessage.Title>{query ? t("没有匹配的持仓", "No matching holdings") : t("还没有持仓明细", "No holdings yet")}</EmptyMessage.Title><EmptyMessage.Description>{query ? t("试试其他名称或代码。", "Try another name or symbol.") : account?.readOnly ? t("更新连接后显示券商提供的持仓。", "Refresh the connection to see holdings from your broker.") : t("记录证券、基金或其他投资，统一查看数量、市值与收益。", "Record securities, funds or other investments to track quantities, values and returns.")}</EmptyMessage.Description>{query && <EmptyMessage.ActionRow><Button color="secondary" variant="outline" pill={false} onClick={() => setQuery('')}>{t("清除搜索", "Clear search")}</Button></EmptyMessage.ActionRow>}</EmptyMessage>}
    {historical.length > 0 && <details className="holdings-historical-funds"><summary><span>{t("历史记录", "Historical records")} {historical.length}</span><ChevronDown /></summary><p className="holdings-history-note">{t("这些基金明细来自较早记录。当前连接提供基金资产总额，尚未提供对应明细。", "These fund holdings come from earlier records. The current connection provides a total fund value, but no corresponding holdings yet.")}</p><SecuritiesList items={historical.map(item => ({ ...item, valuation: undefined, editable: false }))} kind={`${selected}-history`} hidden={hidden} detailDate={account?.recordedAsOf || account?.asOf || ''} /></details>}
  </div>;
}
