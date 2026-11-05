import {inspectExperts} from './expert-package.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {parseDocument} from 'yaml';
import {unzipSync,zipSync} from 'fflate';
import {HttpError} from '../http-error.mjs';

export const PACKAGE_LIMITS=Object.freeze({files:2000,bytes:20*1024*1024,fileBytes:2*1024*1024,archiveBytes:12*1024*1024,skills:400});
const invalid=(message,code='capability_package_invalid')=>{throw new HttpError(400,message,code);};
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function safePath(value){
  if(typeof value!=='string'||!value||value.length>400||value.startsWith('/')||/[\\\x00-\x1f\x7f:]/.test(value)||value.split('/').some(part=>!part||part==='.'||part==='..'))invalid('能力包包含无效的文件路径。');
  return value;
}
function safeObject(value){
  if(Array.isArray(value)){for(const item of value)safeObject(item);return;}
  if(!plain(value))return;
  for(const [key,item] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))invalid('能力包包含不支持的对象字段。');safeObject(item);}
}
function yaml(text,label){
  const document=parseDocument(text,{uniqueKeys:true,version:'1.2'});
  if(document.errors.length)invalid(`${label} 的 YAML 格式无效。`);
  let value;try{value=document.toJS({maxAliasCount:20});}catch{invalid(`${label} 的 YAML 引用过多。`);}
  safeObject(value);return value;
}
function json(bytes,label){let value;try{value=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{invalid(`${label} 的 JSON 格式无效。`);}safeObject(value);return value;}
const short=(value,max=1000)=>typeof value==='string'?value.trim().slice(0,max):'';
function array(value,label){if(value===undefined)return [];if(!Array.isArray(value))invalid(`${label} 须为列表。`);return value;}
function frontmatter(bytes,file){const content=bytes.toString('utf8').replace(/^\uFEFF/,'');const match=content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);if(!match)invalid(`${file} 缺少 YAML 元数据。`);const metadata=yaml(match[1],file);if(!plain(metadata)||!content.slice(match[0].length).trim())invalid(`${file} 的元数据或正文无效。`);return metadata;}
export function checkedFiles(input){
  if(!plain(input)||!Object.keys(input).length||Object.keys(input).length>PACKAGE_LIMITS.files)invalid('能力包文件数量无效。');
  const files=Object.create(null);let total=0;const folded=new Set();
  for(const [name,value] of Object.entries(input)){
    safePath(name);const lower=name.toLocaleLowerCase('en-US');if(folded.has(lower))invalid('能力包包含重名文件（含大小写冲突）。');folded.add(lower);
    if(name.split('/').some(part=>['.git','node_modules','.env','credentials.json','auth.json'].includes(part)||part.startsWith('.env.')))invalid('能力包不能包含依赖目录、Git 历史或凭据文件。');
    if(!(value instanceof Uint8Array))invalid('能力包文件内容无效。');
    if(value.length>PACKAGE_LIMITS.fileBytes||(total+=value.length)>PACKAGE_LIMITS.bytes)invalid('能力包超出大小限制。');
    files[name]=Buffer.from(value);
  }
  return files;
}
export function directoryFiles(directory){
  const root=realpathSync(directory),files=Object.create(null);let count=0,total=0;
  function visit(current,prefix=''){
    for(const entry of readdirSync(current,{withFileTypes:true})){
      const name=prefix+entry.name,file=path.join(current,entry.name),stat=lstatSync(file);
      if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))invalid('能力包不能包含链接或特殊文件。');
      if(stat.isDirectory()){safePath(name);visit(file,name+'/');}
      else{if(++count>PACKAGE_LIMITS.files||stat.size>PACKAGE_LIMITS.fileBytes||(total+=stat.size)>PACKAGE_LIMITS.bytes)invalid('能力包超出大小限制。');files[name]=readFileSync(file);}
    }
  }
  visit(root);return checkedFiles(files);
}
export function archiveFiles(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length>PACKAGE_LIMITS.archiveBytes)invalid('压缩包过大或格式无效。');
  let files;const names=new Set();let total=0;
  try{files=unzipSync(bytes,{filter:entry=>{
    const name=entry.name.replace(/\/$/,'');safePath(name);
    if(name.split('/').some(part=>part==='__MACOSX'||part==='.DS_Store'||part.startsWith('._')))return false;
    if(names.has(entry.name))invalid('压缩包包含重复文件。');names.add(entry.name);
    if(names.size>PACKAGE_LIMITS.files||entry.originalSize>PACKAGE_LIMITS.fileBytes||(total+=entry.originalSize)>PACKAGE_LIMITS.bytes)invalid('压缩包解压后超出大小限制。');
    return !entry.name.endsWith('/');
  }});}catch(error){if(error instanceof HttpError)throw error;invalid('无法读取 ZIP 能力包。');}
  const keys=Object.keys(files);const first=keys[0]?.split('/')[0];
  // GitHub archives and folder uploads wrap the actual package in one directory.
  if(first&&keys.every(name=>name.startsWith(first+'/'))&&!keys.includes('SKILL.md')&&!keys.includes('plugin.json'))files=Object.fromEntries(keys.map(name=>[name.slice(first.length+1),files[name]]));
  return checkedFiles(files);
}
export function encodeArchive(files){return Buffer.from(zipSync(checkedFiles(files),{level:6}));}
export function filesDigest(files){const h=createHash('sha256');for(const name of Object.keys(files).sort()){h.update(name);h.update('\0');h.update(files[name]);h.update('\0');}return h.digest('hex');}
export function fileChanges(previous,next){return {added:Object.keys(next).filter(name=>!previous[name]),removed:Object.keys(previous).filter(name=>!next[name]),changed:Object.keys(next).filter(name=>previous[name]&&!Buffer.from(previous[name]).equals(Buffer.from(next[name])))};}
export function runtimeSkillFile(skill,bytes){
  if(skill.adaptation!=='workbuddy-title-summary-v1')return bytes;
  return Buffer.from(bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/^---\r?\n/,`---\nname: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}\n`));
}

