import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Plugin} from 'vite';

/** Serve only the previously built, public example and explicitly public artwork. */
export function localProductPreview():Plugin {
 const root=fileURLToPath(new URL('..',import.meta.url));
 const contentTypes:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.gif':'image/gif','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon'};
 return {name:'local-public-product-preview',apply:'serve',configureServer(server){server.middlewares.use(async(request,response,next)=>{
  if(!['GET','HEAD'].includes(request.method??''))return next();
  let requested:string;try{requested=decodeURIComponent(new URL(request.url??'/', 'http://localhost').pathname);}catch{return next();}
  const prefix=['/product/','/assets/','/art/','/brand/','/fonts/','/architecture/'].find(value=>requested.startsWith(value));
  if(!prefix)return next();
  const suffix=requested.slice(prefix.length),extension=path.extname(suffix).toLowerCase();
  if(!contentTypes[extension]||suffix.split('/').some(part=>part==='..'||part.startsWith('.')))return next();
  const base=prefix==='/architecture/'?path.join(root,'website/public/architecture'):prefix==='/brand/'?path.join(root,'public/brand'):path.join(root,'dist-site',prefix.slice(1));
  const target=path.resolve(base,suffix);
  if(!target.startsWith(path.resolve(base)+path.sep))return next();
  try{if(!(await stat(target)).isFile())return next();}catch{return next();}
  response.statusCode=200;response.setHeader('Content-Type',contentTypes[extension]);response.setHeader('Cache-Control','no-cache');
  if(request.method==='HEAD')return response.end();
  createReadStream(target).on('error',()=>response.destroy()).pipe(response);
 });}};
}
