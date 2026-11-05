import {writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createApp} from '../../server/index.mjs';
const dataDir=process.argv[2];
const app=createApp({dataDir,scheduler:false,computerInfo:{codexAvailable:false},runCodex:async args=>{
 if(args.dynamicTools.some(t=>t.name==='team_plan'))return {text:'Checked resumed output.'};
 const reporting=args.prompt.includes('team-output-');
 if(reporting&&!existsSync(path.join(dataDir,'release.flag')))await new Promise((_,reject)=>args.signal.addEventListener('abort',()=>reject(Object.assign(new Error('stop'),{name:'AbortError'})),{once:true}));
 writeFileSync(path.join(args.workspace,reporting?'report.md':'research.md'),'persistent fictional evidence');return {text:'persistent fictional evidence'};
}});
const connection={...app.store.connection(),provider:'openai',api:'responses',baseUrl:'https://api.openai.com/v1',model:'fixture-model'};app.store.put('modelConnections',connection);app.store.setKey(connection,'synthetic-restart-key');
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));process.send({port:app.server.address().port});
process.on('SIGTERM',async()=>{await app.close();process.exit();});