function requirements(frontmatter,interfaceData){
  const result=[];const add=(kind,name,optional=false,description)=>{if(typeof name!=='string'||!name.trim()||name.length>200)invalid('技能依赖名称无效。');if(!result.some(item=>item.kind===kind&&item.name===name))result.push({kind,name,optional:!!optional,...(description?{description:short(description)}:{})});};
  const metadata=plain(frontmatter.metadata)?frontmatter.metadata:{};
  const native=interfaceData?.secondu?.requires??metadata.secondu?.requires??{};
  for(const [key,kind] of Object.entries({bins:'binary',env:'environment',connectors:'connector',os:'platform',node:'node-package',python:'python-package'}))for(const value of array(native[key],`技能依赖 ${key}`)){if(typeof value==='string')add(kind,value);else if(plain(value))add(kind,value.name,value.optional,value.description);else invalid('技能依赖格式无效。');}
  let claw=metadata.openclaw??metadata.clawdbot??metadata.clawdis;
  if(typeof claw==='string'){try{claw=JSON.parse(claw);}catch{invalid('OpenClaw 依赖元数据无效。');}}
  for(const bin of array(claw?.requires?.bins,'OpenClaw bins'))add('binary',bin);
  for(const env of array(claw?.requires?.env,'OpenClaw env'))add('environment',env);
  for(const os of array(claw?.os,'OpenClaw os'))add('platform',os);
  for(const tool of array(interfaceData?.dependencies?.tools,'工具依赖')){if(tool.type==='mcp')add('connector',tool.value,false,tool.description);if(tool.type==='env_var')add('environment',tool.value,false,tool.description);}
  if(result.length>40)invalid('单个技能的依赖过多。');return result;
}
function connectorManifest(files,warnings){
  const file=['mcp.json','.mcp.json'].find(name=>files[name]);if(!file)return [];
  const config=json(files[file],file);const servers=config.mcpServers??config.servers;
  if(!plain(servers)||Object.keys(servers).length>30)invalid('MCP 清单须包含不超过 30 个服务。');
  return Object.entries(servers).map(([name,item])=>{
    if(!plain(item))invalid('MCP 服务配置无效。');
    if(item.env!==undefined&&!plain(item.env))invalid('MCP 环境变量须为对象。');
    const environmentNames=Object.keys(item.env??{});for(const [key,value] of Object.entries(item.env??{}))if(typeof value!=='string'||!/^\$\{[A-Z][A-Z0-9_]*\}$/.test(value))invalid(`连接器 ${name} 的 ${key} 含直接配置值。请改为环境变量占位符，将凭据留在本机设置中。`);
    if(item.headers&&Object.values(item.headers).some(value=>typeof value!=='string'||!/^\$\{[A-Z][A-Z0-9_]*\}$/.test(value)))invalid('MCP 请求头须使用环境变量占位符，不能将凭据打包。');
    if(item.url){let url;try{url=new URL(item.url);}catch{invalid('MCP 地址无效。');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)invalid('MCP 地址不能包含凭据。');return {name,transport:'http',url:url.href,environmentNames,...(item.extensions?.['com.openai']?.auth?.type?{auth:short(item.extensions['com.openai'].auth.type,60)}:{})};}
    if(typeof item.command==='string'&&Array.isArray(item.args??[])&&(item.args??[]).every(value=>typeof value==='string'&&value.length<=2000))return {name,transport:'stdio',command:short(item.command,1000),args:item.args??[],environmentNames};
    invalid('MCP 服务缺少可识别的地址或命令。');
  });
}
export function inspectPackage(input,{source={kind:'upload',label:'Local package'},packageId}={}){
  const files=checkedFiles(input),warnings=[];
  const manifestPath=['plugin.json','.codex-plugin/plugin.json','.claude-plugin/plugin.json','.codebuddy-plugin/plugin.json','.secondu-plugin/plugin.json'].find(name=>files[name]);
  const manifest=manifestPath?json(files[manifestPath],manifestPath):{};
  if(!plain(manifest))invalid('插件清单必须为对象。');
  const entries=Object.keys(files).filter(name=>name==='SKILL.md'||name.endsWith('/SKILL.md')).sort();
  if(entries.length>PACKAGE_LIMITS.skills)invalid('能力包最多包含 400 个 SKILL.md。');
  const firstMetadata=entries.length?frontmatter(files[entries[0]],entries[0]):{};
  const packageName=short(manifest.name,64)||(entries.length===1?short(firstMetadata.name,64):entries[0]?.split('/').at(-2))||'local-skill';
  const id=packageId||packageName.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'');
  if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))invalid('能力包名称须使用小写英文字母、数字和连字符。');
  const version=short(manifest.version,80)||'unversioned',hash=filesDigest(files),names=new Set();
  const skills=entries.map(file=>{
    const metadata=frontmatter(files[file],file);
    const adapted=manifestPath==='.codebuddy-plugin/plugin.json'&&!metadata.name&&!metadata.description&&typeof metadata.title==='string'&&typeof metadata.summary==='string';
    const name=short(adapted?path.posix.basename(path.posix.dirname(file)):metadata.name,64),description=short(adapted?metadata.summary:metadata.description,1024);
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)||names.has(name)||!description)invalid(`${file} 的技能名称、描述或正文无效，或名称重复。`);names.add(name);
    const directory=path.posix.dirname(file),prefix=directory==='.'?'':directory+'/';
    const interfaceFile=files[prefix+'SKILL.json']??files[prefix+'agents/openai.yaml'];
    const ui=interfaceFile?(files[prefix+'SKILL.json']?json(interfaceFile,'SKILL.json'):yaml(interfaceFile.toString('utf8'),'agents/openai.yaml')):{};
    const localized=plain(ui?.interface?.localized)?Object.fromEntries(['title','description'].filter(key=>plain(ui.interface.localized[key])).map(key=>[key,{zh:short(ui.interface.localized[key].zh,1024),en:short(ui.interface.localized[key].en,1024)}])):undefined;
    const req=requirements(metadata,ui);const resources=Object.keys(files).filter(name=>name.startsWith(prefix)&&name!==file&&!name.endsWith('/SKILL.md')).map(name=>name.slice(prefix.length));
    if(metadata['allowed-tools'])warnings.push(`技能 ${name} 的 allowed-tools 仅作为声明保存，不会增加执行权限。`);
    if(metadata.metadata?.openclaw?.install||metadata.metadata?.openclaw?.requires?.config||metadata.metadata?.openclaw?.requires?.anyBins)warnings.push(`技能 ${name} 的宿主安装或配置要求需要单独适配。`);
    if(adapted)warnings.push(`技能 ${name} 使用 WorkBuddy 示例中的 title/summary 格式；执行副本补充标准 name/description，原包保持不变。`);
    return {id:`${id}/${name}`,packageId:id,name,title:short(ui?.interface?.display_name??ui?.interface?.displayName??metadata.title)||name,description,...(adapted?{adaptation:'workbuddy-title-summary-v1'}:{}),...(localized?{localized}:{}),license:short(metadata.license)||short(manifest.license)||undefined,compatibility:short(metadata.compatibility)||undefined,path:file,version,digest:hash,requirements:req,resources,enabled:true,status:'available',checks:[]};
  });
  if(files['.app.json'])warnings.push('此包包含宿主专属的账号映射；需要在 SecondU 中连接对应服务。');
  if(Object.keys(files).some(name=>name.startsWith('hooks/'))||manifest.hooks||manifest.extensions?.['com.openai']?.hooks)warnings.push('生命周期钩子随包保留，但 SecondU 不自动运行这些脚本。');
  const {experts,teams}=inspectExperts(files,manifest,{packageId:id,version,digest:hash,skills,frontmatter,safePath,invalid,warnings});
  if(!skills.length&&!experts.length)invalid('能力包须包含有效的 SKILL.md 或专家定义。');
  const license=short(manifest.license)||skills[0]?.license;
  if(!license&&!Object.keys(files).some(name=>/(^|\/)licen[sc]e(?:\.|$)/i.test(name)))warnings.push('未发现许可证声明；安装不代表获得再分发许可。');
  const connectors=connectorManifest(files,warnings);
  const attribution=files['PROVENANCE.json']?json(files['PROVENANCE.json'],'PROVENANCE.json'):undefined;
  let upstream;try{const url=new URL(attribution?.upstream??attribution?.source);if(url.protocol==='https:'&&!url.username&&!url.password)upstream={url:url.href,revision:short(attribution.revision,80),license:short(attribution.license,80)};}catch{}
  return {files,package:{id,name:packageName,description:short(manifest.description)||skills[0]?.description||experts[0]?.description.zh,version,license,source,...(upstream?{upstream}:{}),digest:hash,enabled:true,builtin:source.kind==='builtin',skills,experts,teams,connectors,warnings:[...new Set(warnings)],versions:[]}};
}
