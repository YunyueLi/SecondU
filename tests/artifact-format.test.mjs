import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactContentSize, artifactFormat, parseDelimited, embeddedFile, embeddedFileByteLength } from '../src/artifacts/format.mjs';

test('file extensions select actual viewers without executing component source', () => {
  assert.deepEqual(['view.tsx','script.py','result.json'].map(name=>artifactFormat({name,type:'text'}).kind),['code','code','code']);
  assert.equal(artifactFormat({name:'view.tsx',type:'code'}).language,'tsx');
  assert.equal(artifactFormat({name:'report.csv',type:'text'}).kind,'table');
  assert.equal(artifactFormat({name:'report.pdf',type:'text'}).editable,false);
  assert.equal(artifactFormat({name:'drawing.svg',type:'code'}).kind,'svg');
});

test('Office formats use precise MIME types and remain read only, with legacy formats distinct', () => {
  for(const [extension,mime] of [['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],['pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation']]) {
    assert.deepEqual(artifactFormat({name:`output.${extension}`,type:'text'}),{kind:'office',label:extension.toUpperCase(),language:'text',mime,editable:false});
  }
  for(const extension of ['doc','xls','ppt'])assert.equal(artifactFormat({name:`old.${extension}`}).kind,'legacy-office');
});

// A minimal ZIP directory is enough to test the front-end byte gate; the server
// separately validates package contents, size limits and active content.
function zipDirectory(names) {
  let offset=0;const local=[],central=[];
  for(const name of names){
    const bytes=Buffer.from(name),header=Buffer.alloc(30),entry=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(bytes.length,26);
    entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(bytes.length,28);entry.writeUInt32LE(offset,42);
    local.push(header,bytes);central.push(entry,bytes);offset+=header.length+bytes.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}

test('Office preview requires real ZIP bytes and matching OOXML package parts', () => {
  for(const [extension,part] of [['docx','word/document.xml'],['xlsx','xl/workbook.xml'],['pptx','ppt/presentation.xml']]) {
    const mime=artifactFormat({name:`file.${extension}`}).mime,bytes=zipDirectory(['[Content_Types].xml',part]);
    const content=`data:${mime};base64,${bytes.toString('base64')}`;
    assert.deepEqual(Buffer.from(embeddedFile(content,mime)),bytes);
    assert.equal(embeddedFileByteLength(content,mime),bytes.length);
    assert.equal(embeddedFile(`/tmp/file.${extension}`,mime),null);
    assert.equal(embeddedFile(`data:${mime};base64,${zipDirectory(['[Content_Types].xml','unrelated.xml']).toString('base64')}`,mime),null);
    assert.equal(embeddedFile(`data:${mime};base64,${bytes.subarray(0,-22).toString('base64')}`,mime),null);
    assert.equal(embeddedFile(content,'application/octet-stream'),null);
    assert.equal(embeddedFile(`data:${mime};base64,${Buffer.from('PK\x03\x04 only a fake header').toString('base64')}`,mime),null);
  }
  assert.equal(embeddedFile('data:application/msword;base64,anVzdCB0ZXh0','application/msword'),null);
});

test('CSV keeps quoted newlines, separators, leading zeros, formulas and empty cells literal', () => {
  assert.deepEqual(parseDelimited('\uFEFFcode,note,value\r\n001,"first, second\nthird",=SUM(A1)\r\n,"say ""hi""",\r\n').rows,[
    ['code','note','value'],['001','first, second\nthird','=SUM(A1)'],['','say "hi"',''],
  ]);
  assert.deepEqual(parseDelimited('a\tb\n1\t2','\t').rows,[['a','b'],['1','2']]);
  assert.deepEqual(parseDelimited('a,b\n1\n2,3,4').rows,[['a','b'],['1'],['2','3','4']]);
  assert.deepEqual(parseDelimited('').rows,[]);
});

test('CSV rejects malformed quotes and bounds oversized previews without claiming a complete table', () => {
  for (const input of ['a,"unterminated','a,"quoted"tail','a,un"quoted']) assert.throws(()=>parseDelimited(input));
  const limited=parseDelimited('a\nb\nc',',',2);
  assert.deepEqual(limited,{rows:[['a'],['b']],truncated:true});
  assert.throws(()=>parseDelimited('a,b,c',',',500,2),/columns/);
});

test('a binary filename or a remote URL is not treated as file bytes', () => {
  assert.equal(embeddedFile('https://example.com/file.png','image/png'),null);
  assert.equal(embeddedFile('/Users/user/file.pdf','application/pdf'),null);
  assert.equal(embeddedFile('data:text/html;base64,PHNjcmlwdD4=','image/png'),null);
  assert.equal(embeddedFile('data:image/png;base64,%%%%','image/png'),null);
  assert.deepEqual([...embeddedFile('data:application/pdf;base64,JVBERi0=','application/pdf')],[37,80,68,70,45]);
});

test('cards show decoded binary metadata or bytes, while text measures the current UTF-8 content', () => {
  const pdf = 'data:application/pdf;base64,JVBERi0=';
  assert.equal(artifactContentSize({name:'report.pdf',content:pdf,size:1234}),1234);
  assert.equal(artifactContentSize({name:'report.pdf',content:pdf}),5);
  assert.equal(artifactContentSize({name:'note.md',content:'中文',size:999}),6);
  assert.equal(artifactContentSize({name:'report.pdf',content:'only a description'}),undefined);
  assert.equal(embeddedFileByteLength(pdf,'image/png'),undefined);
});

test('thumbnail validation checks all encoded input but decodes only a small magic header', () => {
  const bytes=Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n','latin1'),Buffer.alloc(64*1024)]);
  const content=`data:image/png;base64,${bytes.toString('base64')}`;
  const decode=globalThis.atob,lengths=[];
  try {
    globalThis.atob=value=>{lengths.push(value.length);return decode(value);};
    assert.equal(embeddedFileByteLength(content,'image/png'),bytes.length);
    assert.ok(lengths.length>0&&lengths.every(length=>length<=64));
    assert.equal(embeddedFileByteLength(`${content.slice(0,-5)}!AAAA`,'image/png'),undefined);
  } finally {globalThis.atob=decode;}
  assert.deepEqual(Buffer.from(embeddedFile(content,'image/png')),bytes);
});
