/** Scroll only the real conversation viewport, never an iframe ancestor. */
export function scrollConversationEnd(target, options = {}) {
  const viewport = target?.closest('.conversation-scroll');
  viewport?.scrollTo({ top: viewport.scrollHeight, behavior: options.behavior || 'auto' });
}

/** Continue the host page only when the pane under the gesture is at its edge. */
export function canConsumeScroll({scrollTop,scrollHeight,clientHeight,overflowY},deltaY){
 if(!/(auto|scroll)/.test(overflowY)||scrollHeight<=clientHeight+1)return false;
 return deltaY<0?scrollTop>1:deltaY>0?scrollTop+clientHeight<scrollHeight-1:false;
}
export function scrollableWithin(target,deltaY){
 const document=target?.ownerDocument,view=document?.defaultView;
 if(!document||!view)return false;
 for(let element=target?.nodeType===1?target:target?.parentElement;element&&element!==document.body;element=element.parentElement){
  if(canConsumeScroll({scrollTop:element.scrollTop,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,overflowY:view.getComputedStyle(element).overflowY},deltaY))return true;
 }
 return false;
}
