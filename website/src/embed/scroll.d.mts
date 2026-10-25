export function scrollConversationEnd(target:Element|null,options?:{behavior?:ScrollBehavior}):void;
export function canConsumeScroll(metrics:{scrollTop:number;scrollHeight:number;clientHeight:number;overflowY:string},deltaY:number):boolean;
export function scrollableWithin(target:EventTarget|null,deltaY:number):boolean;
