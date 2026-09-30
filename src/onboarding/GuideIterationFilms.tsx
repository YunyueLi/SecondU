import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { ArrowLeft, Check, Edit, Reply } from '@openai/apps-sdk-ui/components/Icon';
import { AgentAvatar, AgentBadgeStage } from '../agents/AgentIdentity';
import { TeamRunGraph } from '../agents/TeamRunGraph';
import { MessageReactions } from '../agents/MessageReactions';
import { ReplyReference } from '../agents/RoomMentions';
import { ArtifactCard } from '../design-system/ArtifactCard';
import { ArtifactPreview } from '../artifacts/ArtifactPreview';
import { t } from '../i18n';
import { MotionAppear as Appear } from './filmMotion';
import { guideArtifactIndex, guideArtifacts, guideMembers, guideTeamTask } from './guideExamples';
import '../composer/message-revision.css';
import '../agents/room-editor.css';
import './guideIterationFilms.css';

const noop=()=>{};
const refreshed=async()=>{};
function ExampleLabel(){return <small className="guide-iteration-example">{t('使用虚构资料的操作演示','Product walkthrough with fictional examples')}</small>;}

export function GuideConversationFilm({time}:{time:number}) {
  const editing=time>=3300&&time<6500,revised=time>=6500,saved=time>=14600;
  const artifact={...guideArtifacts()[0],version:saved?2:1,content:t(`# 内测验证方案\n\n准备时间：${saved?'5':'3'} 天。\n\n## 准备清单\n\n- 招募参与者\n- 核对访谈原文\n- 完成设备预检`,`# Pilot validation plan\n\nPreparation: ${saved?'5':'3'} days.\n\n## Checklist\n\n- Recruit participants\n- Check original interviews\n- Test devices`)};
  const message={id:'guide-response',role:'assistant' as const,content:time>=6500?t('准备时间已改为 5 天，方案保留上一版供比较。','Preparation now spans five days; the previous version is kept for comparison.'):t('方案已整理，准备时间先按 3 天安排。','The plan is ready, with three days for preparation.'),createdAt:'2026-09-30',...(time>=9600?{reactions:[{emoji:'👍',actor:'self' as const,createdAt:'2026-09-30'}]}:{})};
  return <Appear at={0} className="guide-iteration-window"><header><strong>{t('修改问题，继续完善成果','Revise the request and refine the result')}</strong><ExampleLabel/></header><div className="guide-iteration-split">
    <section className="guide-iteration-conversation"><div className="guide-product-surface">
      {revised&&<div className="revision-navigation"><span>{t('修改后的对话','Revised conversation')}</span><Button color="secondary" variant="ghost" size="sm"><ArrowLeft/>{t('返回原对话','Original conversation')}</Button></div>}
      {editing?<div className="message-revision-editor"><Textarea className="message-revision-input" variant="soft" rows={3} readOnly value={t('汇总访谈，准备内测方案。准备时间改为 5 天。','Review the interviews and plan a pilot. Allow five days for preparation.')}/><div className="message-revision-footer"><small className="message-revision-note">{t('原对话与成果保留','Original chat and results stay available')}</small><div className="message-revision-actions"><Button color="secondary" variant="ghost" size="sm">{t('取消','Cancel')}</Button><Button className="guide-revision-save" color="primary" size="sm">{t('保存并重新发送','Save and resend')}</Button></div></div></div>:<><div className="guide-iteration-user">{revised?t('汇总访谈，准备内测方案。准备时间改为 5 天。','Review the interviews and plan a pilot. Allow five days for preparation.'):t('汇总访谈，准备一份内测方案。','Review the interviews and prepare a pilot plan.')}</div><div className="guide-iteration-message-actions"><Button className="guide-revision-edit" color="secondary" variant="ghost" size="sm" uniform aria-label={t('编辑问题','Edit message')}><Edit/></Button></div></>}
      <div className="guide-iteration-response"><p>{message.content}</p><div className="guide-iteration-message-actions"><MessageReactions roomId="guide-fictional-room" message={message} onRefresh={refreshed}/><Button className="guide-reply-action" color="secondary" variant="ghost" size="sm" uniform><Reply/></Button></div></div>
      {time>=11400&&<div className="guide-iteration-quote"><ReplyReference message={message} author="SecondU" onOpen={noop}/><p>{t('按 5 天更新准备清单。','Update the checklist for five days.')}</p></div>}
      <ArtifactCard artifact={artifact} onOpen={noop}/>
    </div></section>
    <section className="guide-iteration-result"><div className="guide-iteration-result-heading"><strong>{artifact.name}</strong><span>v{artifact.version}</span><Button className="guide-version-save" color="secondary" variant="ghost" size="sm">{saved?<Check/>:<Edit/>}{saved?t('已保存','Saved'):t('保存版本','Save revision')}</Button></div><div className="guide-product-surface"><ArtifactPreview artifact={artifact} content={artifact.content}/></div><p className="guide-iteration-footnote">{t('问题修改保留分支，成果修改保留版本。','Message edits keep a branch; result edits keep a revision.')}</p></section>
  </div></Appear>;
}

