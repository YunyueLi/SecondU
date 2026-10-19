import {ButtonLink} from '@openai/apps-sdk-ui/components/Button';
import {ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import {currentSpace} from './space';
import {t} from './i18n';

/** Same-origin entry only. This component never opens a network listener. */
export function MobileAccess({compact = false, className = ''}: {compact?:boolean; className?:string}) {
  return <section className={className} aria-label={t('随身入口', 'Mobile access')}>
    {!compact && <><h3>{t('在另一种屏幕上继续', 'Continue on a smaller screen')}</h3><p className="secondary">{t('用移动布局带来材料、查看任务和继续对话，记录保存在同一台电脑。', 'Bring material, view tasks, and continue chats in the mobile layout. Your records stay on the same computer.')}</p></>}
    <ButtonLink as="a" href={'/mobile.html?space=' + encodeURIComponent(currentSpace())} color="secondary" variant="outline" size="md">{t('打开随身入口', 'Open mobile view')}<ArrowRight/></ButtonLink>
    {!compact && <p className="page-footnote">{t('当前可在本机浏览器使用。手机连接仍需单独配置私有访问；此入口不会自动开放网络。', 'Available in the local browser. A phone needs a separately configured private connection; opening this view does not expose the service.')}</p>}
  </section>;
}
