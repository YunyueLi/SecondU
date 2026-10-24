import { t, useLocale } from '../i18n';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { LoadingIndicator } from '@openai/apps-sdk-ui/components/Indicator';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Archive, ArrowRight, ArrowRotateCw, Chat, CreditCard, Eye, EyeOff, Link, Plus, Search, DotsHorizontalMoreMenu, CloseBold } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog, PageHeading } from '../components';
import { getAppNavigation } from '../navigation';
import { AccountForm } from './AccountForm';
import { AccountProfileForm } from './AccountProfileForm';
import { accountTypeLabel,accountTypeOf,isValuedAssetType } from '../../shared/asset-taxonomy.mjs';
import { financeAssetTypeLabel, financeLiabilityTypeLabel } from './labels';
import { AccountSourceDetails } from './AccountSourceDetails';
import { AccountList } from './AccountList';
import { BrandIcon } from './BrandIcon';
import { FinanceDashboard, type FinanceDestination } from './FinanceDashboard';
import { FinancePlanning, type PlanningTab } from './FinancePlanning';
import { Transactions } from './Transactions';
import { FinanceOnboarding } from './FinanceOnboarding';
import { Holdings } from './Holdings';
import { Market } from './Market';
import { NewPositionForm } from './NewPositionForm';
import { Panorama } from './Panorama';
import { PositionEditor } from './PositionEditor';
import { financeRequest, useFinance, useHiddenAmounts } from './api';
import { accountAmount, accountBrand, accountDescription, accountStatus, currencies, date, displayAccounts, money, positionsFor, summaryFor } from './model';
import { percentage } from './percentage';
import { createFinanceContextSnapshot } from './context-snapshot.mjs';
import type { FinanceAccount, FinanceSection, FinanceState } from './types';
import './finance.css';

export type FinanceQuestion = { prompt: string; section: string; accountIds?: string[]; snapshot: { name: string; content: string } };
type Props = {
  section?: string;
  onNavigate?: (section: string) => void;
  presentation?: 'desktop' | 'mobile';
  onAsk?: (context: FinanceQuestion) => void;
  navigation?: ReactNode;
};
type Modal = { type: 'account' | 'update' | 'profile'; id: string } | { type: 'create'; kind: 'asset' | 'liability'; continueToPosition?: boolean } | { type: 'valuation' } | { type: 'archived' } | { type: 'position'; id: string } | { type: 'new-position'; accountId?: string };
const sectionLabels = (): Record<FinanceSection, string> => ({ overview: t("财务总览", "Finance overview"), accounts: t("我的账户", "My accounts"), holdings: t("投资持仓", "Investment holdings"), market: t("市场行情", "Market quotes"), liabilities: t("负债与还款", "Liabilities and repayments"), transactions: t("收支记录", "Income and expenses"), planning: t("财务规划", "Financial planning") });
const pageOf = (section?: string): FinanceSection => section && section in sectionLabels() ? section as FinanceSection : 'overview';
const typeLabel = (account:FinanceAccount) => account.kind==='liability' ? financeLiabilityTypeLabel(accountTypeOf(account),accountTypeLabel(account)) : financeAssetTypeLabel(accountTypeOf(account),accountTypeLabel(account));

