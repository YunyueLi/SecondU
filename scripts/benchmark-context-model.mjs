import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync,realpathSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runContextSuite} from '../benchmarks/context/suite.mjs';
import {codexCommand} from '../server/codex.mjs';

// Explicit opt-in only. The CLI uses its existing login; this script never opens
// an auth file or a personal SecondU store, and never supplies an API key.
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){if(['--run','--smoke'].includes(args[i]))options[args[i]]=true;else if(['--model','--output'].includes(args[i])&&args[i+1])options[args[i]]=args[++i];else throw new Error('Usage: node scripts/benchmark-context-model.mjs --run --model MODEL [--smoke] [--output directory]');}
if(!options['--run']||!options['--model']||!/^[a-zA-Z0-9._:-]{1,100}$/.test(options['--model']))throw new Error('An explicit --run and --model are required. Only synthetic fixture inputs will be sent.');
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.resolve(root,options['--output']??'.local/context-benchmark/model-run');mkdirSync(directory,{recursive:true});
if(process.platform!=='darwin')throw new Error('This existing-login evaluation currently requires the macOS instruction-isolation guard. No model request was sent.');
const codexState=realpathSync(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'));
const globalInstructionFiles=[...new Set(['AGENTS.md','AGENTS.override.md'].flatMap(name=>{const file=path.join(codexState,name);return existsSync(file)?[file,realpathSync(file)]:[file];}))];
const isolationPolicy='(version 1)(allow default)(deny file-read* '+globalInstructionFiles.map(name=>'(literal '+JSON.stringify(name)+')').join(' ')+')';
const model=options['--model'],report=runContextSuite(),manifest=JSON.stringify(report,null,2)+'\n';writeFileSync(path.join(directory,'inputs.json'),manifest);
const sha=value=>createHash('sha256').update(value).digest('hex'),command=codexCommand();
const diagnosticCode=message=>/Failed to read global AGENTS/.test(message)?'global_instructions_read_denied':/Under-development features enabled: skip_host_skill_discovery/.test(message)?'host_skill_discovery_disabled_warning':/code-mode host is disabled/i.test(message)?'code_mode_disabled':/timed out/i.test(message)?'transport_timeout':'runtime_error';
const features=['shell_tool','unified_exec','apps','plugins','remote_plugin','memories','browser_use','browser_use_external','computer_use','view_image','image_generation','multi_agent','multi_agent_v2','hooks','goals','code_mode','code_mode_host','workspace_dependencies','chronicle','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest','recommended_plugins'];
const fixed={model_reasoning_effort:'medium',project_doc_max_bytes:0,developer_instructions:'Use only the provided synthetic task and context. Produce text only. Do not use tools, local files, network, skills, memory or account data. Do not send messages or take actions.',web_search:'disabled','memories.use_memories':false,'memories.generate_memories':false,'features.skip_host_skill_discovery':true,'history.persistence':'none','analytics.enabled':false,'feedback.enabled':false,'permissions.synthetic_text.network.enabled':false,approval_policy:'never',check_for_update_on_startup:false,model_provider:'synthetic_default','model_providers.synthetic_default':{name:'Existing OpenAI sign-in',wire_api:'responses',requires_openai_auth:true,supports_websockets:false}};
const toml=value=>value&&typeof value==='object'?'{'+Object.entries(value).map(([key,item])=>`${JSON.stringify(key)}=${toml(item)}`).join(',')+'}':JSON.stringify(value);
const env=Object.fromEntries(['PATH','HOME','USER','LOGNAME','CODEX_HOME','LANG','LC_ALL','TMPDIR','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
const run={schema:'secondu.context-model-run.v1',synthetic:true,startedAt:new Date().toISOString(),inputManifestSha256:sha(manifest),configuredModel:model,providerReportedModel:null,reasoningEffort:'medium',temperature:'CLI default; not explicitly set',outputLimit:'CLI model default; fixed across all calls',cliVersion:execFileSync(command,['--version'],{encoding:'utf8',env}).trim(),transport:'HTTPS; WebSocket disabled after observed smoke reconnect timeouts',parameters:fixed,outputs:[],semanticQualityScore:null,reviewStatus:'pending',instructionIsolation:{method:'macOS process sandbox denies reads of global AGENTS.md and AGENTS.override.md; project documents disabled; no user config, memories or host skills',globalGuidanceIncluded:false,credentials:'existing CLI login, no credential files read by this script'}};
const save=()=>writeFileSync(path.join(directory,'model-results.json'),JSON.stringify(run,null,2)+'\n');save();
async function execute(id,input){
  const cwd=mkdtempSync(path.join(os.tmpdir(),'secondu-model-eval-'));
  const config={...fixed,default_permissions:'synthetic_text','permissions.synthetic_text.filesystem':{':minimal':'read',[cwd]:'read'}};
  const cliArgs=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--color','never','--json','--model',model,'--cd',cwd,...features.flatMap(feature=>['--disable',feature]),...Object.entries(config).flatMap(([key,value])=>['-c',`${key}=${toml(value)}`]),'-'];
  const prompt=`${input.system}\n\n${input.user}`,start=performance.now();let stdout='',stderr='',timedOut=false;
  try{
    const exitCode=await new Promise((resolve,reject)=>{const child=spawn('/usr/bin/sandbox-exec',['-p',isolationPolicy,command,...cliArgs],{cwd,env,shell:false,stdio:['pipe','pipe','pipe']});const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),1500).unref();},180000);child.on('error',error=>{clearTimeout(timer);reject(error);});child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>2*1024*1024)child.kill('SIGTERM');});child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-16000);});child.on('close',code=>{clearTimeout(timer);resolve(code);});child.stdin.end(prompt);});
    writeFileSync(path.join(directory,`${id}.events.jsonl`),stdout);writeFileSync(path.join(directory,`${id}.stderr.txt`),stderr);
    const events=stdout.split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}),messages=events.filter(event=>event.type==='item.completed'&&event.item?.type==='agent_message').map(event=>event.item.text),output=messages.at(-1)??null;
    const toolEvents=events.filter(event=>event.item&&!['agent_message','reasoning','error','plan'].includes(event.item.type));
    let parsed;try{parsed=JSON.parse(output);}catch{}
    const completed=events.find(event=>event.type==='turn.completed');
    const result={id,status:timedOut?'timeout':exitCode===0&&completed&&output&&toolEvents.length===0?'completed':'failed',exitCode,latencyMs:Math.round(performance.now()-start),inputSha256:sha(prompt),contextSha256:input.contextSha256??null,usage:completed?.usage??null,output,parsedOutput:parsed??null,toolEventCount:toolEvents.length,diagnosticCodes:[...new Set(events.filter(event=>event.type==='error'||event.item?.type==='error').map(event=>diagnosticCode(event.message??event.item?.message??'')))],outputSha256:output?sha(output):null};
    run.outputs.push(result);save();console.log(JSON.stringify({id,status:result.status,latencyMs:result.latencyMs,usage:result.usage,toolEventCount:toolEvents.length}));return result;
  }finally{rmSync(cwd,{recursive:true,force:true});}
}
if(options['--smoke']){await execute('smoke',{system:'Pure synthetic connectivity test. No tools.',user:'Return only {"choice":"A","reason":"Synthetic smoke test only.","usedContextIds":[],"clarification":null}'});}else{
  // A deterministic shuffled order avoids always giving one condition first.
  const tasks=report.cases.flatMap(row=>row.inputs.map(input=>({id:`${row.id}-${input.mode}`,input}))).sort((a,b)=>sha(a.id).localeCompare(sha(b.id)));
  let next=0;await Promise.all([0,1].map(async()=>{while(next<tasks.length){const item=tasks[next++];const result=await execute(item.id,item.input);if(result.toolEventCount)throw new Error('Unexpected tool event; evaluation stopped.');}}));
}
run.finishedAt=new Date().toISOString();run.summary={completed:run.outputs.filter(row=>row.status==='completed').length,total:run.outputs.length,toolEvents:run.outputs.reduce((sum,row)=>sum+row.toolEventCount,0)};save();
if(run.summary.completed!==run.summary.total)process.exitCode=1;
