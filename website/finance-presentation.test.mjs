import test from 'node:test';
import assert from 'node:assert/strict';
import {financePreviewViews,installFinancePresentation} from './src/embed/finance-presentation.ts';

const widgets=['.finance-widget-net-worth','.finance-widget-spend-by-category','.finance-widget-spend-this-month','.finance-widget-upcoming-payments','.finance-dashboard-portfolio','.finance-widget-market-update','.finance-widget-credit-score'];
function presentation(){
 const listeners=new Map(),frames=new Map(),messages=[],available=new Set(widgets);let serial=0,observe=()=>{},full=false,opens=0,closes=0,busy=false,observedOptions;
 const location=new URL('https://example.test/SecondU/product/embed.html?presentation=finance#finance');
 class Element{focus(){return 'native-focus';}}
 const originalFocus=Element.prototype.focus;
 const options=['structure','allocation','details','all'].map((name,index)=>({dataset:{state:index===0?'on':'off'},click(){options.forEach(option=>{option.dataset.state=option===this?'on':'off';});observe();}}));
 const close={click(){closes++;full=false;observe();}};
 const fullscreen={querySelector:selector=>{
  if(selector===':scope > header button')return close;
  assert.equal(selector,'[data-finance-panorama-views]');
  return {querySelector:option=>{const name=/data-finance-panorama-view="([^"]+)"/.exec(option)?.[1];return options[['structure','allocation','details','all'].indexOf(name)];}};
 }};
 const open={disabled:false,click(){opens++;full=true;observe();}};
 const grid={getAttribute:name=>{assert.equal(name,'aria-busy');return String(busy);},querySelector:selector=>available.has(selector)?{}:null};
 const doc={documentElement:{dataset:{},lang:'zh-CN'},body:{inert:false},querySelector(selector){
  if(selector==='.finance-panorama-fullscreen')return full?fullscreen:null;
  if(selector==='.finance-page-overview > .finance-panorama .panorama-header-actions button')return location.hash==='#finance'?open:null;
  if(selector==='.finance-page-holdings .holdings-page')return location.hash==='#finance/holdings'?{}:null;
  if(selector==='.finance-page-overview > .finance-dashboard .finance-dashboard-grid')return location.hash==='#finance'?grid:null;
  return null;
 }};
 const view={location,document:doc,HTMLElement:Element,parent:{postMessage(message,origin){messages.push({message,origin});}},history:{state:null,replaceState(_state,_unused,url){location.href=String(url);full=false;observe();}},HashChangeEvent:class{constructor(type){this.type=type;}},MutationObserver:class{constructor(callback){observe=callback;}observe(_target,options){observedOptions=options;}disconnect(){observe=()=>{};}},requestAnimationFrame(callback){const id=++serial;frames.set(id,callback);return id;},cancelAnimationFrame(id){frames.delete(id);},addEventListener(type,callback){const entries=listeners.get(type)||new Set();entries.add(callback);listeners.set(type,entries);},removeEventListener(type,callback){listeners.get(type)?.delete(callback);},dispatchEvent(event){for(const callback of listeners.get(event.type)||[])callback(event);}};
 const flush=()=>{for(let step=0;frames.size&&step<12;step++){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback());}assert.equal(frames.size,0);};
 const send=(next,overrides={})=>view.dispatchEvent({type:'message',origin:location.origin,source:view.parent,data:{type:'secondu-finance-preview',view:next},...overrides});
 return {view,doc,messages,options,available,originalFocus,flush,send,opens:()=>opens,closes:()=>closes,observedOptions:()=>observedOptions,mutate:()=>observe(),setBusy:value=>{busy=value;observe();}};
}

