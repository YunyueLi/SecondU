import { useCallback, useEffect, useRef, useState, type AnchorHTMLAttributes } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Markdown } from '@openai/apps-sdk-ui/components/Markdown';
import { ArrowLeft, ArrowRight, ArrowRotateCw, BookOpen, Check, ChevronDown, Clock, Document } from '@openai/apps-sdk-ui/components/Icon';
import type { DevelopmentDocument, DevelopmentReview, ReviewReference, ReviewStatus } from '../../shared/development-review-types';
import { api, messageOf } from '../api';
import { Busy, ErrorNotice, PageHeading } from '../components';
import { t } from '../i18n';
import './development.css';
import { BuildTimeline } from './BuildTimeline';

type ReviewView = 'overview' | 'iterations' | 'evidence' | 'documents';
const statusText = (status: ReviewStatus) => ({
  documented: t('已有记录', 'Documented'), verified: t('范围内已验证', 'Verified in scope'), in_progress: t('正在完善', 'In progress'),
  demo: t('Dev 演示', 'Dev preview'), planned: t('待接入', 'Planned'), failed: t('未通过', 'Failed'), partial: t('部分验证', 'Partly verified'),
})[status];
function Status({ value }: { value: ReviewStatus }) {
  return <Badge color={value === 'failed' ? 'danger' : value === 'verified' ? 'success' : 'secondary'} variant="soft" size="sm" className="development-status">{statusText(value)}</Badge>;
}
function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(t('zh-CN', 'en-US'), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function DevelopmentWorkspace({ onExplore }: { onExplore: () => void }) {
  const [review, setReview] = useState<DevelopmentReview>();
  const [view, setView] = useState<ReviewView>('overview');
  const [refreshing, setRefreshing] = useState(false), [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState<Date>();
  const [stageId, setStageId] = useState(''), [evidenceId, setEvidenceId] = useState('');
  const [iterationId, setIterationId] = useState('');
  const [path, setPath] = useState('DEVELOPMENT.md'), [section, setSection] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [document, setDocument] = useState<DevelopmentDocument>();
  const [documentLoading, setDocumentLoading] = useState(false), [documentError, setDocumentError] = useState('');
  const [documentAttempt, setDocumentAttempt] = useState(0);
  const mounted = useRef(true), inFlight = useRef(false);
  const article = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setRefreshing(true);
    try {
      const next = await api<DevelopmentReview>('/development/review');
      if (mounted.current) { setReview(current => current?.revision === next.revision ? current : next); setCheckedAt(new Date()); setError(''); }
    } catch (err) { if (mounted.current) setError(messageOf(err)); }
    finally { inFlight.current = false; if (mounted.current) setRefreshing(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void refresh();
    const visibleRefresh = () => { if (window.document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(visibleRefresh, 60_000);
    window.addEventListener('focus', visibleRefresh); window.document.addEventListener('visibilitychange', visibleRefresh);
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener('focus', visibleRefresh); window.document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [refresh]);
  useEffect(() => {
    if (view !== 'documents' || !review) return;
    let disposed = false;
    setDocumentLoading(true); setDocumentError('');
    api<DevelopmentDocument>(`/development/documents?path=${encodeURIComponent(path)}`).then(next => { if (!disposed) setDocument(next); }).catch(err => { if (!disposed) setDocumentError(messageOf(err)); }).finally(() => { if (!disposed) setDocumentLoading(false); });
    return () => { disposed = true; };
  }, [path, review?.revision, view, documentAttempt]);
  useEffect(() => {
    if (view !== 'documents' || document?.path !== path || !section) return;
    const anchor = section.replace(/^#/, '');
    const slug = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, '').replace(/\s/g, '-');
    const heading = [...(article.current?.querySelectorAll<HTMLElement>('h1,h2,h3,h4') || [])].find(element => element.id === anchor || slug(element.textContent || '') === anchor || element.textContent?.includes(anchor));
    heading?.scrollIntoView({ block: 'start' });
  }, [document, path, section, view]);

  useEffect(() => {
    if (view === 'iterations' && iterationId) window.document.getElementById(`development-iteration-${iterationId}`)?.scrollIntoView({ block: 'center' });
  }, [iterationId, view]);

  function openDocument(next: string, anchor = '') {
    if (!review?.documents.some(item => item.path === next)) return;
    if (view === 'documents' && path !== next) setHistory(current => [...current, path]);
    setPath(next); setSection(anchor); setView('documents');
  }
  function openEvidence(id: string) { setEvidenceId(id); setView('evidence'); }
  function referenceLink(reference: ReviewReference) {
    return reference.document && review?.documents.some(item => item.path === reference.document)
      ? <Button color="secondary" variant="ghost" size="sm" onClick={() => openDocument(reference.document!, reference.section)}><BookOpen />{t('查看原始记录', 'Read the source')}<ArrowRight /></Button> : null;
  }
  function evidenceLinks(ids?: string[]) {
    return ids?.length ? <div className="development-evidence-links">{ids.map(id => {
      const item = review?.evidence.find(entry => entry.id === id);
      return item ? <button type="button" key={id} onClick={() => openEvidence(id)}><Document />{item.title}<ArrowRight /></button> : null;
    })}</div> : null;
  }
  function docTarget(href: string) {
    if (!href || /^[a-z]+:/i.test(href)) return;
    const url = new URL(href, new URL(path, 'https://second-u-docs.invalid/docs/'));
    if (!url.pathname.startsWith('/docs/')) return;
    const next = decodeURIComponent(url.pathname.slice(6));
    return review?.documents.some(item => item.path === next) ? { path: next, section: decodeURIComponent(url.hash.slice(1)) } : undefined;
  }
  const stage = review?.stages.find(item => item.id === stageId) || review?.stages[0];
  const tabs: { id: ReviewView; label: string }[] = [{ id: 'overview', label: t('评审概览', 'Overview') }, { id: 'iterations', label: t('关键迭代', 'Iterations') }, { id: 'evidence', label: t('验证与边界', 'Evidence & limits') }, { id: 'documents', label: t('完整文档', 'Documents') }];

  return <section className="development-workspace page-content">
    <PageHeading title={t('SecondU 的构建过程', 'Building SecondU')} description={t('沿着产品判断、实现与验证，检查这个个人 Agent 如何成形。', 'Follow the decisions, implementation, and evidence behind this personal agent.')} action={<Button size="sm" color="secondary" variant="outline" onClick={onExplore}>{t('探索产品', 'Explore SecondU')}<ArrowRight /></Button>} />
    <div className="development-review-toolbar"><nav aria-label={t('构建过程视图', 'Build review views')}>{tabs.map(tab => <Button key={tab.id} size="sm" color="secondary" variant={view === tab.id ? 'soft' : 'ghost'} aria-current={view === tab.id ? 'page' : undefined} onClick={() => setView(tab.id)}>{tab.label}</Button>)}</nav><Button size="sm" color="secondary" variant="ghost" loading={refreshing} onClick={() => void refresh()}><ArrowRotateCw />{t('更新记录', 'Refresh')}</Button></div>
    <ErrorNotice error={error} />
    {error && review && <p className="development-stale" role="status">{t('刷新失败，当前显示上次读取的记录。', 'Refresh failed. The last loaded records are still shown.')}</p>}
    {!review ? refreshing ? <Busy label={t('正在读取构建记录', 'Loading build records')} /> : <div className="development-unavailable"><BookOpen /><p>{t('构建记录暂时无法读取。', 'Build records are unavailable.')}</p><Button color="secondary" variant="outline" onClick={() => void refresh()}>{t('重新读取', 'Try again')}</Button></div> : <>
      <div className="development-source-line"><span><Clock />{t('记录更新于 ', 'Records updated ')}{timestamp(review.updatedAt)}{checkedAt && <span className="development-check-time" aria-live="polite">{t('已检查 ', 'Checked ')}{checkedAt.toLocaleTimeString(t('zh-CN', 'en-US'), { hour12: false })}</span>}</span><details><summary>{t('记录来源', 'Record source')}<ChevronDown /></summary><p>{review.source.label}</p><p>{review.source.kind === 'workspace' ? t('从本机项目文档读取。页面可见时每分钟检查更新。', 'Reads local project documents and checks every minute while visible.') : t('读取当前安装包内的文档；新记录需随新版本应用更新。', 'Reads documents in this app package. New records arrive with an updated app.')}</p>{review.baselineCommit && <p>{t('已有提交基线：', 'Committed baseline: ')}<code>{review.baselineCommit}</code></p>}</details></div>

      {view === 'overview' && <div className="development-overview">
        <BuildTimeline milestones={review.milestones} onSelect={id=>{setIterationId(id);setView('iterations');}} />
        <header className="development-thesis"><h2 className="sr-only">{review.title}</h2><p>{review.summary}</p></header>
        <section className="development-loop" aria-labelledby="development-loop-title"><div className="development-section-heading"><h2 id="development-loop-title">{t('从产品判断到本机验收', 'From decisions to local acceptance')}</h2><span>{t('点击查看每一环', 'Select a stage to inspect it')}</span></div>
          <ol className="development-flow">{review.stages.map((item, index) => <li key={item.id}><button type="button" aria-pressed={stage?.id === item.id} onClick={() => setStageId(item.id)}><span className="development-flow-position" aria-hidden="true">{index + 1}</span><strong>{item.title}</strong><Status value={item.status} /></button>{index < review.stages.length - 1 && <ArrowRight className="development-flow-arrow" aria-hidden="true" />}</li>)}</ol>
          {stage && <article className="development-stage-detail"><div><h3>{stage.title}</h3><Status value={stage.status} /></div>{stage.details?.length ? <ul>{stage.details.map(detail => <li key={detail}>{detail}</li>)}</ul> : <p>{stage.summary}</p>}{referenceLink(stage)}</article>}
        </section>
        <section className="development-recent"><div className="development-section-heading"><h2>{t('最近的变化', 'Recent changes')}</h2><Button size="sm" color="secondary" variant="ghost" onClick={() => setView('iterations')}>{t('完整时间线', 'Full timeline')}<ArrowRight/></Button></div><ol>{review.iterations.slice(-3).reverse().map(item=><li key={item.id}><time>{item.date}</time><button type="button" onClick={()=>{setIterationId(item.id);setView('iterations');}}><strong>{item.title}</strong><Status value={item.status}/><ArrowRight/></button></li>)}</ol></section>
        <section className="development-capabilities" aria-labelledby="development-capabilities-title"><div className="development-section-heading"><h2 id="development-capabilities-title">{t('当前可以检查什么', 'What you can inspect')}</h2><Button size="sm" color="secondary" variant="ghost" onClick={() => setView('evidence')}>{t('验证与限制', 'Evidence and limits')}<ArrowRight /></Button></div><div className="development-capability-list">{review.capabilities.map(item => <details key={item.id}><summary><span><strong>{item.title}</strong><span>{item.summary}</span></span><Status value={item.status} /><ChevronDown /></summary><div>{evidenceLinks(item.evidence)}{referenceLink(item)}</div></details>)}</div></section>
        <div className="development-reading-next"><div><h3>{t('这些取舍是怎样形成的？', 'How did these decisions evolve?')}</h3><p>{t('查看关键问题、改动和对应验证。', 'Inspect the key problems, changes, and their evidence.')}</p></div><Button color="secondary" variant="outline" size="sm" onClick={() => setView('iterations')}>{t('查看关键迭代', 'View iterations')}<ArrowRight /></Button></div>
      </div>}

      {view === 'iterations' && <section className="development-iterations"><div className="development-section-heading"><div><h2>{t('关键迭代时间线', 'Key iterations')}</h2><p>{t('保留问题与修正。每次验证仅覆盖对应版本和范围。', 'Problems and corrections stay visible. Evidence applies to its recorded version and scope.')}</p></div></div><ol className="development-timeline">{review.iterations.map(item => <li key={item.id} id={`development-iteration-${item.id}`}><time>{item.date}</time><article><div className="development-iteration-heading"><h3>{item.title}</h3><Status value={item.status} /></div><p>{item.summary}</p><details><summary>{t('检查依据与原文', 'Inspect evidence and source')}<ChevronDown /></summary>{evidenceLinks(item.evidence)}{referenceLink(item)}</details></article></li>)}</ol></section>}

      {view === 'evidence' && <section className="development-verification"><div className="development-section-heading"><div><h2>{t('验证有范围，能力有边界', 'Evidence has a scope')}</h2><p>{t('实现、浏览器、原生窗口与真实外部执行分别记录。', 'Implementation, browser behavior, native windows, and real external execution are recorded separately.')}</p></div></div><div className="development-evidence-list">{review.evidence.map(item => <details key={item.id} open={evidenceId === item.id} onToggle={event => { if (!event.currentTarget.open && evidenceId === item.id) setEvidenceId(''); }}><summary onClick={event => { event.preventDefault(); setEvidenceId(evidenceId === item.id ? '' : item.id); }}><span className={`development-evidence-symbol is-${item.status}`} aria-hidden="true">{item.status === 'verified' ? <Check /> : <Document />}</span><span><strong>{item.title}</strong><span>{item.scope}</span></span><Status value={item.status} /><ChevronDown /></summary><div className="development-evidence-detail"><p>{item.detail}</p>{referenceLink(item)}</div></details>)}</div><section className="development-boundaries"><div className="development-section-heading"><h2>{t('Dev 与尚未交付的部分', 'Dev previews and open work')}</h2></div><div>{review.boundaries.map(item => <article key={item.id}><div><h3>{item.title}</h3><Status value={item.status} /></div><p>{item.detail}</p></article>)}</div></section></section>}

      {view === 'documents' && <div className="development-layout"><nav aria-label={t('项目原始文档', 'Source documents')}>{review.documents.map(item => <button type="button" key={item.path} aria-current={path === item.path ? 'page' : undefined} onClick={() => openDocument(item.path)}>{item.title}<ArrowRight /></button>)}</nav><article ref={article} className="development-document"><div className="development-document-bar"><span><BookOpen />{path}</span>{history.length > 0 && <Button size="sm" color="secondary" variant="ghost" onClick={() => { setPath(history.at(-1)!); setHistory(current => current.slice(0, -1)); setSection(''); }}><ArrowLeft />{t('返回上一篇', 'Back')}</Button>}</div><ErrorNotice error={documentError} />{documentError && <Button size="sm" color="secondary" variant="outline" onClick={()=>setDocumentAttempt(value=>value+1)}>{t('重新读取原文', 'Retry source')}</Button>}{documentLoading && <Busy label={t('正在读取原文', 'Loading source')} />}{document?.path === path && !documentLoading && !documentError && <Markdown className="rich-text" components={{ a: ({ href, children }: AnchorHTMLAttributes<HTMLAnchorElement>) => { const target = docTarget(href || ''); if (target) return <button type="button" className="development-doc-link" onClick={() => openDocument(target.path, target.section)}>{children}</button>; return /^https?:\/\//i.test(href || '') ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span className="development-local-reference" title={href}>{children}</span>; } }}>{document.content}</Markdown>}</article></div>}
    </>}
  </section>;
}
