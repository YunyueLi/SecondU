import { ArrowRight, Check, Clock } from '@openai/apps-sdk-ui/components/Icon';
import type { DevelopmentMilestone } from '../../shared/development-review-types';
import { t } from '../i18n';

export function BuildTimeline({ milestones = [], onSelect }: { milestones?: DevelopmentMilestone[]; onSelect: (id: string) => void }) {
  if (!milestones.length) return null;
  const minutes = Math.max(0, Math.floor((Date.parse(milestones.at(-1)!.at) - Date.parse(milestones[0].at)) / 60000));
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  const day = (at: string) => new Date(at).toLocaleDateString(t('zh-CN', 'en-US'), { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' });
  const time = (at: string) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });
  return <section className="build-timeline" aria-label={t('开发时间线', 'Development timeline')}>
    <header><div><span className="build-timeline-eyebrow">{t('从真实提交看开发进展', 'Progress through real commits')}</span><h2>{t('一个产品，逐步长出来。', 'A product taking shape.')}</h2></div><div className="build-timeline-span"><Clock/><span><strong>{t(`${hours} 小时 ${remainder} 分钟`, `${hours}h ${remainder}m`)}</strong><span>{t(`这 ${milestones.length} 次提交的时间跨度`, `Across these ${milestones.length} commits`)}</span></span></div></header>
    <ol>{milestones.map((item, index) => <li key={item.id}><button type="button" onClick={() => onSelect(item.iteration)}><div className="build-timeline-when"><span className="build-timeline-dot" aria-hidden="true"><Check/></span><time dateTime={item.at}>{day(item.at)} <span>{time(item.at)}</span></time></div><div className="build-timeline-copy"><span className="build-timeline-order">{String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><p>{item.detail}</p><span className="build-timeline-source"><code>{item.commit}</code><ArrowRight/></span></div></button></li>)}</ol>
    <p className="build-timeline-note">{t('时间按北京时间显示，点击查看对应迭代与验证。提交时间不等于工时；后续修改持续记录在下方。', 'Times use China Standard Time. Select a milestone for its evidence. Commit span is not work time; subsequent changes are recorded below.')}</p>
  </section>;
}
