// Authored demo biography. Institutions are real; people and their experiences are examples.
export function createSeed(now = new Date().toISOString()) {
  const source=(id,title,text,kind='note')=>({id,title,text,kind,createdAt:now,demo:true});
  const fact=(id,kind,statement,status,sourceIds)=>({id,kind,statement,status,sourceIds,updatedAt:now,version:1,history:[{version:1,kind,statement,status,sourceIds:[...sourceIds],reason:'根据示例资料整理',recordedAt:now}]});
  return {
    profile:{name:'万叶',englishName:'Caspian',description:'英文名 Caspian，杭州长大，现在住北京。2016—2020 年在浙江大学学习软件工程，2020 年加入字节跳动飞书团队，2023 年转到月之暗面，做 Kimi 的产品工程。工作之外喜欢跑步、摄影和坐火车旅行。',demo:true},
    sources:[
      source('source-exhibition','Kimi 工作台内测笔记（9 月）','万叶（Caspian）在月之暗面做 Kimi 的产品工程，和产品经理乔宁、设计师陈禾一起准备一轮 Agent 工作台内测。九月完成了五次用户访谈，反复出现的问题是任务停下后不知道做到了哪一步。首轮准备先做好需求澄清、执行状态和中断后继续，目标是十月十二日邀请八位用户试用。还有三位受访者的时间没定。本轮模型调用预算上限是 2000 元；费用按测试记录核对。十月八日前和测试同事徐沐走完核心流程。'),
      source('source-chat','和许安约试用，也约一碗面','万叶和许安是浙江大学软件工程同学，2016 年入学时住同一层宿舍。许安现在在杭州做阿里云的后端开发。\n万叶：这周想把 Kimi 工作台内测版跑通。上午九点到十一点我先不排会，下午留半小时看反馈。\n许安：你把能跑的版本发我，周三晚上我试。先别讲功能，我就按自己的任务用。\n万叶：好。国庆回杭州再约碗片儿川，还是学校附近？\n许安：可以，时间定了告诉我。','conversation'),
      source('source-feedback','我希望怎样一起做事','我叫万叶，英文名 Caspian。平时叫我万叶就好。建议先说今天最值得做的一步，再展开理由；别为了显得完整写很长。做决定时，我想知道依据和代价。重要的发送、付款和安排先让我看一眼。上午留给写代码和想事情，晚上能回到生活就尽量不要继续开会。','feedback'),
    ],
    facts:[
      fact('fact-clear','preference','建议先给今天能做的一步，再说明理由；语言简短、具体。','confirmed',['source-feedback']),
      fact('fact-budget','constraint','Kimi Agent 工作台本轮内测的模型调用预算上限为 2000 元。','confirmed',['source-exhibition']),
      fact('fact-time','constraint','工作日上午九点到十一点留给连续开发，下午用半小时整理用户反馈。','confirmed',['source-chat']),
      fact('fact-consent','value','重要的发送、付款和安排，先核对内容并确认。','confirmed',['source-feedback']),
      fact('fact-small','preference','可能更愿意先把一个实际任务做顺，再增加功能。','inferred',['source-chat','source-exhibition']),
      fact('fact-identity','identity','万叶（Caspian）在月之暗面做 Kimi 产品工程，负责用户研究、交互原型和产品实现。','confirmed',['source-exhibition','source-feedback']),
    ],
    people:[
      {id:'person-self',name:'万叶',role:'我',description:'英文名 Caspian。浙江大学软件工程毕业，先在字节跳动做飞书前端，后来加入月之暗面做 Kimi 产品工程。住在北京，周末喜欢跑步和摄影。',sourceIds:['source-exhibition','demo-life-v3-biography']},
      {id:'person-xuan',name:'许安',role:'大学同学，朋友',description:'浙江大学同学，现在在杭州做阿里云后端开发。聊技术也聊吃的，万叶回杭州时常约他见面。',sourceIds:['source-chat']},
      {id:'person-qiao',name:'乔宁',role:'同事，产品经理',description:'月之暗面 Kimi 团队的产品经理，和万叶一起筛用户反馈、定首轮内测范围。',sourceIds:['source-exhibition']},
      {id:'person-chen',name:'陈禾',role:'同事，产品设计师',description:'Kimi 产品设计师。评审时喜欢直接操作原型，再讨论信息层级和状态提示。',sourceIds:['source-exhibition']},
    ],
    relationships:[
      {id:'rel-xuan',from:'person-self',to:'person-xuan',label:'长期朋友与同学',description:'2016 年在浙江大学相识，毕业后一个在北京、一个在杭州，仍常联系。',sourceIds:['source-chat']},
      {id:'rel-qiao',from:'person-self',to:'person-qiao',label:'同事',description:'共同整理访谈和内测反馈，乔宁负责范围取舍，万叶把方案做成可试用的版本。',sourceIds:['source-exhibition']},
      {id:'rel-chen',from:'person-self',to:'person-chen',label:'同事',description:'一起在实际界面中检查工作台的状态、编辑和继续操作。',sourceIds:['source-exhibition']},
    ],
    events:[
      {id:'event-idea',date:'2026-09-21',title:'把内测范围缩到一个完整任务',description:'和乔宁看完五次访谈，决定先做好需求澄清、执行状态和中断后继续。工具数量放到下一轮。',category:'career',scope:'note',personIds:['person-self','person-qiao'],sourceIds:['source-exhibition'],platform:'notes',location:'北京'},
      {id:'event-chat',date:'2026-09-25',title:'许安答应试一试新工作台',description:'让他按自己的任务直接用，再看看哪里说不清。也说好国庆回杭州找时间吃面。',category:'relationship',scope:'note',personIds:['person-self','person-xuan'],sourceIds:['source-chat'],platform:'wechat'},
      {id:'event-review',date:'2026-09-28',title:'给自己的协作习惯留一份说明',description:'短一点、具体一点。重要判断有依据，上午留完整时间，晚上记得合上电脑。',category:'personal_note',scope:'note',personIds:['person-self'],sourceIds:['source-feedback'],platform:'notes'},
    ],
    conversations:[{id:'conversation-xuan',title:'许安',personIds:['person-self','person-xuan'],kind:'direct',platform:'wechat',accountId:'fictional-demo',demo:true,messages:[
      {id:'msg-1',senderId:'person-self',content:'这周想把 Kimi 工作台内测版跑通。上午九点到十一点我先不排会，下午留半小时看反馈。',time:'2026-09-25T11:00:00.000Z',sourceId:'source-chat'},
      {id:'msg-2',senderId:'person-xuan',content:'你把能跑的版本发我，周三晚上我试。先别讲功能，我就按自己的任务用。',time:'2026-09-25T11:01:00.000Z',sourceId:'source-chat'},
      {id:'msg-3',senderId:'person-self',content:'好。国庆回杭州再约碗片儿川，还是学校附近？',time:'2026-09-25T11:02:00.000Z',sourceId:'source-chat'},
      {id:'msg-4',senderId:'person-xuan',content:'可以，时间定了告诉我。',time:'2026-09-25T11:03:00.000Z',sourceId:'source-chat'},
    ]}],
    goals:[
      {id:'goal-exhibition',title:'完成 Kimi 工作台首轮内测',description:'十月十二日前让八位用户走完自己的任务，重点看澄清、执行状态和中断恢复。模型调用控制在 2000 元以内。',status:'active',dueDate:'2026-10-12',listId:'goal-list-work',sourceIds:['source-exhibition']},
      {id:'goal-rest',title:'保留上午两小时的专注时间',description:'九点到十一点先不排会；下午集中整理反馈，减少来回切换。',status:'active',listId:'goal-list-work',sourceIds:['source-chat']},
    ],
    agents:[
      {id:'agent-planner',name:'项目规划师',role:'把目标拆成可执行的小步',instructions:'先给今天最值得做的一步，再给简短计划。结合用户已确认的时间和预算，缺少条件时说明具体缺口。',createdAt:now},
      {id:'agent-reviewer',name:'质量评审员',role:'检查结果、依据和遗漏',instructions:'检查草稿或结果与目标是否一致，指出具体问题和修改建议。依据不足时明确说明，不把推测写成事实。',createdAt:now},
    ],
    tasks:[],artifacts:[],automations:[],
    settings:{provider:'moonshot',model:'kimi-k3',baseUrl:'https://api.moonshot.cn/v1',api:'chat_completions',hasKey:false,reasoningEffort:'max'},
  };
}
