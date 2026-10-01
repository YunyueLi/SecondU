import {createReadStream} from 'node:fs';
import {lstat,readFile,stat} from 'node:fs/promises';
import path from 'node:path';

const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.gif':'image/gif','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon'};
const prefixes=['/product/','/assets/','/art/','/brand/','/fonts/','/architecture/','/benchmark/'];
const safeBase=value=>typeof value==='string'&&/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value);

/** The embedded build may use a deployment subpath while Vite runs at /. */
export function embeddedBuildBase(html,fallback='/') {
 const value=html.match(/<script\b[^>]*\bsrc=["'](\/(?:[A-Za-z0-9_-]+\/)*)product\/assets\/[^"']+\.js["']/)?.[1];
 return safeBase(value)?value:safeBase(fallback)?fallback:'/';
}

export function createPublicPreviewMiddleware(root) {
 let cached={mtime:0,size:0,base:'/'};
 const configuredBase=readFile(path.join(root,'website/site.json'),'utf8').then(text=>JSON.parse(text).base).catch(()=>'/');
 async function builtBase(){
  const file=path.join(root,'dist-site/product/embed.html');
  try{
   const info=await stat(file);
   if(info.mtimeMs!==cached.mtime||info.size!==cached.size)cached={mtime:info.mtimeMs,size:info.size,base:embeddedBuildBase(await readFile(file,'utf8'),await configuredBase)};
   return cached.base;
  }catch{return await configuredBase;}
 }
 return async(request,response,next)=>{
  if(!['GET','HEAD'].includes(request.method??''))return next();
  let requested;try{requested=decodeURIComponent(new URL(request.url??'/', 'http://localhost').pathname);}catch{return next();}
  const deploymentBase=await builtBase();
  if(safeBase(deploymentBase)&&deploymentBase!=='/'&&requested.startsWith(deploymentBase))requested='/'+requested.slice(deploymentBase.length);
  const prefix=prefixes.find(value=>requested.startsWith(value));
  if(!prefix)return next();
  // The benchmark page remains a Vite route; only these public records are static.
  if(prefix==='/benchmark/'&&!/^\/benchmark\/2026-10-01(?:-v2)?\/(?:inputs\.json|model-results\.json|review\.json|plan\.json|review\.html)$/.test(requested))return next();
  const missing=()=>{response.statusCode=404;response.setHeader('Content-Type','text/plain; charset=utf-8');response.end('Public preview asset not found. Rebuild the website preview.');};
  const suffix=requested.slice(prefix.length),extension=path.extname(suffix).toLowerCase();
  if(!contentTypes[extension]||suffix.split('/').some(part=>part==='..'||part.startsWith('.')))return missing();
  const base=prefix==='/architecture/'?path.join(root,'website/public/architecture'):prefix==='/brand/'?path.join(root,'public/brand'):prefix==='/art/'&&suffix==='paper-rhythm.png'?path.join(root,'public/art'):path.join(root,'dist-site',prefix.slice(1));
  const target=path.resolve(base,suffix);
  if(!target.startsWith(path.resolve(base)+path.sep))return missing();
  try{if(!(await lstat(target)).isFile())return missing();}catch{return missing();}
  response.statusCode=200;response.setHeader('Content-Type',contentTypes[extension]);response.setHeader('Cache-Control','no-cache');
  if(request.method==='HEAD')return response.end();
  createReadStream(target).on('error',()=>response.destroy()).pipe(response);
 };
}
