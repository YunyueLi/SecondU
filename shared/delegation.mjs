export const delegationPurposes = Object.freeze({
  consultation: { zh: '咨询建议', en: 'Consultation' },
  collaboration: { zh: '协作提案', en: 'Collaboration proposal' },
  matching: { zh: '匹配建议', en: 'Matching suggestion' },
  transaction: { zh: '交易意向', en: 'Transaction inquiry' },
});
export const delegationTerminalStates = ['TASK_STATE_COMPLETED','TASK_STATE_FAILED','TASK_STATE_CANCELED','TASK_STATE_REJECTED'];
export function parseDelegationLink(value) {
  try {
    const url = new URL(value.trim());
    if(url.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username || url.password || url.search) return;
    const match = /^\/share\/(delegation-[a-f0-9-]+)$/.exec(url.pathname);
    const token = new URLSearchParams(url.hash.slice(1)).get('access');
    if(!match || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    return { kind:'delegation', name:'受限分身', url:url.href, id:match[1], hostname:url.host };
  } catch { return; }
}
