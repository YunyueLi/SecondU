import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { guideTeamTask, guideArtifacts, guideArtifactIndex } from '../src/onboarding/guideExamples.ts';
import { artifactFormat, embeddedFile } from '../src/artifacts/format.mjs';

test('the guide illustrates only dispatched specialists and collects them before completion',()=>{
  assert.equal(guideTeamTask(7000).mode,'demo');
  assert.equal(guideTeamTask(7000).teamRuns[0].nodes.length,1);
  assert.equal(guideTeamTask(8300).teamRuns[0].nodes.length,2);
  assert.equal(guideTeamTask(11400).teamRuns[0].nodes.length,3);
  assert.equal(guideTeamTask(11400).status,'running');
  assert.ok(guideTeamTask(14600).teamRuns[0].nodes.every(node=>node.status==='completed'));
  assert.deepEqual(guideTeamTask(7000).messages,[],'guide fixtures never stand in for a sent conversation');
});
test('guide format cues select actual text, code, table and PDF data',async()=>{
  const files=guideArtifacts();
  assert.deepEqual([0,2800,4800,8300].map(time=>artifactFormat(files[guideArtifactIndex(time)]).kind),['markdown','code','table','pdf']);
  const bytes=embeddedFile(files[3].content,'application/pdf');
  assert.ok(bytes);
  const task=getDocument({data:bytes,useSystemFonts:true,verbosity:0});
  try{const pdf=await task.promise;assert.equal(pdf.numPages,1);const page=await pdf.getPage(1);assert.ok((await page.getTextContent()).items.some(item=>item.str.includes('FICTIONAL GUIDE EXAMPLE')));}
  finally{await task.destroy();}
});
