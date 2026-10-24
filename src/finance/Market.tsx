import { t, useLocale } from '../i18n';
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge, type BadgeProps } from '@openai/apps-sdk-ui/components/Badge';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { ArrowDown, ArrowRight, ArrowUp, Chart, ChevronDown, Cube, ExternalLink, Globe, Reload, Search, Stack } from '@openai/apps-sdk-ui/components/Icon';
import { BrandIcon } from './BrandIcon';
import { Dialog, PageHeading } from '../components';
import { Watchlist } from './Watchlist';
import type { FinanceState } from './types';
import { createFinanceTimeFormatter } from './time';
import './Market.css';
import './finance-data-view.css';

type RelatedPosition = { id: string; positionId?: string; accountId: string; symbol?: string; name?: string; name_display?: string; quoteId?: string; valuation?: { quote?: { id?: string; currency?: string } } };
type MarketProps = { state?:FinanceState; onSaved?:(state:FinanceState)=>void; market: any; hidden: boolean; onRefresh: () => Promise<void>; headerActions?: ReactNode; headerNavigation?: ReactNode; positions?: RelatedPosition[]; accounts?: { id: string; name: string }[]; onHolding?: (accountId: string) => void; officialObservations?: { moomoo?: { account?: { positions?: { code: string; name: string | null }[] } } } };
type Quote = {
  id: string; symbol: string; name: string; kind: 'stock' | 'etf' | 'fund' | 'gold' | 'fx' | 'bond' | 'crypto' | 'option' | 'futures' | 'cash' | 'other';
  price: string | null; currency: string; unit?: string; asOf?: string; receivedAt?: string;
  sourceName?: string; sourceUrl?: string; status?: string; marketState?: string; delayMinutes?: number;
  change?: string | null; changePct?: string | null; message?: string; identitySource?: 'moomoo_official'; positionIds?: string[];
};
type Filter = 'watchlist' | 'all' | 'securities' | 'fund' | 'gold' | 'fx';
const marketFilters = (): { value: Filter; label: string }[] => [
  { value: 'all', label: t("全部", "All") }, {value:'watchlist',label:t("我的自选", "Watchlist")}, { value: 'securities', label: t("股票与 ETF", "Stocks and ETFs") },
  { value: 'fund', label: t("基金", "Funds") }, { value: 'gold', label: t("黄金", "Gold") }, { value: 'fx', label: t("汇率", "Exchange rates") },
];
const kindNames = (): Record<Quote['kind'], string> => ({ stock: t("股票", "Stock"), etf: 'ETF', fund: t("基金净值", "Fund NAV"), gold: t("黄金", "Gold"), fx: t("汇率", "Exchange rates"), bond:t("债券", "Bond"),crypto:t("加密资产", "Crypto"),option:t("期权", "Option"),futures:t("期货", "Futures"),cash:t("现金", "Cash"),other:t("其他资产", "Other assets") });
const failureStates = new Set(['error', 'failed', 'unavailable']);
const busyStates = new Set(['loading', 'refreshing']);
type TimeFormatter = ReturnType<typeof createFinanceTimeFormatter>;
const hasQuote = (quote: Quote) => quote.status !== 'unmapped' && quote.price !== null && quote.price !== undefined;
const precisions: Partial<Record<Quote['kind'], { minimum: number; maximum: number }>> = {
  stock: { minimum: 2, maximum: 4 }, etf: { minimum: 2, maximum: 4 },
  fund: { minimum: 4, maximum: 4 }, gold: { minimum: 2, maximum: 2 }, fx: { minimum: 6, maximum: 6 },
};

