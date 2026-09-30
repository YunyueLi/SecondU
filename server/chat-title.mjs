/** A local label for navigation. The original message is always kept separately. */
export function chatTitle(prompt, fallback='新对话') {
  const firstLine=String(prompt??'').split(/\r?\n/).map(line=>line.trim()).find(Boolean)||String(fallback).trim()||'新对话';
  const normalized=firstLine.replace(/^#{1,6}\s+/, '').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1').replace(/\s+/g,' ');
  const clean=normalized.replace(/^(?:请帮我|请你|麻烦你|能不能帮我|可以帮我|帮我)\s*/, '')||normalized;
  const sentence=clean.split(/[。！？!?；;]/)[0].trim()||clean;
  const clause=sentence.split(/[，,]/)[0].trim();
  const source=Array.from(clause).length>=8?clause:sentence;
  const limit=/[\u3400-\u9fff]/u.test(source)?24:48;
  const characters=Array.from(source);
  if(characters.length<=limit)return source;
  let shortened=characters.slice(0,limit).join('');
  // Keep English words intact when a word boundary is available near the end.
  if(!/[\u3400-\u9fff]/u.test(source))shortened=shortened.replace(/\s+\S*$/, '')||shortened;
  return `${shortened.replace(/[\s，,、:：-]+$/,'')}…`;
}
