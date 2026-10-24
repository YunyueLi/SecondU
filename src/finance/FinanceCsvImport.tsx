import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import type { FinanceRecordInput, FinanceTransaction } from '../../shared/finance-journal';
import { financeRequest } from './api';
import { currencies } from './model';
import { categoryLabel } from './journal-categories';
import { CSV_CURRENCIES, MAX_CSV_BYTES, MAX_CSV_TRANSACTIONS, decodeCsvBytes, parseCsv, prepareCsvImport, sha256Hex, suggestCsvMapping, type CsvDateFormat, type CsvDefaults, type CsvDocument, type CsvField, type CsvMapping, type CsvPreview } from './csv-import.mjs';
import type { FinanceState } from './types';
import './FinanceCsvImport.css';
import './finance-data-view.css';

export type FinanceCsvImportProps = { state: FinanceState; onSaved: (state: FinanceState) => void | Promise<void>; onCancel?: () => void };
type SelectedCsv = { name: string; hash: string; document: CsvDocument };
type ImportResult = { createdCount: number; deduplicatedCount: number; replayed?: boolean; state: FinanceState };
const fields: Array<{ key: CsvField; label: string; required?: boolean; fallback?: string }> = [
  { key: 'occurredOn', label: '交易日期', required: true }, { key: 'amount', label: '金额', required: true },
  { key: 'kind', label: '交易类型', fallback: '使用默认类型' }, { key: 'currency', label: '币种', fallback: '使用默认币种' },
  { key: 'merchant', label: '商户' }, { key: 'category', label: '分类' }, { key: 'subcategory', label: '子分类' },
  { key: 'accountId', label: '账户 ID', fallback: '使用默认账户' }, { key: 'toAccountId', label: '转入账户 ID', fallback: '使用默认转入账户' }, { key: 'note', label: '备注' },
];
const typeOptions = [{ value: 'expense', label: '支出（负数为退款）' }, { value: 'income', label: '收入' }, { value: 'transfer', label: '转账（不计收支）' }];
const dateOptions = [
  { value: 'iso', label: '年-月-日，例如 2026-10-24' }, { value: 'ymd-slash', label: '年/月/日，例如 2026/10/24' },
  { value: 'dmy-slash', label: '日/月/年，例如 24/10/2026' }, { value: 'mdy-slash', label: '月/日/年，例如 10/24/2026' },
];
const currencyOptions = CSV_CURRENCIES.map(value => ({ value, label: currencies.find(option => option.value === value)?.label || value }));
const PAGE_SIZE = 50;
const typeLabel = (record: FinanceRecordInput<'transactions'>) => record.kind === 'transfer' ? '转账' : record.kind === 'income' ? '收入' : record.amount?.startsWith('-') ? '退款' : '支出';

