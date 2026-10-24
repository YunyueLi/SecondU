export type AppearanceAccent = 'graphite' | 'blue' | 'violet' | 'green' | 'teal' | 'amber' | 'spectrum' | `#${string}`;
export type ActivityEffect = 'off' | 'subtle' | 'expressive';
export type ActivityPalette = 'theme' | 'graphite' | 'violet' | 'teal' | 'amber' | 'spectrum';
export type AppearancePreferences = {
  theme: 'light' | 'dark' | 'system';
  atmosphere: 'plain' | 'pencil' | 'tidal' | 'night' | 'custom';
  decorativeArtwork: boolean;
  accent: AppearanceAccent;
  activityEffect: ActivityEffect;
  opacity: number;
  fontSize: number;
  motion: 'system' | 'reduced';
  sendKey: 'enter' | 'modifier';
  language: 'zh-CN' | 'en';
};
type NamedOption<T extends string> = { id: T; labelZh: string; labelEn: string };
export const appearanceAccentOptions: readonly (NamedOption<AppearanceAccent> & { color: string; swatch?: string })[];
export const activityEffectOptions: readonly NamedOption<ActivityEffect>[];
export const activityPaletteOptions: readonly (NamedOption<ActivityPalette> & { color: string; stops?: readonly { offset: string; color: string }[] })[];
export const defaultAppearance: Readonly<AppearancePreferences>;
export const appearanceChoices: { readonly [K in Exclude<keyof AppearancePreferences, 'opacity' | 'fontSize'>]: readonly AppearancePreferences[K][] };
export const appearanceRanges: Readonly<Record<'opacity' | 'fontSize', readonly [number, number]>>;

export function isAppearanceAccent(value: unknown): value is AppearanceAccent;
export function appearanceAccentColor(value: unknown): string;
