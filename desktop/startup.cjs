const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const brand = require('../shared/brand.json');
const RETRY_URL = 'secondu-startup://retry';
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function asset(root,relative,mime){
  const file=[path.join(root,'dist',relative),path.join(root,'public',relative)].find(candidate=>fs.existsSync(candidate));
  return file?`data:${mime};base64,${fs.readFileSync(file).toString('base64')}`:'';
}
function readStartupAppearance(dataDir) {
  const file=path.join(dataDir,'spaces','personal','hither.sqlite');
  if(!fs.existsSync(file))return {appearance:{}};
  let db;
  try {
    const {DatabaseSync}=require('node:sqlite');
    db=new DatabaseSync(file,{readOnly:true});
    const query=db.prepare("SELECT data FROM entities WHERE collection='meta' AND id=?");
    const appearance=JSON.parse(query.get('appearance')?.data||'{}').value||{};
    return {appearance};
  }catch{return {appearance:{}};}finally{db?.close();}
}
function startupHtml(root,{error='',appearance={}}={}){
  const theme=['light','dark'].includes(appearance.theme)?appearance.theme:'system',motion=appearance.motion==='reduced'?'reduced':'system',accent=['graphite','blue','violet','green'].includes(appearance.accent)?appearance.accent:'blue',fontSize=Math.max(12,Math.min(18,Number(appearance.fontSize)||14));
  const en=appearance.language==='en',paper=asset(root,'art/paper-rhythm.png','image/png'),mark=asset(root,brand.mark.slice(1),'image/svg+xml'),wordmark=asset(root,brand.wordmark.slice(1),'image/svg+xml');
  const css=fs.readFileSync(path.join(root,'shared/startup.css'),'utf8');
  const message=error?(en?'Could not start SecondU':'暂时无法启动 SecondU'):(en?'Opening your workspace':'正在打开你的空间');
  return `<!doctype html><html lang="${en?'en':'zh-CN'}" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(brand.name)}</title><style>html,body{margin:0;width:100%;height:100%}body{background:${theme==='dark'?'#212121':'#ffffff'}}${css}.startup-seal>img{width:42px;height:42px}@media(max-width:480px){.startup-seal>img{width:38px;height:38px}}</style></head><body><main class="startup-screen ${error?'is-error':'is-loading'}" data-theme="${theme}" data-accent="${accent}" data-motion="${motion}" style="--startup-font-size:${fontSize}px" aria-busy="${!error}" aria-label="${en?'Starting SecondU':'启动 SecondU'}"><div class="startup-drag-region" aria-hidden="true"></div><div class="startup-content"><div class="startup-illustration" aria-hidden="true"><img src="${paper}" alt="" width="190" height="190"><span class="startup-seal"><img src="${mark}" alt=""></span></div><div class="startup-brand"><span class="startup-wordmark" role="img" aria-label="${escape(brand.name)}" style="mask-image:url('${wordmark}');-webkit-mask-image:url('${wordmark}')"></span></div><p class="startup-status" role="${error?'alert':'status'}">${error?'':'<span class="startup-dots" aria-hidden="true"><i></i><i></i><i></i></span>'}<span>${message}</span></p>${error?`<div class="startup-actions"><a class="startup-retry" href="${RETRY_URL}">${en?'Try again':'重新尝试'}</a></div><details class="startup-error-details"><summary>${en?'View details':'查看原因'}</summary><p>${escape(error)}</p></details>`:''}</div></main></body></html>`;
}
function writeStartupDocument(root,directory,options={}){
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,'startup.html');
  // Artwork belongs in the document body, not in a multi-megabyte navigation URL.
  fs.writeFileSync(file,startupHtml(root,options),{mode:0o600});
  return {file,url:pathToFileURL(file).href};
}
module.exports={startupHtml,writeStartupDocument,readStartupAppearance,RETRY_URL};
