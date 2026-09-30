import { useId, useState } from 'react';
import { DateTime } from 'luxon';
import { DatePicker } from '@openai/apps-sdk-ui/components/DatePicker';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { t, useLocale } from '../i18n';
import './record-forms.css';

type Precision = 'day' | 'month' | 'year';

/** Keep date-only strings local, and never invent a day for a partial historical date. */
export function RecordDateInput({ id, value, onChange, disabled, allowPartial = false, required = false }: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  allowPartial?: boolean;
  required?: boolean;
}) {
  const generatedId = useId();
  const locale = useLocale();
  const [precision, setPrecision] = useState<Precision>(value.length === 4 ? 'year' : value.length === 7 ? 'month' : 'day');
  const mode = allowPartial ? precision : 'day';
  const parsed = value.length === 10 ? DateTime.fromISO(value, { locale }) : null;
  const date = parsed?.isValid ? parsed : null;
  const changePrecision = (next: Precision) => {
    setPrecision(next);
    if (next === 'year') onChange(value.slice(0, 4));
    else if (next === 'month') onChange(value.slice(0, 7));
    else if (value.length !== 10) onChange('');
  };
  return <div className={`record-date-input ${allowPartial ? 'has-precision' : ''}`}>
    {allowPartial && <Select aria-label={t('日期精度', 'Date precision')} size="md" block={false} align="start" triggerClassName="record-date-precision" listWidth="auto" listMinWidth={120} listMaxWidth={180} value={mode} disabled={disabled} onChange={option => changePrecision(option.value as Precision)} options={[{ value: 'day', label: t('具体日期', 'Exact date') }, { value: 'month', label: t('只知年月', 'Month only') }, { value: 'year', label: t('只知年份', 'Year only') }]} />}
    {mode === 'day' ? <DatePicker id={id || generatedId} value={date} onChange={next => onChange(next?.toISODate() || '')} disabled={disabled} triggerClassName="record-date-trigger" triggerDateFormat={locale === 'en' ? 'MMM d, yyyy' : 'yyyy 年 M 月 d 日'} placeholder={t('选择日期', 'Choose date')} align="start" alignOffset={0} block={false} pill={false} size="md" clearable={!required} /> : <Input id={id || generatedId} size="md" className="record-partial-date" inputMode="numeric" value={value} required={required} disabled={disabled} maxLength={mode === 'year' ? 4 : 7} pattern={mode === 'year' ? '[0-9]{4}' : '[0-9]{4}-(0[1-9]|1[0-2])'} placeholder={mode === 'year' ? '2020' : '2020-06'} onChange={event => onChange(event.target.value)} />}
  </div>;
}
