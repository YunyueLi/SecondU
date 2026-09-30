import { t } from '../i18n';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Check, CloseBold } from '@openai/apps-sdk-ui/components/Icon';
import type { Approval } from '../../shared/contracts';

export function TaskApproval({ approval, busy = false, onDecision }: {
  approval: Approval;
  busy?: boolean;
  onDecision: (decision: 'approve' | 'reject') => void;
}) {
  if (approval.status !== 'pending') {
    return <details className="approval-history">
      <summary>{approval.status === 'approved' ? <Check /> : <CloseBold />}<span>{approval.title}</span><small>{approval.status === 'approved' ? t("已允许", "Approved") : t("已拒绝", "Rejected")}</small></summary>
      <p>{approval.description}</p>
      {approval.details && <pre>{approval.details}</pre>}
    </details>;
  }
  return <section className="approval-card">
    <div className="row spread"><h3>{approval.title}</h3><Badge color="warning" size="sm">{t("等你确认", "Awaiting approval")}</Badge></div>
    <p>{approval.description}</p>
    {approval.details && <details><summary>{t("查看具体操作", "View action details")}</summary><pre>{approval.details}</pre></details>}
    <div className="approval-actions">
      <Button color="secondary" variant="outline" disabled={busy} onClick={() => onDecision('reject')}>{t("拒绝", "Reject")}</Button>
      <Button color="primary" disabled={busy} onClick={() => onDecision('approve')}><Check />{t("允许这一次", "Allow once")}</Button>
    </div>
  </section>;
}
