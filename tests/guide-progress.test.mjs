import test from 'node:test';
import assert from 'node:assert/strict';
import {GUIDE_VERSION,readGuideProgress,saveGuideProgress,completeGuideChapter} from '../src/onboarding/guideProgress.mjs';
const memory=new Map();
const currentKey=`hither.product-guide.v${GUIDE_VERSION}`;
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
test('switching, closing, and skipping chapters never mark them completed',()=>{
 memory.clear();saveGuideProgress(2,false);assert.deepEqual(readGuideProgress(),{index:2,seen:false,completed:[]});saveGuideProgress(7,true);assert.deepEqual(readGuideProgress().completed,[]);
});
test('a completed chapter persists independently from current selection and is idempotent',()=>{
 memory.clear();saveGuideProgress(0,false);assert.deepEqual(completeGuideChapter('vision'),['vision']);saveGuideProgress(3,true);completeGuideChapter('vision');completeGuideChapter('experts');assert.deepEqual(readGuideProgress(),{index:3,seen:true,completed:['vision','experts']});
});
test('legacy, malformed, and unknown completion values are handled without inventing completion',()=>{
 memory.clear();memory.set(currentKey,JSON.stringify({version:GUIDE_VERSION,index:2,seen:true}));assert.deepEqual(readGuideProgress().completed,[]);
 memory.set(currentKey,JSON.stringify({version:GUIDE_VERSION,index:20,completed:['world','unknown','world']}));assert.deepEqual(readGuideProgress(),{index:7,seen:false,completed:['world']});
 memory.set(currentKey,'bad');assert.deepEqual(readGuideProgress(),{index:0,seen:false,completed:[]});
});

test('the new guide does not mark revised chapters complete from an older edition',()=>{memory.clear();memory.set('hither.product-guide.v3',JSON.stringify({version:3,index:7,seen:true,completed:['world']}));assert.deepEqual(readGuideProgress(),{index:0,seen:false,completed:[]});});
