// Settings swatches, runtime colors and server validation use the same choices.
export const appearanceAccentOptions = Object.freeze([
  { id: 'graphite', labelZh: '石墨', labelEn: 'Graphite', color: '#595b64' },
  { id: 'blue', labelZh: '湖蓝', labelEn: 'Lake blue', color: '#347bf5' },
  { id: 'violet', labelZh: '鸢尾', labelEn: 'Iris', color: '#8164cb' },
  { id: 'green', labelZh: '苔绿', labelEn: 'Moss', color: '#56826b' },
  { id: 'teal', labelZh: '青绿', labelEn: 'Teal', color: '#219f97' },
  { id: 'amber', labelZh: '暖金', labelEn: 'Amber', color: '#c08b31' },
  { id: 'spectrum', labelZh: '多彩', labelEn: 'Spectrum', color: '#9670e8', swatch: 'linear-gradient(135deg, #3988ff, #9664ec 30%, #e46aa6 55%, #d49c40 78%, #32a99a)' },
]);

const spectrumStops = Object.freeze([
  { offset: '0%', color: '#3988ff' },
  { offset: '30%', color: '#9664ec' },
  { offset: '55%', color: '#e46aa6' },
  { offset: '78%', color: '#d49c40' },
  { offset: '100%', color: '#32a99a' },
]);
export const activityPaletteOptions = Object.freeze([
  { id: 'theme', labelZh: '跟随强调色', labelEn: 'Follow accent', color: 'var(--hither-accent)' },
  { id: 'graphite', labelZh: '石墨', labelEn: 'Graphite', color: 'var(--color-text-secondary)' },
  { id: 'violet', labelZh: '紫罗兰', labelEn: 'Violet', color: '#9670e8' },
  { id: 'teal', labelZh: '青绿', labelEn: 'Teal', color: '#219f97' },
  { id: 'amber', labelZh: '暖金', labelEn: 'Amber', color: '#c08b31' },
  { id: 'spectrum', labelZh: '多彩', labelEn: 'Spectrum', color: `linear-gradient(135deg, ${spectrumStops.map(stop => `${stop.color} ${stop.offset}`).join(', ')})`, stops: spectrumStops },
]);

export const activityEffectOptions = Object.freeze([
  { id: 'off', labelZh: '关闭', labelEn: 'Off' },
  { id: 'subtle', labelZh: '柔和', labelEn: 'Subtle' },
  { id: 'expressive', labelZh: '鲜明', labelEn: 'Expressive' },
]);

export const defaultAppearance = Object.freeze({
  theme: 'system', atmosphere: 'pencil', decorativeArtwork: false, accent: 'spectrum',
  activityEffect: 'subtle',
  opacity: 96, fontSize: 14, motion: 'system', sendKey: 'enter', language: 'zh-CN',
});

export const appearanceChoices = Object.freeze({
  theme: ['light', 'dark', 'system'], atmosphere: ['plain', 'pencil', 'tidal', 'night', 'custom'],
  decorativeArtwork: [true, false], accent: appearanceAccentOptions.map(option => option.id),
  activityEffect: activityEffectOptions.map(option => option.id), activityPalette: activityPaletteOptions.map(option => option.id),
  motion: ['system', 'reduced'], sendKey: ['enter', 'modifier'], language: ['zh-CN', 'en'],
});
export const appearanceRanges = Object.freeze({ opacity: [70, 100], fontSize: [12, 18] });

export function isAppearanceAccent(value) { return typeof value === 'string' && (appearanceAccentOptions.some(option => option.id === value) || /^#[0-9a-f]{6}$/i.test(value)); }
export function appearanceAccentColor(value) { return appearanceAccentOptions.find(option => option.id === value)?.color ?? (isAppearanceAccent(value) ? value.toLowerCase() : '#347bf5'); }
