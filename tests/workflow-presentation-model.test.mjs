import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowModel,workflowStages,stageStatus} from '../src/agents/workflowModel.ts';
const stage={id:'research',title:'Research',agentIds:['researcher'],after:[],connectionIds:{researcher:'assignment'}};
const connections=['assignment','workflow','agent','conversation','global'].map(id=>({id,model:`model-${id}`,name:`Connection ${id}`,provider:'openai'}));
const data={agents:[{id:'researcher',connectionId:'agent'}],modelConnections:connections,defaultConnectionId:'global'};
const task={connectionId:'conversation',team:{defaultConnectionId:'workflow'}};

test('model preview follows the dispatch hierarchy and distinguishes inherited values',()=>{
 assert.equal(workflowModel(task,undefined,stage,'researcher',data).model,'model-assignment');
 assert.equal(workflowModel(task,undefined,stage,'researcher',data,{inherit:true}).source,'workflow');
 assert.equal(workflowModel(task,undefined,stage,'researcher',data,{inherit:true,memberDefault:true}).source,'agent');
 const noAgent={...data,agents:[{id:'researcher'}]};
 assert.equal(workflowModel({...task,team:undefined},undefined,{...stage,connectionIds:undefined},'researcher',noAgent).source,'conversation');
 assert.equal(workflowModel({},undefined,{...stage,connectionIds:undefined},'researcher',noAgent).source,'default');
});
test('a running assignment shows its recorded model, including after a connection changes or is removed',()=>{
 const run={nodes:[{stageId:'research',agentId:'researcher',model:{connectionId:'assignment',model:'original-model',name:'Original connection',provider:'anthropic'}}]};
 const result=workflowModel(task,run,stage,'researcher',{...data,modelConnections:[]});
 assert.deepEqual(result,{connectionId:'assignment',model:'original-model',name:'Original connection',provider:'anthropic',source:'recorded'});
 assert.equal(workflowModel(task,{nodes:[{stageId:'research',agentId:'researcher'}]},stage,'researcher',data).source,'unrecorded');
});
test('a live run uses its current workflow while a pending review uses the editable draft',()=>{
 const draft={...stage,connectionIds:{researcher:'old'}},current={...stage,connectionIds:{researcher:'new'}};
 const run={workflowPlanId:'plan',workflow:[current],nodes:[]};
 assert.equal(workflowStages({workflowPlans:[{id:'plan',status:'confirmed',team:{workflow:[draft]}}]},run)[0].connectionIds.researcher,'new');
 assert.equal(workflowStages({workflowPlans:[{id:'plan',status:'pending',team:{workflow:[draft]}}]},run)[0].connectionIds.researcher,'old');
});
test('queued work is not labelled running and later attempts determine a stage state',()=>{
 const node={stageId:'research',agentId:'researcher'};
 assert.equal(stageStatus({nodes:[{...node,status:'queued'}]},stage),'queued');
 assert.equal(stageStatus({nodes:[{...node,status:'completed'},{...node,status:'failed'}]},stage),'failed');
 assert.equal(stageStatus({nodes:[{...node,status:'failed'},{...node,status:'completed'}]},stage),'completed');
 assert.equal(stageStatus({nodes:[]},{...stage,agentIds:[]}),'queued');
});

test('inherited previews use the launch snapshot when agent settings change during review',()=>{
 const run={nodes:[],memberModels:{researcher:{connectionId:'agent',name:'Original',model:'frozen-agent',provider:'anthropic',source:'agent'}}};
 assert.equal(workflowModel(task,run,{...stage,connectionIds:undefined},'researcher',data).model,'frozen-agent');
 assert.equal(workflowModel(task,run,stage,'researcher',data).model,'model-assignment');
});

import {workflowFiles,workflowPrimaryFile} from '../src/agents/workflowRunPresentation.ts';
test('the lead final document is the primary deliverable and unrelated task files do not leak in',()=>{
 const run={outputArtifactIds:['final'],programResult:{artifacts:[{id:'draft'}]},nodes:[{artifacts:[{id:'draft'}]}]};
 assert.deepEqual(workflowFiles(run,[{id:'unrelated'},{id:'draft'},{id:'final'}]).map(f=>f.id),['draft','final']);
 assert.equal(workflowPrimaryFile(run),'final');assert.equal(workflowPrimaryFile({...run,outputArtifactIds:undefined}),'draft');
});
