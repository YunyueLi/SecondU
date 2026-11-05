import path from 'node:path';
import {createRequire} from 'node:module';
import {readFile,writeFile,realpath,lstat} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const root=await realpath(process.cwd());
const modules=process.env.SECONDU_NODE_MODULES;
if(!modules||!path.isAbsolute(modules))throw new Error('SecondU did not provide the dependency directory. Call secondu_workspace_dependencies.');
const require=createRequire(path.join(modules,'package.json'));
const load=async name=>import(pathToFileURL(require.resolve(name)).href);
const [command,...args]=process.argv.slice(2);
const inside=file=>file!==root&&file.startsWith(root+path.sep);
async function workspacePath(input,{output=false}={}){
  if(typeof input!=='string'||!input)throw new Error('A task-workspace path is required.');
  const candidate=path.resolve(root,input);
  if(!inside(candidate))throw new Error('Input and output must stay in the task workspace.');
  if(output){
    const parent=await realpath(path.dirname(candidate));
    if(parent!==root&&!inside(parent))throw new Error('Output directory escapes the task workspace.');
    try{await lstat(candidate);throw new Error('Output already exists; choose a new filename.');}catch(error){if(error.code!=='ENOENT')throw error;}
    return path.join(parent,path.basename(candidate));
  }
  const resolved=await realpath(candidate);
  if(!inside(resolved))throw new Error('Input escapes the task workspace.');
  const stat=await lstat(resolved);
  if(!stat.isFile()||stat.size>30*1024*1024)throw new Error('Input must be a regular file under 30 MiB.');
  return resolved;
}
const emit=value=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
async function specification(file){const value=JSON.parse(await readFile(await workspacePath(file),'utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('The specification must be a JSON object.');return value;}

if(command==='help'){
  emit({commands:['inspect FILE','docx SPEC_JSON NEW.docx','xlsx SPEC_JSON NEW.xlsx','pptx SPEC_JSON NEW.pptx','recalculate INPUT NEW.xlsx','pdf INPUT NEW.pdf','render INPUT NEW_DIRECTORY [SHEET] [RANGE]'],specs:{docx:{title:'Report',sections:[{heading:'Findings',paragraphs:['Evidence-based text'],table:[['Item','Value'],['Example',12]]}]},xlsx:{sheets:[{name:'Summary',widths:[24,18],numberFormats:{B:'0.00'},rows:[['Item','Value'],['One',12],['Two',8],['Total',{formula:'SUM(B2:B3)'}]]}]},pptx:{title:'Review',slides:[{title:'Decision',bullets:['Supported finding','Next action']}]}}});
}else if(command==='docx'){
  const spec=await specification(args[0]),output=await workspacePath(args[1],{output:true});
  const {Document,Paragraph,TextRun,HeadingLevel,Table,TableRow,TableCell,Packer}=await load('docx');
  const children=[];
  if(spec.title)children.push(new Paragraph({text:String(spec.title),heading:HeadingLevel.TITLE}));
  for(const section of spec.sections??[]){
    if(section.heading)children.push(new Paragraph({text:String(section.heading),heading:HeadingLevel.HEADING_1}));
    for(const text of section.paragraphs??[])children.push(new Paragraph({children:[new TextRun(String(text))]}));
    if(section.table?.length)children.push(new Table({rows:section.table.map(row=>new TableRow({children:row.map(value=>new TableCell({children:[new Paragraph(String(value??''))]}))}))}));
  }
  const document=new Document({creator:'SecondU',title:spec.title,sections:[{properties:{},children}]});
  await writeFile(output,await Packer.toBuffer(document),{flag:'wx',mode:0o600});emit({file:output,verified:'written; reopen and inspect before delivery'});
}else if(command==='xlsx'){
  const spec=await specification(args[0]),output=await workspacePath(args[1],{output:true});
  const ExcelJS=require('exceljs'),workbook=new ExcelJS.Workbook();
  workbook.creator='SecondU';workbook.calcProperties.fullCalcOnLoad=true;
  for(const item of spec.sheets??[]){const sheet=workbook.addWorksheet(item.name);sheet.addRows(item.rows??[]);for(const [index,width] of (item.widths??[]).entries())sheet.getColumn(index+1).width=width;for(const [column,format] of Object.entries(item.numberFormats??{}))sheet.getColumn(column).numFmt=format;sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];}
  if(!workbook.worksheets.length)throw new Error('Provide at least one sheet.');
  await writeFile(output,Buffer.from(await workbook.xlsx.writeBuffer()),{flag:'wx',mode:0o600});emit({file:output,formulaCaches:'not recalculated'});
}else if(command==='pptx'){
  const spec=await specification(args[0]),output=await workspacePath(args[1],{output:true});
  const PptxGenJS=require('pptxgenjs'),deck=new PptxGenJS();deck.layout='LAYOUT_WIDE';deck.author='SecondU';deck.subject=spec.title??'';deck.title=spec.title??'';deck.lang='zh-CN';
  for(const item of spec.slides??[]){const slide=deck.addSlide();slide.background={color:'FFFFFF'};slide.addText(String(item.title??''),{x:0.7,y:0.45,w:11.9,h:0.9,fontSize:28,bold:true,color:'202124',breakLine:false});slide.addText((item.bullets??[]).map(text=>({text:String(text),options:{bullet:{indent:18},breakLine:true}})),{x:0.85,y:1.7,w:11.4,h:4.7,fontSize:21,color:'303134',paraSpaceAfterPt:18,valign:'top'});}
  if(!deck._slides.length)throw new Error('Provide at least one slide.');
  await writeFile(output,Buffer.from(await deck.write({outputType:'nodebuffer'})),{flag:'wx',mode:0o600});emit({file:output,slides:spec.slides.length,visualCheck:'not performed'});
}else if(command==='inspect'){
  const input=await workspacePath(args[0]),bytes=await readFile(input),extension=path.extname(input).toLowerCase();
  if(extension==='.xlsx'){
    const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
    emit({file:input,sheets:book.worksheets.map(sheet=>({name:sheet.name,rows:sheet.rowCount,columns:sheet.columnCount,cells:sheet.getSheetValues().slice(1,101).map(row=>row?.slice(1,31)),truncated:sheet.rowCount>100||sheet.columnCount>30}))});
  }else{
    const {unzipSync}=require('fflate');let expanded=0,count=0;
    const entries=unzipSync(bytes,{filter:entry=>{if(++count>3000||entry.originalSize>12*1024*1024||(expanded+=entry.originalSize)>60*1024*1024)throw new Error('Office archive exceeds inspection limits.');return !entry.name.endsWith('/');}});
    const {XMLParser}=require('fast-xml-parser'),parser=new XMLParser({ignoreAttributes:false,processEntities:false});
    const parts=Object.entries(entries).filter(([name])=>extension==='.docx'?/^word\/(document|header\d+|footer\d+)\.xml$/.test(name):/^ppt\/slides\/slide\d+\.xml$/.test(name));
    if(!parts.length)throw new Error('No supported Office document parts found.');
    emit({file:input,parts:parts.map(([name,data])=>({name,content:parser.parse(Buffer.from(data).toString('utf8'))})),structuralOnly:true});
  }
}else if(['pdf','render','recalculate'].includes(command)){
  const inputPath=await workspacePath(args[0]),output=await workspacePath(args[1],{output:true});
  const {createConverter}=await load('@deepseek-ai/libreoffice-kit');
  const converter=await createConverter({timeoutMs:60000,maxInputBytes:30*1024*1024,maxOutputBytes:30*1024*1024,fontMetadataCacheDirectory:false});
  try{
    const result=command==='render'?await converter.renderImages({inputPath,outputDir:output,...(args[2]?{sheet:args[2]}:{}),...(args[3]?{range:args[3]}:{})}):command==='recalculate'?await converter.recalculate({inputPath,outputPath:output}):await converter.convert({inputPath,outputPath:output});
    if(command==='pdf'&&!(await readFile(output)).subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('The exported file is not a PDF.');
    emit(result);
  }finally{await converter.dispose();}
}else throw new Error('Unknown operation. Run help for supported operations.');
