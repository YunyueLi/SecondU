import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Document, ArrowRight } from '@openai/apps-sdk-ui/components/Icon';
import type { Artifact } from '../../shared/contracts';

export function ArtifactCard({ artifact, onOpen }: {
  artifact: Pick<Artifact, 'name' | 'version' | 'reviewStatus'>;
  onOpen: () => void;
}) {
  return <Button color="secondary" variant="outline" pill={false} className="artifact-message-card" onClick={onOpen}>
    <Document /><span><strong>{artifact.name}</strong><small>第 {artifact.version} 版 · {artifact.reviewStatus === 'pending' ? '待验收' : '可预览和编辑'}</small></span><ArrowRight />
  </Button>;
}
