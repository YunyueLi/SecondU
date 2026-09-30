// Textarea selection offsets use UTF-16. Do not treat an email address as an
// addressee picker, while allowing Chinese text directly before an @ symbol.
export function mentionQuery(value:string,caret:number){
  const match=value.slice(0,caret).match(/(?:^|[^a-zA-Z0-9._%+-])@([^\s@]*)$/u);
  return match?{start:caret-match[1].length-1,end:caret,query:match[1]}:undefined;
}

export interface InlineMention { start:number;end:number;text:string;recipientIds:string[] }

export function validInlineMentions(value:string,mentions:InlineMention[]):InlineMention[]{
  return mentions.filter(mention=>!!mention&&Number.isInteger(mention.start)&&Number.isInteger(mention.end)&&mention.start>=0&&mention.end>mention.start&&value.slice(mention.start,mention.end)===mention.text&&mention.text.startsWith('@')&&Array.isArray(mention.recipientIds)&&mention.recipientIds.every(id=>typeof id==='string')&&(mention.end===value.length||/[\s\p{P}\p{S}]/u.test(value[mention.end])));
}

// Preserve the chosen IDs while edits move a mention. Editing through its text
// removes the binding; typing the same display name does not invent a new ID.
export function updateInlineMentions(before:string,after:string,mentions:InlineMention[]):InlineMention[]{
  if(before===after)return validInlineMentions(after,mentions);
  let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
  let oldEnd=before.length,newEnd=after.length;while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
  const offset=newEnd-oldEnd;
  return validInlineMentions(after,mentions.flatMap(mention=>mention.end<=start?[mention]:mention.start>=oldEnd?[{...mention,start:mention.start+offset,end:mention.end+offset}]:[]));
}

export function mentionRecipientIds(value:string,mentions:InlineMention[]):string[]{return [...new Set(validInlineMentions(value,mentions).flatMap(mention=>mention.recipientIds))];}
