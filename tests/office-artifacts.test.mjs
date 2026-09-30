import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {createTask} from '../server/domain.mjs';
import {encodeBinaryArtifact,artifactBytes} from '../server/artifact-content.mjs';
import {validateOfficeArchive,officeEntries,OFFICE_LIMITS} from '../server/office-content.mjs';
import {createOfficePreviewer,findOfficeBinary,convertWithLibreOffice} from '../server/office-preview.mjs';
import {officeFixture,officeFixtureEntries,zipFixture,previewPdf} from './fixtures/office-documents.mjs';
async function fixture(t,options={}){const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-office-test-'));const app=createApp({dataDir:path.join(dir,'data'),seed:false,scheduler:false,computerInfo:{codexAvailable:false},...options});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});const task=createTask(app.store,{prompt:'Synthetic Office acceptance fixture',mode:'live'});return {app,task,dir,base:`http://127.0.0.1:${app.server.address().port}/api/`};}
test('OOXML validates type, ZIP boundaries, CRC, safe names and decompression limits',()=>{
 for(const extension of ['.docx','.xlsx','.pptx']){const bytes=officeFixture(extension);assert.equal(validateOfficeArchive('fixture'+extension,bytes).type.part.endsWith('.xml'),true);assert.deepEqual(artifactBytes({name:'fixture'+extension,...encodeBinaryArtifact('fixture'+extension,bytes)}).data,bytes);assert.throws(()=>encodeBinaryArtifact('wrong'+(extension==='.docx'?'.xlsx':'.docx'),bytes));assert.throws(()=>encodeBinaryArtifact('bad'+extension,bytes.subarray(0,-5)));}
 const entries=officeFixtureEntries('.docx');
 assert.doesNotThrow(()=>encodeBinaryArtifact('tutorial.docx',officeFixture('.docx','A plain explanation of macroEnabled and vbaProject words.')));
 for(const name of ['../outside.xml','/absolute.xml','word/../document.xml','word\\document.xml','word/%2e%2e/outside.xml'])assert.throws(()=>officeEntries(zipFixture([...entries,[name,'x']])));
 assert.throws(()=>officeEntries(zipFixture([...entries,entries[0]])));
 assert.throws(()=>officeEntries(zipFixture(entries,{flags:1})));
 assert.throws(()=>officeEntries(zipFixture(entries,{mode:0xa000})));
 const crc=officeFixture('.docx');crc[14]^=1;assert.throws(()=>officeEntries(crc));
 assert.throws(()=>officeEntries(zipFixture([...entries,['large.txt',Buffer.alloc(OFFICE_LIMITS.entryBytes+1)]])));
 assert.throws(()=>validateOfficeArchive('macro.docx',zipFixture([...entries,['word/vbaProject.bin','macro']])));
 assert.throws(()=>validateOfficeArchive('entity.docx',zipFixture(entries.map(([name,data])=>[name,name==='word/document.xml'?'<!DOCTYPE x [<!ENTITY payload SYSTEM "file:///private">]>'+data:data]))));
});
test('complex links and embedded objects remain downloadable but are rejected before preview conversion',()=>{
 const entries=officeFixtureEntries('.docx');
 const relation=target=>`<Relationships><Relationship Id="unsafe" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${target}" TargetMode="External"/></Relationships>`;
 for(const target of ['https://example.invalid/file','file:///private/file','../../../../outside']){const bytes=zipFixture([...entries,['word/_rels/document.xml.rels',relation(target)]]);assert.deepEqual(artifactBytes({name:'links.docx',...encodeBinaryArtifact('links.docx',bytes)}).data,bytes);assert.throws(()=>validateOfficeArchive('links.docx',bytes,{preview:true}),error=>error.code==='office_unsafe_content');}
 const embedded=zipFixture([...entries,['word/embeddings/linked.xlsx',officeFixture('.xlsx')]]);assert.doesNotThrow(()=>encodeBinaryArtifact('embedded.docx',embedded));assert.throws(()=>validateOfficeArchive('embedded.docx',embedded,{preview:true}));
 const localTraversal=zipFixture([...entries,['word/_rels/document.xml.rels','<Relationships><Relationship Type="internal" Target="../../outside.xml"/></Relationships>']]);assert.throws(()=>validateOfficeArchive('local.docx',localTraversal,{preview:true}));
 const declaration=zipFixture([...entries,['word/settings.xml','<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:smartTagType w:uri="http://schemas.microsoft.com/office/word"/></w:settings>']]);assert.doesNotThrow(()=>validateOfficeArchive('declarations.docx',declaration,{preview:true}));
 const connections=zipFixture([...officeFixtureEntries('.xlsx'),['xl/connections.xml','<connections><connection><webPr url="https://example.invalid/private"/></connection></connections>']]);assert.doesNotThrow(()=>encodeBinaryArtifact('links.xlsx',connections));assert.throws(()=>validateOfficeArchive('links.xlsx',connections,{preview:true}));
 const packageRoot=zipFixture(officeFixtureEntries('.xlsx').map(([name,data])=>[name,name==='xl/_rels/workbook.xml.rels'?data.replace('Target="worksheets/sheet1.xml"','Target="/xl/worksheets/sheet1.xml"'):data]));assert.doesNotThrow(()=>validateOfficeArchive('root.xlsx',packageRoot,{preview:true}));
});
test('Office collection preserves bytes and versions, but never collects credentials hidden in ZIP XML',async t=>{
 const f=await fixture(t),workspace=f.app.store.taskWorkspace(f.task.id);
 for(const extension of ['.docx','.xlsx','.pptx'])writeFileSync(path.join(workspace,'sample'+extension),officeFixture(extension));
 writeFileSync(path.join(workspace,'context.docx'),officeFixture('.docx','password="synthetic-secret-value"'));
 const collected=f.app.runner.collectWorkspace(f.task.id,new Map());assert.equal(collected.count,3);assert.equal(collected.skipped,1);
 for(const artifact of f.app.store.list('artifacts')){assert.equal(artifact.encoding,'data-url');const expected=readFileSync(path.join(workspace,artifact.name));const response=await fetch(f.base+`artifacts/${artifact.id}/download`);assert.equal(response.headers.get('content-type'),artifact.mime);assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);assert.equal((await fetch(f.base+`artifacts/${artifact.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'changed',baseVersion:1})})).status,409);}
});
test('preview uses private temporary profile, content cache, versions and clean failure states',async t=>{
 const f=await fixture(t);let calls=0;const directories=[];
 const preview=createOfficePreviewer(f.app.store,{binary:'synthetic-converter',convert:async options=>{calls++;directories.push(path.dirname(options.profileDir));assert.match(readFileSync(path.join(options.profileDir,'user','registrymodifications.xcu'),'utf8'),/DisableMacrosExecution/);assert.match(readFileSync(path.join(options.profileDir,'user','registrymodifications.xcu'),'utf8'),/BlockUntrustedRefererLinks/);assert.ok(options.input.endsWith('document.docx'));return previewPdf('version '+calls);}});
 const first=f.app.runner.saveArtifact(f.task.id,'document.docx',encodeBinaryArtifact('document.docx',officeFixture('.docx','First')).content,'用户');
 const [a,b]=await Promise.all([preview(first.id),preview(first.id)]);assert.deepEqual(a,b);assert.equal(calls,1);assert.ok(directories.every(dir=>!existsSync(dir)));
 const second=f.app.runner.saveArtifact(f.task.id,'document.docx',encodeBinaryArtifact('document.docx',officeFixture('.docx','Second')).content,'用户');assert.notDeepEqual(await preview(second.id),a);assert.deepEqual(await preview(second.id,'1'),a);assert.equal(calls,2);assert.ok(directories.every(dir=>!existsSync(dir)));
 await assert.rejects(preview(second.id,'../file'));await assert.rejects(preview(second.id,'3'),error=>error.code==='artifact_version_missing');
 await assert.rejects(createOfficePreviewer(f.app.store,{binary:()=>undefined})(first.id),error=>error.code==='office_preview_unavailable');
 let broken;await assert.rejects(createOfficePreviewer(f.app.store,{binary:'fixture',convert:async options=>{broken=path.dirname(options.profileDir);throw Error('Do not expose host path');}})(first.id),error=>error.code==='office_preview_failed'&&!error.message.includes('host path'));assert.equal(existsSync(broken),false);
});
test('Office HTTP preview is a PDF with no-store, has version isolation, and cannot cross local spaces',async t=>{
 let calls=0;const f=await fixture(t,{officePreviewOptions:{binary:'fixture',convert:async()=>previewPdf('conversion '+ ++calls)}});
 const artifact=f.app.runner.saveArtifact(f.task.id,'test.xlsx',encodeBinaryArtifact('test.xlsx',officeFixture('.xlsx')).content,'用户');
 const response=await fetch(f.base+`artifacts/${artifact.id}/preview`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('cache-control'),/no-store/);assert.ok(Buffer.from(await response.arrayBuffer()).subarray(0,5).equals(Buffer.from('%PDF-')));assert.equal(calls,1);
 assert.equal((await fetch(f.base+`artifacts/${artifact.id}/preview?version=100`)).status,404);
 await fetch(f.base+'spaces/personal',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal((await fetch(f.base+`spaces/personal/artifacts/${artifact.id}/preview`)).status,404);assert.equal(calls,1);
});
test('conversion timeout terminates its own process group and cleans all temporary files',{skip:process.platform==='win32'},async t=>{
 const f=await fixture(t);const binary=path.join(f.dir,'slow-converter');writeFileSync(binary,'#!/bin/sh\nsleep 60\n',{mode:0o700});let temporary;
 const artifact=f.app.runner.saveArtifact(f.task.id,'test.docx',encodeBinaryArtifact('test.docx',officeFixture('.docx')).content,'用户');
 const preview=createOfficePreviewer(f.app.store,{binary,timeoutMs:60,convert:async options=>{temporary=path.dirname(options.profileDir);return convertWithLibreOffice(options);}});
 await assert.rejects(preview(artifact.id),error=>error.code==='office_preview_timeout');assert.equal(existsSync(temporary),false);
});
test('production static worker and WASM responses have loadable MIME types under nosniff',async t=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'secondu-static-office-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));writeFileSync(path.join(dir,'worker.mjs'),'export const value=1;');writeFileSync(path.join(dir,'module.wasm'),Buffer.from([0,97,115,109,1,0,0,0]));const f=await fixture(t,{distDir:dir});
 for(const [name,mime] of [['worker.mjs','text/javascript; charset=utf-8'],['module.wasm','application/wasm']]){const response=await fetch(f.base.replace(/api\/$/,'')+name);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mime);assert.equal(response.headers.get('x-content-type-options'),'nosniff');}
});
test('installed LibreOffice converts three synthetic OOXML types to real PDF bytes',{skip:process.env.HITHER_TEST_REAL_OFFICE!=='1'},async t=>{
 assert.ok(findOfficeBinary(),'Opt-in check requires an installed converter');const f=await fixture(t);const preview=createOfficePreviewer(f.app.store);
 for(const extension of ['.docx','.xlsx','.pptx']){const artifact=f.app.runner.saveArtifact(f.task.id,'real'+extension,encodeBinaryArtifact('real'+extension,officeFixture(extension,'Synthetic '+extension+' acceptance')).content,'用户');const pdf=await preview(artifact.id);assert.ok(pdf.length>500);assert.doesNotThrow(()=>encodeBinaryArtifact('preview.pdf',pdf));}
});
