export const siteUrl: string;
export function siteMetadata(language: 'zh' | 'en', base?: string): {
  title: string;
  description: string;
  imageAlt: string;
  locale: string;
  noscript: string;
  repositoryLabel: string;
  language: 'zh' | 'en';
  htmlLanguage: string;
  canonical: string;
  meta: { name?: string; property?: string; content: string }[];
  alternates: { language: string; href: string }[];
};
export function requestedSiteLanguage(value: string): 'zh' | 'en' | undefined;
export function homepageLanguageUrl(value: string, language: 'zh' | 'en'): URL;