export function FinanceWorkspace({ section, onNavigate, presentation = 'desktop', onAsk, navigation }: Props) {
  useLocale();
  const sections=sectionLabels();
  const { data, error, loading, refresh, applyState } = useFinance();
  const [page, setPage] = useState<FinanceSection>(() => pageOf(section));
  const [hidden, setHidden] = useHiddenAmounts();
  const [modal, setModal] = useState<Modal | null>(null);
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('ALL');
  const [typeFilter,setTypeFilter]=useState('ALL');
  const [holdingAccount, setHoldingAccount] = useState<string>();
  const [destination,setDestination]=useState<FinanceDestination>({section:'overview'});
  const [notice, setNotice] = useState('');
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),4500);return()=>window.clearTimeout(timer);},[notice]);
  const [savingArchive,setSavingArchive]=useState(false);
  const [preferenceError, setPreferenceError] = useState(''), [savingPreference, setSavingPreference] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPage(pageOf(section)); setQuery(''); setTypeFilter('ALL');
    root.current?.closest<HTMLElement>('.main-workspace,.mobile-main')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [section]);
  useLayoutEffect(() => {
    const element = root.current;
    const heading = element?.querySelector<HTMLElement>('.finance-page-heading,.market-heading');
    const toolbar = element?.querySelector<HTMLElement>('.finance-page-toolbar');
    if (!element || !heading) return;
    const update = () => {
      element.style.setProperty('--finance-header-height', `${heading.getBoundingClientRect().height}px`);
      element.style.setProperty('--finance-toolbar-height', `${toolbar?.getBoundingClientRect().height || 0}px`);
    };
    const observer = new ResizeObserver(update); observer.observe(heading); update();
    if (toolbar) observer.observe(toolbar);
    return () => observer.disconnect();
  }, [page, Boolean(data), Boolean(data?.metadata?.onboarding?.completed)]);
  const go = (next: FinanceSection) => {
    setPage(next); setQuery(''); setTypeFilter('ALL'); onNavigate?.(next);
    const scroller = root.current?.closest<HTMLElement>('.main-workspace,.mobile-main');
    scroller?.scrollTo({ top: 0, behavior: 'instant' });
  };
  const navigateDashboard=(next:FinanceDestination)=>{setDestination(next);go(next.section);};
  const saved = (state: FinanceState, message = t("记录已保存。", "Record saved.")) => { applyState(state); setModal(null); setNotice(message); };
  const baseCurrency = data?.metadata?.onboarding?.displayCurrency || data?.valuation?.currency || 'CNY';
  const chosenCurrency = filter === 'ALL' ? baseCurrency : filter;
  const accountRows = useMemo(() => data ? displayAccounts(data) : [], [data]);
  const summary = data ? summaryFor(data, chosenCurrency, filter === 'ALL' ? undefined : filter) : null;
  const allRows = data ? [...accountRows, ...data.liabilities] : [];
  const activeAccount = modal && 'id' in modal ? allRows.find(account => account.id === modal.id) : undefined;
  const reconcilePosition = activeAccount?.projection?.reconciliationRequired && !activeAccount.readOnly ? data?.positions?.items?.find(item => item.accountId === activeAccount.id && item.editable) : undefined;
  const positionAccounts = accountRows.filter(account => account.canAddPosition === true);
  const needOnboarding = Boolean(data && !data.metadata?.onboarding?.completed);
  const showOnboarding = needOnboarding && page === 'overview';
  const availableCurrencies = [...new Set(allRows.map(account => account.currency))].sort();
  const sectionRows=page === 'liabilities' ? data?.liabilities || [] : accountRows;
  const typeOptions=[{value:'ALL',label:page==='liabilities'?t("全部负债类型", "All liability types"):t("全部资产类型", "All asset types")},...new Map(sectionRows.map(account=>[accountTypeOf(account),{value:accountTypeOf(account),label:typeLabel(account)}])).values()];
  const listRows = sectionRows.filter(account => (typeFilter==='ALL'||accountTypeOf(account)===typeFilter) && (filter === 'ALL' || account.currency === filter) && (!query.trim() || [account.name, account.description, account.provider, account.currency].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const openHoldings = (id: string) => { setHoldingAccount(id); go('holdings'); };
  const openNewPosition = (accountId?: string) => {
    if (!positionAccounts.length) { setModal({ type: 'create', kind: 'asset', continueToPosition: true }); setNotice(''); }
    else setModal({ type: 'new-position', accountId });
  };
  const archiveAccount = async (accountId:string, archived:boolean) => {
    setSavingArchive(true);
    try { const result=await financeRequest<{state:FinanceState}>('/accounts/archive',{accountId,archived},'PUT');applyState(result.state);setModal(null);setNotice(archived?t("账户已移出当前列表。", "Account removed from the current list."):t("账户已恢复。", "Account restored.")); }
    catch(failure){setNotice(failure instanceof Error?failure.message:t("账户状态保存失败。", "Could not save the account status."));}
    finally{setSavingArchive(false);}
  };
  const chooseDisplayCurrency = async (currency: string) => {
    if (!data || savingPreference) return;
    setSavingPreference(true); setPreferenceError('');
    try {
      const result = await financeRequest<{ state: FinanceState }>('/onboarding', { ...data.metadata?.onboarding, completed: true, displayCurrency: currency }, 'PUT');
      if (!result.state) throw new Error(t("展示币种尚未保存，请重试。", "The display currency was not saved. Try again."));
      applyState(result.state);
    } catch (failure) { setPreferenceError(failure instanceof Error ? failure.message : t("展示币种尚未保存，请重试。", "The display currency was not saved. Try again.")); }
    finally { setSavingPreference(false); }
  };
  const refreshMarket = async () => {
    const result = await financeRequest<{ state?: FinanceState; refreshed?: boolean; message?: string }>('/market/refresh', {});
    if (result.state) applyState(result.state); else await refresh(true);
    if(result.refreshed === false&&result.message)setNotice(result.message);
  };
  const showAccounts = (rows: FinanceAccount[], compact = false) => <AccountList
    hidden={hidden} variant={compact ? 'compact' : 'full'}
    headingLabel={page === 'liabilities' ? t("负债", "Liabilities") : t("账户", "Account")}
    rows={rows.map(account => {
      const inCurrency = accountAmount(data!, account, chosenCurrency);
      const total = account.kind === 'liability' ? summary?.liabilities : summary?.assets;
      const share = percentage(inCurrency, total);
      return { id: account.id, brand: accountBrand(account), name: account.name, description: typeLabel(account), suffix: account.suffix || account.cardSuffix || account.accountSuffix, currency: account.currency, amount: money(account.amount, hidden), meta: accountStatus(account), share: share ? t(`占${account.kind === 'liability' ? '负债' : '资产'} ${share}`, `${share} of ${account.kind === 'liability' ? 'liabilities' : 'assets'}`) : null };
    })}
    onSelect={id => setModal({ type: 'account', id })}
  />;
  const askAboutPage = () => {
    if (onAsk && data) onAsk({ prompt: page === 'holdings' ? t("帮我分析当前的投资持仓。", "Help me analyze my current investment holdings.") : t("帮我梳理当前的账户与资产情况。", "Help me review my current accounts and assets."), section: page, snapshot: createFinanceContextSnapshot(data, { section: page }) });
  };
  const commonActions = <>
    {onAsk && data && !showOnboarding && <Button className="finance-ask-button" color="secondary" variant="ghost" pill={false} onClick={askAboutPage} aria-label={t("聊聊财务", "Discuss finances")}><Chat /><span className="finance-action-label">{t("聊聊财务", "Discuss finances")}</span></Button>}
    <Button color="secondary" variant="ghost" pill={false} uniform aria-label={hidden ? t("显示金额", "Show amounts") : t("隐藏金额", "Hide amounts")} title={hidden ? t("显示金额", "Show amounts") : t("隐藏金额", "Hide amounts")} onClick={() => setHidden(!hidden)}>{hidden ? <EyeOff /> : <Eye />}</Button>
    <ButtonLink className="finance-manage-link" href="#settings/connectors" color="secondary" variant="ghost" pill={false} aria-label={t("管理财务连接", "Manage financial connections")}><Link /><span className="finance-action-label">{t("管理连接", "Manage connections")}</span></ButtonLink>
    {page === 'accounts' && Boolean(data?.archivedAccounts?.length) && <Menu><Menu.Trigger><Button color="secondary" variant="ghost" pill={false} uniform aria-label={t("更多账户操作", "More account actions")} title={t("更多账户操作", "More account actions")}><DotsHorizontalMoreMenu /></Button></Menu.Trigger><Menu.Content align="end"><Menu.Item onSelect={() => setModal({ type: 'archived' })}><Archive />{t("已移除账户", "Removed accounts")}</Menu.Item></Menu.Content></Menu>}
  </>;
  const primaryAction = !showOnboarding && data && !['transactions','planning'].includes(page) && <Button color="primary" pill={false} onClick={() => page === 'holdings' ? openNewPosition(holdingAccount) : setModal({ type: 'create', kind: page === 'liabilities' ? 'liability' : 'asset' })}><Plus />{page === 'holdings' ? t("添加持仓", "Add holding") : page === 'liabilities' ? t("添加负债", "Add liability") : t("添加资产", "Add asset")}</Button>;
  const pageActions = page === 'holdings' ? <>
    <div className="finance-holdings-desktop-actions">{commonActions}{primaryAction}</div>
    <div className="finance-holdings-compact-actions">
      {primaryAction && <Button color="primary" pill={false} aria-label={t("添加持仓", "Add holding")} onClick={() => openNewPosition(holdingAccount)}><Plus />{t("添加", "Add")}</Button>}
      <Menu>
        <Menu.Trigger><Button color="secondary" variant="ghost" pill={false} uniform aria-label={t("更多持仓操作", "More holding actions")} title={t("更多持仓操作", "More holding actions")}><DotsHorizontalMoreMenu /></Button></Menu.Trigger>
        <Menu.Content align="end" minWidth={184}>
          {onAsk && data && <Menu.Item className="finance-holdings-menu-item" onSelect={askAboutPage}><Chat />{t("就此页提问", "Ask about this page")}</Menu.Item>}
          <Menu.Item className="finance-holdings-menu-item" onSelect={() => setHidden(!hidden)}>{hidden ? <EyeOff /> : <Eye />}{hidden ? t("显示金额", "Show amounts") : t("隐藏金额", "Hide amounts")}</Menu.Item>
          <Menu.Link as="a" className="finance-holdings-menu-item" href="#settings/connectors"><Link />{t("连接账户", "Connect account")}</Menu.Link>
        </Menu.Content>
      </Menu>
    </div>
  </> : <>{commonActions}{primaryAction}</>;
  return <div ref={root} className={`finance-workspace finance-page-${page}`} data-presentation={presentation}>
    {(page !== 'market' || showOnboarding || !data) && <PageHeading className="finance-page-heading" title={<span className="finance-heading-leading">{navigation}<span>{showOnboarding ? t("财务", "Finance") : presentation === 'mobile' ? getAppNavigation().financeSections.find(item => item.id === page)?.label : sections[page]}</span></span>} action={pageActions} />}
    {error && <div className="finance-error"><Alert color="danger" variant="soft" title={data ? t("最新数据读取未完成", "Latest data could not be loaded") : t("财务数据暂时无法读取", "Financial data is unavailable")} description={data ? t(`${error} 当前保留上次数据。`, `${error} Previous data is retained.`) : error} /><Button color="secondary" variant="outline" pill={false} size="sm" loading={loading} onClick={() => void refresh()}><ArrowRotateCw />{t("重新读取", "Reload")}</Button></div>}
    {notice && createPortal(<div className="finance-notice" role="status"><span>{notice}</span><Button color="secondary" variant="ghost" pill={false} size="sm" uniform aria-label={t("关闭提示", "Dismiss notice")} onClick={()=>setNotice('')}><CloseBold/></Button></div>,document.body)}
    {!data ? !error && <div className="finance-loading" role="status"><LoadingIndicator />{t("正在读取账户…", "Loading accounts…")}</div> : showOnboarding ? <FinanceOnboarding state={data} hidden={hidden} onSaved={state => { applyState(state); if (state.metadata?.onboarding?.completed) go('overview'); }} /> : <>
      {data.officialObservationIssue && <div className="finance-status-message" role="status"><span>{t("部分连接本次读取未完成，保留上次账户数据。", "Some connections could not be refreshed. Previous account data is retained.")}</span><ButtonLink href="#settings/connectors" color="secondary" variant="ghost" pill={false} size="sm">{t("重新连接", "Reconnect")}<ArrowRight /></ButtonLink></div>}
      {page === 'overview' && <>
        {!accountRows.length && !data.liabilities.length ? <EmptyMessage fill="none" className="finance-empty"><EmptyMessage.Icon><CreditCard /></EmptyMessage.Icon><EmptyMessage.Title>{t("从第一个账户开始", "Start with your first account")}</EmptyMessage.Title><EmptyMessage.Description>{t("添加账户余额，或连接已有账户，查看资产与负债。", "Add an account balance or connect an existing account to view your assets and liabilities.")}</EmptyMessage.Description><EmptyMessage.ActionRow><Button color="primary" pill={false} onClick={() => setModal({ type: 'create', kind: 'asset' })}><Plus />{t("添加账户", "Add account")}</Button><ButtonLink href="#settings/connectors" color="secondary" variant="outline" pill={false}>{t("连接账户", "Connect account")}</ButtonLink></EmptyMessage.ActionRow></EmptyMessage> : <>
          <div className="finance-page-toolbar finance-currency-toolbar"><div><SegmentedControl value={filter} onChange={setFilter} size="md" pill={false} aria-label={t("资产汇总币种", "Asset summary currency")}><SegmentedControl.Option value="ALL">{t("全部（", "All (")}{baseCurrency}{t("）", ")")}</SegmentedControl.Option>{availableCurrencies.map(currency => <SegmentedControl.Option key={currency} value={currency}>{currency}</SegmentedControl.Option>)}</SegmentedControl></div><Button color="secondary" variant="ghost" pill={false} size="md" onClick={() => setModal({ type: 'valuation' })}>{t("汇率与折算", "Exchange rates")}<ArrowRight /></Button></div>
          <dl className="finance-metrics"><div><dt>{summary?.assets === null ? t("总资产待折算", "Asset conversion pending") : summary?.reconciliationRequiredAccounts.length ? t("总资产待核对", "Asset reconciliation pending") : t("总资产", "Total assets")}{t("（", " (")}{chosenCurrency}{t("）", ")")}</dt><dd>{money(summary?.assets, hidden)}</dd><small>{summary?.accounts.length} {t(" 个账户", " accounts")}</small></div><button type="button" onClick={() => go('liabilities')} aria-label={t("查看负债与还款", "View liabilities and repayments")}><span className="finance-metric-label">{t("已记录负债（", "Recorded liabilities (")}{chosenCurrency}{t("）", ")")}</span><strong>{money(summary?.liabilities, hidden)}</strong><small>{hidden?t("占比已隐藏", "Share hidden"):percentage(summary?.liabilities,summary?.assets)?t(`占总资产 ${percentage(summary?.liabilities,summary?.assets)}`, `${percentage(summary?.liabilities,summary?.assets)} of total assets`):t(`${summary?.liabilityCount || 0} 项负债`, `${summary?.liabilityCount || 0} liabilities`)}</small></button><div><dt>{summary?.reconciliationRequiredAccounts.length ? t("净资产待核对", "Net worth reconciliation pending") : t("净资产", "Net worth")}{t("（", " (")}{chosenCurrency}{t("）", ")")}</dt><dd>{money(summary?.net, hidden)}</dd><small>{hidden?t("占比已隐藏", "Share hidden"):percentage(summary?.net,summary?.assets)?t(`占总资产 ${percentage(summary?.net,summary?.assets)}`, `${percentage(summary?.net,summary?.assets)} of total assets`):t("资产减已记录负债", "Assets minus recorded liabilities")}</small></div></dl>
          <Panorama state={data} currency={chosenCurrency} nativeCurrency={filter === 'ALL' ? undefined : filter} hidden={hidden} onAccount={id => setModal({ type: 'account', id })} onHolding={openHoldings} />
          <section className="finance-overview-accounts"><div className="finance-section-heading"><h2><CreditCard />{t("账户资产", "Account assets")}</h2><Button color="secondary" variant="ghost" pill={false} size="sm" onClick={() => go('accounts')}>{t("查看全部", "View all")}<ArrowRight /></Button></div>{showAccounts(summary?.accounts || [], true)}</section>
        </>}
        <FinanceDashboard state={data} currency={chosenCurrency} hidden={hidden} onNavigate={navigateDashboard} onSaved={applyState} onAsk={onAsk} onAccount={id=>setModal({type:'account',id})} onHolding={openHoldings} />
      </>}
      {(page === 'accounts' || page === 'liabilities') && <>
        <div className="finance-page-toolbar finance-filter-toolbar finance-list-toolbar"><div className="finance-toolbar-filter"><Select value={typeFilter} options={typeOptions} aria-label={page==='liabilities'?t("筛选负债类型", "Filter liability types"):t("筛选资产类型", "Filter asset types")} onChange={option=>setTypeFilter(option.value)} size="md" pill={false}/></div><div className="finance-toolbar-filter"><Select value={filter} options={[{ value: 'ALL', label: t("全部币种", "All currencies") }, ...availableCurrencies.map(currency => ({ value: currency, label: currency }))]} aria-label={t("筛选账户币种", "Filter account currencies")} onChange={option => setFilter(option.value)} size="md" pill={false} /></div><div className="finance-toolbar-search"><Input value={query} onChange={event => setQuery(event.target.value)} aria-label={page === 'liabilities' ? t("搜索负债", "Search liabilities") : t("搜索账户", "Search accounts")} placeholder={page === 'liabilities' ? t("搜索负债", "Search liabilities") : t("搜索账户", "Search accounts")} startAdornment={<Search />} size="md" /></div></div>
        {page === 'liabilities' && <dl className="finance-data-summary finance-liability-summary"><dt>{t("待偿总额（", "Total outstanding (")}{chosenCurrency}{t("）", ")")}</dt><dd>{money(summary?.liabilities, hidden)}</dd></dl>}
        {listRows.length ? showAccounts(listRows) : <EmptyMessage fill="none" className="finance-empty"><EmptyMessage.Icon><CreditCard /></EmptyMessage.Icon><EmptyMessage.Title>{query || filter !== 'ALL' || typeFilter !== 'ALL' ? t("没有匹配的记录", "No matching records") : page === 'liabilities' ? t("还没有负债记录", "No liabilities yet") : t("还没有账户记录", "No accounts yet")}</EmptyMessage.Title><EmptyMessage.Description>{query || filter !== 'ALL' || typeFilter !== 'ALL' ? t("调整筛选条件后再试。", "Adjust the filters and try again.") : page === 'liabilities' ? t("记录待偿金额、信用卡账单或贷款。", "Record outstanding amounts, credit card balances or loans.") : t("记录常用账户的余额，逐步补齐资产。", "Record balances in your regular accounts and build up your asset overview.")}</EmptyMessage.Description><EmptyMessage.ActionRow>{query || filter !== 'ALL' || typeFilter !== 'ALL' ? <Button color="secondary" variant="outline" pill={false} onClick={() => { setQuery(''); setFilter('ALL'); setTypeFilter('ALL'); }}>{t("清除筛选", "Clear filters")}</Button> : <Button color="primary" pill={false} onClick={() => setModal({ type: 'create', kind: page === 'liabilities' ? 'liability' : 'asset' })}><Plus />{page === 'liabilities' ? t("添加负债", "Add liability") : t("添加资产", "Add asset")}</Button>}</EmptyMessage.ActionRow></EmptyMessage>}
      </>}
      {page === 'transactions' && <Transactions state={data} hidden={hidden} onSaved={applyState} onAsk={onAsk} initialCategory={destination.category} initialMonth={destination.month} initialTab={['transactions','bills','subscriptions'].includes(destination.tab||'')?destination.tab as 'transactions'|'bills'|'subscriptions':'transactions'} />}
      {page === 'planning' && <FinancePlanning state={data} hidden={hidden} onSaved={applyState} onAsk={onAsk} initialTab={['weekly','goals','budgets','scenario','creditRecords','memories'].includes(destination.tab||'')?destination.tab as PlanningTab:'goals'} />}
      {page === 'holdings' && <Holdings state={data} hidden={hidden} initialAccount={holdingAccount} onAccountChange={setHoldingAccount} onEdit={id => setModal({ type: 'position', id })} />}
      {page === 'market' && <Market state={data} onSaved={applyState} market={data.market} positions={positionsFor(data)} accounts={data.accounts} onHolding={openHoldings} hidden={hidden} onRefresh={refreshMarket} officialObservations={data.officialObservations} headerActions={commonActions} headerNavigation={navigation} />}
    </>}
    {presentation === 'mobile' && data && !showOnboarding && <nav className="finance-mobile-navigation" aria-label={t("财务导航", "Finance navigation")}>{getAppNavigation().financeSections.slice(0,4).map(({ id, label, Icon }) => <Button key={id} color="secondary" variant="ghost" pill={false} aria-current={page === id ? 'page' : undefined} onClick={() => go(id as FinanceSection)}><Icon /><span>{label}</span></Button>)}<Menu><Menu.Trigger><Button color="secondary" variant="ghost" pill={false} aria-current={['liabilities','transactions','planning'].includes(page)?'page':undefined} aria-label={t("更多财务页面", "More finance pages")}><DotsHorizontalMoreMenu/><span>{t("更多", "More")}</span></Button></Menu.Trigger><Menu.Content side="top" align="end">{getAppNavigation().financeSections.slice(4).map(({id,label,Icon})=><Menu.Item key={id} onSelect={()=>go(id as FinanceSection)}><Icon/>{label}</Menu.Item>)}</Menu.Content></Menu></nav>}
    {modal && data && <Dialog title={modal.type === 'account' ? activeAccount?.name || t("账户详情", "Account details") : modal.type === 'profile' ? t("资产与账户资料", "Asset and account profile") : modal.type === 'update' ? activeAccount?.kind === 'liability' ? t("更新待偿金额", "Update outstanding amount") : isValuedAssetType(activeAccount?.assetType)?t("更新资产估值", "Update asset valuation"):t("更新账户余额", "Update account balance") : modal.type === 'create' ? modal.kind === 'liability' ? t("添加负债", "Add liability") : t("添加资产或账户", "Add asset or account") : modal.type === 'archived' ? t("已移除账户", "Removed accounts") : modal.type === 'valuation' ? t("汇率与折算", "Exchange rates") : modal.type === 'new-position' ? t("添加持仓", "Add holding") : t("更新持仓", "Update holding")} className="finance-settings finance-detail-dialog" onClose={() => setModal(null)}>
      {modal.type === 'account' && activeAccount && <>
        <div className="finance-account-hero"><BrandIcon id={accountBrand(activeAccount)} size={36} /><div><strong>{money(activeAccount.amount, hidden)} <small>{activeAccount.currency}</small></strong><small>{accountDescription(activeAccount)}</small></div></div>
        <dl className="finance-detail-list"><div><dt>{t("类型", "Type")}</dt><dd>{typeLabel(activeAccount)}</dd></div><div><dt>{t("记录日期", "Record date")}</dt><dd>{date(activeAccount.providerAsOf || activeAccount.asOf)}</dd></div><div><dt>{t("数据来源", "Data source")}</dt><dd>{activeAccount.readOnly ? t("账户连接", "Account connection") : activeAccount.sourceName || t("账户记录", "Account record")}</dd></div>{activeAccount.suffix && <div><dt>{t("账户尾号", "Account ending")}</dt><dd>{hidden ? '••••' : activeAccount.suffix}</dd></div>}{activeAccount.description && <div><dt>{t("说明", "Description")}</dt><dd>{activeAccount.description}</dd></div>}{activeAccount.projection?.estimatedAmount && activeAccount.projection.estimatedAmount !== activeAccount.bookAmount && <div><dt>{t("最近记录余额", "Latest recorded balance")}</dt><dd>{money(activeAccount.bookAmount, hidden)} {activeAccount.currency}</dd></div>}</dl>
        {activeAccount.assetDetails&&<dl className="finance-detail-list"><div><dt>{activeAccount.assetType==='insurance'?t("保单现金价值", "Policy cash value"):t("资产总估值", "Total asset valuation")}</dt><dd>{money(activeAccount.assetDetails.totalValue,hidden)} {activeAccount.currency}</dd></div><div><dt>{t("本人持有份额", "Ownership share")}</dt><dd>{hidden?'••••':`${activeAccount.assetDetails.ownershipPercent}%`}</dd></div><div><dt>{t("归属资产价值", "Owned asset value")}</dt><dd>{money(activeAccount.amount,hidden)} {activeAccount.currency}</dd></div>{activeAccount.assetDetails.acquiredAmount!==null&&<div><dt>{t("购入金额", "Purchase amount")}</dt><dd>{money(activeAccount.assetDetails.acquiredAmount,hidden)} {activeAccount.currency}</dd></div>}{activeAccount.assetDetails.acquiredOn&&<div><dt>{t("购入日期", "Purchase date")}</dt><dd>{date(activeAccount.assetDetails.acquiredOn)}</dd></div>}<div><dt>{t("估值来源", "Valuation source")}</dt><dd>{activeAccount.assetDetails.valuationSource}</dd></div><div><dt>{t("估值日期", "Valuation date")}</dt><dd>{date(activeAccount.assetDetails.valuationAsOf)}</dd></div>{activeAccount.assetDetails.linkedLiabilityIds?.map((id:string)=>{const debt=data.liabilities.find(item=>item.id===id);return debt?<div key={id}><dt>{t("关联负债", "Linked liabilities")}</dt><dd><Button color="secondary" variant="ghost" pill={false} size="sm" onClick={()=>setModal({type:'account',id})}>{debt.name}<ArrowRight/></Button>{money(debt.amount,hidden)} {debt.currency}</dd></div>:null;})}</dl>}
        <AccountSourceDetails state={data} account={activeAccount} hidden={hidden} />
        <div className="finance-detail-actions">{activeAccount.canEditProfile&&<Button color="secondary" variant="outline" pill={false} onClick={()=>setModal({type:'profile',id:activeAccount.id})}>{t("编辑资料", "Edit profile")}</Button>}<Button color="secondary" variant="ghost" pill={false} loading={savingArchive} onClick={()=>void archiveAccount(activeAccount.id,true)}>{t("移出当前账户", "Remove from current accounts")}</Button>{reconcilePosition && <Button color="secondary" variant="outline" pill={false} onClick={() => setModal({ type: 'position', id: reconcilePosition.positionId || reconcilePosition.id })}>{t("核对持仓", "Reconcile holdings")}</Button>}{onAsk && <Button color="secondary" variant="ghost" pill={false} onClick={() => { setModal(null); onAsk({ prompt: t("帮我分析这个账户的资产情况。", "Help me analyze the assets in this account."), section: page, accountIds: [activeAccount.id], snapshot: createFinanceContextSnapshot(data, { section: page, accountIds: [activeAccount.id] }) }); }}><Chat />{t("聊聊这个账户", "Discuss this account")}</Button>}{activeAccount.kind === 'asset' && positionsFor(data).some(item => item.accountId === activeAccount.id) && <Button color="secondary" variant="outline" pill={false} onClick={() => { setModal(null); openHoldings(activeAccount.id); }}>{t("查看持仓", "View holdings")}<ArrowRight /></Button>}{activeAccount.readOnly ? <ButtonLink as="a" href="#settings/connectors" color="secondary" variant="outline" pill={false} onClick={() => setModal(null)}>{t("管理连接", "Manage connections")}</ButtonLink> : <Button color="primary" pill={false} onClick={() => setModal({ type: 'update', id: activeAccount.id })}>{activeAccount.kind === 'liability' ? t("更新待偿金额", "Update outstanding amount") : isValuedAssetType(activeAccount.assetType)?t("更新估值", "Update valuation"):t("更新余额", "Update balance")}</Button>}</div>
      </>}
      {modal.type === 'profile' && activeAccount && <AccountProfileForm key={activeAccount.id} state={data} account={activeAccount} hidden={hidden} onSaved={state=>saved(state,t("资料已保存。", "Profile saved."))}/> }
      {modal.type === 'update' && activeAccount && <AccountForm key={activeAccount.id} state={data} account={activeAccount} hidden={hidden} onSaved={state => saved(state)} />}
      {modal.type === 'create' && modal.continueToPosition && <p className="muted">{t("先添加一个手动账户，再记录持仓。", "Add a manual account first, then record your holdings.")}</p>}
      {modal.type === 'create' && <AccountForm key={modal.kind} state={data} kind={modal.kind} hidden={hidden} displayCurrency={baseCurrency} forPositions={modal.continueToPosition} submitLabel={modal.continueToPosition ? t("添加账户并继续", "Add account and continue") : undefined} onSaved={(state, id) => {
        if (modal.continueToPosition) {
          applyState(state);
          if (!id || !state.accounts.some(account => account.id === id && account.canAddPosition === true)) throw new Error(t("账户已保存，但暂时无法继续添加持仓。请重试确认账户状态。", "The account was saved, but holdings cannot be added yet. Check the account status and try again."));
          setModal({ type: 'new-position', accountId: id });
          setNotice(t("账户已添加。继续记录持仓。", "Account added. Continue with your holdings."));
        } else saved(state);
      }} />}
      {modal.type === 'position' && <PositionEditor key={modal.id} state={data} initialId={modal.id} hidden={hidden} onSaved={async state => { saved(state, t("持仓记录已保存。", "Holding record saved.")); }} />}
      {modal.type === 'new-position' && <NewPositionForm state={data} initialAccount={modal.accountId} onSaved={state => saved(state, t("持仓已添加。", "Holding added."))} />}
      {modal.type === 'archived' && <div className="finance-archived-accounts">{(data.archivedAccounts||[]).map((account:FinanceAccount)=><div key={account.id}><span>{account.name}</span><Button color="secondary" variant="outline" pill={false} size="sm" loading={savingArchive} onClick={()=>void archiveAccount(account.id,false)}>{t("恢复", "Restore")}</Button></div>)}</div>}
      {modal.type === 'valuation' && <>
        <div className="update-form"><label htmlFor="finance-summary-currency">{t("汇总展示币种", "Summary display currency")}</label><Select id="finance-summary-currency" value={baseCurrency} options={currencies} onChange={option => void chooseDisplayCurrency(option.value)} disabled={savingPreference} pill={false} /></div>
        {preferenceError && <p className="form-error" role="alert">{preferenceError}</p>}
        <dl className="finance-detail-list">{(data.valuation?.rates || []).filter(rate => rate.currency !== (rate.baseCurrency || 'CNY')).map(rate => <div key={rate.currency}><dt>1 {rate.currency}</dt><dd>{Number(rate.rate).toLocaleString('zh-CN', { maximumFractionDigits: 6 })} {rate.baseCurrency || 'CNY'}<small>{rate.status === 'stale' ? t("上次报价，", "Previous quote, ") : ''}{date(rate.asOf)}{rate.sourceName ? t(`，${rate.sourceName}`, `, ${rate.sourceName}`) : ''}</small></dd></div>)}</dl>
        {!data.valuation?.complete && <p className="muted">{t("部分汇率待补充，原币余额可继续查看。", "Some exchange rates are missing. Balances remain available in their original currencies.")}</p>}
        {!data.valuation?.rates?.length && <p className="muted">{t("暂无可用折算汇率。", "No exchange rates are available.")}</p>}
      </>}
    </Dialog>}
  </div>;
}
