import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createAppUpdater}=createRequire(import.meta.url)('../desktop/updater.cjs');
const token='ABCDE123-1234-4567-8901-0123456789AB',nextToken='ABCDE124-1234-4567-8901-0123456789AB';
const idle={phase:'idle',canCheckForUpdates:true,canShow:true,sessionInProgress:false,started:true};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}) {
  let state={...idle}, callback;const calls=[],events=[],requests=[];
  const native={start({onEvent}){calls.push('start');callback=onEvent;return state;},getState(){return state;},checkForUpdates(){calls.push('check');return state;},checkInBackground(){calls.push('background');return state;},show(){calls.push('show');return state;},resumeRelaunch(t){calls.push(['resume',t]);return state;}};
  const updater=createAppUpdater({packaged:true,platform:'darwin',version:'0.1.5',loadNative:()=>native,onChange:s=>events.push(s),onPrepareRelaunch:t=>requests.push(t),...options});
  return {updater,native,calls,events,requests,set:s=>state=s,emitStale:e=>callback(e),emit:e=>{if(e.state)state=e.state;callback(e);}};
}

test('only packaged macOS loads the native engine, and startup is idempotent',()=>{
  for(const options of [{packaged:false,platform:'darwin'},{packaged:true,platform:'linux'},{packaged:true,platform:'win32'}]){
    const u=createAppUpdater({...options,version:'0.1.5',loadNative(){throw Error('must not load');}});
    for(const method of ['start','getState','check','checkInBackground','show'])assert.equal(u[method]().phase,'unavailable');
    assert.equal(u.getState().supported,false);
  }
  const f=fixture();f.updater.start();f.updater.start();assert.deepEqual(f.calls,['start']);assert.equal(f.updater.getState().currentVersion,'0.1.5');
});

test('renderer states contain only safe facts, and preserve genuine available/downloaded states',()=>{
  const f=fixture();f.updater.start();const original={...idle,phase:'available',updateVersion:'0.1.6',lastCheckedAt:1728000000000,token,privatePath:'/Users/private/key',error:{domain:'/private/domain',code:99,message:'secret'},downloadedBytes:512,totalBytes:1024};
  f.emit({type:'state',state:original,token});const snapshot=f.updater.getState();
  assert.deepEqual(snapshot,{supported:true,currentVersion:'0.1.5',phase:'available',canCheckForUpdates:true,canShow:true,sessionInProgress:false,lastCheckedAt:'2024-10-04T00:00:00.000Z',updateVersion:'0.1.6',downloadedBytes:512,totalBytes:1024});
  assert.doesNotMatch(JSON.stringify(f.events),/private|secret|token|ABCDE/);assert.equal(Object.isFrozen(snapshot),true);
  f.emit({type:'state',state:{...idle,phase:'downloaded',updateVersion:'0.1.6',sessionInProgress:false}});assert.equal(f.updater.getState().phase,'downloaded');
});

test('native error text, domains and exception paths never reach renderer state',()=>{
  const f=fixture();f.updater.start();
  for(const [domain,code,reason] of [['SUSparkleErrorDomain',3001,'signature'],['NSURLErrorDomain',-1001,'network'],['SUSparkleErrorDomain',1005,'install-location'],['SUSparkleErrorDomain',4012,'permission'],['/Users/private',999,'unknown']]){
    f.emit({type:'error',state:{...idle,phase:'error',error:{domain,code,message:'/Users/private/credentials.json api-key-secret'}}});const s=f.updater.getState();assert.equal(s.errorReason,reason);assert.doesNotMatch(JSON.stringify(s),/Users|credentials|api-key-secret|domain|3001/);
  }
  const failed=createAppUpdater({packaged:true,platform:'darwin',loadNative(){throw new Error('/Users/private/build/path');}});assert.equal(failed.start().errorReason,'updater-unavailable');assert.doesNotMatch(JSON.stringify(failed.getState()),/Users|build/);
});

