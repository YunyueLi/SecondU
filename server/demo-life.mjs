// A coherent sample biography; real places do not make the sample a real person's history.
export function createDemoLife(stamp){
 const sourceId='demo-life-v3-biography',self='person-self';
 const rows=[
  ['study','2016-09','2020-06','在浙江大学学习软件工程','education','从杭州的家搬进紫金港校区，认识许安和宋岚。毕业项目做的是校园活动报名工具，陆棠老师让万叶先去问同学怎么组织活动，再画原型和写代码。',['demo-v2-person-lu','person-xuan','demo-v2-person-song'],'杭州'],
  ['first-job','2020-07','2023-02','加入字节跳动飞书团队','career','毕业后来到北京，做飞书协作产品的前端开发。最初关注页面能不能稳定交付，后来开始参与需求访谈，追问同事为什么这样使用文档和表格。',[],'北京'],
  ['move','2022-03','','在北京安顿下来','life','搬到海淀的一间出租屋，通勤短了一些。添了一张结实的书桌，周末学着做饭，也开始给回杭州看家人留固定时间。周芮帮忙看过租房合同。',['demo-v2-person-zhou'],'北京海淀'],
  ['volunteer','2023-03','','加入月之暗面，转做 Kimi 产品工程师','career','想把模型能力做成日常能用的产品，加入月之暗面。工作逐渐包含用户研究、交互原型、产品实现和上线后的反馈。与乔宁、陈禾开始共事。',['person-qiao','person-chen'],'北京'],
  ['running','2024-05','','和魏禾开始每周去奥森跑步','life','起初只能连续跑三公里，现在习惯周日下午四点在奥林匹克森林公园见面。速度随状态，不把跑步变成另一项考核。',['demo-v2-person-wei'],'北京奥林匹克森林公园'],
  ['boundaries','2025-11','','把晚上和周末重新留给生活','personal_note','项目忙过一阵以后，开始把上午留给完整开发，晚上减少临时会议。固定给杭州的父母打电话，周末带相机出去走走。',['demo-v2-person-du','demo-v2-person-lin'],'北京'],
  ['workbench','2026-07','','开始负责 Kimi Agent 工作台内测','career','与梁秋开展访谈，九月已有五份完整记录。首轮聚焦澄清、执行状态和中断恢复，十月十二日是计划内测日期，当前尚未正式上线。',['person-qiao','demo-v2-person-liang','demo-v2-person-qiu'],'北京'],
  ['photo-trip','2026-08-16','','带相机去了一趟青岛','life','和高远坐火车去青岛，下午沿着海边走，拍了阴天的海和街边晾着的衣服。回北京后只挑了十二张留下，不再把旅行排成打卡清单。',['demo-v2-person-gao'],'青岛'],
 ];
 const sources=[{id:sourceId,title:'万叶的求学、工作与生活',kind:'note',demo:true,createdAt:stamp,text:'万叶，英文名 Caspian，杭州长大，现在住北京。\n\n'+rows.map(([,date,end,title,,description])=>`${date}${end?' 至 '+end:''}：${title}\n${description}`).join('\n\n')}];
 const events=rows.map(([key,date,endDate,title,category,description,personIds,location])=>({id:`demo-life-v3-${key}`,date,...(endDate?{endDate}:{}),title,category,description,scope:'milestone',personIds:[self,...personIds],sourceIds:[sourceId],platform:'notes',location}));
 return {sources,events};
}
export function applyDemoLifeTimeline(store,stamp){
 if(!store.meta('profile').demo||store.get('meta','demo-engineer-v4'))return;
 const data=createDemoLife(stamp);
 store.transaction(()=>{for(const collection of ['sources','events'])for(const entity of data[collection])if(!store.get(collection,entity.id))store.put(collection,entity);});
}
