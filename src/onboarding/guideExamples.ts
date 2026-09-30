import type { AgentProfile, Artifact, Task, TeamRunNode } from '../../shared/contracts';
import { t } from '../i18n.ts';

export function guideMembers(): AgentProfile[] {
  return [
    {id:'guide-lead',name:t('产品负责人','Product lead'),role:t('拆解目标，汇总交付','Plan the work and gather results')},
    {id:'guide-research',name:t('研究专家','Researcher'),role:t('核对访谈来源','Check interview sources')},
    {id:'guide-review',name:t('质量评审','Reviewer'),role:t('检查成果与验收条件','Check results and pass criteria')},
  ].map(agent=>({...agent,instructions:agent.role,createdAt:'2026-09-30',avatarStyle:'notionists'}));
}

/** Authored sample states only; no runtime, account or task is created by the film. */
export function guideTeamTask(time:number): Task {
  const agents=guideMembers(),done=time>=14600;
  const nodes:TeamRunNode[]=[{id:'guide-node-lead',kind:'lead',agentId:agents[0].id,name:agents[0].name,role:agents[0].role,objective:t('核对访谈，按需分派研究与评审，汇总内测方案。','Check interviews, delegate research and review as needed, and assemble the pilot plan.'),status:done?'completed':'running',createdAt:'2026-09-30',...(done?{result:t('依据与验收条件已收齐，方案可供复核。','Evidence and criteria are collected. The plan is ready for review.')}: {})}];
  if(time>=8300)nodes.push({id:'guide-node-research',parentId:nodes[0].id,kind:'worker',agentId:agents[1].id,name:agents[1].name,role:agents[1].role,objective:t('核对 5 份访谈的原文与出处。','Check originals and provenance for five interviews.'),status:time>=11400?'completed':'running',createdAt:'2026-09-30'});
  if(time>=11400)nodes.push({id:'guide-node-review',parentId:nodes[0].id,kind:'worker',agentId:agents[2].id,name:agents[2].name,role:agents[2].role,objective:t('检查方案的通过标准与遗漏项。','Check pass criteria and omissions.'),status:done?'completed':'running',createdAt:'2026-09-30'});
  return {id:'guide-task',title:'Guide example',prompt:'Guide example',agentIds:agents.map(agent=>agent.id),contextFactIds:[],mode:'demo',status:done?'completed':'running',createdAt:'2026-09-30',updatedAt:'2026-09-30',messages:[],events:[],artifactIds:[],approvals:[],team:{leadAgentId:agents[0].id},teamRuns:[{id:'guide-run',leadAgentId:agents[0].id,status:done?'completed':'running',startedAt:'2026-09-30',nodes}]};
}

function examplePdf() {
  const stream='0.16 0.18 0.17 rg BT /F1 26 Tf 44 340 Td (Pilot review) Tj 0 -50 Td /F1 14 Tf (Original files stay available.) Tj 0 -30 Td (Inspect the evidence before sharing.) Tj 0 -70 Td /F1 10 Tf (FICTIONAL GUIDE EXAMPLE / 1 OF 1) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 420] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let source='%PDF-1.7\n';const offsets:number[]=[];
  objects.forEach((object,index)=>{offsets.push(source.length);source+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=source.length;source+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return {content:`data:application/pdf;base64,${btoa(source)}`,size:source.length,encoding:'data-url' as const,mime:'application/pdf'};
}
const pdf=examplePdf();
export function guideArtifacts(): Artifact[] {
  const files=[
    {name:t('内测方案.md','Pilot plan.md'),type:'markdown' as const,content:t('# 内测验证方案\n\n从证据出发，先完成一次小范围验证。\n\n- 核对访谈来源\n- 明确通过标准\n- 保存修改与版本','## Pilot validation plan\n\nStart from evidence and run a small test.\n\n- Check interview sources\n- Define pass criteria\n- Keep changes and revisions')},
    {name:'review.ts',type:'code' as const,content:'type Review = { title: string; checked: boolean };\n\nexport function ready(items: Review[]) {\n  return items.every(item => item.checked);\n}\n\nconst evidence = [\n  { title: "Saved version", checked: true },\n  { title: "Original source", checked: true },\n];\n'},
    {name:t('验收清单.csv','Review checklist.csv'),type:'text' as const,content:t('项目,状态,依据\n原文核对,已完成,访谈记录\n版本保存,已完成,第 2 版\n参与时间,待确认,报名表','Item,Status,Evidence\nSource check,Complete,Interviews\nSaved revision,Complete,Version 2\nParticipant times,Pending,Signup sheet')},
    {name:'pilot-review.pdf',type:'text' as const,...pdf},
  ];
  return files.map((file,index)=>({...file,id:`guide-file-${index}`,taskId:'guide-task',version:2,versions:[],updatedAt:'2026-09-30'}));
}
export function guideArtifactIndex(time:number){return time<2800?0:time<4800?1:time<8300?2:3;}