test('finance story defaults to the four native overview widgets and selects all six views',()=>{
 assert.deepEqual(financePreviewViews,['overview','portfolio','structure','allocation','details','holdings']);
 const model=presentation(),stop=installFinancePresentation(model.view);model.flush();
 assert.equal(model.opens(),0);assert.equal(model.doc.documentElement.dataset.financePreviewView,'overview');
 assert.equal(model.messages.at(-1).message.view,'overview');
 model.send('portfolio');model.flush();assert.equal(model.messages.at(-1).message.view,'portfolio');assert.equal(model.opens(),0);
 model.send('structure');model.flush();assert.equal(model.opens(),1);
 model.send('allocation');model.flush();assert.equal(model.options[1].dataset.state,'on');assert.equal(model.opens(),1);
 model.send('details');model.flush();assert.equal(model.options[2].dataset.state,'on');assert.equal(model.opens(),1);
 model.send('holdings');model.flush();assert.equal(model.view.location.hash,'#finance/holdings');
 assert.equal(model.messages.at(-1).message.view,'holdings');
 model.send('overview');model.flush();assert.equal(model.view.location.hash,'#finance');assert.equal(model.messages.at(-1).message.view,'overview');
 assert.ok(model.messages.every(row=>row.origin==='https://example.test'));
 stop();
});
test('same-route dashboard selections close the native panorama before announcing readiness',()=>{
 const model=presentation(),stop=installFinancePresentation(model.view);model.flush();
 for(const target of ['overview','portfolio']){
  model.send('structure');model.flush();
  const count=model.messages.length;
  model.send(target);model.flush();
  assert.equal(model.view.location.hash,'#finance');assert.equal(model.messages.length,count+1);
  assert.equal(model.messages.at(-1).message.view,target);
 }
 assert.equal(model.opens(),2);assert.equal(model.closes(),2);
 stop();
});
test('dashboard readiness waits for every selected native widget and settled analysis',()=>{
 const model=presentation();model.available.delete('.finance-widget-upcoming-payments');
 const stop=installFinancePresentation(model.view);model.flush();assert.equal(model.messages.length,0);
 model.available.add('.finance-widget-upcoming-payments');model.setBusy(true);model.flush();assert.equal(model.messages.length,0);
 model.setBusy(false);model.flush();assert.equal(model.messages.at(-1).message.view,'overview');
 model.available.delete('.finance-widget-credit-score');model.send('portfolio');model.flush();
 assert.equal(model.messages.at(-1).message.view,'overview');
 model.available.add('.finance-widget-credit-score');model.mutate();model.flush();
 assert.equal(model.messages.at(-1).message.view,'portfolio');
 assert.ok(model.observedOptions().attributeFilter.includes('aria-busy'));
 stop();
});
test('finance story rejects messages from another sender, origin or unlisted view',()=>{
 const model=presentation(),stop=installFinancePresentation(model.view);model.flush();
 model.send('allocation',{source:{}});model.send('details',{origin:'https://other.test'});model.send('settings/connectors');model.flush();
 assert.equal(model.opens(),0);assert.equal(model.view.location.hash,'#finance');assert.equal(model.messages.length,1);
 assert.equal(model.doc.documentElement.dataset.financePreviewView,'overview');
 stop();
});
test('newer view requests supersede pending views without stale readiness',()=>{
 const model=presentation(),stop=installFinancePresentation(model.view);model.flush();
 model.send('structure');model.send('portfolio');model.flush();
 assert.equal(model.opens(),0);assert.deepEqual(model.messages.map(row=>row.message.view),['overview','portfolio']);
 stop();
});
test('presentation is inert while native methods remain intact and cleanup restores interaction',()=>{
 const model=presentation(),stop=installFinancePresentation(model.view);
 assert.equal(model.doc.body.inert,true);assert.equal(model.view.HTMLElement.prototype.focus,model.originalFocus);
 stop();model.flush();assert.equal(model.doc.body.inert,false);assert.equal(model.view.HTMLElement.prototype.focus,model.originalFocus);
 assert.equal(model.doc.documentElement.dataset.websitePresentation,undefined);assert.equal(model.doc.documentElement.dataset.financePreviewView,undefined);assert.equal(model.messages.length,0);
});
test('standalone product remains interactive and receives no presentation changes',()=>{
 const model=presentation();model.view.parent=model.view;
 const stop=installFinancePresentation(model.view);model.flush();
 assert.equal(model.doc.documentElement.dataset.websitePresentation,undefined);assert.equal(model.view.HTMLElement.prototype.focus,model.originalFocus);assert.equal(model.opens(),0);stop();
});
