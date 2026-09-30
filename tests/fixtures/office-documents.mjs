// Minimal synthetic OOXML documents and a ZIP writer, with no private content.
import {deflateRawSync} from 'node:zlib';
import {zipCrc32,OFFICE_TYPES} from '../../server/office-content.mjs';
const relns='http://schemas.openxmlformats.org/package/2006/relationships';
const office='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export function zipFixture(entries,{flags=0,mode=0,compression=8}={}){
 const locals=[],central=[];let offset=0;
 for(const [name,value] of entries){const nameBytes=Buffer.from(name),data=Buffer.from(value),compressed=compression===8?deflateRawSync(data):data,crc=zipCrc32(data),local=Buffer.alloc(30),record=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(compression,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);
  record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(flags,8);record.writeUInt16LE(compression,10);record.writeUInt32LE(crc,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(nameBytes.length,28);record.writeUInt32LE((mode<<16)>>>0,38);record.writeUInt32LE(offset,42);
  locals.push(local,nameBytes,compressed);central.push(record,nameBytes);offset+=30+nameBytes.length+compressed.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);
}
export function officeFixtureEntries(extension,label='Synthetic acceptance document'){
 const type=OFFICE_TYPES[extension],entries=[['_rels/.rels',`<Relationships xmlns="${relns}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="${type.part}"/></Relationships>`]];
 const escape=text=>text.replace(/[<>&"]/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[char]));label=escape(label);
 let extra='';
 if(extension==='.docx')entries.push([type.part,`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${label}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`]);
 if(extension==='.xlsx'){
  entries.push([type.part,`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${office}"><sheets><sheet name="Fixture" sheetId="1" r:id="rId1"/></sheets></workbook>`],['xl/_rels/workbook.xml.rels',`<Relationships xmlns="${relns}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],['xl/worksheets/sheet1.xml',`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${label}</t></is></c></row></sheetData></worksheet>`]);extra='<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
 }
 if(extension==='.pptx'){
  entries.push([type.part,`<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="${office}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],['ppt/_rels/presentation.xml.rels',`<Relationships xmlns="${relns}"><Relationship Id="rId1" Type="${office}/slide" Target="slides/slide1.xml"/></Relationships>`],['ppt/slides/slide1.xml',`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Fixture"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="7000000" cy="1000000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2000"/><a:t>${label}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`]);extra='<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
 }
 entries.push(['[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${type.part}" ContentType="${type.contentType}"/>${extra}</Types>`]);return entries;
}
export const officeFixture=(extension,label)=>zipFixture(officeFixtureEntries(extension,label));
export function previewPdf(label='Fixture PDF'){const stream=`BT /F1 12 Tf 10 30 Td (${label}) Tj ET`;let content='%PDF-1.4\n';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`],offsets=[];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(content));content+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(content);return Buffer.from(content+`xref\n0 6\n0000000000 65535 f \n${offsets.map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);}
