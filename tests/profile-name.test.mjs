import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../server/store.mjs';
import { saveProfile } from '../server/profile.mjs';
import { displayProfileName } from '../shared/profile-name.mjs';

test('optional English name is stored, retained by unrelated profile updates, cleared explicitly and survives restart',t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'secondu-profile-name-'));let store=new Store(directory,{seed:false});t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 const initial=saveProfile(store,{name:'万叶',englishName:'  Caspian  ',description:'Example profile'});
 assert.equal(initial.name,'万叶');assert.equal(initial.englishName,'Caspian');assert.equal(initial.demo,false);
 assert.equal(saveProfile(store,{description:'A new description'}).englishName,'Caspian');
 store.close();store=new Store(directory,{seed:false});assert.equal(store.meta('profile').englishName,'Caspian');
 assert.throws(()=>saveProfile(store,{englishName:7}),/englishName/);assert.throws(()=>saveProfile(store,{englishName:'x'.repeat(201)}),/englishName/);
 assert.equal(saveProfile(store,{englishName:''}).englishName,undefined);assert.equal(store.meta('profile').name,'万叶');
 saveProfile(store,{englishName:'Caspian'});assert.equal(saveProfile(store,{englishName:null}).englishName,undefined);
});
test('locale display chooses only an explicit English preference and never modifies canonical evidence',()=>{
 const profile={name:'万叶',englishName:'Caspian',description:'万叶保留在原始记录中'};const before=structuredClone(profile);
 assert.equal(displayProfileName(profile,'zh-CN'),'万叶');assert.equal(displayProfileName(profile,'en'),'Caspian');assert.deepEqual(profile,before);
 assert.equal(displayProfileName({name:'真实姓名'},'en'),'真实姓名');assert.equal(displayProfileName({name:'真实姓名',englishName:' '},'en'),'真实姓名');
});
