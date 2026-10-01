import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const publicRuns = ['2026-10-01', '2026-10-01-v2'];
const coreEvidenceFiles = ['inputs.json', 'model-results.json', 'review.json'];
/** Copy the explicitly reviewed synthetic artifacts, never local event logs. */
export async function copyBenchmarkAssets({sourceDirectory, outputDirectory}) {
 for (const run of publicRuns) {
  const source=path.join(sourceDirectory,run);
  try {if(!(await lstat(source)).isDirectory())throw new Error(`Benchmark source is not a directory: ${run}`);} catch(error) {if(error.code==='ENOENT'&&run.endsWith('-v2'))continue;throw error;}
  const evidenceFiles=run.endsWith('-v2')?[...coreEvidenceFiles,'plan.json']:coreEvidenceFiles;
  const evidence={};
  for(const name of evidenceFiles){
   const file=path.join(source,name);
   if(!(await lstat(file)).isFile())throw new Error(`Benchmark evidence must be a regular file: ${run}/${name}`);
   const bytes=await readFile(file),parsed=JSON.parse(bytes.toString('utf8'));
   if(parsed.synthetic!==true&&parsed.fixture?.synthetic!==true)throw new Error(`Benchmark evidence must be explicitly synthetic: ${run}/${name}`);
   evidence[name]={bytes,parsed};
  }
  const hashes=evidence['review.json'].parsed.evidence;
  const expectedHashes=[['inputs.json','inputsSha256'],['model-results.json','resultsSha256'],...(run.endsWith('-v2')?[['plan.json','planSha256']]:[])];
  for(const [name,key] of expectedHashes){
   const digest=createHash('sha256').update(evidence[name].bytes).digest('hex');
   if(hashes?.[key]!==digest)throw new Error(`Benchmark evidence hash mismatch: ${run}/${name}`);
  }
  const output=path.join(outputDirectory,'benchmark',run);
  await mkdir(output,{recursive:true});
  for(const name of evidenceFiles)await writeFile(path.join(output,name),evidence[name].bytes);
  // Keep the historical report intact except for its documentation link, which
  // must resolve from a published subdirectory rather than the source checkout.
  const report=path.join(source,'review.html');
  try {
   if(!(await lstat(report)).isFile())throw new Error(`Benchmark report must be a regular file: ${run}`);
   const html=await readFile(report,'utf8');
   await writeFile(path.join(output,'review.html'),html.replaceAll('../../../docs/CONTEXT-BENCHMARK.md','https://github.com/YunyueLi/SecondU/blob/main/docs/CONTEXT-BENCHMARK.md'));
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }
}
