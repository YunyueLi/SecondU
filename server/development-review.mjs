import {readFileSync, lstatSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {HttpError} from './http-error.mjs';
import brand from '../shared/brand.json' with {type:'json'};

// Product documentation only. Runtime logs, personal records and arbitrary paths
// are never exposed, even when a Markdown document links to them.
export const DEVELOPMENT_DOCUMENTS=Object.freeze([
  'DEVELOPMENT.md','ITERATION.md','PRODUCT.md','RESEARCH.md','HARNESS.md','revision-02/ACCEPTANCE.md','DEVICES.md',
  'ACCEPTANCE.md','ANTHROPIC.md','API.md','BRANDING.md','COMMUNICATIONS.md','COMPOSER-ACCEPTANCE.md',
  'CONNECTORS.md','DAILY-ACTIVITY.md','DELEGATION.md','DESIGN.md','DEVICE-SIMULATOR.md','IMPORTS.md',
  'MODEL-PRESETS.md','OPENJARVIS.md','PERSON-PORTRAITS.md','PROJECTS.md','REMOTE-COMPUTERS.md',
  'RESPONSIVE-ACCEPTANCE.md','REVIEW.md','SCREEN-SHARING.md','qa/visual-refresh/README.md',
  'revision-02/AGENT-DESIGN.md','revision-02/AGENT-RESOURCES-DEMO.md','revision-02/BRIEF.md',
  'revision-02/COGNITION-DESIGN.md','revision-02/COMPUTER-HISTORY-PLAN.md','revision-02/DEMO-DATA.md',
  'revision-02/EXPERT-LIBRARY.md','revision-02/MODEL-CONNECTIONS.md','revision-02/OPENMUSE-REVIEW.md',
  'revision-02/PRODUCT-GUIDE.md','revision-02/QR-SOURCES.md',
]);
const paths=new Set(DEVELOPMENT_DOCUMENTS),statuses=new Set(['documented','verified','in_progress','demo','planned','failed','partial']);
const digest=value=>createHash('sha256').update(value).digest('hex');
const unavailable=()=>new HttpError(503,'构建记录暂时不可读取，请检查本机文档后刷新。','development_unavailable');
const invalid=()=>new HttpError(503,'评审记录格式或文档引用无效，请更新本机记录后刷新。','development_review_invalid');

function readProductFile(root,relative,{optional=false}={}) {
  try {
    let file=root;
    for(const part of ['docs',...relative.split('/')]) {
      file=path.join(file,part);const stat=lstatSync(file);
      if(stat.isSymbolicLink())throw unavailable();
    }
    const before=lstatSync(file);
    if(!before.isFile()||before.size>1024*1024)throw unavailable();
    const content=readFileSync(file,'utf8'),after=lstatSync(file);
    if(before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw unavailable();
    return {content,revision:digest(content),updatedAt:after.mtime.toISOString(),bytes:Buffer.byteLength(content)};
  } catch(error) {
    if(optional&&error.code==='ENOENT')return null;
    if(error instanceof HttpError)throw error;
    throw unavailable();
  }
}
function validateReview(value,documents) {
  if(!value||value.schemaVersion!==1||!/^([a-f0-9]{7,40})$/.test(value.baselineCommit??''))throw invalid();
  const text=(value,limit=6000)=>{if(typeof value!=='string'||!value.trim()||value.length>limit)throw invalid();return value;};
  text(value.title);text(value.summary);
  const translations=item=>{for(const key of ['titleEn','summaryEn','detailEn','scopeEn'])if(item[key]!==undefined)text(item[key]);if(item.detailsEn!==undefined){if(!Array.isArray(item.detailsEn)||item.detailsEn.length>20)throw invalid();for(const detail of item.detailsEn)text(detail);}};
  translations(value);
  const documentPaths=new Set(documents.map(item=>item.path));
  for(const key of ['stages','iterations','capabilities','evidence','boundaries']) {
    if(!Array.isArray(value[key])||value[key].length>100)throw invalid();
    const ids=new Set();
    for(const item of value[key]) {
      if(!item||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id??'')||ids.has(item.id)||!statuses.has(item.status))throw invalid();
      ids.add(item.id);text(item.title);translations(item);
      text(key==='evidence'||key==='boundaries'?item.detail:item.summary);
      if(key==='evidence')text(item.scope);
      if(key==='iterations'&&!/^\d{4}-\d{2}-\d{2}$/.test(item.date??''))throw invalid();
      if(item.document&&!documentPaths.has(item.document))throw invalid();
      if(item.section)text(item.section,200);
      if(item.details&&(!Array.isArray(item.details)||item.details.length>20))throw invalid();
      for(const detail of item.details??[])text(detail);
    }
  }
  const evidenceIds=new Set(value.evidence.map(item=>item.id));
  if(value.milestones!==undefined){
    if(!Array.isArray(value.milestones)||value.milestones.length>40)throw invalid();
    const iterationIds=new Set(value.iterations.map(item=>item.id)),ids=new Set();let previous=-Infinity;
    for(const item of value.milestones){
      const at=Date.parse(item?.at);
      if(!item||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id??'')||ids.has(item.id)||!Number.isFinite(at)||at<previous||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(item.at)||!/^[a-f0-9]{7,40}$/.test(item.commit??'')||!iterationIds.has(item.iteration))throw invalid();
      ids.add(item.id);previous=at;text(item.title,100);text(item.detail,600);translations(item);
    }
  }
  if(value.currentProgress!==undefined){
    const item=value.currentProgress;
    if(!item||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id??'')||!/^\d{4}-\d{2}-\d{2}$/.test(item.date??'')||!['in_progress','partial'].includes(item.status)||!value.iterations.some(entry=>entry.id===item.iteration)||value.milestones?.some(entry=>entry.id===item.id)||['commit','at','publishedAt','release'].some(key=>key in item))throw invalid();
    text(item.title,100);text(item.summary,800);text(item.titleEn,160);text(item.summaryEn,1200);
    for(const key of ['completed','pending','highlights']){
      if(key==='highlights'&&item[key]===undefined)continue;
      if(!Array.isArray(item[key])||item[key].length>6)throw invalid();
      for(const note of item[key]){text(note?.zh,300);text(note?.en,500);}
    }
  }
  if(value.latestRelease!==undefined){
    const item=value.latestRelease;
    if(!item||!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(item.version??'')||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(item.publishedAt??'')||!Number.isFinite(Date.parse(item.publishedAt))||!/^([a-f0-9]{7,40})$/.test(item.commit??'')||item.url!==`https://github.com/YunyueLi/SecondU/releases/tag/${item.version}`||item.isDraft===true)throw invalid();
  }
  for(const item of [...value.iterations,...value.capabilities]) {
    if(item.evidence&&(!Array.isArray(item.evidence)||item.evidence.some(id=>!evidenceIds.has(id))))throw invalid();
  }
  return value;
}
export function createDevelopmentReader({projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')}={}) {
  const root=path.resolve(projectRoot);
  let packaged=false;
  try{packaged=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'))[brand.compatibility.packagedFlag]===true;}catch{}
  function document(relative) {
    if(typeof relative!=='string'||!paths.has(relative))throw new HttpError(404,'此文档不在产品资料目录中。','development_document_not_found');
    const value=readProductFile(root,relative,{optional:true});
    if(!value)throw new HttpError(404,'当前版本未包含这份文档。','development_document_not_found');
    return {path:relative,title:value.content.match(/^#\s+(.+)$/m)?.[1]?.trim()??relative,...value};
  }
  function review() {
    const record=readProductFile(root,'review.json');
    let value;try{value=JSON.parse(record.content);}catch{throw invalid();}
    const documents=DEVELOPMENT_DOCUMENTS.flatMap(relative=>{
      const value=readProductFile(root,relative,{optional:true});
      if(!value)return [];
      return [{path:relative,title:value.content.match(/^#\s+(.+)$/m)?.[1]?.trim()??relative,revision:value.revision,updatedAt:value.updatedAt,bytes:value.bytes}];
    });
    value=validateReview(value,documents);
    const revision=digest(JSON.stringify([record.revision,...documents.map(item=>[item.path,item.revision])]));
    const updatedAt=[record.updatedAt,...documents.map(item=>item.updatedAt)].sort().at(-1);
    return {...value,revision,updatedAt,documents,source:{kind:packaged?'packaged':'workspace',refresh:'local-files',label:packaged?'当前应用包内的产品记录；更新应用后可获得新记录。':'当前工作区的产品记录；文档保存后刷新即可读取。'}};
  }
  return {review,document};
}
