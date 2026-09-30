import './design-system/settings-type-scale.css';
import { t, getLocale } from './i18n';
import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import type { TaskStatus } from '../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Alert } from '@openai/apps-sdk-ui/components/Alert';
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage';
import { LoadingIndicator } from '@openai/apps-sdk-ui/components/Indicator';
import { Markdown } from '@openai/apps-sdk-ui/components/Markdown';
import { TextLink } from '@openai/apps-sdk-ui/components/TextLink';
import { CloseBold } from '@openai/apps-sdk-ui/components/Icon';
import { LinkChip } from './composer/LinkChip';
import { remarkHitherLinks } from './composer/remarkLinks';
import { StartupScreen } from './StartupScreen';
import { ThemeDecoration, decorationForIllustration, type ThemeDecorationKind } from './themes/ThemeDecoration';

export const taskLabels: Record<TaskStatus, string> = { get queued() { return t("准备开始", "Ready"); }, get running() { return t("进行中", "Running"); }, get needs_input() { return t("等你补充", "Needs input"); }, get awaiting_approval() { return t("等你确认", "Needs approval"); }, get completed() { return t("已完成", "Completed"); }, get failed() { return t("未完成", "Failed"); }, get cancelled() { return t("已停止", "Stopped"); }, get interrupted() { return t("已中断", "Interrupted"); } };
export function TaskBadge({ status }: { status: TaskStatus }) {
  return <Badge color={status === 'failed' ? 'danger' : status === 'awaiting_approval' || status === 'needs_input' ? 'warning' : 'secondary'} size="sm">{taskLabels[status] || status}</Badge>;
}
export function ErrorNotice({ error }: { error?: string | null }) { return error ? <Alert color="danger" variant="soft" title={t("操作未完成", "Action failed")} description={error} /> : null; }
export function Busy({ label = t("正在加载", "Loading") }: { label?: string }) { return <div className="busy-state" role="status"><LoadingIndicator /><span>{label}</span></div>; }
export function Empty({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) { return <EmptyMessage fill="none"><EmptyMessage.Title>{title}</EmptyMessage.Title>{description && <EmptyMessage.Description>{description}</EmptyMessage.Description>}{action && <EmptyMessage.ActionRow>{action}</EmptyMessage.ActionRow>}</EmptyMessage>; }
export function PageHeading({ title, description, compactDescription, illustration, decoration, action, className = '' }: { title: React.ReactNode; description?: React.ReactNode; compactDescription?: string; illustration?: string; decoration?: ThemeDecorationKind; action?: React.ReactNode; className?: string }) {
  const artwork = decoration || decorationForIllustration(illustration);
  return <header className={`page-heading ${illustration || artwork ? 'has-illustration' : ''} ${className}`}>
    <div className="page-heading-intro">{artwork ? <ThemeDecoration kind={artwork} className="page-heading-art"/> : illustration && <img className="page-heading-art" src={illustration} alt="" aria-hidden="true" draggable={false} />}<div className="page-heading-copy"><h1>{title}</h1>{description && <p><span className={compactDescription ? 'page-description-full' : undefined}>{description}</span>{compactDescription && <span className="page-description-compact">{compactDescription}</span>}</p>}</div></div>
    {action && <div className="page-heading-actions">{action}</div>}
  </header>;
}
export function PageToolbar({children,className='',label}:{children:React.ReactNode;className?:string;label?:string}) {
  return <div className={`page-toolbar ${className}`} role="group" aria-label={label}>{children}</div>;
}
const contentComponents = {
  a: ({href,children}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <LinkChip href={href}>{children}</LinkChip>,
  img: ({src,alt}: React.ImgHTMLAttributes<HTMLImageElement>) => <TextLink as="a" href={typeof src==='string'?src:undefined} target="_blank" rel="noopener noreferrer">{alt || t("查看图片", "View image")}</TextLink>,
};
export function RichText({children,className}:{children:string;className?:string}) { return <Markdown className={`rich-text ${className || ''}`} components={contentComponents} remarkPlugins={[remarkHitherLinks]}>{children}</Markdown>; }
export function Dialog({ title, children, onClose, className = '' }: { title: string; children: React.ReactNode; onClose: () => void; className?:string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const shell = document.querySelector<HTMLElement>('.app-shell');
    const wasInert = shell?.inert || false;
    if (shell) shell.inert = true;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex]') || []).filter(el => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest('[inert]'));
    (focusable()[0] || ref.current)?.focus();
    const keys = (event: KeyboardEvent) => {
      // Settings can open a second dialog. Only the topmost dialog owns Escape
      // and the focus loop; closing a child must leave its parent open.
      const dialogs = [...document.querySelectorAll<HTMLElement>('.app-dialog[role="dialog"]')].filter(element => element.getClientRects().length > 0);
      if (dialogs.at(-1) !== ref.current) return;
      // Official Select menus are portalled beside this modal. Let their own
      // keyboard handler close the menu before closing the surrounding form.
      const menuOpen = [...document.querySelectorAll('[data-radix-popper-content-wrapper]')].some(el => el.querySelector('[data-state="open"]'));
      if (menuOpen || event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const elements = focusable(); const first = elements[0]; const last = elements.at(-1);
        if (!first) { event.preventDefault(); ref.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('keydown', keys); if (shell) shell.inert = wasInert; if (opener?.isConnected) opener.focus(); };
  }, []);
  return createPortal(<div className="dialog-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div ref={ref} className={`app-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><header><h2>{title}</h2><Button color="secondary" variant="ghost" uniform aria-label={t("关闭", "Close")} onClick={onClose}><CloseBold /></Button></header>{children}</div></div>, document.body);
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const generatedId = useId();
  const child = React.isValidElement<{id?:string}>(children) ? children : null;
  const id = child?.props.id || generatedId;
  return <div className="form-field"><label className="field-label" htmlFor={id}>{label}</label>{child ? React.cloneElement(child,{id}) : children}{hint && <p className="field-hint">{hint}</p>}</div>;
}
export function when(value?: string) { if (!value) return t("尚未运行", "Never run"); const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(getLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <StartupScreen state="error" message={t("页面暂时无法显示", "This page could not load")} error={t("重新加载后可再次打开。", "Reload the page to try again.")} onRetry={() => location.reload()}/> : this.props.children; }
}
