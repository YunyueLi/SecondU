import { t } from '../i18n';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Document } from '@openai/apps-sdk-ui/components/Icon';

export function SourcePill({ title, compact = false, onOpen }: { title: string; compact?: boolean; onOpen: () => void }) {
  return <Button className="source-pill" color="secondary" variant="ghost" size="sm" title={title} aria-label={t(`查看来源：${title}`, `View source: ${title}`)} onClick={onOpen}>
    <Document aria-hidden="true" /><span className="source-pill-label">{compact ? t("来源", "Source") : title}</span>
  </Button>;
}
