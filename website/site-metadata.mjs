import config from './site.json' with { type: 'json' };

export const siteUrl = config.url;

const copy = {
  zh: {
    title: 'SecondU，你的数字分身',
    description: '你的数字分身。从懂你，到为你行动。SecondU 持续理解你的背景、经历、偏好、关系和目标，在不同任务、场景和设备之间延续这些理解。',
    imageAlt: 'SecondU 奶油色与淡紫色的两个油画侧脸，彼此相伴。',
    locale: 'zh_CN',
    noscript: 'SecondU 是以个人数字分身为核心的智能体产品。请启用 JavaScript 体验本页交互，或前往',
    repositoryLabel: 'GitHub 阅读产品资料',
  },
  en: {
    title: 'SecondU — Your digital twin',
    description: 'Your digital twin. From understanding to action. SecondU learns your background, experiences, preferences, relationships and goals, and carries that understanding across tasks, situations and devices.',
    imageAlt: 'SecondU: two painted profiles in ivory and pale lavender, side by side.',
    locale: 'en_US',
    noscript: 'SecondU is a personal agent built around your digital twin. Enable JavaScript to explore this page, or visit',
    repositoryLabel: 'GitHub to read about the product',
  },
};

export function siteMetadata(language, base = siteUrl) {
  const selected = language === 'en' ? 'en' : 'zh';
  const text = copy[selected];
  const canonical = new URL(selected === 'en' ? 'en.html' : '', base).href;
  const image = new URL('assets/secondu-share.jpg', base).href;
  return {
    ...text,
    language: selected,
    htmlLanguage: selected === 'en' ? 'en' : 'zh-CN',
    canonical,
    meta: [
      { name: 'description', content: text.description },
      { property: 'og:title', content: text.title },
      { property: 'og:description', content: text.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: canonical },
      { property: 'og:site_name', content: 'SecondU' },
      { property: 'og:locale', content: text.locale },
      { property: 'og:locale:alternate', content: copy[selected === 'en' ? 'zh' : 'en'].locale },
      { property: 'og:image', content: image },
      { property: 'og:image:type', content: 'image/jpeg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: text.imageAlt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: text.title },
      { name: 'twitter:description', content: text.description },
      { name: 'twitter:image', content: image },
      { name: 'twitter:image:alt', content: text.imageAlt },
    ],
    alternates: [
      { language: 'zh-CN', href: new URL('', base).href },
      { language: 'en', href: new URL('en.html', base).href },
      { language: 'x-default', href: new URL('', base).href },
    ],
  };
}

/** Explicit query links remain compatible; the static English entry works without one. */
export function requestedSiteLanguage(value) {
  const url = new URL(value);
  const query = url.searchParams.get('lang');
  if (query === 'zh' || query === 'en') return query;
  return url.pathname.endsWith('/en.html') ? 'en' : undefined;
}

/** Retain other query parameters and the current section when switching entry documents. */
export function homepageLanguageUrl(value, language) {
  const url = new URL(value);
  const directory = url.pathname.replace(/(?:index|en)\.html$/, '');
  url.pathname = `${directory.endsWith('/') ? directory : `${directory}/`}${language === 'en' ? 'en.html' : ''}`;
  url.searchParams.set('lang', language);
  return url;
}
