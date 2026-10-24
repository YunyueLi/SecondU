import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip';
import { ArrowUpRight, CloseBold } from '@openai/apps-sdk-ui/components/Icon';
import { RecommendationIcon } from '../design-system/RecommendationIcon';
import { ServiceIcon } from '../connectors/ConnectorServiceIcon';
import { currentSpace } from '../space';
import { useWorkspaceVisible } from '../shared/WorkspaceVisibility';
import { getLocale, t } from '../i18n';
import { buildHomeSuggestionCandidates, dismissHomeSuggestion, homeSuggestionStorageKey, readHomeDismissals, selectHomeSuggestions, writeHomeDismissals, type HomeSuggestion, type HomeSuggestionData, type HomeSuggestionSource } from './home-suggestions.mjs';
import { homeSourceLabel, homeSuggestionSourcePreview } from './home-source-preview.mjs';
import './home-suggestions.css';

type Props = { data: HomeSuggestionData; disabled?: boolean; persist?: boolean; onDraft: (prompt: string, projectId?: string) => void };
const browserStorage = () => { try { return window.localStorage; } catch { return undefined; } };

export function HomeSuggestions(props: Props) {
  const space = currentSpace();
  return <ScopedHomeSuggestions key={`${space}:${props.persist !== false}`} {...props} space={space}/>;
}

function ScopedHomeSuggestions({ data, disabled, onDraft, space, persist = true }: Props & { space: string }) {
  const storageKey = homeSuggestionStorageKey(space);
  const [dismissed, setDismissed] = useState(() => persist ? readHomeDismissals(browserStorage(), storageKey) : []);
  const [announcement, setAnnouncement] = useState('');
  const [storageError, setStorageError] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  const locale = getLocale();
  const candidates = useMemo(() => buildHomeSuggestionCandidates(data, { locale }), [data, locale]);
  const sourceText = useMemo(() => new Map(data.sources.map(source => [source.id, source.text])), [data.sources]);
  const visible = useMemo(() => selectHomeSuggestions(candidates, dismissed), [candidates, dismissed]);

  useEffect(() => {
    if (!persist) return;
    const synchronize = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setDismissed(readHomeDismissals(browserStorage(), storageKey));
    };
    addEventListener('storage', synchronize);
    return () => removeEventListener('storage', synchronize);
  }, [storageKey, persist]);

  function dismiss(item: HomeSuggestion, index: number) {
    const next = dismissHomeSuggestion(dismissed, item);
    setDismissed(next);
    setStorageError(persist && !writeHomeDismissals(browserStorage(), storageKey, next));
    setAnnouncement(t('已收起这条建议，可以恢复。', 'Suggestion hidden. You can restore it.'));
    requestAnimationFrame(() => {
      const actions = listRef.current?.querySelectorAll<HTMLElement>('.home-suggestion-action');
      (actions?.[Math.min(index, actions.length - 1)] || restoreRef.current)?.focus({ preventScroll: true });
    });
  }
  function restore() {
    setDismissed([]);
    setStorageError(persist && !writeHomeDismissals(browserStorage(), storageKey, []));
    setAnnouncement(t('已恢复收起的建议。', 'Hidden suggestions restored.'));
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('.home-suggestion-action')?.focus({ preventScroll: true }));
  }
  function prepare(item: HomeSuggestion) {
    if (item.action.type !== 'draft') return;
    onDraft(item.action.prompt, item.action.projectId);
    setAnnouncement(t('已加入输入框，发送前可以继续编辑。', 'Added to the composer. You can edit it before sending.'));
  }

  return <section className="home-suggestions" aria-label={data.profile.demo ? t('示例任务', 'Example tasks') : t('建议与任务入口', 'Suggestions and task starters')}>
    {visible.length > 0 ? <ul ref={listRef} className="home-suggestions-list">
      {visible.map((item, index) => <HomeSuggestionRow key={item.id} item={item} disabled={disabled} sourceText={sourceText} onPrepare={() => prepare(item)} onDismiss={() => dismiss(item, index)}/>)}
    </ul> : <p className="home-suggestions-empty">{t('这些建议已收起。你仍然可以直接输入，或恢复建议。', 'These suggestions are hidden. Type your own request or restore them.')}</p>}
    {dismissed.length > 0 && <div className="home-suggestions-restore-row"><Button ref={restoreRef} type="button" color="secondary" variant="ghost" size="sm" className="home-suggestions-restore" onClick={restore}>{t('恢复已收起', 'Restore hidden')}</Button></div>}
    {storageError && <p className="home-suggestions-storage-note" role="status">{t('当前窗口已更新，暂时无法保存这项偏好。', 'Updated in this window, but this preference could not be saved.')}</p>}
    <span className="home-suggestions-announcement" role="status" aria-live="polite">{announcement}</span>
  </section>;
}

function suggestionReference(item: HomeSuggestion) {
  const source = item.sources.find(source => source.external)
    || item.sources.find(source => source.kind === 'project')
    || item.sources.find(source => source.kind === 'source')
    || item.sources[0];
  if (!source) return undefined;
  return { source, label: homeSourceLabel(source) };
}

