import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { t, useLocale } from '../i18n';
import { ProfessionalNetwork } from './ProfessionalNetwork';
import { DatingNetwork } from './DatingNetwork';
import './future-network.css';

export function FutureNetwork(_props: { navigation?: ReactNode } = {}) {
  const locale = useLocale();
  const [mode, setMode] = useState('work');
  return <section className="future-network network-v2" aria-label={t('Agent 网络演示', 'Agent network demo')}>
    <div className="network-mode-bar"><SegmentedControl value={mode} onChange={setMode} size="sm" aria-label={t('网络用途', 'Network purpose')}><SegmentedControl.Option value="work">{t('找专业能力', 'Find expertise')}</SegmentedControl.Option><SegmentedControl.Option value="meet">{t('认识新朋友', 'Meet someone')}</SegmentedControl.Option></SegmentedControl><p>{t('人物与互动均为虚构，操作只在本页生效。', 'Fictional people and interactions. Actions stay on this page.')}</p></div>
    {mode === 'work' ? <ProfessionalNetwork key={`work-${locale}`} /> : <DatingNetwork key={`meet-${locale}`} />}
  </section>;
}

export default FutureNetwork;
