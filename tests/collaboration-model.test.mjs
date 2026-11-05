import test from 'node:test';
import assert from 'node:assert/strict';
import {collaborationRecords,collaborationAnchor,collaborationReply} from '../src/agents/collaborationModel.ts';
const at=n=>`2026-10-29T00:00:${String(n).padStart(2,'0')}Z`;
const worker={id:'n',agentId:'writer',name:'Writer',kind:'worker',objective:'Write the report',createdAt:at(1),startedAt:at(2),finishedAt:at(8),status:'completed',result:'Saved excerpt',resultTruncated:true,artifacts:[{id:'f'}],inputArtifacts:[{artifactId:'input'}]};
const run={id:'r',leadAgentId:'lead',nodes:[worker],startedAt:at(1),finishedAt:at(9)};
const msg=(id,detail,phase)=>({id,type:'runtime.message',agentId:'writer',teamNodeId:'n',createdAt:at(5),detail,activity:{kind:'message',phase:'completed',messagePhase:phase}});
test('collaboration uses recorded assignments, handoffs and full replies, excluding tool and reasoning events',()=>{
 const task={teamRuns:[run],events:[msg('m','Working on it','commentary'),msg('f','Full final answer','final_answer'),{...msg('t','secret command','commentary'),type:'runtime.action',activity:{kind:'command',phase:'completed'}},{...msg('r','internal reasoning','commentary'),type:'runtime.reasoning_summary'}]};
 const records=collaborationRecords(task,run);
 assert.deepEqual(records.map(r=>r.kind),['assignment','handoff','message','result']);
 assert.equal(records.at(-1).content,'Full final answer');assert.deepEqual(records.at(-1).artifactIds,['f']);assert.equal(records.at(-1).truncated,false);
});
test('historical saved replies appear once and retain their excerpt indicator',()=>{
 const records=collaborationRecords({events:[],teamRuns:[run]},run);assert.equal(records.filter(r=>r.kind==='result').length,1);assert.equal(records.at(-1).truncated,true);
});
test('concurrent assignments for the same expert do not mix replies',()=>{
 const other={...worker,id:'n2',objective:'Different task',result:'Different result'},r={...run,nodes:[worker,other]},task={teamRuns:[r],events:[msg('m','First only','commentary')]};
 const records=collaborationRecords(task,r);assert.equal(records.filter(r=>r.content==='First only').length,1);assert.equal(records.find(r=>r.content==='First only').nodeId,'n');
});
test('each collaboration and deliverable stays with its initiating turn',()=>{
 const messages=[{id:'u1',taskMessageId:'input1',role:'user',taskId:'task',createdAt:at(0)},{id:'a1',role:'assistant',taskId:'task',createdAt:at(10)},{id:'u2',taskMessageId:'input2',role:'user',taskId:'task',createdAt:at(20)},{id:'a2',role:'assistant',taskId:'task',createdAt:at(30)}];
 assert.equal(collaborationAnchor({...run,inputMessageId:'input1'},messages,'task'),'u1');assert.equal(collaborationReply(run,messages,'task'),'a1');
 const second={...run,id:'r2',inputMessageId:'input2',startedAt:at(21),finishedAt:at(29)};assert.equal(collaborationAnchor(second,messages,'task'),'u2');assert.equal(collaborationReply(second,messages,'task'),'a2');
 assert.equal(collaborationAnchor({...second,inputMessageId:undefined},messages,'task'),'u2');
});
