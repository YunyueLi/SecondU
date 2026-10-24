import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Desktop, ArrowRight } from '@openai/apps-sdk-ui/components/Icon';
import type { Bootstrap } from '../../shared/contracts';
import { t } from '../i18n';

/** The current local destination; opening this control never changes task routing. */
export function ComputerContext({ computer }: { computer: Bootstrap['computer'] }) {
  return <Popover><Popover.Trigger><Button type="button" color="secondary" variant="ghost" size="sm" uniform className="composer-computer-trigger" aria-label={t('运行电脑：本机', 'Execution computer: this computer')} title={t('本机', 'This computer')}><Desktop/></Button></Popover.Trigger><Popover.Content side="bottom" align="end" width={280} minWidth="auto" className="composer-computer-popover">
    <strong>{computer.name}</strong>
    <p>{computer.status !== 'online' ? t('本机当前离线', 'This computer is offline') : computer.codexAvailable ? t('本机运行组件已就绪', 'Local runtime is ready') : t('本机运行组件尚未就绪', 'Local runtime is not ready')}</p>
    <ButtonLink as="a" href="#settings/computer" color="secondary" variant="ghost" size="sm">{t('管理电脑', 'Manage computers')}<ArrowRight/></ButtonLink>
  </Popover.Content></Popover>;
}
