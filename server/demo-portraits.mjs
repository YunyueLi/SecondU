import {demoRecordHash} from './demo-refresh.mjs';
import {updatePersonPortrait,portraitSourceIds} from './person-portrait.mjs';
export const DEMO_PORTRAIT_MARKER='demo-person-portraits-v3';
const community='demo-v2-source-community';
const chat=key=>`demo-v2-source-chat-${key}`;
const observation=(kind,statement,sourceIds,extra={})=>({kind,statement,sourceIds,status:'confirmed',privacy:'private',...extra});

// Every entry is grounded in the accompanying authored sample sources.
export function createDemoPortraits(){
 const entries={
  'person-self':[
   observation('identity','万叶，英文名 Caspian，在月之暗面做 Kimi 产品工程。',['source-exhibition','source-feedback']),
   observation('background','杭州长大，2016—2020 年在浙江大学学习软件工程，毕业后到北京加入字节跳动飞书团队。',['demo-life-v3-biography']),
   observation('experience','2023 年加入月之暗面，2026 年开始负责 Kimi Agent 工作台的研究、原型与内测。',['demo-life-v3-biography']),
   observation('preference','先给今天最值得做的一步，再展开依据和代价；建议简短、具体。',['source-feedback']),
   observation('goal','计划在十月十二日开始首轮内测，先验证澄清、执行状态与中断后继续。',['source-exhibition'],{status:'candidate'}),
   observation('boundary','本轮模型调用预算上限 2000 元；重要的发送、付款和安排先核对内容。',['source-exhibition','source-feedback']),
   observation('preference','周日和魏禾去奥森慢跑，喜欢摄影和坐火车旅行。',['demo-life-v3-biography',community]),
   observation('note','这轮工作更重视一个任务是否完整可用，暂时把工具数量放到后面。',['source-exhibition'],{status:'inferred',note:'来自这轮内测取舍，后续可随安排更新。'}),
  ],
  'person-qiao':[
   observation('identity','Kimi 团队产品经理，与万叶共同负责工作台首轮内测。',['source-exhibition']),
   observation('goal','首轮内测聚焦需求澄清、执行状态和中断后继续。',['source-exhibition'],{status:'candidate'}),
  ],
  'person-chen':[
   observation('identity','Kimi 产品设计师，与万叶一起评审实际原型和状态提示。',['source-exhibition']),
  ],
  'person-xuan':[
   observation('background','2016 年在浙江大学与万叶相识，现在在杭州做阿里云后端开发。',['source-chat']),
   observation('preference','试用时希望直接带自己的任务操作，再看功能说明。',['source-chat']),
   observation('goal','约好试用新工作台，也想在国庆和万叶吃一碗面，具体时间待定。',['source-chat'],{status:'candidate'}),
  ],
  'demo-v2-person-lu':[
   observation('identity','浙江大学软件工程教师，指导过万叶的毕业项目。',[community]),
   observation('preference','先看一个人如何完成一件具体事情，再讨论功能和抽象需求。',[chat('lu')]),
   observation('note','除职业成长外，也提醒万叶读些工作以外的书、留时间休息。',[chat('lu')]),
  ],
  'demo-v2-person-song':[
   observation('background','浙江大学同学，现在在上海做内容产品。',[community]),
   observation('goal','国庆后想约万叶吃饭、沿苏州河走走，日期还没定。',[chat('song')],{status:'candidate'}),
  ],
  'demo-v2-person-he':[
   observation('identity','月之暗面算法工程师，负责 Kimi 工具调用评测。',[community]),
   observation('preference','评测先写清完成条件，保留失败样例，并区分模型判断和工具返回的问题。',[chat('he')]),
   observation('goal','先跑小批量任务，周四四点和万叶看十条完整记录与实际调用量。',[chat('he')],{status:'candidate'}),
  ],
  'demo-v2-person-xu':[
   observation('identity','Kimi 团队测试工程师，习惯给出可复现步骤。',[community]),
   observation('preference','检查保存前后中断、软件重启、用户改文件后的继续操作。',[chat('xu')]),
  ],
  'demo-v2-person-tang':[
   observation('identity','Kimi 交互设计师，负责澄清与工具确认界面。',[community]),
   observation('preference','希望在可运行页面里实际操作；确认弹窗要展示动作、对象和内容。',[chat('tang')]),
  ],
  'demo-v2-person-shen':[
   observation('identity','Kimi 后端工程师，负责任务状态与执行接口。',[community]),
   observation('preference','通过明确字段表达状态，并把文件版本冲突和执行中断分别处理。',[chat('shen')]),
  ],
  'demo-v2-person-zhao':[
   observation('background','万叶在杭州读高中时的班主任，教数学。',[community]),
   observation('note','鼓励万叶工作之余运动、回家陪伴家人；国庆见面不必赶。',[chat('zhao')]),
  ],
  'demo-v2-person-zhou':[
   observation('background','万叶的高中同学，在北京做用户体验研究，搬家时互相帮忙。',[community]),
   observation('preference','处理租房问题先记录现状、找房东维修，再核对续租条款。',[chat('zhou')]),
  ],
  'demo-v2-person-wu':[
   observation('identity','Kimi 产品运营，负责内测招募、使用说明和回访。',[community]),
   observation('goal','约齐首轮八位内测用户，让他们带自己的任务试用。',[chat('wu')],{status:'candidate'}),
  ],
  'demo-v2-person-gao':[
   observation('identity','住在北京的数据工程师，也是万叶的摄影伙伴。',[community]),
   observation('experience','2026 年八月和万叶去青岛拍照。',['demo-life-v3-biography']),
   observation('preference','先选少量照片再修图，旅行留出走路和观察的空档。',[chat('gao')]),
  ],
  'demo-v2-person-ye':[
   observation('identity','Kimi 前端工程师，与万叶共同开发会话与成果编辑界面。',[community]),
   observation('preference','关注草稿不丢失、长会话滚动和窄窗口的实际使用。',[chat('ye')]),
  ],
  'demo-v2-person-liang':[
   observation('identity','Kimi 用户研究员，与万叶共同做访谈。',[community]),
   observation('preference','从一次具体操作中找出停顿，先保留原话，再总结观察。',[community,chat('liang')]),
   observation('goal','找两位用户回访，观察修改要求、查看结果和再次开始的过程。',[chat('liang')],{status:'candidate'}),
  ],
  'demo-v2-person-qiu':[
   observation('identity','Kimi 工作台工程负责人，和万叶一起定每轮交付范围。',[community]),
   observation('preference','先修会阻塞用户的具体问题，再安排更多功能。',[community]),
  ],
  'demo-v2-person-wei':[
   observation('identity','住在北京，是万叶工作之外的朋友和跑步伙伴。',[community]),
   observation('preference','通常周日下午四点在奥森见面，跑步时少看工作消息，速度随状态。',[chat('wei')]),
   observation('experience','2024 年五月开始与万叶保持每周跑步的习惯。',['demo-life-v3-biography'],{validFrom:'2024-05'}),
  ],
  'demo-v2-person-du':[
   observation('identity','万叶的母亲，住在杭州，喜欢逛菜市场和种花。',[community]),
   observation('goal','国庆和家人吃饭，万叶初步计划十月二日中午回家，车次待定。',[chat('du')],{status:'candidate'}),
   observation('preference','希望回家主要吃饭和相处，别把家里也安排成工作场所。',[chat('du')]),
  ],
  'demo-v2-person-lin':[
   observation('identity','万叶的父亲，住在杭州，喜欢做饭、散步和看球。',[community]),
   observation('preference','回家时间提前一天确认，再买菜准备片儿川。',[chat('lin')]),
   observation('note','关心产品做错后能否让人修改，用普通使用者的视角问问题。',[chat('lin')]),
  ],
  'demo-v2-person-jiang':[
   observation('identity','万叶的妹妹，在杭州读大学。',[community]),
   observation('goal','课程项目做校园活动报名，先画列表、报名和确认结果的流程，再请两位同学试。',[chat('jiang')],{status:'candidate'}),
   observation('note','会和哥哥交流课程项目，也分享音乐和日常。',[community,chat('jiang')]),
  ],
  'demo-v2-person-han':[
   observation('identity','月之暗面隐私与法务同事，帮助 Kimi 团队核对访谈说明与数据使用范围。',[community]),
  ],
 };
 return Object.fromEntries(Object.entries(entries).map(([personId,rows])=>[personId,rows.map((row,index)=>({...row,id:`${personId}-portrait-${index+1}`}))]));
}

