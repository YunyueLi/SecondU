import '../styles.css';
import '../desktop-refinement.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import type { Artifact } from '../../shared/contracts';
import { ArtifactEditor } from '../ArtifactWorkspace';
import { ArtifactCard } from '../design-system/ArtifactCard';
import { pdfFixture } from './pdfFixture.mjs';

const files = [
  pdfFixture,
  { name: 'WeeklyReview.tsx', type: 'code', content: 'import { useState } from "react";\n\n// A saved component is source code; it is never executed by the preview.\nexport function WeeklyReview() {\n  const [count, setCount] = useState(0);\n  return <button onClick={() => setCount(count + 1)}>Review {count} completed tasks and inspect the evidence behind every result before sharing it.</button>;\n}\n' },
  { name: 'review-data.csv', type: 'text', content: 'ID,项目,状态,备注\n001,资料整理,已完成,"保留原文、来源与日期"\n002,设计检查,待复核,"第一行\n第二行"\n003,公式示例,原文,"=SUM(A1:A3)"\n' },
  { name: 'result.html', type: 'html', content: '<!doctype html><html><head><style>body{font:16px system-ui;margin:0;padding:40px;background:#fbf9f4;color:#30332d}small{letter-spacing:2px;color:#767970}h1{font-weight:500;font-size:36px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.card{background:white;border:1px solid #e3e2da;border-radius:16px;padding:24px}.card strong{display:block;font-size:32px;margin-bottom:6px}</style></head><body><small>WEEKLY REVIEW</small><h1>让进展清晰可见</h1><p>结果、证据和下一步，在同一页。</p><div class="grid"><div class="card"><strong>12</strong>完成事项</div><div class="card"><strong>3</strong>待你确认</div></div></body></html>' },
  { name: 'workflow.svg', type: 'code', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 220"><rect width="560" height="220" fill="#fbf9f4"/><g fill="white" stroke="#b8bcb0"><rect x="30" y="70" width="130" height="70" rx="16"/><rect x="215" y="70" width="130" height="70" rx="16"/><rect x="400" y="70" width="130" height="70" rx="16"/><path d="M160 105h55m130 0h55"/></g><g font-family="system-ui" font-size="18" fill="#30332d" text-anchor="middle"><text x="95" y="112">理解任务</text><text x="280" y="112">执行与核对</text><text x="465" y="112">交付结果</text></g></svg>' },
  { name: '交付说明.md', type: 'markdown', content: '# 本周交付\n\n每项结果都保留可核对的来源。\n\n- 完成任务梳理\n- 补充结果预览\n- 保存版本与反馈\n\n| 项目 | 状态 |\n| --- | --- |\n| 交互检查 | 已完成 |\n| 浏览器验收 | 待核对 |\n\n```typescript\nconst next = { status: "review", evidence: true };\n```' },
  { name: 'configuration.json', type: 'text', content: '{\n  "project": "SecondU",\n  "review": { "required": true, "version": 2 },\n  "formats": ["markdown", "code", "csv", "html", "svg"]\n}' },
  { name: 'missing-original.pdf', type: 'text', content: 'This is only a description. There are no PDF bytes in this record.' },
] satisfies Array<Pick<Artifact, 'name'|'type'|'content'> & Partial<Pick<Artifact, 'encoding'|'mime'|'size'>>>;

function Preview() {
  const [index, setIndex] = useState(0);
  const [dark, setDark] = useState(false);
  const [compact, setCompact] = useState(false);
  const artifacts: Artifact[] = files.map((file, i) => ({ ...file, id: `preview-${i}`, taskId:'preview', version:2, updatedAt:'2026-09-30T10:00:00Z', versions:[{version:1,content:file.content,author:'Preview',createdAt:'2026-09-29T10:00:00Z'},{version:2,content:file.content,author:'Preview',createdAt:'2026-09-30T10:00:00Z'}] }));
  return <main style={{padding:24,maxWidth:1280,margin:'auto'}}><div className="row" style={{marginBottom:20}}><h1 style={{fontSize:20,marginRight:'auto'}}>产物预览检查</h1><Button color="secondary" onClick={() => {setDark(!dark);document.documentElement.dataset.theme=dark?'light':'dark';}}>切换明暗</Button><Button color="secondary" onClick={() => setCompact(!compact)}>切换侧栏宽度</Button></div><div style={{display:'flex',gap:24,alignItems:'flex-start',flexWrap:'wrap'}}><nav style={{width:310,maxWidth:'100%'}}>{artifacts.map((file,i)=><ArtifactCard key={file.id} artifact={file} onOpen={()=>setIndex(i)}/>)}</nav><div style={{flex:compact?'0 1 460px':'1 1 500px',minWidth:0,maxWidth:'100%',height:780,border:'1px solid var(--color-border-subtle)',borderRadius:14,overflow:'hidden'}}><ArtifactEditor key={index} artifact={artifacts[index]} compact={compact} readOnly onRefresh={async()=>{}}/></div></div></main>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<AppsSDKUIProvider linkComponent="a"><Preview/></AppsSDKUIProvider>);