function Time({ value, formatTime }: { value?: string; formatTime: TimeFormatter }) {
  const formatted = formatTime(value);
  if (!formatted) return <span>{t("时间未提供或无效", "Time unavailable")}</span>;
  return <time dateTime={value} title={formatted.title}>{formatted.text}</time>;
}
function numberText(value: string | number | null | undefined, hidden: boolean, signed = false, precision = { minimum: 2, maximum: 4 }) {
  if (hidden) return '••••';
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value), match = raw.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return raw;
  const fraction = (match[3] || '').padEnd(precision.maximum, '0');
  const scale = 10n ** BigInt(precision.maximum);
  const rounded = BigInt(match[2]) * scale + BigInt(fraction.slice(0, precision.maximum) || '0') + (Number(fraction[precision.maximum] || '0') >= 5 ? 1n : 0n);
  let decimals = String(rounded % scale).padStart(precision.maximum, '0');
  while (decimals.length > precision.minimum && decimals.endsWith('0')) decimals = decimals.slice(0, -1);
  const nonzero = rounded !== 0n;
  const sign = match[1] === '-' && nonzero ? '-' : signed && nonzero ? '+' : '';
  return `${sign}${String(rounded / scale).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decimals ? `.${decimals}` : ''}`;
}
function movement(value?: string | null) {
  if (value === null || value === undefined || !/^[+-]?\d+(?:\.\d+)?$/.test(String(value)) || !/[1-9]/.test(String(value))) return 0;
  return String(value).startsWith('-') ? -1 : 1;
}
function unitText(quote: Quote) {
  const units: Record<string, string> = { g: t("克", "g"), gram: t("克", "g"), grams: t("克", "g"), oz: t("盎司", "oz"), ounce: t("盎司", "oz"), share: t("股", "shares"), unit: t("份", "units") };
  const unit = quote.unit ? units[quote.unit] || quote.unit : quote.kind === 'fx' ? quote.symbol.match(/^[A-Z]{3}/)?.[0] : null;
  return [quote.currency, unit].filter(Boolean).join(' / ');
}
function safeSource(url?: string) {
  if (!url) return null;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null; } catch { return null; }
}
function Source({ quote }: { quote: Quote }) {
  const href = safeSource(quote.sourceUrl);
  if (!quote.sourceName && !href) return <span className="market-muted">{t("来源未提供", "Source not provided")}</span>;
  return href ? <a className="market-source-link finance-data-meta" href={href} target="_blank" rel="noopener noreferrer"><span>{quote.sourceName || t("数据来源", "Source")}</span><ExternalLink aria-hidden="true" /></a> : <span>{quote.sourceName}</span>;
}
function stateInfo(quote: Quote): { label: string; color: BadgeProps['color']; stale: boolean } {
  const hasPrice = hasQuote(quote);
  if (hasPrice && (quote.status === 'stale' || quote.status === 'unavailable')) return { label: quote.kind === 'fund' ? t("保留上次净值", "Previous NAV") : t("保留上次报价", "Previous quote"), color: 'warning', stale: true };
  if (quote.status === 'unmapped') return { label: quote.identitySource === 'moomoo_official' || quote.kind === 'gold' && Boolean(quote.sourceName) ? t("行情未接入", "Quote unavailable") : t("待确认", "Unconfirmed"), color: 'secondary', stale: false };
  if (!hasPrice || quote.status === 'unavailable') return { label: t("暂不可用", "Unavailable"), color: 'secondary', stale: false };
  if (quote.status === 'example') return { label: t("示例价格", "Example price"), color: 'secondary', stale: false };
  if (quote.kind === 'fund' && ['live', 'delayed', 'closed'].includes(quote.status || '')) return { label: t("最新公布净值", "Latest published NAV"), color: 'secondary', stale: false };
  if (quote.status === 'live') return { label: t("实时报价", "Live quote"), color: 'success', stale: false };
  if (quote.status === 'delayed' || quote.status === 'unknown') return { label: quote.delayMinutes && quote.delayMinutes > 0 ? t(`延迟 ${quote.delayMinutes} 分钟`, `Delayed ${quote.delayMinutes} min`) : t("最新报价", "Latest quote"), color: 'secondary', stale: false };
  if (quote.status === 'closed') return { label: t("已收市", "Market closed"), color: 'secondary', stale: false };
  return { label: t("时效待确认", "Freshness unconfirmed"), color: 'secondary', stale: false };
}
function Status({ quote }: { quote: Quote }) {
  const info = stateInfo(quote);
  return <Badge className="market-status-badge" color={info.color} variant="soft" size="sm">{info.label}</Badge>;
}
function Identity({ quote }: { quote: Quote }) {
  const KindIcon = quote.kind === 'gold' ? Cube : quote.kind === 'fx' ? Globe : Stack;
  return <span className="market-identity">
    {quote.kind === 'stock' || quote.kind === 'etf' ? <BrandIcon id={quote.symbol || quote.id} size={32} /> : <span className="market-kind-icon"><KindIcon aria-hidden="true" /></span>}
    <span className="market-identity-text"><strong className="finance-data-name">{quote.name || quote.symbol || t("未命名产品", "Unnamed product")}</strong><span className="finance-data-meta">{quote.symbol && <span>{quote.symbol}</span>}<span>{kindNames()[quote.kind] || t("行情", "Market")}</span></span></span>
  </span>;
}
function Price({ quote, hidden }: { quote: Quote; hidden: boolean }) {
  const available = hasQuote(quote);
  return <span className={`market-price${available ? '' : ' market-price-empty'}`}>
    <strong className="finance-data-amount">{available ? numberText(quote.price, hidden, false, precisions[quote.kind]) : '—'}</strong>
    {available && <small className="finance-data-meta">{unitText(quote)}</small>}
  </span>;
}
function Change({ quote, hidden }: { quote: Quote; hidden: boolean }) {
  const available = hasQuote(quote);
  const hasChange = quote.change !== null && quote.change !== undefined, hasPct = quote.changePct !== null && quote.changePct !== undefined;
  if (!available || (!hasChange && !hasPct)) return <span className="market-change market-muted">—</span>;
  const direction = hidden ? 0 : movement(quote.changePct ?? quote.change);
  const DirectionIcon = direction < 0 ? ArrowDown : ArrowUp;
  return <span className={`market-change${direction > 0 ? ' is-up' : direction < 0 ? ' is-down' : ''}`}>
    {hasPct && <span>{direction !== 0 && <DirectionIcon aria-hidden="true" />}<span>{numberText(quote.changePct, hidden, true, { minimum: 2, maximum: 2 })}{!hidden && '%'}</span></span>}
    {hasChange && <span className={hasPct ? 'market-change-absolute finance-data-meta' : undefined}>{!hasPct && direction !== 0 && <DirectionIcon aria-hidden="true" />}<span>{numberText(quote.change, hidden, true, precisions[quote.kind])}</span></span>}
  </span>;
}
function QuoteTime({ quote, formatTime }: { quote: Quote; formatTime: TimeFormatter }) {
  return <span className="market-quote-time finance-data-meta">{quote.asOf ? <Time value={quote.asOf} formatTime={formatTime} /> : '—'}</span>;
}