test('unknown states and invalid optional fields fail closed; incompatibility is not latest',()=>{
  const f=fixture();f.updater.start();f.set({phase:'pretend-installed',canCheckForUpdates:true,canShow:true});assert.equal(f.updater.getState().errorReason,'invalid-state');assert.equal(f.updater.getState().canShow,false);
  f.set({...idle,phase:'no-update',noUpdateReason:'system-too-old',lastCheckedAt:Infinity,updateVersion:'../../private',downloadedBytes:-1,totalBytes:0});assert.deepEqual(f.updater.getState(),{supported:true,currentVersion:'0.1.5',phase:'no-update',canCheckForUpdates:true,canShow:true,sessionInProgress:false,noUpdateReason:'system-too-old'});
});

test('check and show respect actual native action availability',()=>{
  const f=fixture();f.updater.start();f.set({...idle,phase:'downloading',canCheckForUpdates:false,canShow:false,sessionInProgress:true});f.updater.check();f.updater.show();assert.deepEqual(f.calls,['start']);
  f.set({...idle,phase:'available'});f.updater.show();f.updater.check();assert.deepEqual(f.calls,['start','show','check']);
});

test('relaunch tokens stay private, duplicate requests coalesce, stale and repeated resume fail',async()=>{
  let release;const handshakes=[];const f=fixture({onPrepareRelaunch:t=>{handshakes.push(t);return new Promise(resolve=>release=resolve);}});f.updater.start();const state={...idle,phase:'awaiting-relaunch',awaitingRelaunch:true,canCheckForUpdates:false,canShow:true};
  f.emit({type:'prepare-relaunch',state,token});f.emit({type:'prepare-relaunch',state,token});await flush();assert.deepEqual(handshakes,[token]);assert.doesNotMatch(JSON.stringify(f.events),/ABCDE|token|awaitingRelaunch/);
  assert.throws(()=>f.updater.resumeRelaunch(nextToken),{code:'updater_stale_relaunch'});f.updater.resumeRelaunch(token);assert.throws(()=>f.updater.resumeRelaunch(token),{code:'updater_stale_relaunch'});assert.equal(f.calls.filter(c=>Array.isArray(c)&&c[0]==='resume').length,1);release();await flush();
  f.emit({type:'prepare-relaunch',state,token});await flush();assert.equal(handshakes.length,1);
});

test('declining a preparation leaves installation paused and allows the same token to be retried explicitly',async()=>{
  const f=fixture();f.updater.start();const state={...idle,phase:'awaiting-relaunch',awaitingRelaunch:true};f.emit({type:'prepare-relaunch',state,token});await flush();f.emit({type:'prepare-relaunch',state,token});await flush();assert.deepEqual(f.requests,[token,token]);assert.equal(f.calls.some(Array.isArray),false);
  f.emit({type:'prepare-relaunch',state,token:nextToken});await flush();assert.throws(()=>f.updater.resumeRelaunch(token),{code:'updater_stale_relaunch'});
});

test('rejected asynchronous preparations fail closed without leaking exception details',async()=>{
  const f=fixture({onPrepareRelaunch:async()=>{throw Error('/Users/private/exit-state');}});f.updater.start();f.emit({type:'prepare-relaunch',state:{...idle,phase:'awaiting-relaunch',awaitingRelaunch:true},token});await flush();assert.equal(f.events.at(-1).errorReason,'relaunch');assert.doesNotMatch(JSON.stringify(f.events),/Users|exit-state/);assert.equal(f.calls.some(Array.isArray),false);
});

test('native cancellation invalidates an outstanding preparation before a late approval can resume',async()=>{
  let complete;const f=fixture({onPrepareRelaunch:()=>new Promise(resolve=>complete=resolve)});f.updater.start();
  f.emit({type:'prepare-relaunch',state:{...idle,phase:'awaiting-relaunch',awaitingRelaunch:true},token});await flush();
  f.emit({type:'state',state:{...idle,phase:'available',awaitingRelaunch:false}});
  assert.throws(()=>f.updater.resumeRelaunch(token),{code:'updater_stale_relaunch'});complete();await flush();assert.equal(f.calls.some(Array.isArray),false);
});

