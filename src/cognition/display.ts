import { t } from '../i18n';
// Normalize only this known label from the original authored demo. Imported text is unchanged.
export const displayRole = (role: string) => role === '我 · 虚构示例' ? t('我（虚构示例）', 'Me (fictional sample)') : role;
