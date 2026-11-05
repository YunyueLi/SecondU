import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ChevronDown,ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import type {WorkflowProgram} from '../../shared/team-run-types';
import type {AgentRoom} from '../../shared/contracts';
import {t} from '../i18n';
import './workflow.css';
export function WorkflowProgramDetails({program}:{program:WorkflowProgram}){
  return <div className="workflow-program"><dl>{program.parameters.map(p=><div key={p.name}><dt>{p.label}</dt><dd>{Object.hasOwn(program.args,p.name)?typeof program.args[p.name]==='boolean'?(program.args[p.name]?t('开启','On'):t('关闭','Off')):String(program.args[p.name]):p.default!==undefined?String(p.default):t('未填写','Not supplied')}</dd></div>)}</dl><details><summary><ChevronDown/>{t('查看流程脚本','View workflow script')}</summary><pre><code>{program.source}</code></pre></details></div>;
}
/** Saved workflows start through the same conversation and confirmation as a new task. */
export function SavedWorkflowLauncher({room,disabled,onStart}:{room:AgentRoom;disabled:boolean;onStart:()=>void}){
  const stages=room.team?.workflow??[],fresh=!room.messages.length;
  return <section className="workflow-reuse" aria-label={t('使用已保存流程','Use saved workflow')}>
    <div><strong>{fresh?room.title:t('沿用这套流程','Use this workflow again')}</strong><p>{fresh?t('说说这次的目标和材料。助理会补齐所需信息，再给你确认方案。','Describe this task and its materials. Your agent will clarify missing information and ask you to review the plan.'):t('换一份材料，或告诉助理这次有哪些变化。','Share new materials or describe what should change this time.')}</p></div>
    <Button color="secondary" variant="ghost" size="sm" disabled={disabled} onClick={onStart}>{fresh?t('填写本次要求','Describe this task'):t('再次运行','Run again')}<ArrowRight/></Button>
    {fresh&&stages.length>0&&<details><summary>{t('查看已保存的分工','View saved assignments')}</summary><ol>{stages.map(stage=><li key={stage.id}><strong>{stage.title}</strong><p>{stage.description}</p></li>)}</ol></details>}
  </section>;
}
