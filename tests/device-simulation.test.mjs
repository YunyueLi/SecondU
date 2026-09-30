import test from 'node:test';
import assert from 'node:assert/strict';
import {initialDeviceSimulation as initial,deviceSimulationReducer as reduce} from '../src/deviceSimulation.ts';
const action=(state,type,fields={})=>reduce(state,{type,...fields});
function draft(){let s=action(initial(),'dictate',{text:'Fictional café feedback',noisy:false});s=action(s,'clarify',{answer:'A private pilot checklist'});return action(s,'prepare',{content:'Demo draft one'});}
test('capabilities gate camera and voice input, and observation requires a reviewed candidate',()=>{
 let s=initial();s=action(s,'observe');assert.equal(s.notice,'noCamera');assert.equal(s.observing,false);assert.equal(s.candidate,false);
 s=action(s,'capture',{text:'Not permitted'});assert.equal(s.brief,'');
 s=action(s,'capability',{capability:'camera',enabled:true});s=action(s,'observe');assert.equal(s.candidate,false);s=action(s,'capture',{text:'Fictional café note'});assert.equal(s.source,'camera');assert.equal(s.candidate,true);assert.equal(s.status,'clarifying');
 s=action(s,'capability',{capability:'audio',enabled:false});const before=s.brief;s=action(s,'dictate',{text:'Unavailable voice',noisy:false});assert.equal(s.notice,'noAudio');assert.equal(s.brief,before);assert.equal(s.speaking,false);
});
test('noisy inputs need clarification and all devices refer to the same task and revision',()=>{
 let s=action(initial(),'dictate',{text:'Uncertain fictional input',noisy:true});const id=s.taskId;assert.equal(s.status,'clarifying');assert.equal(s.noisy,true);
 s=action(s,'prepare',{content:'Cannot bypass clarification'});assert.equal(s.draft,'');assert.equal(s.writes.length,0);
 s=action(s,'clarify',{answer:'A checklist, not a message'});assert.equal(s.noisy,false);s=action(s,'prepare',{content:'Demo checklist'});s=action(s,'review');assert.equal(s.review.taskId,id);assert.equal(s.review.revision,s.revision);assert.equal(s.review.content,s.draft);assert.equal(s.candidate,true);
});
test('stopping and interrupting narration never silently cancel the task',()=>{
 let s=action(initial(),'dictate',{text:'A fictional observation',noisy:false});assert.equal(s.speaking,true);
 s=action(s,'stopSpeaking');assert.equal(s.speaking,false);assert.equal(s.status,'clarifying');const task=s.taskId;
 s=action(s,'clarify',{answer:'Private note'});s=action(s,'interrupt');assert.equal(s.taskId,task);assert.equal(s.status,'clarifying');assert.equal(s.speaking,false);
});
test('old revisions are rejected and a newly reviewed revision can be approved exactly once',()=>{
 let s=action(draft(),'review');const old=s.review.revision;s=action(s,'revise',{content:'Demo draft two'});assert(s.revision>old);s=action(s,'approve');assert.equal(s.notice,'stale');assert.equal(s.writes.length,0);
 s=action(s,'review');s=action(s,'approve');assert.equal(s.status,'complete');assert.equal(s.writes.length,1);assert.equal(s.writes[0].content,'Demo draft two');s=action(s,'replay');assert.equal(s.notice,'duplicate');assert.equal(s.writes.length,1);
});
test('offline phone approval waits, reconnects once and ignores repeated connection events',()=>{
 let s=action(draft(),'review');s=action(s,'network',{device:'phone',online:false});s=action(s,'approve');assert(s.queued);assert.equal(s.writes.length,0);const packet=s.queued.eventId;
 s=action(s,'network',{device:'phone',online:true});assert.equal(s.writes.length,1);assert.equal(s.writes[0].eventId,packet);assert.equal(s.queued,undefined);s=action(s,'network',{device:'phone',online:true});s=action(s,'replay');assert.equal(s.writes.length,1);
});
test('desktop disconnection also waits without writing and resumes the same approval',()=>{
 let s=action(draft(),'review');s=action(s,'network',{device:'desktop',online:false});s=action(s,'approve');assert.equal(s.notice,'waitingDesktop');assert.equal(s.writes.length,0);
 s=action(s,'network',{device:'desktop',online:true});assert.equal(s.writes.length,1);assert.equal(s.status,'complete');
});
test('queued stale or expired approvals cannot write after reconnect',()=>{
 for(const change of ['revise','advance']){let s=action(draft(),'review');s=action(s,'network',{device:'phone',online:false});s=action(s,'approve');s=change==='revise'?action(s,'revise',{content:'Changed while offline'}):action(s,'advance');s=action(s,'network',{device:'phone',online:true});assert.equal(s.writes.length,0);assert.equal(s.queued,undefined);assert.equal(s.notice,change==='revise'?'stale':'expired');}
});
test('cancel clears queued work and an old confirmation cannot resume the task',()=>{
 let s=action(draft(),'review');s=action(s,'network',{device:'phone',online:false});s=action(s,'approve');s=action(s,'cancel');assert.equal(s.queued,undefined);s=action(s,'network',{device:'phone',online:true});s=action(s,'replay');assert.equal(s.notice,'cancelledApproval');assert.equal(s.status,'cancelled');assert.equal(s.writes.length,0);
 const oldId=s.taskId;s=action(s,'reset');assert.notEqual(s.taskId,oldId);assert.equal(s.status,'idle');assert.equal(s.events.length,0);
});
test('queued duplicate confirmations clear on reconnect without another write',()=>{
 let s=action(draft(),'review');s=action(s,'approve');s=action(s,'network',{device:'phone',online:false});s=action(s,'approve');s=action(s,'network',{device:'phone',online:true});assert.equal(s.writes.length,1);assert.equal(s.queued,undefined);
});