export function applyDemoPortraits(store,data,stamp){
 if(!store.meta('profile').demo||store.get('meta',DEMO_PORTRAIT_MARKER))return;
 const expectedPeople=new Map(data.people.map(person=>[person.id,person])),expectedSources=new Map(data.sources.map(source=>[source.id,source]));
 const report={appliedAt:stamp,added:[],preserved:[]};
 const sourceMatches=id=>{const current=store.get('sources',id),expected=expectedSources.get(id);return current&&expected&&demoRecordHash(current)===demoRecordHash({...expected,createdAt:current.createdAt});};
 store.transaction(()=>{
  for(const [personId,entries] of Object.entries(createDemoPortraits())){
   const current=store.get('people',personId),expected=expectedPeople.get(personId);
   if(!current||!expected||current.portrait!==undefined||demoRecordHash(current)!==demoRecordHash(expected)){report.preserved.push({id:personId,reason:'modified_or_missing_person'});continue;}
   const sourceIds=[...new Set([...current.sourceIds,...entries.flatMap(entry=>entry.sourceIds)])];
   if(sourceIds.some(id=>!sourceMatches(id))){report.preserved.push({id:personId,reason:'modified_or_missing_evidence'});continue;}
   const portrait=updatePersonPortrait(store,{portrait:{schema:'hither.person.v1',entries},basePortraitVersion:0});
   store.put('people',{...current,portrait,sourceIds:[...new Set([...current.sourceIds,...portraitSourceIds(portrait)])]});report.added.push(personId);
  }
  store.setMeta(DEMO_PORTRAIT_MARKER,report);
 });
}
