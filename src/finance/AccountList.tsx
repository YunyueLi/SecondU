import { t, useLocale } from '../i18n';
import { ChevronRight } from '@openai/apps-sdk-ui/components/Icon';
import { BrandIcon } from './BrandIcon';
import './AccountList.css';
import './finance-data-view.css';

export type AccountListRow = {
  id: string;
  name: string;
  brand?: string;
  description: string;
  suffix?: string;
  currency: string;
  amount: string;
  meta: string;
  share: string | null;
};
type Props = { rows: readonly AccountListRow[]; hidden: boolean; onSelect: (id: string) => void; variant?: 'full' | 'compact'; headingLabel?: string };
const shortShare = (value: string) => value.match(/(?:[<>≤≥]?\s*[+−-]?\d+(?:\.\d+)?|[•●*]+)\s*%/)?.[0].trim() || value;

export function AccountList({ rows, hidden, onSelect, variant = 'full', headingLabel = t("账户", "Account") }: Props) {
  useLocale();
  return <div className={`finance-account-list finance-account-list-${variant} finance-data-view`}>
    {variant === 'full' && <div className="finance-account-columns finance-data-columns" aria-hidden="true"><span>{headingLabel}</span><span>{t("类型", "Type")}</span><span>{t("更新状态", "Update status")}</span><span>{t("金额", "Amount")}</span><span>{t("占比", "Share")}</span><span /></div>}
    <ul className="finance-account-rows" aria-label={t(`${headingLabel}列表`,`${headingLabel} list`)}>
      {rows.map(row => {
        const amount = hidden ? '••••' : row.amount;
        const share = row.share ? hidden ? '•••%' : shortShare(row.share) : null;
        const suffix = row.suffix ? hidden ? '••••' : row.suffix : null;
        const label = [t(`查看${row.name}详情`,`View ${row.name} details`), row.description, suffix ? t(`尾号 ${suffix}`,`Ending ${suffix}`) : '', row.meta, hidden ? t("金额与占比已隐藏", "Amounts and shares hidden") : `${amount} ${row.currency}`, !hidden ? row.share : ''].filter(Boolean).join(t('，',', '));
        return <li key={row.id}><button type="button" className="finance-account-row finance-data-row" onClick={() => onSelect(row.id)} aria-label={label}>
          <BrandIcon id={row.brand || row.id} size={28} />
          <span className="finance-account-identity"><strong className="finance-data-name">{row.name}</strong>{suffix && <small className="finance-data-meta">{t("尾号 ", "Ending ")}{suffix}</small>}</span>
          <span className="finance-account-type">{row.description}</span>
          <span className="finance-account-status finance-data-meta">{row.meta}</span>
          <span className="finance-account-money"><strong className="finance-data-amount">{amount}</strong><small className="finance-data-meta">{row.currency}</small></span>
          <span className="finance-account-share finance-data-meta" title={hidden ? undefined : row.share || undefined}>{share || '—'}</span>
          <ChevronRight className="finance-account-arrow" aria-hidden="true" />
        </button></li>;
      })}
    </ul>
    {!rows.length && <p className="finance-account-empty">{t("没有找到对应账户。", "No matching accounts.")}</p>}
  </div>;
}
