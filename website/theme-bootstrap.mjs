export const themeStorageKey = 'secondu.website.theme';
export const themeQuery = '(prefers-color-scheme: dark)';
export const themeColors = { light: '#f8f7f4', dark: '#18191c' };

// Inline and synchronous: resolve the preference before styles and React load.
// Both source entry documents and the production output use this same template.
export const themeBootstrapMarkup = `<style data-initial-theme>html{background:${themeColors.light};color-scheme:light}html[data-theme=dark]{background:${themeColors.dark};color-scheme:dark}</style>
  <script data-theme-bootstrap>
    (() => {
      let preference = 'system';
      try {
        const saved = localStorage.getItem(${JSON.stringify(themeStorageKey)});
        if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
      } catch { /* Storage is optional. */ }
      const theme = preference === 'system' ? (matchMedia(${JSON.stringify(themeQuery)}).matches ? 'dark' : 'light') : preference;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '${themeColors.dark}' : '${themeColors.light}');
    })();
  </script>`;

export function renderThemeBootstrap(html) {
  const marker = /<!-- theme-bootstrap:start -->[\s\S]*?<!-- theme-bootstrap:end -->/;
  if (!marker.test(html)) throw new Error('Theme bootstrap markers are missing.');
  return html.replace(marker, `<!-- theme-bootstrap:start -->\n  ${themeBootstrapMarkup}\n  <!-- theme-bootstrap:end -->`);
}
