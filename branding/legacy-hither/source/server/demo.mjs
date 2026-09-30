// Deterministic local examples, never a fallback for a failed model call.
import { smallTalkKind, demoTopic, planTurn } from './turn-policy.mjs';
const note='这是一份演示草稿，没有调用语言模型。';
const roleOf=agent=>`${agent.name} ${agent.role}`;
export const demoConversationKind=smallTalkKind;
function conversationReply(kind,agent){
  if(kind==='thanks')return '不客气。需要时，我们可以继续把下一步理清楚。\n\n本地演示回复，未调用模型。';
  if(kind==='identity'||kind==='introduction')return '我是 Hither，你的个人 Agent，也是这里所说的数字分身。我们可以依据你确认的背景和偏好一起处理事情，由你决定授权和采用什么。\n\n当前是本地演示回复，未调用模型。';
  const greeting=/复核|review|审查|核对/.test(roleOf(agent))?'你好，我在。可以把想一起核对的内容发给我。':'你好！今天想先聊点什么，或做点什么？';
  return `${greeting}\n\n本地演示回复，未调用模型。`;
}
function relatedFacts(task,facts,exhibition,workbench){
  const prompt=demoTopic(task);
  const relevant=workbench?/Agent|工作台|模型调用|内测|访谈|用户资料|连续开发|用户反馈|对外邀请/i:exhibition?/声音|音频|展览|邻居|首期预算/:/预算|经费|费用|成本/.test(prompt)?/预算|经费|费用|成本/:/邀请|邮件|文案|写作/.test(prompt)?/写作|措辞|语气|许可|同意/:/时间|日程|排期/.test(prompt)?/时间|日程|分钟|小时/:null;
  // Topic-specific, explicitly selected constraints only. Never dump every selected fact.
  return relevant?facts.filter(f=>['confirmed','inferred','candidate'].includes(f.status)&&relevant.test(f.statement)&&(!workbench||/预算|经费|费用|成本|连续开发|用户反馈|许可|同意/.test(f.statement))).slice(0,3):[];
}
function constraint(fact,fallback){return fact?`${fact.status==='confirmed'?'':'待你确认：'}${fact.statement}`:fallback;}
export function demoDocument({task,facts,agent,previous=[],turn}){
  const casual=['greeting','thanks','identity','introduction'].includes(turn?.kind)?turn.kind:demoConversationKind(task,[agent]);if(casual)return conversationReply(casual,agent);
  const prompt=demoTopic(task),exhibition=/声音展|音频展|社区声音/.test(prompt),workbench=/Agent\s*工作台|模型工作台|工作台.*(?:内测|上线|需求)|(?:内测|需求研究).*工作台/i.test(prompt),role=roleOf(agent),reviewer=/复核|review|审查|核对/.test(role);
  const relevant=relatedFacts(task,facts,exhibition,workbench),budget=relevant.find(f=>/预算|经费/.test(f.statement)),time=relevant.find(f=>/分钟|小时|筹备时间|连续开发|半小时/.test(f.statement)),consent=relevant.find(f=>/许可|同意/.test(f.statement));
  if(task.roomId&&task.interaction!=='task'&&!workbench&&!exhibition&&planTurn(task,[agent]).conversationOnly){
    const response=reviewer?'可以先聊。我会关注哪些判断有依据、哪些还需要确认；你现在最拿不准的是哪一点？':/文字|写作|文案|writer|编辑/.test(role)?'可以先从一句话开始：你最想让对方知道什么？我们把意思说清楚，再考虑怎么写。':'可以先聊。你现在更想理清目标、眼前卡住的地方，还是下一步怎么做？';
    return [response,budget?constraint(budget):'', '本地演示回复，未调用模型。'].filter(Boolean).join('\n\n');
  }
  if(workbench&&reviewer)return [
    '内测前，先用这份清单复核工作台：',
    '- **需求是否闭合**：每项待做内容对应哪条访谈证据；没有证据的想法先放在待验证区。',
    '- **过程是否看得懂**：用户能否分清运行中、等待确认和中断，继续时会不会重复执行已完成的动作。',
    `- **费用是否有边界**：${constraint(budget,'模型调用预算待确认；先记录每次测试的用量，不承诺总费用。')}`,
    `- **资料与许可**：${constraint(consent,'访谈原文只按已确认用途使用；对外邀请先存草稿。')}`,
    '先找出一个会阻塞内测的具体问题，记录触发步骤、实际结果和预期结果，再决定是否扩大范围。',note,
  ].join('\n\n');
  if(workbench&&/文字|写作|文案|writer|编辑/.test(role))return [
    '**访谈邀请草稿**\n你好，我们正在准备 Agent 工作台的小范围内测，想了解你从说明需求到查看结果时，哪些环节最容易不确定。',
    '如果你愿意参与，我们先确认方便的时间。访谈时长、资料用途、是否录音和撤回方式，都确认后再开始。',
    `**发送前检查**\n${constraint(consent,'先确认联系对象、用途和许可，再决定是否发送。')}这份草稿不会自动发送。`,note,
  ].join('\n\n');
  if(workbench)return [
    '**今天要做的一步**\n用 30 分钟，把一条已有用户反馈变成可复现的内测验收场景。30 分钟是本次演示安排，可按实际时间调整。',
    '1. 选一条已获许可的访谈记录，写下用户要完成什么、卡在哪里。\n2. 在工作台走一遍“说明需求 → 查看执行状态 → 中断后继续”，记录实际结果。\n3. 留下一条最值得修的问题，写清完成标准。暂时不扩展功能范围。',
    '**本轮限制**\n'+[
      `- ${constraint(budget,'模型调用预算还没确认，先留空并记录试跑用量。')}`,
      `- ${constraint(time,'先确认今天可用的开发和复盘时间。')}`,
      `- ${constraint(consent,'使用访谈材料前确认用途和许可；对外邀请只保留草稿。')}`,
    ].join('\n'),
    '**内测前再确认**\n参与者和时间、需要覆盖的场景、费用记录方式，以及失败时由谁处理。日期和访谈数量以已确认材料为准。',note,
  ].join('\n\n');
  if(exhibition&&reviewer)return [
    '先核对这几件事，再把声音展的草稿定下来：',
    `- **预算**：${constraint(budget,'上限还没确认，先不要承诺采购。')}`,
    `- **时间**：${constraint(time,'先按今天 30 分钟试排，超过可用时间就缩小范围。')}`,
    `- **参与许可**：${constraint(consent,'录制、保存和公开播放分别征得同意，也要说明如何撤回。')}`,
    '- **场地与交接**：日期和场地仍待确认；给音频剪辑预留三天只是本次示例安排，需和协作者确认。',
    '- **邀请文字**：写清用途、时间和自愿参与，先保留草稿，由你决定是否发送。',
    '最先需要你决定的是：这一次体验只验证什么，以及哪些内容可以留到以后。',note,
  ].join('\n\n');
  if(exhibition)return [
    '**今天要做的一步**\n先用 30 分钟写清声音展的主题和参与方式，暂时不用准备完整提案。',
    '1. 用 10 分钟写下一句话主题，以及想收集哪类日常声音。\n2. 用 10 分钟修改下面的邀请草稿，补上用途和退出方式。\n3. 留 10 分钟列出待确认的日期、场地和交接时间。',
    '**先守住这些限制**\n'+[
      `- ${constraint(budget,'预算上限待确认；没有报价前，费用先留空。')}`,
      `- ${constraint(time,'30 分钟是演示安排，可以按你的实际时间缩减。')}`,
      `- ${constraint(consent,'取得参与者许可后，才能录制、保存或公开播放。')}`,
    ].join('\n'),
    '**邀请草稿**\n你好，我们想做一个小型社区声音展，邀请你自愿分享一段日常生活中的声音。\n\n主题、时间和地点还在确认。使用录音前，我们会说明展示范围、保存期限和撤回方式；你也可以只来听听，不提供录音。\n\n如果你有兴趣，我再把具体说明给你看。',
    '**接下来确认**\n场地和日期是否可用；参与人数；是否能为音频剪辑预留三天。三天是本次示例安排，需要协作者确认。邀请先存为草稿，不会自动发送。',note,
  ].join('\n\n');
  const paragraphs=reviewer?[
    '先从最容易出错的地方检查这份任务：',
    '- 目标是否清楚，完成后能用什么结果判断。\n- 关键说法是否有材料支持，哪些还需要你确认。\n- 时间、费用或对外动作是否超出了原先范围。',
    previous.length?'可以把前一份草稿作为检查对象，逐项补上修改意见，再由你决定采用哪些。':'把要核对的材料补进这份草稿，就可以逐项留下修改意见。',
  ]:/文字|写作|文案|writer|编辑/.test(role)?[
    '先确定这段文字写给谁，以及希望对方读完后知道或做什么。',
    '- 开头用一句话说明来意。\n- 中间只保留对方需要的信息，缺少的时间或条件先留空。\n- 结尾写清下一步，涉及发送时由你确认。',
    '可以先在草稿里写出最想表达的一句话，再围绕它补充。',
  ]:/预算|成本|budget/.test(role)?[
    '先把已有资源、待确认报价和实际支出分开。',
    '- 列出必须完成的最小范围。\n- 给必要支出设上限，未确认的价格留空。\n- 超出预算时先减范围，再决定是否增加投入。',
  ]:[
    '先把这件事收敛成一个可以检查的小结果。',
    '- 写清最希望得到的结果，例如一段草稿、一张清单或一个决定。\n- 列出已经有的材料，只补最关键的缺口。\n- 先做一个小版本，再根据你的反馈修改。',
    '这份工作稿可以继续编辑。具体内容还需要你的材料，或连接模型后进一步处理。',
  ];
  if(relevant.length)paragraphs.push('与这次任务相关的提醒：\n'+relevant.map(f=>`- ${constraint(f,'')}`).join('\n'));
  return [...paragraphs,note].join('\n\n');
}
