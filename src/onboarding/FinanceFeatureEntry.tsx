import { useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { CloseBold } from '@openai/apps-sdk-ui/components/Icon';
import { SuggestionRow } from '../design-system/SuggestionRow';
import { financeHref, financeFeatureDismissed, dismissFinanceFeature } from '../finance-navigation-model.mjs';
import { spaceStorageKey } from '../space';
import { t } from '../i18n';
import './finance-feature-entry.css';

export function FinanceFeatureEntry() {
  const key = spaceStorageKey('hither.financeFeatureDismissed.v1');
  const [dismissed, setDismissed] = useState(() => financeFeatureDismissed(localStorage, key));
  if (dismissed) return null;
  return <div className="assistant-example-stories finance-feature-entry"><div className="finance-feature-row">
    <SuggestionRow kind="finance" href={financeHref()}><span className="finance-feature-copy"><span>{t('财务', 'Finance')}</span><Badge color="discovery" variant="soft" size="sm">{t('新增', 'New')}</Badge><span>{t('查看账户与持仓', 'View accounts and holdings')}</span></span></SuggestionRow>
    <Button type="button" color="secondary" variant="ghost" size="sm" uniform className="finance-feature-dismiss" aria-label={t('关闭财务入口', 'Dismiss finance entry')} onClick={() => { dismissFinanceFeature(localStorage, key); setDismissed(true); }}><CloseBold /></Button>
  </div></div>;
}