function matchesQuote(position: RelatedPosition, quote: Quote) {
  if (position.quoteId === quote.id || position.valuation?.quote?.id === quote.id || quote.positionIds?.some(positionId => positionId === position.id || positionId === position.positionId)) return true;
  const official = position.valuation?.quote;
  const code = /^moomoo:(US|HK)\.(.+)$/.exec(official?.id || '');
  if (!code || !['stock', 'etf'].includes(quote.kind) || official?.currency !== quote.currency) return false;
  const symbol = code[1] === 'HK' ? `${code[2].replace(/^0+(?=\d)/, '').padStart(4, '0')}.HK` : code[2];
  return quote.symbol === symbol;
}

function QuoteDetails({ quote, id, positions, accounts, onHolding, formatTime }: { quote: Quote; id: string; formatTime: TimeFormatter } & Pick<MarketProps, 'positions' | 'accounts' | 'onHolding'>) {
  const linked = positions?.filter(position => matchesQuote(position, quote));
  return <section id={id} className="market-quote-detail finance-data-expansion" aria-label={t(`${quote.name || quote.symbol}报价详情`, `Quote details for ${quote.name || quote.symbol}`)}>
    <dl className="market-detail-facts finance-data-meta">
      <div><dt>{quote.kind === 'fund' ? t("净值日期", "NAV date") : t("报价时间", "Quote time")}</dt><dd><Time value={quote.asOf} formatTime={formatTime} /></dd></div>
      <div><dt>{t("获取时间", "Retrieved")}</dt><dd><Time value={quote.receivedAt} formatTime={formatTime} /></dd></div>
      <div><dt>{t("数据来源", "Source")}</dt><dd><Source quote={quote} /></dd></div>
      <div><dt>{t("报价状态", "Quote status")}</dt><dd>{stateInfo(quote).label}</dd></div>
    </dl>
    {linked && <div className="market-related-positions finance-data-meta"><span>{t("关联持仓", "Linked holdings")}</span>{linked.length ? <div>{linked.map(position => {
      const label = `${accounts?.find(account => account.id === position.accountId)?.name || t("持仓账户", "Investment account")}${t('，', ', ')}${position.name_display || position.name || position.symbol || quote.name}`;
      return onHolding ? <Button key={position.id} pill={false} color="secondary" variant="ghost" size="sm" onClick={() => onHolding(position.accountId)}>{label}<ArrowRight aria-hidden="true" /></Button> : <span key={position.id}>{label}</span>;
    })}</div> : <span>{t("暂无关联持仓", "No linked holdings")}</span>}</div>}
  </section>;
}

