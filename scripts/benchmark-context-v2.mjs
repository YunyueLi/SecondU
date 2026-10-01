import path from 'node:path';
import {freezeSuite} from '../benchmarks/context/suite-v2.mjs';
const args=process.argv.slice(2),pilot=args.includes('--pilot'),index=args.indexOf('--output');
if(index<0||!args[index+1]||args.some((arg,i)=>arg!=='--pilot'&&arg!=='--output'&&i!==index+1))throw new Error('Usage: node scripts/benchmark-context-v2.mjs [--pilot] --output DIRECTORY');
const {report,sha256}=freezeSuite(path.resolve(args[index+1]),{pilot});
console.log(JSON.stringify({inputManifestSha256:sha256,protocol:report.protocol,checks:report.summary}));
if(report.summary.checks!==report.summary.passed)process.exitCode=1;
