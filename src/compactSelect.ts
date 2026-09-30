import './compactSelect.css';

// Let the menu follow its labels and trigger instead of the SDK's inline 300 px minimum.
export const compactSelectProps = {
  block: false,
  align: 'start',
  alignOffset: 0,
  listWidth: 'auto',
  listMinWidth: 'auto',
  listMaxWidth: 'auto',
  optionClassName: 'compact-select-option',
} as const;
