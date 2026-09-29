import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const fonts = fileURLToPath(new URL('./node_modules/katex/dist/fonts/', import.meta.url));
const localFonts = fileURLToPath(new URL('./public/fonts/', import.meta.url));
mkdirSync(localFonts, { recursive: true });
for (const name of readdirSync(fonts).filter(name => name.endsWith('.woff2'))) cpSync(fonts + name, localFonts + name);
export default defineConfig({
  plugins: [tailwindcss(), {
    name: 'local-math-fonts', enforce: 'post',
    transform(code, id) { if (/\.css(?:\?|$)/.test(id) && code.includes('https://cdn.openai.com/common/fonts/katex/')) return code.replaceAll('https://cdn.openai.com/common/fonts/katex/', '/fonts/'); },
    generateBundle(_options, bundle) { for (const asset of Object.values(bundle)) if (asset.type === 'asset' && asset.fileName.endsWith('.css') && typeof asset.source === 'string') asset.source = asset.source.replaceAll('https://cdn.openai.com/common/fonts/katex/', '/fonts/'); },
  }],
  server: { host: '127.0.0.1', port: 58644, strictPort: true, proxy: { '/api': 'http://127.0.0.1:58645' } },
  build: { outDir: 'dist', sourcemap: true },
});