test('a replaced preparation is never dispatched from an older queued event',async()=>{
  const f=fixture();f.updater.start();const state={...idle,phase:'awaiting-relaunch',awaitingRelaunch:true};
  f.emit({type:'prepare-relaunch',state,token});f.emit({type:'prepare-relaunch',state,token:nextToken});await flush();assert.deepEqual(f.requests,[nextToken]);
});

test('queued preparation after native cancellation cannot begin shutdown',async()=>{
  const f=fixture();f.updater.start();f.set({...idle,phase:'available',awaitingRelaunch:false});
  f.emitStale({type:'prepare-relaunch',state:{...idle,phase:'awaiting-relaunch',awaitingRelaunch:true},token});await flush();assert.deepEqual(f.requests,[]);assert.equal(f.updater.getState().phase,'available');
});

test('events from a failed startup cannot reactivate the updater or request restart',async()=>{
  let callback;const events=[],requests=[];const native={start({onEvent}){callback=onEvent;throw Error('private native load path');},getState(){return idle;},checkForUpdates(){},checkInBackground(){},show(){},resumeRelaunch(){}};
  const updater=createAppUpdater({packaged:true,platform:'darwin',loadNative:()=>native,onChange:s=>events.push(s),onPrepareRelaunch:t=>requests.push(t)});updater.start();
  callback({type:'prepare-relaunch',state:{...idle,phase:'awaiting-relaunch',awaitingRelaunch:true},token});await flush();assert.equal(updater.getState().errorReason,'updater-unavailable');assert.deepEqual(requests,[]);assert.doesNotMatch(JSON.stringify(events),/private|token|ABCDE/);
});

test('background checks use only the information probe and leave known updates or active sessions intact',()=>{
  const f=fixture();f.updater.start();
  for(const phase of ['available','downloading','downloaded','extracting','ready','awaiting-relaunch','installing','checking']){f.set({...idle,phase});f.updater.checkInBackground();}
  f.set({...idle,sessionInProgress:true});f.updater.checkInBackground();
  f.set({...idle,canCheckForUpdates:false});f.updater.checkInBackground();assert.deepEqual(f.calls,['start']);
  for(const phase of ['idle','up-to-date','no-update','error']){f.set({...idle,phase});f.updater.checkInBackground();}
  assert.deepEqual(f.calls,['start','background','background','background','background']);
});

test('inconsistent or unsafe download lengths never produce a determinate percentage',()=>{
  const f=fixture();f.updater.start();
  f.set({...idle,phase:'downloading',downloadedBytes:120,totalBytes:100});assert.equal(f.updater.getState().totalBytes,undefined);assert.equal(f.updater.getState().downloadedBytes,120);
  f.set({...idle,phase:'downloading',downloadedBytes:Number.MAX_SAFE_INTEGER+1,totalBytes:Infinity});assert.equal(f.updater.getState().downloadedBytes,undefined);assert.equal(f.updater.getState().totalBytes,undefined);
});

test('main-process relaunch predicate rechecks native cancellation before backend commit',async()=>{
  const f=fixture();f.updater.start();f.emit({type:'prepare-relaunch',state:{...idle,phase:'awaiting-relaunch',awaitingRelaunch:true},token});await flush();
  assert.equal(f.updater.isRelaunchPending(token),true);assert.equal(f.updater.isRelaunchPending(nextToken),false);
  // The native cancellation exists already; its queued notification has not
  // reached JavaScript. Commit checks must still reject the old preparation.
  f.set({...idle,phase:'available',awaitingRelaunch:false});
  assert.equal(f.updater.isRelaunchPending(token),false);assert.throws(()=>f.updater.resumeRelaunch(token),{code:'updater_stale_relaunch'});assert.equal(f.calls.some(Array.isArray),false);
});