function HomeSuggestionRow({ item, disabled, sourceText, onPrepare, onDismiss }: {
  item: HomeSuggestion; disabled?: boolean; sourceText: ReadonlyMap<string, string>; onPrepare: () => void; onDismiss: () => void;
}) {
  const [preview, setPreview] = useState<'prompt' | 'source' | null>(null);
  const workspaceVisible = useWorkspaceVisible();
  const reference = suggestionReference(item);
  const body = reference?.source.kind === 'task' && item.title.endsWith(reference.label) ? item.title.slice(0, -reference.label.length).replace(/[：:\s]+$/, '') : item.title;
  useEffect(() => { if (!workspaceVisible) setPreview(null); }, [workspaceVisible]);
  function changePreview(kind: 'prompt' | 'source', open: boolean) {
    setPreview(current => open && workspaceVisible ? kind : current === kind ? null : current);
  }
  function prepare() { setPreview(null); onPrepare(); }
  return <li className="home-suggestion-row" data-suggestion-kind={item.kind} data-preview={preview || undefined}>
    <Popover open={preview === 'prompt' && workspaceVisible} onOpenChange={open => changePreview('prompt', open)} showOnHover hoverOpenDelay={300}>
      <Popover.Trigger onClick={event => { if (item.action.type === 'draft') event.preventDefault(); }}>
        {item.action.type === 'navigate' ? <ButtonLink href={item.action.href} color="secondary" variant="ghost" size="sm" pill={false} className="home-suggestion-action" aria-label={`${item.action.label}${t('：', ': ')}${item.title}`} onClick={() => setPreview(null)}><span className="home-suggestion-sr-only">{item.title}</span></ButtonLink>
          : <Button type="button" color="secondary" variant="ghost" size="sm" pill={false} className="home-suggestion-action" aria-label={item.title} disabled={disabled} onClick={prepare}><span className="home-suggestion-sr-only">{item.title}</span></Button>}
      </Popover.Trigger>
      <SuggestionPreview text={item.previewPrompt} kind="prompt"/>
    </Popover>
    <SuggestionIdentity item={item} source={reference?.source}/>
    <div className="home-suggestion-copy">
      {reference && <><span className="home-suggestion-reference">
        <Popover open={preview === 'source' && workspaceVisible} onOpenChange={open => changePreview('source', open)} showOnHover hoverOpenDelay={300}>
          <Popover.Trigger><Button type="button" color="secondary" variant="ghost" size="sm" pill={false} className="home-suggestion-context-trigger" title={reference.source.title} aria-label={t(`查看来源：${reference.source.title}`, `View source: ${reference.source.title}`)} onPointerEnter={() => setPreview(current => current === 'prompt' ? null : current)}><span className="home-suggestion-source-name">{reference.label}</span></Button></Popover.Trigger>
          <SuggestionPreview text={homeSuggestionSourcePreview(item, reference.source, sourceText)} kind="source"/>
        </Popover>
        <SourceDestination source={reference.source}/>
      </span>{' '}</>}
      <span className="home-suggestion-body" aria-hidden="true">{body}</span>
    </div>
    <Tooltip content={t('暂不显示这条建议', 'Hide this suggestion')} compact>
      <Button type="button" color="secondary" variant="ghost" size="sm" uniform className="home-suggestion-dismiss" aria-label={t(`收起建议：${item.title}`, `Hide suggestion: ${item.title}`)} onPointerEnter={() => setPreview(null)} onClick={onDismiss}><CloseBold/></Button>
    </Tooltip>
  </li>;
}

function SuggestionIdentity({ item, source }: { item: HomeSuggestion; source?: HomeSuggestionSource }) {
  const link = source?.external;
  if (link?.brand) return <Tooltip content={t(`在 ${link.label} 打开`, `Open in ${link.label}`)} compact>
    <a className="home-suggestion-icon home-suggestion-icon-link" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={t(`在 ${link.label} 打开来源（新窗口）`, `Open source in ${link.label} (new window)`)}><ServiceIcon service={{ id: link.brand, name: link.label }}/></a>
  </Tooltip>;
  const kind = item.iconKind || (source?.kind === 'project' ? 'organize' : source?.kind === 'task' ? 'chat' : source?.kind === 'goal' ? 'calendar' : 'file');
  return <span className="home-suggestion-icon" aria-hidden="true"><RecommendationIcon kind={kind}/></span>;
}

function SourceDestination({ source }: { source: HomeSuggestionSource }) {
  const external = source.external;
  const label = external ? t(`在 ${external.label} 打开`, `Open in ${external.label}`) : t(`打开来源：${source.title}`, `Open source: ${source.title}`);
  return <Tooltip content={label} compact><a className="home-suggestion-source-destination" href={external?.href || source.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} aria-label={external ? `${label}${t('（新窗口）', ' (new window)')}` : label}><ArrowUpRight aria-hidden="true"/></a></Tooltip>;
}

function SuggestionPreview({ text, kind }: { text: string; kind: 'prompt' | 'source' }) {
  return <Popover.Content side="top" align="center" sideOffset={12} width={500} minWidth="auto" className={`home-suggestion-popover home-suggestion-${kind}-popover`} autoFocus={false}>
    <SuggestionPreviewText text={text} kind={kind}/>
  </Popover.Content>;
}

function SuggestionPreviewText({ text, kind }: { text: string; kind: 'prompt' | 'source' }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(false);
  function updateFade() {
    const element = scrollRef.current;
    if (element) setFade(element.scrollHeight - element.scrollTop - element.clientHeight > 2);
  }
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(updateFade);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    updateFade();
    return () => observer.disconnect();
  }, [text]);
  return <div className="home-suggestion-preview" data-overflow={fade || undefined}>
    <div ref={scrollRef} className="home-suggestion-popover-scroll" tabIndex={0} role="region" aria-label={kind === 'prompt' ? t('完整请求', 'Full request') : t('来源摘录', 'Source excerpt')} onScroll={updateFade}>
      <p className="home-suggestion-preview-text">{text}</p>
    </div>
  </div>;
}
