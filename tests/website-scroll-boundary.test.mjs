import test from 'node:test';
import assert from 'node:assert/strict';
import {canConsumeScroll,scrollableWithin} from '../website/src/embed/scroll.mjs';

test('inline workspace scrolls inside a pane and hands back at either boundary',()=>{
 const pane={scrollTop:200,scrollHeight:900,clientHeight:400,overflowY:'auto'};
 assert.equal(canConsumeScroll(pane,90),true);
 assert.equal(canConsumeScroll(pane,-90),true);
 assert.equal(canConsumeScroll({...pane,scrollTop:500},90),false);
 assert.equal(canConsumeScroll({...pane,scrollTop:0},-90),false);
 assert.equal(canConsumeScroll({...pane,overflowY:'hidden'},90),false);
 assert.equal(canConsumeScroll({...pane,scrollHeight:400},90),false);
});
test('a nested pane at the end still gives its scrollable ancestor a turn',()=>{
 const document={body:{},defaultView:{getComputedStyle:element=>({overflowY:element.overflowY})}};
 const outer={nodeType:1,ownerDocument:document,parentElement:document.body,scrollTop:50,scrollHeight:1000,clientHeight:500,overflowY:'auto'};
 const inner={nodeType:1,ownerDocument:document,parentElement:outer,scrollTop:300,scrollHeight:600,clientHeight:300,overflowY:'auto'};
 assert.equal(scrollableWithin(inner,60),true);
 outer.scrollTop=500;
 assert.equal(scrollableWithin(inner,60),false);
});