export function FinanceCsvImport({ state, onSaved, onCancel }: FinanceCsvImportProps) {
  const formId = useId(), root = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null), mounted = useRef(true), generation = useRef(0), savingLock = useRef(false);
  const [file, setFile] = useState<SelectedCsv | null>(null), [mapping, setMapping] = useState<CsvMapping>({});
  const [defaults, setDefaults] = useState<CsvDefaults>(() => ({ kind: 'expense', currency: CSV_CURRENCIES.includes(state.valuation.currency || state.valuation.baseCurrency || '') ? state.valuation.currency || state.valuation.baseCurrency || 'CNY' : 'CNY', dateFormat: 'iso', accountId: null, toAccountId: null }));
  const [preview, setPreview] = useState<CsvPreview | null>(null), [page, setPage] = useState(0);
  const [reading, setReading] = useState(false), [checking, setChecking] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [saved, setSaved] = useState<ImportResult | null>(null), [refreshFailed, setRefreshFailed] = useState(false);
  const busy = reading || checking || saving;
  const accounts = useMemo(() => [...state.accounts, ...state.liabilities].filter((account, index, rows) => rows.findIndex(item => item.id === account.id) === index), [state.accounts, state.liabilities]);
  const accountOptions = [{ value: '', label: '不关联账户' }, ...accounts.map(account => ({ value: account.id, label: account.name }))];
  const accountName = (id: string | null | undefined) => id ? accounts.find(account => account.id === id)?.name || id : '未关联';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++generation.current; }; }, []);
  useEffect(() => { root.current?.closest('[role="dialog"]')?.scrollTo({ top: 0 }); }, [preview, saved]);

  const chooseFile = async (selected?: File) => {
    if (!selected || savingLock.current) return;
    const request = ++generation.current;
    setReading(true); setError(''); setFile(null); setPreview(null); setSaved(null); setRefreshFailed(false); setPage(0);
    try {
      if (selected.size > MAX_CSV_BYTES) throw new Error('CSV 文件不能超过 20 MB。');
      const bytes = await selected.arrayBuffer();
      const document = parseCsv(decodeCsvBytes(bytes));
      const hash = await sha256Hex(bytes);
      if (!mounted.current || request !== generation.current) return;
      setFile({ name: selected.name, hash, document }); setMapping(suggestCsvMapping(document.headers));
    } catch (failure) {
      if (mounted.current && request === generation.current) setError(failure instanceof Error ? failure.message : 'CSV 读取失败，请重新选择文件。');
    } finally { if (mounted.current && request === generation.current) setReading(false); }
  };
  const changeMapping = (field: CsvField, value: string) => {
    setMapping(previous => { const next = { ...previous }; if (value === '') delete next[field]; else next[field] = Number(value); return next; });
    setError('');
  };
  const changeDefault = <K extends keyof CsvDefaults,>(key: K, value: CsvDefaults[K]) => { setDefaults(previous => ({ ...previous, [key]: value })); setError(''); };
  const review = async () => {
    if (!file || busy) return;
    const request = generation.current;
    setChecking(true); setError('');
    try {
      const result = await prepareCsvImport({ document: file.document, mapping, defaults, fileName: file.name, fileHash: file.hash, accounts });
      if (mounted.current && request === generation.current) { setPreview(result); setPage(0); }
    } catch (failure) { if (mounted.current && request === generation.current) setError(failure instanceof Error ? failure.message : '列映射检查未完成，请重试。'); }
    finally { if (mounted.current && request === generation.current) setChecking(false); }
  };
  const applySaved = async (result: ImportResult) => {
    try { await onSaved(result.state); if (mounted.current) { setRefreshFailed(false); setError(''); } }
    catch { if (mounted.current) { setRefreshFailed(true); setError('交易已保存，列表刷新未完成。请点击“刷新列表”重试。'); } }
  };
  const save = async () => {
    if (!preview || preview.errors.length || !preview.transactions.length || preview.transactions.length > MAX_CSV_TRANSACTIONS || savingLock.current || saved) return;
    savingLock.current = true; setSaving(true); setError('');
    try {
      const result = await financeRequest<ImportResult>('/journal/import', { idempotencyKey: preview.idempotencyKey, transactions: preview.transactions });
      if (!result.state || result.state.revision == null || !Array.isArray(result.state.accounts) || !Array.isArray(result.state.liabilities) || !Number.isInteger(result.createdCount) || result.createdCount < 0 || !Number.isInteger(result.deduplicatedCount) || result.deduplicatedCount < 0 || result.createdCount + result.deduplicatedCount !== preview.transactions.length) throw new Error('保存结果暂未确认，请保持当前预览并重试。');
      if (mounted.current) setSaved(result);
      await applySaved(result);
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : '导入未完成，请重试。'); }
    finally { savingLock.current = false; if (mounted.current) setSaving(false); }
  };
  const columnOptions = file ? file.document.headers.map((header, index) => ({ value: String(index), label: `${index + 1}. ${header || '空表头'}` })) : [];
  const pageRows = preview?.transactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) || [];
  const pageCount = preview ? Math.ceil(preview.transactions.length / PAGE_SIZE) : 0;
  const errorRows = new Set(preview?.errors.map(item => item.row) || []).size;

  return <div ref={root} className="finance-csv-import finance-data-view" aria-busy={busy}>
    <div className="finance-csv-file">
      <div><strong className="finance-data-name">{file ? file.name : '选择交易 CSV'}</strong><p className="finance-data-meta">UTF-8 编码，第一行为列名；最多 {MAX_CSV_TRANSACTIONS.toLocaleString('zh-CN')} 条交易、20 MB。</p></div>
      <input ref={fileInput} id={`${formId}-file`} type="file" accept=".csv,text/csv" className="finance-csv-file-input" aria-label="选择本机 CSV 文件" disabled={busy || Boolean(saved)} onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
      <Button type="button" color="secondary" variant="outline" pill={false} disabled={busy || Boolean(saved)} loading={reading} onClick={() => fileInput.current?.click()}>{file ? '更换文件' : '选择 CSV 文件'}</Button>
    </div>
    {!file && <p className="finance-data-meta">文件只在本机解析，确认后保存到本机财务记录。</p>}
    {file && !preview && <>
      <header className="finance-data-section-heading"><h3>核对列映射</h3><span className="finance-data-meta">{file.document.rows.length} 条交易</span></header>
      <p className="finance-data-meta">精确匹配的标准列名已预选。请逐项核对；未选择的可选字段留空，类型、币种和账户使用下方默认值。</p>
      <div className="finance-csv-mapping">
        {fields.map(field => <div key={field.key} className="finance-csv-field">
          <label htmlFor={`${formId}-${field.key}`}>{field.label}{field.required && <span className="finance-data-meta">（必填）</span>}</label>
          <Select id={`${formId}-${field.key}`} value={mapping[field.key] === undefined ? '' : String(mapping[field.key])} options={[{ value: '', label: field.required ? '请选择 CSV 列' : field.fallback || '不导入该字段' }, ...columnOptions]} onChange={option => changeMapping(field.key, option.value)} disabled={busy} pill={false} />
          {mapping[field.key] !== undefined && <span className="finance-csv-sample finance-data-meta" title={file.document.rows[0]?.cells[mapping[field.key]!] || '空值'}>首行：{file.document.rows[0]?.cells[mapping[field.key]!] || '空值'}</span>}
        </div>)}
      </div>
      <header className="finance-data-section-heading"><h3>格式与默认值</h3></header>
      <div className="finance-csv-defaults">
        <div className="finance-csv-field finance-csv-wide"><label htmlFor={`${formId}-date-format`}>日期格式</label><Select id={`${formId}-date-format`} value={defaults.dateFormat} options={dateOptions} onChange={option => changeDefault('dateFormat', option.value as CsvDateFormat)} disabled={busy} pill={false} /></div>
        <div className="finance-csv-field"><label htmlFor={`${formId}-default-kind`}>默认交易类型</label><Select id={`${formId}-default-kind`} value={defaults.kind} options={typeOptions} onChange={option => changeDefault('kind', option.value as FinanceTransaction['kind'])} disabled={busy} pill={false} /></div>
        <div className="finance-csv-field"><label htmlFor={`${formId}-default-currency`}>默认币种</label><Select id={`${formId}-default-currency`} value={defaults.currency} options={currencyOptions} onChange={option => changeDefault('currency', option.value)} disabled={busy} pill={false} /></div>
        <div className="finance-csv-field"><label htmlFor={`${formId}-default-account`}>默认账户<span className="finance-data-meta">（可选）</span></label><Select id={`${formId}-default-account`} value={defaults.accountId || ''} options={accountOptions} onChange={option => changeDefault('accountId', option.value || null)} disabled={busy} pill={false} /></div>
        <div className="finance-csv-field"><label htmlFor={`${formId}-default-to-account`}>默认转入账户<span className="finance-data-meta">（仅转账）</span></label><Select id={`${formId}-default-to-account`} value={defaults.toAccountId || ''} options={accountOptions} onChange={option => changeDefault('toAccountId', option.value || null)} disabled={busy} pill={false} /></div>
      </div>
      <p className="finance-data-meta">默认值用于未映射或为空的单元格。账户列须填当前空间的账户 ID。支出正数表示消费、负数表示退款；收入和转账须大于零，转账不计入收支。</p>
    </>}
    {preview && <>
      <header className="finance-data-section-heading"><h3>{saved ? '导入结果' : '导入预览'}</h3>{!saved && <Button type="button" color="secondary" variant="ghost" pill={false} size="sm" disabled={busy} onClick={() => { setPreview(null); setError(''); }}>返回列映射</Button>}</header>
      {saved ? <Alert color="success" variant="soft" title="交易已保存" description={saved.replayed ? `本批 ${preview.totalRows} 条交易已导入，未重复新增。` : `新增 ${saved.createdCount} 条，跳过已导入的 ${saved.deduplicatedCount} 条。`} /> : <div className="finance-data-summary"><span>共 {preview.totalRows} 条，{preview.transactions.length} 条通过检查</span>{errorRows > 0 && <span>{errorRows} 行需要修正</span>}</div>}
      {preview.errors.length > 0 && <div className="finance-csv-errors" role="alert"><strong>有 {preview.errors.length} 处错误，整批尚未保存。</strong><ul>{preview.errors.slice(0, 50).map((item, index) => <li key={`${item.row}-${item.field}-${index}`}>第 {item.row} 行{item.field === 'row' ? '' : `，${fields.find(field => field.key === item.field)?.label}`}：{item.message}</li>)}</ul>{preview.errors.length > 50 && <p>当前显示前 50 处错误。修正文件并重新选择后可继续检查其余错误。</p>}</div>}
      {pageRows.length > 0 && <div className="finance-csv-preview" role="region" aria-label="待导入交易预览，可横向滚动" tabIndex={0}><table className="finance-data-table"><colgroup><col className="finance-csv-col-row" /><col className="finance-csv-col-date" /><col className="finance-csv-col-kind" /><col className="finance-csv-col-merchant" /><col className="finance-csv-col-amount" /><col className="finance-csv-col-account" /></colgroup><thead><tr><th scope="col">CSV 行</th><th scope="col">日期</th><th scope="col">类型</th><th scope="col">商户 / 分类</th><th scope="col" className="finance-csv-number">金额</th><th scope="col">账户</th></tr></thead><tbody>{pageRows.map(record => <tr key={record.idempotencyKey}>
        <td className="finance-data-meta">{record.source?.kind === 'import' ? record.source.row : '—'}</td><td>{record.occurredOn}</td><td>{typeLabel(record)}</td>
        <td><span className="finance-data-name">{record.merchant || '—'}</span><span className="finance-csv-secondary finance-data-meta">{[record.category, record.subcategory].filter(Boolean).map(value=>categoryLabel(value)).join(' / ') || '未分类'}</span>{record.note && <span className="finance-csv-secondary finance-data-meta">{record.note}</span>}</td>
        <td className="finance-csv-number"><span className="finance-data-amount">{record.amount}</span><span className="finance-csv-secondary finance-data-meta">{record.currency}</span></td>
        <td>{accountName(record.accountId)}{record.kind === 'transfer' && <span className="finance-csv-secondary finance-data-meta">转入 {accountName(record.toAccountId)}</span>}</td>
      </tr>)}</tbody></table></div>}
      {pageRows.length > 0 && <div className="finance-csv-mobile-preview" role="region" aria-label="待导入交易预览" tabIndex={0}><ul>{pageRows.map(record => <li className="finance-csv-mobile-row finance-data-row" key={record.idempotencyKey}>
        <div className="finance-csv-mobile-date finance-data-meta"><span>{record.occurredOn}</span><span>{typeLabel(record)}</span><span>CSV 第 {record.source?.kind === 'import' ? record.source.row : '—'} 行</span></div>
        <div className="finance-csv-mobile-main"><div><span className="finance-data-name">{record.merchant || '未填写商户'}</span><span className="finance-csv-secondary finance-data-meta">{[record.category, record.subcategory].filter(Boolean).map(value=>categoryLabel(value)).join(' / ') || '未分类'}</span></div><div className="finance-csv-mobile-amount"><span className="finance-data-amount">{record.amount}</span><span className="finance-csv-secondary finance-data-meta">{record.currency}</span></div></div>
        <div className="finance-csv-mobile-account finance-data-meta">账户：{accountName(record.accountId)}{record.kind === 'transfer' && <span>，转入 {accountName(record.toAccountId)}</span>}</div>
        {record.note && <p className="finance-csv-mobile-note finance-data-meta">{record.note}</p>}
      </li>)}</ul></div>}
      {pageCount > 1 && <nav className="finance-csv-pagination" aria-label="预览分页"><Button type="button" color="secondary" variant="ghost" pill={false} size="sm" disabled={page === 0 || busy} onClick={() => setPage(value => value - 1)}>上一页</Button><span className="finance-data-meta">第 {page + 1} / {pageCount} 页</span><Button type="button" color="secondary" variant="ghost" pill={false} size="sm" disabled={page + 1 >= pageCount || busy} onClick={() => setPage(value => value + 1)}>下一页</Button></nav>}
      {!saved && <p className="finance-data-meta">保存时按文件与 CSV 行号核对重复记录。同日同金额的不同记录会分别保留。</p>}
    </>}
    {error && <Alert color="danger" variant="soft" title={saved ? '列表需要刷新' : '导入需要处理'} description={error} />}
    <div className="finance-csv-actions">
      {onCancel && <Button type="button" color="secondary" variant="ghost" pill={false} disabled={busy} onClick={onCancel}>{saved ? '关闭' : '取消'}</Button>}
      {file && !preview && <Button type="button" color="primary" pill={false} loading={checking} disabled={busy || mapping.occurredOn === undefined || mapping.amount === undefined} onClick={() => void review()}>确认映射并预览</Button>}
      {preview && !saved && <Button type="button" color="primary" pill={false} loading={saving} disabled={busy || Boolean(preview.errors.length) || !preview.transactions.length} onClick={() => void save()}>确认导入 {preview.totalRows} 条交易</Button>}
      {saved && refreshFailed && <Button type="button" color="primary" pill={false} onClick={() => void applySaved(saved)}>刷新列表</Button>}
    </div>
  </div>;
}
