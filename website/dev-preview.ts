import {fileURLToPath} from 'node:url';
import type {Plugin} from 'vite';
import {createPublicPreviewMiddleware} from './preview-assets.mjs';

/** Serve only the previously built, public example and explicitly public artwork. */
export function localProductPreview():Plugin {
 const root=fileURLToPath(new URL('..',import.meta.url));
 return {name:'local-public-product-preview',apply:'serve',configureServer(server){server.middlewares.use(createPublicPreviewMiddleware(root));}};
}
