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
      <summary>{approval.status === 'approved' ? <Check /> : <CloseBold />}<span>{approval.title}</span><small>{approval.status === 'approved' ? '已允许' : '已拒绝'}</small></summary>
      <p>{approval.description}</p>
      {approval.details && <pre>{approval.details}</pre>}
    </details>;
  }
  return <section className="approval-card">
    <div className="row spread"><h3>{approval.title}</h3><Badge color="warning" size="sm">等你确认</Badge></div>
    <p>{approval.description}</p>
    {approval.details && <details><summary>查看具体操作</summary><pre>{approval.details}</pre></details>}
    <div className="approval-actions">
      <Button color="secondary" variant="outline" disabled={busy} onClick={() => onDecision('reject')}>拒绝</Button>
      <Button color="primary" disabled={busy} onClick={() => onDecision('approve')}><Check />允许这一次</Button>
    </div>
  </section>;
}
