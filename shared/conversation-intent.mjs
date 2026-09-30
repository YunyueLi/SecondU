// Deliberately bounded local routing, not semantic intent detection. A message
// that also asks for substantive work falls through to normal task handling.
export function conversationText(value,names=[]) {
  let content=String(value);
  for(const name of [...new Set(['everyone','所有人',...names])].filter(Boolean).sort((a,b)=>b.length-a.length)){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    content=content.replace(new RegExp(`(^|[\\s，,、:：])@${escaped}(?=$|[\\s，,、!?！？。])`,'giu'),'$1');
  }
  return content.trim();
}
export function conversationKind(value,names=[]) {
  const input=conversationText(value,names).toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
  if(/^(hi|hello|hey)(everyone|all|team|there)?$/.test(input)||/^(你们好|大家好|各位好|各位大家好|你们好吗|大家都在吗|你好|您好|嗨|哈喽|哈罗|早|早安|早上好|上午好|下午好|晚上好|在吗|在不在)$/.test(input))return 'greeting';
  if(/^(谢谢|谢谢你|谢谢你们|谢谢大家|多谢|感谢|辛苦了|辛苦大家了|thanks|thankyou|thx)(everyone|all|team)?$/.test(input))return 'thanks';
  if(/^(你|你们|hither)(不是|是|到底是|究竟是|还是|算是|算不算|是不是|能不能算|可以算)(我的|我们的|一个|我的个人|我们的个人)?(数字分身|个人agent|个人助理|超级助理|ai助理|分身)(吗|么|对吗|吧)?$/.test(input)||/^(areyou|arentyou|areyounot)(my|our|a)?(digitaltwin|personalagent|personalassistant|superassistant)$/.test(input))return 'identity';
  if(/^(你是谁|你们是谁|你到底是谁|你究竟是谁|你能做什么|你们能做什么|你可以做什么|你们可以做什么|怎么使用|你有什么用|whoareyou|whatisyourrole|whatcanyoudo)$/.test(input))return 'introduction';
}
