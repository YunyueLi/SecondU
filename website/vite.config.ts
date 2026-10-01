import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { localProductPreview } from './dev-preview';
export default defineConfig({
 root:fileURLToPath(new URL('.',import.meta.url)),
 base:'./',publicDir:false,
 resolve:{dedupe:['react','react-dom','@openai/apps-sdk-ui']},
 optimizeDeps:{entries:['index.html']},
 plugins:[localProductPreview(),tailwindcss(),{name:'site-layers',transformIndexHtml:{order:'post',handler:()=>[{tag:'style',attrs:{'data-layers':''},children:'@layer properties, theme, base, components, utilities;',injectTo:'head-prepend'}]}}],
 server:{fs:{allow:[fileURLToPath(new URL('..',import.meta.url))]}},
 build:{outDir:'../dist-site',emptyOutDir:false,sourcemap:false,chunkSizeWarningLimit:1400,rollupOptions:{input:{main:fileURLToPath(new URL('index.html',import.meta.url)),benchmark:fileURLToPath(new URL('benchmark/index.html',import.meta.url))},output:{manualChunks(id){if(id.includes('/three/'))return 'three';}}}},
});