export function Market({ state, onSaved, market, hidden, onRefresh, headerActions, headerNavigation, officialObservations, positions, accounts, onHolding }: MarketProps) {
  const locale = useLocale();
  const [watchlistOpen,setWatchlistOpen]=useState(false);
  const watchlist=(state?.journal?.watchlist||[]).filter(row=>!row.archived);
  const [filter, setFilter] = useState<Filter>('all'), [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false), [refreshFailed, setRefreshFailed] = useState(false), [cooldown, setCooldown] = useState(false), [announcement, setAnnouncement] = useState('');
  const previous = useRef<any>(null), refreshLock = useRef(false), mounted = useRef(true), failedUpdate = useRef<string | undefined>(undefined);
  const selectId = useId();
  const detailPrefix = useId();
  useEffect(() => { setExpanded(null); }, [filter, query]);
  const rawQuotes: Quote[] = Array.isArray(market?.quotes) ? market.quotes : [];
  const serverFailed = failureStates.has(String(market?.status || ''));
  const serverBusy = busyStates.has(String(market?.status || ''));
  const busy = refreshing || serverBusy;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (rawQuotes.length) previous.current = market; }, [market, rawQuotes.length]);
  useEffect(() => { if (refreshFailed && market?.updatedAt && market.updatedAt !== failedUpdate.current && !serverFailed && !serverBusy) setRefreshFailed(false); }, [refreshFailed, market?.updatedAt, serverFailed, serverBusy]);
  useEffect(() => { setCooldown(false); }, [market?.updatedAt]);
  const retained = refreshFailed || serverFailed;
  const displayedMarket = rawQuotes.length || !(retained || busy) ? market : previous.current || market;
  const formatTime = useMemo(() => createFinanceTimeFormatter(locale, displayedMarket?.timeZone), [locale, displayedMarket?.timeZone]);
  const quotes: Quote[] = useMemo(() => (Array.isArray(displayedMarket?.quotes) ? displayedMarket.quotes : []).map((quote: Quote) => {
    const official = officialObservations?.moomoo?.account?.positions?.find(position => position.code.split('.').at(-1) === quote.symbol && position.name?.trim());
    return quote.status === 'unmapped' && official ? { ...quote, name: official.name!, identitySource: 'moomoo_official' as const } : quote;
  }), [displayedMarket?.quotes, officialObservations]);
  const visible = useMemo(() => quotes.filter(quote => {
    const inCategory = filter === 'all' || (filter==='watchlist'&&watchlist.some(row=>row.quoteId===quote.id&&row.currency===quote.currency)) || (filter === 'securities' ? quote.kind === 'stock' || quote.kind === 'etf' : quote.kind === filter);
    const matches = !query.trim() || [quote.name, quote.symbol, quote.currency, quote.sourceName].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return inCategory && matches;
  }), [quotes, filter, query, state?.journal?.revision]);
  const refresh = async () => {
    if (refreshLock.current || serverBusy) return;
    refreshLock.current = true;
    setRefreshing(true); setRefreshFailed(false); setCooldown(false); setAnnouncement(t("正在检查行情更新。", "Checking for quote updates."));
    try { await onRefresh(); if (mounted.current) setAnnouncement(t("行情更新检查已完成。", "Quote update check complete.")); }
    catch (error) {
      if (mounted.current) {
        const failure = error as { status?: number; code?: string } | null;
        if (failure?.status === 429 || failure?.code === 'MARKET_REFRESH_COOLDOWN') { setCooldown(true); setAnnouncement(t("行情刚刚更新，请稍后再试。", "Quotes were just updated. Try again shortly.")); }
        else { failedUpdate.current = market?.updatedAt; setRefreshFailed(true); setAnnouncement(t("行情更新未完成，请稍后重试。", "Quote update failed. Please try again.")); }
      }
    }
    finally { refreshLock.current = false; if (mounted.current) setRefreshing(false); }
  };

  return <div className="market-page finance-data-view" aria-busy={busy}>
    <PageHeading className="market-heading" title={<span className="finance-heading-leading">{headerNavigation}<span>{headerNavigation ? t("行情", "Market") : t("市场行情", "Market quotes")}</span></span>} action={<>{headerActions}<Button pill={false} color="secondary" variant="outline" size="md" loading={busy} disabled={busy} onClick={refresh} title={refreshFailed || serverFailed ? t("本次行情更新未完成，点击重试", "Quote update failed. Click to retry.") : cooldown ? t("刚刚检查过更新，请稍后再试", "Updates were just checked. Try again shortly.") : undefined}><Reload aria-hidden="true" />{busy ? t("更新中", "Updating") : refreshFailed || serverFailed ? t("重试更新", "Retry update") : cooldown ? t("稍后重试", "Try again shortly") : t("更新行情", "Refresh quotes")}</Button></>} />
    <span className="market-sr-only" role="status" aria-live="polite">{announcement}</span>
    <div className="market-toolbar finance-page-toolbar finance-filter-toolbar">
      <div className="finance-toolbar-filter"><label className="market-sr-only" htmlFor={selectId}>{t("行情品种", "Quote category")}</label><Select pill={false} id={selectId} value={filter} options={marketFilters()} onChange={option => setFilter(option.value as Filter)} size="md" /></div>
      <div className="market-search finance-toolbar-search"><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("名称或代码", "Name or symbol")} aria-label={t("搜索行情名称或代码", "Search quotes by name or symbol")} startAdornment={<Search aria-hidden="true" />} size="md" /></div>
      {state&&onSaved&&<Button className="market-watchlist-action" color="secondary" variant="outline" pill={false} size="md" onClick={()=>setWatchlistOpen(true)}>{t("管理自选", "Manage watchlist")}</Button>}
    </div>
    {!quotes.length ? <EmptyMessage fill="none" className="market-empty"><EmptyMessage.Icon><Chart aria-hidden="true" /></EmptyMessage.Icon><EmptyMessage.Title>{busy ? t("正在获取行情", "Loading quotes") : t("还没有可用行情", "No quotes available yet")}</EmptyMessage.Title><EmptyMessage.Description>{busy ? t("完成后会显示数据方的报价、时间与来源。", "Quotes, timestamps and sources will appear when loading finishes.") : t("点击“更新行情”获取已关联产品的最新数据。", "Select “Refresh quotes” to get the latest data for linked products.")}</EmptyMessage.Description></EmptyMessage> : !visible.length ? <EmptyMessage fill="none" className="market-empty"><EmptyMessage.Icon><Search aria-hidden="true" /></EmptyMessage.Icon><EmptyMessage.Title>{t("没有匹配的行情", "No matching quotes")}</EmptyMessage.Title><EmptyMessage.Description>{t("试试其他名称、代码或品种。", "Try another name, symbol or category.")}</EmptyMessage.Description><EmptyMessage.ActionRow><Button pill={false} color="secondary" variant="outline" onClick={() => { setQuery(''); setFilter('all'); }}>{t("查看全部行情", "View all quotes")}</Button></EmptyMessage.ActionRow></EmptyMessage> : <>
      <div className="market-desktop"><table className="market-table finance-data-table"><colgroup><col className="market-col-product" /><col className="market-col-price" /><col className="market-col-change" /><col className="market-col-time" /><col className="market-col-status" /></colgroup><thead><tr><th scope="col">{t("品种", "Product")}</th><th scope="col" className="market-number">{t("最新报价 / 净值", "Latest price / NAV")}</th><th scope="col" className="market-number">{t("涨跌 / 涨跌幅", "Change / %")}</th><th scope="col">{filter === 'fund' ? t("净值日期", "NAV date") : t("报价时间", "Quote time")}</th><th scope="col">{t("报价状态", "Quote status")}</th></tr></thead><tbody>{visible.map(quote => {
        const open = expanded === quote.id, detailId = `${detailPrefix}-desktop-${encodeURIComponent(quote.id)}`;
        const toggle = () => setExpanded(open ? null : quote.id);
        return <Fragment key={quote.id}><tr className={`market-quote-row finance-data-row${open ? ' is-expanded' : ''}${stateInfo(quote).stale ? ' market-row-stale' : ''}`} onClick={toggle}>
          <th scope="row"><Button pill={false} color="secondary" variant="ghost" className="market-quote-open" aria-label={t(`${open ? '收起' : '展开'} ${quote.name || quote.symbol} 报价详情`, `${open ? 'Collapse' : 'Expand'} quote details for ${quote.name || quote.symbol}`)} aria-expanded={open} aria-controls={detailId} onClick={event => { event.stopPropagation(); toggle(); }}><Identity quote={quote} /><ChevronDown className="market-expand-icon" aria-hidden="true" /></Button></th>
          <td className="market-number"><Price quote={quote} hidden={hidden} /></td><td className="market-number"><Change quote={quote} hidden={hidden} /></td><td><QuoteTime quote={quote} formatTime={formatTime} /></td><td><Status quote={quote} /></td>
        </tr>{open && <tr className="market-detail-row finance-data-detail-row"><td colSpan={5}><QuoteDetails quote={quote} id={detailId} positions={positions} accounts={accounts} onHolding={onHolding} formatTime={formatTime} /></td></tr>}</Fragment>;
      })}</tbody></table></div>
      <div className="market-mobile">{visible.map(quote => {
        const open = expanded === quote.id, detailId = `${detailPrefix}-mobile-${encodeURIComponent(quote.id)}`;
        return <article className={`market-quote-card${open ? ' is-expanded' : ''}${stateInfo(quote).stale ? ' market-row-stale' : ''}`} key={quote.id} aria-label={t(`${quote.name || quote.symbol}行情`, `${quote.name || quote.symbol} quote`)}>
          <button type="button" className="market-card-open finance-data-row" aria-label={t(`${open ? '收起' : '展开'} ${quote.name || quote.symbol} 报价详情`, `${open ? 'Collapse' : 'Expand'} quote details for ${quote.name || quote.symbol}`)} aria-expanded={open} aria-controls={detailId} onClick={() => setExpanded(open ? null : quote.id)}>
            <span className="market-card-heading"><Identity quote={quote} /><Status quote={quote} /><ChevronDown className="market-expand-icon" aria-hidden="true" /></span>
            <span className="market-card-prices"><span><span className="market-field-label finance-data-meta">{quote.kind === 'fund' ? t("最新公布净值", "Latest published NAV") : t("最新报价", "Latest quote")}</span><Price quote={quote} hidden={hidden} /></span><span><span className="market-field-label finance-data-meta">{t("涨跌 / 涨跌幅", "Change / %")}</span><Change quote={quote} hidden={hidden} /></span></span>
            <span className="market-card-time finance-data-meta"><span>{quote.kind === 'fund' ? t("净值日期", "NAV date") : t("报价时间", "Quote time")}</span><QuoteTime quote={quote} formatTime={formatTime} /></span>
          </button>
          {open && <QuoteDetails quote={quote} id={detailId} positions={positions} accounts={accounts} onHolding={onHolding} formatTime={formatTime} />}
        </article>;
      })}</div>
    </>}
    {watchlistOpen&&state&&onSaved&&<Dialog title={t("我的自选", "Watchlist")} className="finance-settings finance-detail-dialog" onClose={()=>setWatchlistOpen(false)}><Watchlist state={state} onSaved={next=>{onSaved(next);void refresh();}}/></Dialog>}
  </div>;
}
