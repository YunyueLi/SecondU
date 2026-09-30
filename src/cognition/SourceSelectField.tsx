import { createContext, useContext } from 'react';
import { Select, type Option } from '@openai/apps-sdk-ui/components/Select';
import type { Source } from '../../shared/contracts';
import { t } from '../i18n';

const SourceFieldLabel = createContext('');

// Keep this component stable: the SDK uses it inside its focusable trigger.
function SourceSelectionSummary({ values, selectedAll }: { values: Option[]; selectedAll: boolean }) {
  const label = useContext(SourceFieldLabel);
  const selected = values.filter(option => option.value !== '');
  const summary = selected.length === 0
    ? values[0]?.label || t('选择已有资料（可选）', 'Choose sources (optional)')
    : selectedAll
      ? t('已选择全部来源', 'All sources selected')
      : selected.length === 1
        ? selected[0].label
        : t(`已选择 ${selected.length} 项`, `${selected.length} selected`);
  return <><span className="sr-only">{label}{t('：', ': ')}</span>{summary}</>;
}

export function SourceSelectField({ label, sources, value, onChange, disabled = false, placeholder }: {
  label: string;
  sources: ReadonlyArray<Pick<Source, 'id' | 'title'>>;
  value: string[];
  onChange: (sourceIds: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  // SDK 0.2.2 renders an input with value[0] when Select has id/name. An empty
  // selection makes that input uncontrolled. This field has no native form
  // serialization: label the group and trigger directly, and keep the real
  // source IDs exclusively in the existing controlled array.
  return <fieldset className="form-field" disabled={disabled} style={{ display: 'block', minWidth: 0, padding: 0, border: 0 }}>
    <legend className="field-label" style={{ padding: 0, marginBottom: 7 }}>{label}</legend>
    <SourceFieldLabel.Provider value={label}>
      <Select multiple size="md" align="start" listMinWidth={240} listMaxWidth={420}
        disabled={disabled} value={value} options={sources.map(source => ({ value: source.id, label: source.title }))}
        onChange={options => onChange(options.map(option => option.value))}
        placeholder={placeholder || t('选择已有资料（可选）', 'Choose sources (optional)')}
        TriggerView={SourceSelectionSummary} />
    </SourceFieldLabel.Provider>
  </fieldset>;
}
