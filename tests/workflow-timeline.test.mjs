import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowTimeline,workflowVerticalPaths} from '../src/agents/workflowTimeline.ts';
import {teamConfiguration} from '../server/team-runs.mjs';
const stage=(i,after=[])=>({id:`s${i}`,title:`阶段 ${i+1}`,agentIds:['worker'],after,description:'',required:true});
for(const count of [0,1,2,3,4,6,10,20])test(`${count} stages retain every assignment and every dependency`,()=>{
 const stages=Array.from({length:count},(_,i)=>stage(i,i?[`s${i-1}`]:[]));
 const layout=workflowTimeline(stages);
 assert.equal(layout.stations.length,count);assert.equal(layout.edges.length,Math.max(0,count-1));
 assert.equal(new Set(layout.stations.map(station=>station.x)).size,count);
 assert.ok(layout.stations.every(station=>Number.isFinite(station.y)));
 assert.ok(layout.edges.every(edge=>!edge.path.includes('NaN')));
 assert.equal(teamConfiguration({leadAgentId:'lead',maxNodes:72,workflow:stages},['lead','worker'],'group').workflow.length,count);
});
test('parallel branches have separate tracks and never receive a fabricated sequential edge',()=>{
 const stages=[stage(0),stage(1,['s0']),stage(2,['s0']),stage(3,['s1']),stage(4,['s2']),stage(5,['s3','s4'])];
 const result=workflowTimeline(stages);
 assert.notEqual(result.tracks[1],result.tracks[2]);assert.equal(result.tracks[1],result.tracks[3]);assert.equal(result.tracks[2],result.tracks[4]);
 assert.deepEqual(result.edges.map(e=>`${e.from}>${e.to}`).sort(),['0>1','0>2','1>3','2>4','3>5','4>5']);
 assert.ok(result.stations[1].y!==result.stations[2].y);
});
test('dense cross-branch dependencies retain their exact endpoints',()=>{
 const stages=[stage(0),stage(1),stage(2),stage(3,['s0','s1','s2']),stage(4,['s0','s2']),stage(5,['s1','s3','s4'])];
 const result=workflowTimeline(stages);
 assert.equal(result.edges.length,8);assert.equal(new Set(result.edges.map(e=>e.path)).size,8);
 assert.ok(result.edges.every(edge=>edge.from<edge.to));
});
test('invalid future or cyclic dependencies are rejected at authoring',()=>{
 assert.throws(()=>teamConfiguration({leadAgentId:'lead',maxNodes:72,workflow:[stage(0,['s1']),stage(1,['s0'])]},['lead','worker'],'group'),{code:'team_workflow_invalid'});
});

test('vertical sidebar joins the two parallel workers only to their report',()=>{
 const graph=workflowTimeline([stage(0),stage(1),stage(2,['s0','s1'])]);
 const points=graph.tracks.map((track,index)=>({x:21+14*track,y:18+index*36}));
 const paths=workflowVerticalPaths(points,graph.edges);
 assert.deepEqual(paths.map(edge=>`${edge.from}>${edge.to}`).sort(),['0>2','1>2']);
 for(const edge of paths){assert.ok(edge.path.startsWith(`M${points[edge.from].x} ${points[edge.from].y+6}`));assert.ok(edge.path.endsWith(`V${points[edge.to].y-7}`));}
 assert.equal(workflowVerticalPaths(points,[]).length,0);
 const expanded=points.map((point,index)=>({...point,y:point.y+(index?140:0)}));
 assert.ok(workflowVerticalPaths(expanded,graph.edges).every(edge=>edge.path.endsWith(`V${expanded[edge.to].y-7}`)));
});
test('vertical skip edges route around intermediate stage markers',()=>{
 const paths=workflowVerticalPaths([{x:21,y:18},{x:21,y:54},{x:21,y:90}],[{from:0,to:2}]);
 assert.ok(paths[0].path.includes('Q'));
 assert.ok(!paths[0].path.includes('NaN'));
 assert.deepEqual(workflowVerticalPaths([undefined,{x:21,y:54}],[{from:0,to:1}]),[]);
});
