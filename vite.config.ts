import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const fonts = fileURLToPath(new URL('./node_modules/katex/dist/fonts/', import.meta.url));
const localFonts = fileURLToPath(new URL('./public/fonts/', import.meta.url));
function localPdfAssets(): Plugin {
  const root = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url));
  const assets = new Map<string, Buffer>([['LICENSE', readFileSync(`${root}LICENSE`)]]);
  for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    for (const name of readdirSync(`${root}${folder}`)) assets.set(`${folder}/${name}`, readFileSync(`${root}${folder}/${name}`));
  }
  return {
    name: 'local-pdf-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (request, response, next) => {
        const name = (request.url || '').split('?')[0].replace(/^\//, '');
        const content = assets.get(name);
        if (!content) { next(); return; }
        response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        response.setHeader('Cache-Control', 'public, max-age=3600');
        response.end(content);
      });
    },
    generateBundle() {
      for (const [name, source] of assets) this.emitFile({ type: 'asset', fileName: `pdfjs/${name}`, source });
    },
  };
}
mkdirSync(localFonts, { recursive: true });
for (const name of readdirSync(fonts).filter(name => name.endsWith('.woff2'))) {
  const source = fonts + name, target = localFonts + name;
  // A build must not rewrite unchanged public assets and reload every open dev tab.
  if (!existsSync(target) || !readFileSync(source).equals(readFileSync(target))) cpSync(source, target);
}
export default defineConfig({
  plugins: [{
    name: 'design-system-layer-order',
    // Shared component CSS can be emitted before the entry stylesheet in a
    // production build. Establish the cascade before either stylesheet loads,
    // so Tailwind's base reset cannot outrank the SDK's component layer.
    transformIndexHtml: {
      order: 'post',
      handler: () => [{
        tag: 'style',
        attrs: { 'data-design-system-layers': '' },
        children: '@layer properties, theme, base, components, utilities;',
        injectTo: 'head-prepend',
      }],
    },
  }, tailwindcss(), localPdfAssets(), {
    name: 'local-math-fonts', enforce: 'post',
    transform(code, id) { if (/\.css(?:\?|$)/.test(id) && code.includes('https://cdn.openai.com/common/fonts/katex/')) return code.replaceAll('https://cdn.openai.com/common/fonts/katex/', '/fonts/'); },
    generateBundle(_options, bundle) { for (const asset of Object.values(bundle)) if (asset.type === 'asset' && asset.fileName.endsWith('.css') && typeof asset.source === 'string') asset.source = asset.source.replaceAll('https://cdn.openai.com/common/fonts/katex/', '/fonts/'); },
  }],
  server: {
    host: '127.0.0.1', port: 58644, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:58645' },
    // Runtime records and acceptance evidence are not browser modules. Watching
    // them restarts an open conversation or guide while results are being saved.
    watch: { ignored: ['**/.hither/**', '**/.local/**', '**/docs/**', '**/tests/**', '**/desktop-build/**'] },
  },
  build: { outDir: 'dist', sourcemap: true },
});
