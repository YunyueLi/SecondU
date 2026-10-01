import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,renameSync,rmSync,realpathSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {codexCommand} from '../server/codex.mjs';
import {sha,MODES} from '../benchmarks/context/suite-v2.mjs';

const args=process.argv.slice(2),options={};
for(let index=0;index<args.length;index++){const key=args[index];if(['--run','--prepare'].includes(key))options[key]=true;else if(['--model','--input','--output'].includes(key)&&args[index+1])options[key]=args[++index];else throw new Error('Usage: node scripts/benchmark-context-v2-model.mjs (--prepare|--run) --model gpt-6-astra --input inputs.json --output DIRECTORY');}
if((!options['--run']&&!options['--prepare'])||options['--model']!=='gpt-6-astra'||!options['--input']||!options['--output'])throw new Error('This frozen evaluation requires an explicit --prepare or --run, input, output and the authorized gpt-6-astra model.');
if(process.platform!=='darwin')throw new Error('The global-instruction read-isolation guard is currently implemented only for macOS. No model request was sent.');
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.resolve(options['--output']);mkdirSync(directory,{recursive:true});
const manifest=readFileSync(path.resolve(options['--input']),'utf8'),inputs=JSON.parse(manifest);
if(inputs.schema!=='secondu.context-benchmark.v2'||inputs.fixture?.synthetic!==true||inputs.summary.passed!==inputs.summary.checks)throw new Error('Expected a checked, frozen synthetic v2 manifest.');
const localInput=path.join(directory,'inputs.json');if(existsSync(localInput)){if(readFileSync(localInput,'utf8')!==manifest)throw new Error('Output directory contains another input manifest.');}else writeFileSync(localInput,manifest,{flag:'wx'});
const model=options['--model'],command=codexCommand();
const features=['shell_tool','unified_exec','apps','plugins','remote_plugin','memories','browser_use','browser_use_external','computer_use','view_image','image_generation','multi_agent','multi_agent_v2','hooks','goals','code_mode','code_mode_host','workspace_dependencies','chronicle','skill_search','skill_mcp_dependency_install','sleep_tool','tool_suggest','recommended_plugins'];
const fixed={model_reasoning_effort:'medium',project_doc_max_bytes:0,developer_instructions:'Use only the provided synthetic task and context. Produce text only. Do not use tools, local files, network, skills, memory or account data. Do not send messages or take actions.',web_search:'disabled','memories.use_memories':false,'memories.generate_memories':false,'features.skip_host_skill_discovery':true,'history.persistence':'none','analytics.enabled':false,'feedback.enabled':false,'permissions.synthetic_text.network.enabled':false,approval_policy:'never',check_for_update_on_startup:false,model_provider:'synthetic_default','model_providers.synthetic_default':{name:'Existing OpenAI sign-in',wire_api:'responses',requires_openai_auth:true,supports_websockets:false}};
const toml=value=>value&&typeof value==='object'?'{'+Object.entries(value).map(([key,item])=>`${JSON.stringify(key)}=${toml(item)}`).join(',')+'}':JSON.stringify(value);
const env=Object.fromEntries(['PATH','HOME','USER','LOGNAME','CODEX_HOME','LANG','LC_ALL','TMPDIR','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
const codexState=realpathSync(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'));
const globalInstructionFiles=[...new Set(['AGENTS.md','AGENTS.override.md'].flatMap(name=>{const file=path.join(codexState,name);return existsSync(file)?[file,realpathSync(file)]:[file];}))];
const isolationPolicy='(version 1)(allow default)(deny file-read* '+globalInstructionFiles.map(name=>'(literal '+JSON.stringify(name)+')').join(' ')+')';
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
const blocks=inputs.cases.flatMap((stage,index)=>Array.from({length:inputs.protocol.repetitions},(_,repeat)=>({stage,index,repeat:repeat+1,order:permutations[(index+repeat*3)%6]}))).sort((a,b)=>sha(`secondu-v2-order|${a.stage.id}|${a.repeat}`).localeCompare(sha(`secondu-v2-order|${b.stage.id}|${b.repeat}`)));
const trials=blocks.flatMap(block=>block.order.map(position=>{const mode=MODES[position],input=block.stage.inputs.find(row=>row.mode===mode);return {id:`${block.stage.id}--${mode}--r${block.repeat}--a1`,caseId:block.stage.id,capabilityId:block.stage.capabilityId,mode,repetition:block.repeat,attempt:1,inputSha256:input.inputSha256,contextSha256:input.contextSha256};}));
const additionalFiles=['scripts/benchmark-context-v2-model.mjs','benchmarks/context/score-v2.mjs','scripts/review-context-benchmark-v2.mjs'];
const codeHashes=[...inputs.codeHashes,...additionalFiles.map(file=>({file,sha256:sha(readFileSync(path.join(root,file)))}))];
for(const item of inputs.codeHashes)if(sha(readFileSync(path.join(root,item.file)))!==item.sha256)throw new Error(`Source changed after input freeze: ${item.file}`);
const plan={schema:'secondu.context-trial-plan.v2',synthetic:true,inputManifestSha256:sha(manifest),configuredModel:model,reasoningEffort:'medium',repetitions:inputs.protocol.repetitions,concurrency:2,timeoutMs:180000,retries:0,orderSeed:'secondu-v2-order',conditionOrder:'Six prespecified permutations; same option mapping and prompt for every condition and repeat within each scenario',outputLimit:'Identical CLI model default, plus the same 180-word answer instruction. Not an independently enforced token cap.',parameters:fixed,disabledFeatures:features,codeHashes,trials};
const planText=JSON.stringify(plan,null,2)+'\n',planPath=path.join(directory,'plan.json');
if(existsSync(planPath)){if(readFileSync(planPath,'utf8')!==planText)throw new Error('Frozen plan does not match current code or protocol.');}else writeFileSync(planPath,planText,{flag:'wx'});
if(!options['--run']){console.log(JSON.stringify({prepared:true,planned:trials.length,inputManifestSha256:sha(manifest),planSha256:sha(planText),codeHashes}));process.exit(0);}
if(existsSync(path.join(directory,'model-results.json')))throw new Error('Refusing to overwrite recorded model attempts. Use the existing run or a separately declared run directory.');
const logs=path.join(root,'.local/context-benchmark-v2-logs',`${inputs.fixture.pilot?'pilot':'formal'}-${Date.now()}`);mkdirSync(logs,{recursive:true});
const run={schema:'secondu.context-model-run.v2',synthetic:true,startedAt:new Date().toISOString(),inputManifestSha256:sha(manifest),planSha256:sha(planText),configuredModel:model,providerReportedModel:null,reasoningEffort:'medium',temperature:'CLI default; not explicitly set',outputLimit:plan.outputLimit,cliVersion:execFileSync(command,['--version'],{encoding:'utf8',env}).trim(),transport:'HTTPS; WebSocket disabled',parameters:fixed,codeHashes,outputs:[],reviewStatus:'pending',isolation:{ephemeralSessions:true,toolFeaturesDisabled:features,projectInstructionsDisabled:true,userConfigIgnored:true,globalInstructionReadGuard:'macOS sandbox denies reads of global AGENTS.md and AGENTS.override.md including resolved symlink targets',credentials:'Uses existing CLI login; no credential files read by this script and no key supplied',localRawLogsPublished:false}};
const save=()=>{const target=path.join(directory,'model-results.json'),temporary=`${target}.tmp`;writeFileSync(temporary,JSON.stringify(run,null,2)+'\n');renameSync(temporary,target);};save();
const sanitize=text=>String(text??'').replace(/\/(?:Users|home)\/[^\s"'`]+/g,'[LOCAL_PATH]').replace(/\/var\/folders\/[^\s"'`]+/g,'[LOCAL_PATH]').replace(/\b(?:Bearer\s+)[A-Za-z0-9._~-]+/gi,'Bearer [REDACTED]').replace(/\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g,'[REDACTED]').slice(0,4000);
const diagnosticCode=message=>/Failed to read global AGENTS/.test(message)?'global_instructions_read_denied':/Under-development features enabled: skip_host_skill_discovery/.test(message)?'host_skill_discovery_disabled_warning':/code-mode host is disabled/i.test(message)?'code_mode_disabled':/timed out|timeout/i.test(message)?'transport_timeout':'runtime_error';
let stop=false;
async function execute(trial){
 const stage=inputs.cases.find(row=>row.id===trial.caseId),input=stage.inputs.find(row=>row.mode===trial.mode),prompt=`${input.system}\n\n${input.user}`;
 if(sha(prompt)!==trial.inputSha256||sha(input.context)!==trial.contextSha256)throw new Error('Frozen prompt hash mismatch.');
 const cwd=mkdtempSync(path.join(os.tmpdir(),'secondu-v2-model-')),config={...fixed,default_permissions:'synthetic_text','permissions.synthetic_text.filesystem':{':minimal':'read',[cwd]:'read'}};
 const cliArgs=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--color','never','--json','--model',model,'--cd',cwd,...features.flatMap(feature=>['--disable',feature]),...Object.entries(config).flatMap(([key,value])=>['-c',`${key}=${toml(value)}`]),'-'];
 let stdout='',stderr='',timedOut=false,exitCode=null,spawnError=null;const start=performance.now();
 try{
  try{exitCode=await new Promise((resolve,reject)=>{const child=spawn('/usr/bin/sandbox-exec',['-p',isolationPolicy,command,...cliArgs],{cwd,env,shell:false,stdio:['pipe','pipe','pipe']});const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),1500).unref();},plan.timeoutMs);child.on('error',error=>{clearTimeout(timer);reject(error);});child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>2*1024*1024)child.kill('SIGTERM');});child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-16000);});child.on('close',code=>{clearTimeout(timer);resolve(code);});child.stdin.on('error',()=>{});child.stdin.end(prompt);});}catch(error){spawnError=error;}
  writeFileSync(path.join(logs,`${trial.id}.events.jsonl`),stdout);writeFileSync(path.join(logs,`${trial.id}.stderr.txt`),stderr);
  let malformed=0;const events=stdout.split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{malformed++;return [];}}),messages=events.filter(event=>event.type==='item.completed'&&event.item?.type==='agent_message').map(event=>event.item.text),output=messages.at(-1)??null;
  const completed=events.find(event=>event.type==='turn.completed'),toolEvents=events.filter(event=>event.item&&!['agent_message','reasoning','error','plan'].includes(event.item.type)),session=events.find(event=>event.type==='thread.started')?.thread_id;
  let parsed=null;try{parsed=JSON.parse(output);}catch{}
  const messagesDiagnostic=events.filter(event=>event.type==='error'||event.item?.type==='error').map(event=>event.message??event.item?.message??''),diagnostics=messagesDiagnostic.map(message=>({code:diagnosticCode(message),message:sanitize(message)}));
  if(spawnError)diagnostics.push({code:'spawn_error',message:sanitize(spawnError.message)});
  if(timedOut)diagnostics.push({code:'call_timeout',message:`The isolated call exceeded ${plan.timeoutMs} ms. No automatic retry was made.`});
  if(malformed)diagnostics.push({code:'malformed_event_lines',message:`${malformed} event lines could not be decoded.`});
  if(stderr.trim())diagnostics.push({code:'cli_stderr',message:sanitize(stderr)});
  const result={...trial,status:timedOut?'timeout':exitCode===0&&completed&&output&&toolEvents.length===0&&!malformed?'completed':'failed',exitCode,latencyMs:Math.round(performance.now()-start),inputSha256:sha(prompt),contextSha256:input.contextSha256,usage:completed?.usage??null,output,parsedOutput:parsed,outputSha256:output?sha(output):null,toolEventCount:toolEvents.length,diagnostics,isolation:{sessionIdSha256:session?sha(session):null,blockedGlobalInstructionReads:messagesDiagnostic.filter(message=>/Failed to read global AGENTS/.test(message)).length,eventTypes:[...new Set(events.map(event=>event.type))].sort(),itemTypes:[...new Set(events.filter(event=>event.item).map(event=>event.item.type))].sort(),temporaryWorkingDirectoryRemoved:true},localRawEvidence:{eventsSha256:sha(stdout),stderrSha256:sha(stderr)}};
  run.outputs.push(result);if(toolEvents.length)stop=true;save();console.log(JSON.stringify({id:trial.id,status:result.status,completed:run.outputs.length,planned:trials.length,latencyMs:result.latencyMs,usage:result.usage,toolEvents:toolEvents.length}));
 }finally{rmSync(cwd,{recursive:true,force:true});}
}
let next=0;await Promise.all(Array.from({length:plan.concurrency},async()=>{while(!stop&&next<trials.length){const trial=trials[next++];await execute(trial);}}));
run.finishedAt=new Date().toISOString();run.summary={planned:trials.length,recorded:run.outputs.length,completed:run.outputs.filter(row=>row.status==='completed').length,failed:run.outputs.filter(row=>row.status!=='completed').length,missing:trials.length-run.outputs.length,toolEvents:run.outputs.reduce((n,row)=>n+row.toolEventCount,0)};save();
console.log(JSON.stringify({finished:true,summary:run.summary,inputManifestSha256:run.inputManifestSha256,planSha256:run.planSha256}));
if(run.summary.completed!==trials.length||run.summary.toolEvents)process.exitCode=1;
