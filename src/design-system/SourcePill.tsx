import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Document } from '@openai/apps-sdk-ui/components/Icon';

export function SourcePill({ title, compact = false, onOpen }: { title: string; compact?: boolean; onOpen: () => void }) {
  return <Button className="source-pill" color="secondary" variant="ghost" size="sm" title={title} aria-label={`查看来源：${title}`} onClick={onOpen}>
    <Document aria-hidden="true" /><span className="source-pill-label">{compact ? '来源' : title}</span>
  </Button>;
}
