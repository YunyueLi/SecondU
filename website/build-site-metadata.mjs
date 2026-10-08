import { siteMetadata } from './site-metadata.mjs';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderMetadata(language, base) {
  const data = siteMetadata(language, base);
  return [
    `<title>${escape(data.title)}</title>`,
    ...data.meta.map(({ name, property, content }) => `<meta ${name ? `name="${name}"` : `property="${property}"`} content="${escape(content)}">`),
    `<link rel="canonical" href="${escape(data.canonical)}">`,
    ...data.alternates.map(({ language, href }) => `<link rel="alternate" hreflang="${language}" href="${escape(href)}">`),
  ].join('\n  ');
}

/** Reuse the compiled homepage in the same directory: all assets keep their URLs. */
export function renderWebsitePage(html, language, base) {
  const data = siteMetadata(language, base);
  const metadataBlock = /<!-- site-metadata:start -->[\s\S]*?<!-- site-metadata:end -->/;
  if (!metadataBlock.test(html)) throw new Error('Homepage metadata markers are missing.');
  return html
    .replace(/(<html\b[^>]*\blang=")[^"]*"/, `$1${data.htmlLanguage}"`)
    .replace(metadataBlock, `<!-- site-metadata:start -->\n  ${renderMetadata(language, base)}\n  <!-- site-metadata:end -->`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/, `<noscript>${escape(data.noscript)} <a href="https://github.com/YunyueLi/SecondU">${escape(data.repositoryLabel)}</a>${language === 'zh' ? '。' : '.'}</noscript>`);
}
