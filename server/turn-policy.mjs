// Small, inspectable turn routing. This does not claim model-based intent
// detection: ambiguous room messages go to the first (coordinating) member.
import { conversationKind } from '../shared/conversation-intent.mjs';
export const currentMessage = task => task.messages.filter(message=>message.role==='user').at(-1)?.content ?? task.prompt;
export function smallTalkKind(task,agents=[]) {
  return conversationKind(currentMessage(task),agents.map(agent=>agent.name).filter(Boolean));
}
export function demoTopic(task) {
  const latest=currentMessage(task);
  // Bring back an earlier topic only for an explicit continuation/correction.
  return latest!==task.prompt && /继续|补充|修改|调整|改成|再做|把今天|把.*放在|按刚才|按之前|continue|revise|adjust/i.test(latest) && !smallTalkKind(task) ? `${task.prompt}\n${latest}` : latest;
}
export function planTurn(task, agents) {
  const current=currentMessage(task),social=smallTalkKind(task,agents),roomChat=!!task.roomId&&task.interaction!=='task',group=!!task.roomId&&agents.length>1;
  const noFiles=/(?:不要|不用|无需|不必|别).{0,14}(?:文件|文档|文稿|保存|写入)|(?:do not|don't|no need to).{0,20}(?:file|save|document)/i.test(current);
  const fileRequested=!noFiles&&/(?:保存|写入|创建|生成|导出|制作|写成).{0,20}(?:文件|文档|文稿|报告|表格|markdown|\.md|\.txt|\.html)|(?:文件|文档|草稿).{0,8}(?:保存|写入)|(?:create|save|write|export|generate).{0,30}(?:file|document|report|spreadsheet|markdown|\.md|\.txt)/i.test(current);
  const mentions=agents.filter(agent=>current.includes(`@${agent.name}`));
  const collaborative=/(?:大家|各位|你们|一起|分别|每位).{0,30}(?:讨论|觉得|看法|建议|想法|评审|复核|分析|判断)|[？?]|怎么|如何|为什么|是否|怎么办|有什么|可不可以|能不能|(?:帮我|请|一起)?(?:整理|制定|准备|规划|生成|分析|检查|复核|创建)|\b(?:discuss|review|analy[sz]e|compare|plan|what|why|how|should|could|can)\b/i.test(current);
  let selected=agents,reason='selected-task-roles';
  if(group){
    if(task.recipientIds?.length){selected=agents.filter(agent=>task.recipientIds.includes(agent.id));reason='explicit-recipients';}
    else if(social){selected=agents.slice(0,1);reason='social-coordinator';}
    else if(mentions.length){selected=mentions;reason='explicit-mentions';}
    else if(roomChat&&!collaborative&&!fileRequested){selected=agents.slice(0,1);reason='conversation-coordinator';}
    else reason='group-participation';
  }
  return {kind:social??(roomChat?'discussion':'task'),current,reason,agents:selected,conversationOnly:!!social||(roomChat&&!fileRequested),useContext:task.digitalTwinEnabled===true||(!social&&task.digitalTwinEnabled!==false)};
}
