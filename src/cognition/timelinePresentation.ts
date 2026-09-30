import { t, getLocale } from '../i18n';
import { apiUrl } from '../api';

export const timelineCategoryOptions = () => [
  { value: 'life', label: t('生活', 'Life') },
  { value: 'education', label: t('学习', 'Education') },
  { value: 'career', label: t('工作', 'Work') },
  { value: 'project', label: t('项目', 'Projects') },
  { value: 'community', label: t('关系与社区', 'People and community') },
  { value: 'personal_note', label: t('个人成长', 'Personal growth') },
];

export const timelinePlatformOptions = () => [
  { value: 'hither', label: 'SecondU' }, { value: 'wechat', label: t('微信', 'WeChat') },
  { value: 'photos', label: t('相册', 'Photos') }, { value: 'notes', label: t('备忘录', 'Notes') },
  { value: 'instagram', label: 'Instagram' }, { value: 'xiaohongshu', label: t('小红书', 'Xiaohongshu') },
  { value: 'weibo', label: t('微博', 'Weibo') }, { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'imessage', label: 'iMessage' }, { value: 'telegram', label: 'Telegram' },
  { value: 'qq', label: 'QQ' }, { value: 'wecom', label: t('企业微信', 'WeCom') },
  { value: 'feishu', label: t('飞书', 'Feishu') }, { value: 'dingtalk', label: t('钉钉', 'DingTalk') },
  { value: 'slack', label: 'Slack' }, { value: 'teams', label: 'Teams' },
  { value: 'discord', label: 'Discord' }, { value: 'signal', label: 'Signal' },
  { value: 'line', label: 'LINE' }, { value: 'messenger', label: 'Messenger' },
  { value: 'other', label: t('其他来源', 'Other source') },
];

export const timelinePlatformLabel = (platform: string) => timelinePlatformOptions().find(item => item.value === platform)?.label || platform;
export const timelineCategoryLabel = (category: string) => timelineCategoryOptions().find(item => item.value === category)?.label || category;

export function fullTimelineDate(value: string) {
  const [year, month, day] = value.split('-');
  if (!month) return getLocale() === 'en' ? year : `${year}年`;
  if (getLocale() === 'en') return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', ...(day ? { day: 'numeric' as const } : {}) }).format(new Date(Number(year), Number(month) - 1, Number(day || 1)));
  return `${year}年${Number(month)}月${day ? `${Number(day)}日` : ''}`;
}

export function timelinePhotoUrl(id: string) {
  return /^attachment-[a-f0-9-]{36}$/.test(id) ? apiUrl(`/attachments/${encodeURIComponent(id)}`) : undefined;
}