export function GuideTeamFilm({time}:{time:number}) {
  const members=guideMembers(),team=time>=5000,task=guideTeamTask(time),previewIndex=time<2800?1:time<4800?2:0,previewAgent=members[previewIndex];
  return <><Appear at={0} until={6500} className="guide-team-setup"><header><h2>{t('认识专家，选好成员与负责人','Meet the specialists, choose members and a lead')}</h2><ExampleLabel/></header><div className="guide-team-settings"><div className="guide-team-badge"><AgentBadgeStage agent={previewAgent} face="identity" onFaceChange={noop}/><div className="guide-team-badge-caption"><span>{t('同一个目标，不同专长','One goal, different specialties')}</span><span>{previewIndex+1} / {members.length}</span></div></div><div className="guide-product-surface"><div className="ag-room-roster"><div className="ag-room-section-heading"><strong>{t('已选成员','Selected members')}</strong><span>3 / 12</span></div>{members.map((member,index)=><div className={`ag-room-selected ${index===previewIndex?'is-previewed':''}`} data-guide-member={index} key={member.id}><AgentAvatar agent={member} size={30}/><span className="ag-room-selected-name"><strong>{member.name}</strong><small>{member.role}</small></span>{team&&(index===0?<span className="ag-room-lead-label"><Check/>{t('负责人','Lead')}</span>:<Button color="secondary" variant="ghost" size="xs">{t('设为负责人','Make lead')}</Button>)}</div>)}</div><section className="ag-room-coordination"><strong>{t('协作方式','Collaboration')}</strong><SegmentedControl className="ag-room-mode-control guide-team-mode" value={team?'team':'discussion'} aria-label={t('协作方式','Collaboration')}><SegmentedControl.Option value="discussion">{t('共同讨论','Discussion')}</SegmentedControl.Option><SegmentedControl.Option value="team">{t('负责人调度','Led team')}</SegmentedControl.Option></SegmentedControl><p>{t('负责人按需分工，汇总结果。','The lead delegates as needed and gathers results.')}</p></section></div></div></Appear>
    <Appear at={7000} className="guide-team-execution"><header><h2>{t('每次派发，都有可查看的进展','Follow each assignment as it runs')}</h2><ExampleLabel/></header><div className="guide-team-execution-grid"><div className="guide-product-surface"><TeamRunGraph task={task} agents={members}/></div><aside><h3>{time>=14600?t('收齐结果，再汇总交付','Collect results, then deliver'):t('从目标到具体分工','From the goal to assignments')}</h3><p>{time>=14600?t('已保存的执行树保留角色、任务、结果和状态。','The saved execution tree keeps roles, assignments, results and states.'):t('负责人可以自行回答，也可以临时邀请需要的专家。','The lead can answer directly or call in a specialist when needed.')}</p><span>{t('失败与待审批也会如实显示','Failures and pending approvals keep their own states')}</span></aside></div></Appear></>;
}

export function GuideArtifactsFilm({time}:{time:number}) {
  const files=guideArtifacts(),selected=guideArtifactIndex(time),artifact=files[selected];
  if(time>=12900)return null;
  return <Appear at={0} until={12300} className="guide-iteration-window guide-artifact-library"><header><strong>{t('项目资料与成果','Project sources and results')}</strong><ExampleLabel/></header><div className="guide-artifact-layout"><aside><div className="guide-product-surface guide-artifact-list">{files.map((file,index)=><div className={`guide-artifact-item ${index===selected?'is-selected':''}`} data-guide-format={index} key={file.id}><ArtifactCard artifact={file} onOpen={noop}/></div>)}</div><div className="guide-artifact-formats"><p>{t('Word、Excel 和 PowerPoint','Word, Excel and PowerPoint')}</p><small>{t('Office 由本机转换为只读 PDF；需安装 LibreOffice。','Office converts locally to read-only PDF and requires LibreOffice.')}</small></div></aside><section><div className="guide-iteration-result-heading"><strong>{artifact.name}</strong><span>v2</span></div><div className="guide-product-surface guide-artifact-preview"><ArtifactPreview key={artifact.id} artifact={artifact} content={artifact.content}/></div></section></div></Appear>;
}
