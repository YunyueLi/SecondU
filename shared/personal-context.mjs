import {conversationKind} from './conversation-intent.mjs';
const stopWords=new Set('a an the and or but if then than that this these those for from with without about into onto over under between are was were been being have has had does did doing can could would should will shall may might must you your yours our ours their theirs they them its what which who whom when where why how please help need needs want wants just also some any'.split(' '));
const englishWords=text=>new Set((text.match(/[a-z0-9]{3,}/g)||[]).filter(word=>!stopWords.has(word)));
const generic=new Set(['我们','我的','帮我','可以','需要','进行','一个','一下','目前','今天','现在','任务','什么','如何','根据','结合']);
// Confirmed facts only. Baseline is an explicit digital-twin mode, independent of
// whether this particular message contains a matching keyword.
export function selectPersonalContext(facts,prompt,{baseline=false}={}) {
 const normalized=String(prompt).toLocaleLowerCase();
 if(!baseline&&conversationKind(prompt))return [];
 const words=new Set(normalized.match(/[a-z0-9]{3,}|[\u3400-\u9fff]{2,}/g)||[]),grams=new Set();
 for(const word of words)if(/[\u3400-\u9fff]/.test(word))for(let i=0;i<word.length-1;i++)grams.add(word.slice(i,i+2));
 for(const word of generic)grams.delete(word);
 const english=englishWords(normalized),confirmed=facts.filter(fact=>fact.status==='confirmed');
 const ranked=confirmed.map((fact,index)=>{const statement=fact.statement.toLocaleLowerCase(),factEnglish=englishWords(statement);return {fact,index,score:[...grams].filter(gram=>statement.includes(gram)).length+[...english].filter(word=>factEnglish.has(word)).length*2};}).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
 const stable=baseline?confirmed.filter(fact=>fact.kind==='identity'||fact.kind==='preference').slice(0,4):[];
 const aboutMe=baseline&&/(?:我是谁|了解我|你知道我|记得我|我的(?:背景|情况|目标|习惯|偏好))|\b(?:about me|my background|my preferences|who am i)\b/i.test(prompt);
 return [...new Set([...ranked.map(item=>item.fact.id),...stable.map(item=>item.id),...(aboutMe?confirmed.map(item=>item.id):[])])].slice(0,8);
}
