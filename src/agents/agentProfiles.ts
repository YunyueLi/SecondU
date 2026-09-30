import type { AgentProfile, Bootstrap } from '../../shared/contracts';
import { brand } from '../brand';
import { t } from '../i18n';
import { displayProfileName } from '../profile';

export const SELF_AGENT_ID='hither';
export const isSelfAgent=(agent:Pick<AgentProfile,'id'>)=>agent.id===SELF_AGENT_ID;
export function selfAgent(data:Bootstrap):AgentProfile {
  return {id:SELF_AGENT_ID,name:brand.name,role:t(`${displayProfileName(data.profile)}的数字分身`,`${displayProfileName(data.profile)}’s digital twin`),instructions:t('以你确认的个人画像、生活近况和当前目标为背景协助你。根据本次任务选择需要参考的资料，解释建议依据；发送、购买和修改外部资料仍须遵循你的授权。','Works with your confirmed profile, current life and goals. Uses relevant context and explains its suggestions; sending, purchases and external changes follow your authorization.'),createdAt:'2026-09-30T00:00:00.000Z'};
}
/** Display aliases apply only to original sample ids and names. Persisted identities and history stay intact. */
export function professionalAgent(agent:AgentProfile):AgentProfile {
 const aliases:Record<string,[string,string]>={'agent-planner':['筹划伙伴',t('项目规划师','Project planner')],'agent-reviewer':['复核伙伴',t('质量评审员','Quality reviewer')],'agent-writer':['文字伙伴',t('写作编辑','Writing editor')],'agent-researcher':['资料伙伴',t('研究分析师','Research analyst')],'agent-budget':['预算伙伴',t('预算分析师','Budget analyst')],'agent-care':['节奏伙伴',t('生活规划师','Life planner')]};
 const entry=Object.entries(aliases).find(([id,[name]])=>(agent.id===id||agent.id.startsWith('demo-')&&agent.id.endsWith(id))&&agent.name===name);
 return entry?{...agent,name:entry[1][1]}:agent;
}
