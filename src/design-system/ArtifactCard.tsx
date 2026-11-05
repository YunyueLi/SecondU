import { t } from '../i18n';
import { useMemo } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { ArrowRight } from '@openai/apps-sdk-ui/components/Icon';
import type { Artifact } from '../../shared/contracts';
import { ArtifactThumbnail } from '../artifacts/ArtifactPreview';
import { artifactContentSize, artifactDisplayName, artifactFormat, fileSizeLabel } from '../artifacts/format.mjs';

export function ArtifactCard({ artifact, onOpen }: {
  artifact: Pick<Artifact, 'name' | 'version' | 'reviewStatus'> & Partial<Pick<Artifact, 'type' | 'content' | 'size' | 'mime' | 'encoding' | 'teamOrigin'>>;
  onOpen: () => void;
}) {
  const format = artifactFormat(artifact);
  const name = artifactDisplayName(artifact);
  const bytes = useMemo(() => artifactContentSize(artifact), [artifact.name, artifact.type, artifact.content, artifact.size, artifact.mime, artifact.encoding]);
  return <Button color="secondary" variant="outline" pill={false} className="artifact-message-card" onClick={onOpen} aria-label={t(`打开文件 ${name}`, `Open file ${name}`)}>
    <ArtifactThumbnail artifact={artifact}/><span className="artifact-card-copy"><strong title={name}>{name}</strong><small><span className="inline-metadata"><span>{format.label}</span>{bytes !== undefined && <span>{fileSizeLabel(bytes)}</span>}<span>{t(`第 ${artifact.version} 版`, `Version ${artifact.version}`)}</span>{artifact.reviewStatus === 'pending' && <span>{t('待验收', 'Needs review')}</span>}</span></small></span><ArrowRight className="artifact-card-arrow"/>
  </Button>;
}
