// Synthetic, isolated measurement of source loading during context selection.
// It does not measure app startup, bootstrap, model latency or decision quality.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Store} from '../server/store.mjs';
import {personalContextFor} from '../server/personal-context.mjs';

const worker=process.argv.indexOf('--worker');
if(worker>=0){
  const [mode,directory]=process.argv.slice(worker+1),store=new Store(directory,{seed:false});
  const start=performance.now();
  if(mode==='before'){
    // Reproduce the previous source-map loading, using the same selection logic.
    const sources=new Map(store.list('sources').map(source=>[source.id,source]));
    store.sourceInfo=id=>sources.get(id);
  }
  const bundle=personalContextFor(store,{prompt:'Synthetic deadline',digitalTwinEnabled:true},{at:'2026-01-01T00:00:00.000Z'});
  const elapsedMs=performance.now()-start;
  const result={elapsedMs,peakRssKiB:process.resourceUsage().maxRSS,selectedIds:bundle.facts.map(f=>f.id),resultHash:createHash('sha256').update(JSON.stringify(bundle)).digest('hex')};
  store.close();process.stdout.write(JSON.stringify(result));
}else{
  const directory=mkdtempSync(path.join(tmpdir(),'secondu-context-benchmark-'));
  try{
    const store=new Store(directory,{seed:false}),count=256,chars=200000;
    store.transaction(()=>{
      for(let i=0;i<count;i++)store.put('sources',{id:`synthetic-${i}`,title:`Synthetic source ${i}`,kind:'document',text:'合成资料。'.repeat(chars/5),demo:true});
      store.put('facts',{id:'synthetic-fact',kind:'constraint',statement:'Synthetic deadline',status:'confirmed',version:1,sourceIds:['synthetic-0']});
    });store.close();
    const samples={before:[],after:[]};
    for(let i=0;i<5;i++)for(const mode of i%2?['after','before']:['before','after']){
      const run=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--worker',mode,directory],{encoding:'utf8'});
      if(run.status!==0)throw new Error(run.stderr||`Benchmark worker exited ${run.status}`);
      samples[mode].push(JSON.parse(run.stdout));
    }
    if(new Set([...samples.before,...samples.after].map(v=>v.resultHash)).size!==1)throw new Error('Context output changed');
    const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
    console.log(JSON.stringify({scope:'Synthetic source loading during context selection only; before simulates the previous eager source map.',sourceCount:count,sourceCharacters:count*chars,outputIdentical:true,before:{medianMs:median(samples.before.map(v=>v.elapsedMs)),medianPeakRssMiB:median(samples.before.map(v=>v.peakRssKiB))/1024},after:{medianMs:median(samples.after.map(v=>v.elapsedMs)),medianPeakRssMiB:median(samples.after.map(v=>v.peakRssKiB))/1024},samples},null,2));
  }finally{rmSync(directory,{recursive:true,force:true});}
}
