import { t } from '../i18n';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Document, ArrowRight } from '@openai/apps-sdk-ui/components/Icon';
import type { Artifact } from '../../shared/contracts';

export function ArtifactCard({ artifact, onOpen }: {
  artifact: Pick<Artifact, 'name' | 'version' | 'reviewStatus'>;
  onOpen: () => void;
}) {
  return <Button color="secondary" variant="outline" pill={false} className="artifact-message-card" onClick={onOpen}>
    <Document /><span><strong>{artifact.name}</strong><small>{t(`第 ${artifact.version} 版，`, `Version ${artifact.version}, `)}{artifact.reviewStatus === 'pending' ? t("待验收", "Needs review") : t("可预览和编辑", "Preview and edit")}</small></span><ArrowRight />
  </Button>;
}
