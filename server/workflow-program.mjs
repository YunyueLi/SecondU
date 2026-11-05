import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {HttpError} from './http-error.mjs';
export const programHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=message=>{throw new HttpError(400,message,'workflow_program_invalid');};
export function normalizeProgram(value){
  if(value===undefined)return undefined;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['source','parameters','args'].includes(k)))fail('流程脚本格式无效。');
  if(typeof value.source!=='string'||!value.source.trim()||value.source.length>30000)fail('流程脚本须为 1–30,000 字符的 JavaScript。');
  try{new vm.Script(`(async()=>{${value.source}\n})()`);}catch(e){fail(`流程脚本语法错误：${e.message}`);}
  const parameters=value.parameters??[];
  if(!Array.isArray(parameters)||parameters.length>16)fail('流程最多支持 16 个输入参数。');
  const names=new Set();
  for(const p of parameters){
    if(!p||Object.keys(p).some(k=>!['name','label','type','required','default','description'].includes(k))||typeof p.name!=='string'||!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(p.name)||['constructor','prototype','__proto__'].includes(p.name)||names.has(p.name)||!['string','number','boolean'].includes(p.type)||typeof p.label!=='string'||!p.label.trim()||p.label.length>100||p.required!==undefined&&typeof p.required!=='boolean'||p.description!==undefined&&(typeof p.description!=='string'||p.description.length>1000))fail('参数需要唯一名称、标签和有效类型。');
    names.add(p.name);
    if(p.default!==undefined)validateValue(p,p.default);
  }
  const result={source:value.source,parameters:structuredClone(parameters)};
  result.args=programArguments(result,value.args??{});
  return result;
}
function validateValue(p,value){if(typeof value!==p.type||p.type==='number'&&!Number.isFinite(value)||p.type==='string'&&value.length>12000)fail(`参数“${p.label}”类型或长度不正确。`);}
export function programArguments(program,supplied,{requireAll=false}={}){
  if(!supplied||typeof supplied!=='object'||Array.isArray(supplied)||Object.keys(supplied).some(k=>!program.parameters.some(p=>p.name===k)))fail('流程包含未声明的输入参数。');
  const result={};
  for(const p of program.parameters){const value=Object.hasOwn(supplied,p.name)?supplied[p.name]:p.default;if(value===undefined||p.required&&value===''){if(requireAll&&p.required)fail(`请填写“${p.label}”。`);continue;}validateValue(p,value);result[p.name]=value;}
  return result;
}
/** The script cell has no credentials, workspace access, network or process API.
 * Only journaled stage requests cross into the existing approved worker runtime. */
export function runProgram(program,{signal,onStep,timeoutMs=30*60*1000}){
  const worker=fileURLToPath(new URL('./workflow-program-cell.mjs',import.meta.url));
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--permission',`--allow-fs-read=${worker}`,'--disable-proto=throw','--max-old-space-size=96',worker],{stdio:['pipe','pipe','pipe'],env:{ELECTRON_RUN_AS_NODE:'1'}});
    let buffer='',stderr='',done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);child.kill('SIGKILL');error?reject(error):resolve(value);};
    const abort=()=>finish(Object.assign(new Error('流程脚本已停止。'),{name:'AbortError'}));
    const timer=setTimeout(()=>finish(new Error('流程脚本运行超时，请检查未完成步骤。')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
    child.on('error',e=>finish(e));child.on('exit',code=>{if(!done)finish(new Error(`流程脚本进程退出（${code}）：${stderr.slice(0,1200)}`));});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000);});
    const send=value=>{if(!done&&!child.stdin.destroyed)child.stdin.write(JSON.stringify(value)+'\n');};
    child.stdout.on('data',chunk=>{
      buffer+=chunk;if(buffer.length>1024*1024){finish(new Error('流程脚本输出超过限额。'));return;}
      let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let msg;try{msg=JSON.parse(line);}catch{finish(new Error('流程脚本消息无效。'));return;}
        if(msg.type==='step')Promise.resolve().then(()=>onStep(msg.request)).then(value=>send({id:msg.id,value}),e=>send({id:msg.id,error:e.message}));
        else if(msg.type==='done')finish(undefined,msg.value);
        else if(msg.type==='error')finish(new Error(`流程脚本错误：${msg.error}`));
      }
    });
    send({source:program.source,args:program.args});
  });
}
