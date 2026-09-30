import { createSeed } from './seed.mjs';
import { createDemoLife } from './demo-life.mjs';
import { createDemoStories } from './demo-stories.mjs';
import { refreshFictionalDemo, DEMO_MATCHER_VERSION } from './demo-refresh.mjs';
import { applyDemoPortraits, DEMO_PORTRAIT_MARKER } from './demo-portraits.mjs';
export const DEMO_VERSION=6;
export function createDemoExpansion(stamp){
 const prefix='demo-v2-',self='person-self',personId=key=>`${prefix}person-${key}`;
 const cast=[
  ['lu','陆棠','大学导师','浙江大学软件工程教师，指导过万叶的毕业项目。毕业后偶尔聊职业选择，也关心他有没有好好休息。'],
  ['song','宋岚','大学同学，朋友','浙江大学同学，在上海做内容产品。两人会交换读书笔记、聊用户研究，假期找机会见面。'],
  ['he','何舟','同事，算法工程师','月之暗面算法工程师，负责 Kimi 工具调用相关评测，和万叶一起看任务成功率与失败样例。'],
  ['xu','徐沐','同事，测试工程师','Kimi 团队测试工程师。习惯把问题写成可复现步骤，最近在测工作台中断、继续和文件冲突。'],
  ['tang','唐悦','同事，交互设计师','Kimi 交互设计师，负责澄清和工具确认界面。午休时常和万叶一起走出办公室买咖啡。'],
  ['shen','沈川','同事，后端工程师','Kimi 后端工程师，负责工作台任务状态和执行接口，和万叶共同排查前后端边界问题。'],
  ['zhao','赵栩','高中班主任','万叶在杭州读高中时的班主任，教数学。节假日偶尔联系，关心他的工作和生活。'],
  ['zhou','周芮','高中同学，朋友','高中同学，现在也在北京做用户体验研究。搬家时互相帮忙，平时会约饭和交换租房经验。'],
  ['wu','吴桐','同事，产品运营','Kimi 产品运营，负责内测招募、使用说明和回访，和万叶一起读真实用户的反馈。'],
  ['gao','高远','朋友，摄影伙伴','在北京做数据工程，工作之外喜欢街头摄影。八月和万叶去青岛拍照，约好每次只留少量满意的照片。'],
  ['ye','叶澄','同事，前端工程师','Kimi 前端工程师，与万叶一起做工作台的会话和成果编辑界面，午饭时会交流各自读到的文章。'],
  ['liang','梁秋','同事，用户研究员','Kimi 用户研究员，和万叶共同做访谈，擅长追问一次具体操作里发生了什么。'],
  ['qiu','邱原','同事，工程负责人','Kimi 工作台工程负责人，和万叶一起定每轮可交付的范围，倾向先修阻塞用户的具体问题。'],
  ['wei','魏禾','朋友，跑步伙伴','住在北京的朋友。2024 年开始和万叶每周去奥森慢跑，跑完会找地方吃面。'],
  ['du','杜晴','母亲','住在杭州，爱逛菜市场和种花。国庆想和家人吃顿饭，常提醒万叶别把周末也全排成工作。'],
  ['jiang','万晴','妹妹','在杭州读大学，最近在做校园活动报名的课程项目。会请哥哥看原型，也给他推荐餐厅和音乐。'],
  ['lin','万建明','父亲','住在杭州，喜欢做饭、散步和看球。万叶回家时会做片儿川，通常提前一天去买菜。'],
  ['han','韩知','同事，隐私与法务','月之暗面隐私与法务同事，帮助 Kimi 团队把访谈说明和数据使用范围写清楚。'],
 ];
 const stories=[
  ['lu','和陆老师聊工作，也聊读书','wechat','relationship','把一次任务从头到尾看明白，比列出一长串功能更有用。也记下陆老师推荐的书，国庆带回杭州。',[
   '陆老师，最近在 Kimi 做一个工作台，从访谈到前端都要自己跟。','听起来像你毕业项目的放大版。最难的是哪一段？','功能不难列，难的是知道哪些真值得先做。','先看一个人从开始到结束怎么完成事情。别急着总结十种需求。','五次访谈里，有三个人都卡在任务中断以后。','那就先把这一步看透，做完请他们再试一次。','您当年让我去食堂问同学怎么报名活动，也是这个意思。','是。还有，不要天天只看产品文章。最近有读别的书吗？','在看《置身事内》，国庆带回杭州接着看。','好，回来了有空喝杯茶，不必准备汇报。']],
  ['song','约国庆后在上海见面','wechat','relationship','宋岚十月中旬在上海，先把见面的周末留出来。聊到工作时，两人都决定少追一个热点，多看一次真实使用。',[
   '国庆你回杭州吗？','今年留上海，想把家里收拾一下。你呢？','先回去看爸妈，十月中旬也许去上海一趟。','那来找我吃饭，别只在虹桥转车。','好。你们最近也在做 AI 功能？','在试，但我更想知道用户离开页面之前究竟缺了什么。','我们现在也把接更多工具往后放了，先让任务停下后能接着做。','这个听起来很具体。到时候带电脑来给我看十分钟就够。','剩下时间不聊工作。想沿苏州河走走。','可以，等你的日期定下来。']],
  ['he','评测先看失败在哪里','feishu','career','第一轮只跑小批量真实任务，保留失败样例和调用量。周四一起看任务究竟停在模型判断还是工具返回。',[
   '何舟，首轮评测我想先跑五类任务，不做一个大分数。','可以，每类写清什么才算完成。','整理资料和改已有文稿先放进去，都是访谈里实际做的。','失败样例别删，尤其要保留工具调用之前的上下文。','这轮模型调用先控制在两千元内。','我先跑小批量，给你实际用量和失败分布。','界面会标出最后完成的一步，工具失败不会显示完成。','好，模型判断错和工具没返回最好分开看。','周四下午一起看第一轮？','四点可以。先拿十条完整记录来。']],
  ['xu','把中断发生的时刻测清楚','feishu','career','徐沐会分别在文件保存前后中断任务，再重启本机服务。用户改过文件后的继续操作也加入了验收。',[
   '我把中断和继续接好了，你今天能帮我看吗？','可以，我会在保存前后各按一次，不只测正常完成。','部分写好的文件会保留，界面标成待检查。','那关掉软件再打开，能找回原来的状态吗？','能读到最后一条执行事件，我再补一轮重启验证。','还有一种：停下后用户自己改了文件，再点继续。','不能盖掉他的改动，我会让它提示版本冲突。','这条我来测。报错最好告诉我哪个文件，不要只说失败。','好。测完我们优先修会丢输入的。','明天中午前把复现记录发你。']],
  ['tang','午休时一起走了一遍确认弹窗','feishu','career','将“是否继续”改成具体动作、对象与内容；回来后用发送邮件的原型走了一遍。',[
   '下楼买咖啡吗？我顺便给你看一下确认弹窗。','走。现在弹窗只有是否继续，我看不出要确认什么。','发邮件时应该直接看到收件人和正文。','对，改完正文再确认一次。读一份文档就不用每步都问。','我先把按钮写成发送这封邮件。','拒绝以后也别报错，让用户回去改内容。','这一版我下午接到可运行页面里。','别只发截图，我想真的按一遍。','好。你还是冰美式？','今天热的，外面有点凉。']],
  ['shen','对齐任务状态与文件版本','feishu','career','状态用接口字段传递，前端不从回复文字里猜。文件版本冲突和服务中断分别保留可读原因。',[
   '前端现在要区分等用户、运行中和失败。','我给你明确状态字段，不用从消息文本猜。','关页面以后，只要本机服务没停，任务就继续对吗？','对。服务停了会留下中断状态，重启后不会假装完成。','文件每次保存带版本号？','带，版本对不上返回冲突，旧内容还在。','那我在编辑区让用户先看自己的修改。','可以。我把最后完成的步骤也一起返回。','这下继续按钮可以有明确依据了。','接口说明更新了，下午我们连起来走一遍。']],
  ['zhao','和高中班主任说说近况','wechat','relationship','赵老师问起北京的生活，也提醒万叶别把假期塞满。国庆如果时间合适，回杭州见面喝茶。',[
   '赵老师，好久没联系，最近忙吗？','刚送走一届高三，难得轻松一点。你在北京还习惯吗？','习惯了，现在在月之暗面做 Kimi 产品，工作挺有意思。','我也用过 Kimi，原来你做这个。每天是不是很忙？','最近有内测，白天忙些。周末会出去跑跑步。','那就好。你以前一做题就坐着不动。','这个习惯还在改。国庆回杭州，想找您喝茶。','先陪家里，时间有余再来，不着急。','好，我提前给您发消息。','路上顺利，回来了再说。']],
  ['wu','敲定第一批内测回访的安排','feishu','career','八位候选用户中五位已完成访谈，另外三位还在约时间。吴桐整理回复情况，先看大家自己的任务能否完成。',[
   '十月十二日那轮先按八位用户准备吧。','可以，五位已经聊过，另外三位我还在约时间。','别让大家照着我们的脚本点，最好带自己的任务。','我在邀请里写清楚准备一件最近真想做的事。','如果中间停住，记录停在哪里就行，不用帮我们找借口。','哈哈，这句我会换个自然点的说法。','使用说明我先缩成一页。','好，我把反馈入口放在最后，不要发一大包文档。','邀请今天给韩知看一眼，明天再核对名单。','收到，有回复我同步到表里。']],
  ['ye','一起把成果编辑区做顺','feishu','career','保留输入草稿、切换文件不丢内容，长会话也不抢滚动位置。小窗口下再走一遍实际操作。',[
   '今天你接状态列表，我做成果编辑，可以吗？','行。切换文稿前记得留住草稿。','我做了自动保存本地草稿，正式版本还是点保存。','长会话别强制拉到最下面，我昨天看上一段总被拽走。','收到。窄窗口的成果区我改成可收起的侧层。','关掉以后焦点回到打开按钮，这个也顺便测。','你午饭想吃什么？我想出去走一下。','楼下面馆吧，回来我们拿真实长标题再测一遍。','好，中文和英文都看。','两点见，先吃饭。']],
  ['liang','五次访谈里重复出现的停顿','feishu','career','三位受访者在任务失败后不知道从哪一步继续。下一轮回访重点观察他们怎么修改要求、查看结果和再次开始。',[
   '五次访谈原话都在文档里了。','我先看具体操作，再写结论。哪一段最值得重放？','三个人在任务停下后都问过：现在做到了哪里？','那执行状态和恢复入口可以放在同一轮原型里看。','还有一个人想先改要求，再决定重跑哪部分。','这个很关键，不只是再试一次。','对。也有人不愿意把全部资料交进来，要能只选几份。','我在界面上保留选择范围，别逼他先导入所有东西。','下轮先找两位回访，看看改完是否好理解。','时间定了叫我，我一起听。']],
  ['wei','周日四点，奥森见','wechat','life','周日下午去奥森跑六公里，状态不好就缩短。跑完吃面，手机尽量放进腰包。',[
   '周日还跑吗？这周坐太久了。','跑，四点奥森南门？','可以，先按六公里，跑不动就走。','本来也不是训练营。你别一边跑一边回工作消息就行。','我把手机放腰包，工作到周五先收个尾。','跑完去吃面？上次那家汤不错。','好。最近早晚凉，要不要带个薄外套？','带着吧，停下来会冷。','如果下雨就改散步，临时看天气。','没问题，出门前联系。']],
  ['du','国庆回杭州，先吃一顿家常饭','wechat','family','初步打算十月二日中午到家，车次还没定。母亲想做饭，万叶想把那天下午留给家人。',[
   '妈，我想二号中午回杭州吃饭，车次还没定。','好，你定了再告诉我，不用一早赶。','这次回去不带一堆工作安排，下午陪你们走走。','那最好。阳台的桂花这几天开了，你回来能闻到。','想吃爸做的片儿川。','跟他说了，他已经在想买什么菜。','不用做太多，我们三四个人够吃就好。','你妹妹也回来，她说有新歌要放给你听。','哈哈好，课程作业晚点再看。','回来先吃饭，别把家里也变成办公室。']],
  ['lin','和父亲约一碗片儿川','wechat','family','回家吃面，不安排正式工作演示。父亲关心产品做错之后能不能让人改，也把这当成普通人的使用问题。',[
   '爸，二号如果中午到，想吃你做的片儿川。','可以，提前一天告诉我，我去买雪菜和笋。','不用一大桌，就吃面。','好。你最近做的那个工作台，是帮人干什么的？','把一句要求变成实际做事的过程，能看到做到了哪里。','它做错了，人还能改吧？','能，最近就在做停下来改要求、接着做这一段。','这就挺好，人自己干活也经常改主意。','回去给你看个简单的。','先吃饭，吃完想看再看。']],
  ['jiang','和妹妹看校园活动报名原型','wechat','family','万晴先画了活动列表、报名和确认结果的流程，准备找两位同学试一遍，再决定要不要加聊天功能。',[
   '哥，我们课程要做校园活动报名，页面越想越多。','先说一个同学从看见活动到报上名，要经过哪几步？','看时间地点，填信息，最后知道报名成功。','那先把这三步画出来，别急着加其他页。','我还想放一个聊天机器人。','你先问问同学，他们报名时具体有什么问题。','好，如果只是问地点，页面写清楚就行。','对。先找两个人试一下，你就知道哪里没讲明白。','我周末发原型给你，顺便给你听新歌。','新歌可以现在发，作业我们周末看。']],
  ['zhou','处理出租屋漏水和续租','wechat','life','厨房水槽下有一点渗水，先拍照给房东并约维修。续租条款等修好以后再逐项核对。',[
   '厨房水槽下面又湿了，周末做饭才发现。','先看看是不是软管接口，拍张照给房东。','拍了，他说可以约师傅，我准备周六上午在家等。','那先别自己拆。之前续租合同也快到期了吧？','十一月底，想等漏水修好再聊续租。','可以，把维修责任和涨租写清楚。','你上次搬家那家搬运公司怎么样？','还行，不过你先别急着搬，通勤短挺重要的。','也是。修完来家里吃饭，我最近学会煎三文鱼了。','期待，别只给我看成品照片。']],
  ['gao','从青岛照片里挑十二张','wechat','life','留下阴天的海、街边衣服和车窗倒影，整理成一本小相册。下次旅行留更多走路的空档。',[
   '青岛那批照片你选完了吗？我还有三百多张没看。','先选十二张，别一开始就修图。','我最喜欢阴天海边那张，颜色很淡。','我喜欢你拍的车窗倒影，比打卡照有意思。','下次想少排两个地方，就沿着路走。','同意。旅行不是把地图上的点都点亮。','周末我先把相册做个小版本。','发我，我帮你看顺序。','等打印出来带去跑步后给你看。','好，封面别堆字，留张你最喜欢的。']],
 ];
 const sources=[],conversations=[];
 for(let i=0;i<stories.length;i++){
  const [key,topic,platform,,summary,lines]=stories[i],partner=cast.find(p=>p[0]===key),sourceId=`${prefix}source-chat-${key}`,date=`2026-09-${String(10+i).padStart(2,'0')}`;
  sources.push({id:sourceId,title:topic,kind:'conversation',text:lines.map((line,n)=>`${(n+(['liang','jiang'].includes(key)?1:0))%2?partner[1]:'万叶'}：${line}`).join('\n'),createdAt:`${date}T12:00:00.000Z`,demo:true});
  conversations.push({id:`${prefix}chat-${key}`,title:partner[1],kind:'direct',personIds:[self,personId(key)],platform,accountId:'fictional-demo',demo:true,messages:lines.map((content,n)=>({id:`${prefix}message-${key}-${n+1}`,senderId:(n+(['liang','jiang'].includes(key)?1:0))%2?personId(key):self,content,time:`${date}T12:${String(n).padStart(2,'0')}:00.000Z`,sourceId}))});
 }
 const communityId=`${prefix}source-community`,sourceByPerson=key=>stories.some(s=>s[0]===key)?`${prefix}source-chat-${key}`:communityId;
 const people=cast.map(([key,name,role,description])=>({id:personId(key),name,role,description,sourceIds:[communityId,sourceByPerson(key)].filter((id,i,a)=>a.indexOf(id)===i)}));
 const relationshipLabels={lu:'导师',song:'长期朋友与同学',zhao:'老师',zhou:'高中同学与长期朋友',gao:'朋友',wei:'朋友',du:'母亲',jiang:'妹妹',lin:'父亲'};
 const relationships=cast.map(([key,,role,description])=>({id:`${prefix}rel-self-${key}`,from:self,to:personId(key),label:relationshipLabels[key]||'同事',description,sourceIds:[communityId]}));
 const pairs=[['he','shen','模型与工具接口'],['he','gao','技术交流'],['xu','shen','失败恢复测试'],['xu','ye','界面验收'],['tang','ye','交互实现'],['tang','han','授权界面评审'],['wu','liang','内测回访'],['wu','han','访谈说明核对'],['qiu','shen','工程交付'],['qiu','he','评测与质量'],['du','lin','夫妻'],['du','jiang','母女'],['lin','jiang','父女'],['song','zhou','朋友']];
 sources.push({id:communityId,title:'万叶的亲友与同事',kind:'note',demo:true,createdAt:stamp,text:'万叶，英文名 Caspian，住在北京，在月之暗面做 Kimi 产品工程。父母与妹妹在杭州。\n\n'+cast.map(p=>`${p[1]}，${p[2]}：${p[3]}`).join('\n')+'\n\n人与人的联系：\n'+pairs.map(([a,b,label])=>`${cast.find(p=>p[0]===a)[1]}与${cast.find(p=>p[0]===b)[1]}：${label}。`).join('\n')+'\n\n九月工作：十月三日前整理访谈，八日前完成核心流程验收，十二日计划开始首轮内测。生活安排：周日四点去奥森跑步；国庆回杭州看家人；周六等师傅修水槽；将青岛旅行照片选成十二张的小相册。'});
 const legacyPairIds=['lu-du','song-liang','he-ye','xu-zhao','tang-han','shen-song','wu-he','gao-xu','ye-liang','qiu-wu','wei-lin','zhou-lu'];
 for(const [i,[a,b,label]] of pairs.entries())relationships.push({id:`${prefix}rel-${legacyPairIds[i]??`${a}-${b}`}`,from:personId(a),to:personId(b),label,description:`${cast.find(p=>p[0]===a)[1]}与${cast.find(p=>p[0]===b)[1]}：${label}。`,sourceIds:[communityId]});
 const events=stories.map(([key,title,platform,category,description],i)=>({id:`${prefix}event-${key}`,date:`2026-09-${String(10+i).padStart(2,'0')}`,title,description,category,scope:'note',personIds:[self,personId(key)],sourceIds:[sourceByPerson(key)],platform}));
 events.push(...[
  ['scope','2026-09-23','内测先做好中断后继续','把更多工具接入放到下一轮，先看用户能否找到上一次停下的位置。','career','北京'],
  ['quiet','2026-09-24','给周日留出一段慢跑时间','奥森南门，下午四点。跑六公里或者走一会儿，结束后吃面。','life','北京奥林匹克森林公园'],
  ['permission','2026-09-26','把内测使用说明缩成一页','请用户带自己的任务来，告诉他们在哪里看结果、哪里反馈问题。','career','北京'],
 ].map(([key,date,title,description,category,location])=>({id:`${prefix}event-${key}`,date,title,description,category,scope:'note',personIds:[self],sourceIds:[communityId],platform:'notes',location})));
 const agents=[
  ['writer','写作编辑','把想法写成清楚、自然的文字','先看文字写给谁、要说明什么。保留用户原意，给出可直接修改的草稿。发送前由用户确认。'],
  ['researcher','研究分析师','查资料、找依据、整理问题','优先阅读已选资料，再补必要来源。区分资料中的说法和自己的判断，结论能回到出处。'],
  ['budget','预算分析师','整理费用与时间安排','区分预算、报价和实际支出，算清必要成本，超出上限时给出可行调整。'],
  ['care','生活规划师','安排生活中的大小事情','结合用户的时间、精力和偏好安排日程，给休息、朋友与家人留出位置。不要替用户作承诺。'],
 ].map(([key,name,role,instructions])=>({id:`${prefix}agent-${key}`,name,role,instructions,createdAt:stamp}));
 const goals=[
  ['samples','完成工作台核心流程验收','和徐沐、叶澄检查澄清、执行、中断、继续与文件版本冲突。','active','2026-10-08','work'],
  ['permission','整理访谈结论，约齐首轮内测用户','整理五次访谈的原话与观察，和吴桐确认另外三位受访者的时间。','active','2026-10-03','work'],
  ['interactive','规划下一轮工具接入','等首轮内测结果出来，再决定哪些工具值得优先接入。','paused','','work'],
  ['rest','确认国庆回杭州的车次','初步十月二日中午到家，确定后提前告诉爸妈，把那天下午留给家人。','active','2026-10-01','personal'],
  ['photos','从青岛旅行照片里挑十二张','先选片，再调整顺序，做一本小相册给高远看。','active','','personal'],
  ['home','约好厨房水槽的维修时间','和房东确认周六上午，拍好渗水位置，修完检查软管接口。','active','','personal'],
 ].map(([key,title,description,status,dueDate,list])=>({id:`${prefix}goal-${key}`,title,description,status,...(dueDate?{dueDate}:{}),listId:`goal-list-${list}`,sourceIds:[communityId]}));
 const rooms=[
  ['planner','和项目规划师商量','direct',['agent-planner']],
  ['writer','和写作编辑写草稿','direct',[`${prefix}agent-writer`]],
  ['studio','Kimi 工作台内测小组','group',['agent-planner','agent-reviewer',`${prefix}agent-writer`]],
  ['balance','安排国庆与本周生活','group',[`${prefix}agent-budget`,`${prefix}agent-care`]],
 ].map(([key,title,kind,agentIds])=>({id:`${prefix}room-${key}`,title,kind,agentIds,mode:'demo',createdAt:stamp,updatedAt:stamp,demo:true,taskIds:[],messages:[{id:`${prefix}room-intro-${key}`,role:'system',content:'本地演示会话；连接模型后可继续处理自己的任务。',createdAt:stamp,demo:true}]}));
 const extra=createDemoStories(stamp);
 return {sources:[...sources,...extra.sources],people,relationships,events:[...events,...extra.events],conversations:[...conversations,...extra.conversations],goals,agents,agentRooms:rooms};
}
export function applyDemoExpansion(store,stamp){
 if(!store.meta('profile').demo)return;
 if(store.get('meta','demo-engineer-v4')?.value?.matcherVersion>=DEMO_MATCHER_VERSION&&store.get('meta',DEMO_PORTRAIT_MARKER))return;
 const seed=createSeed(stamp),expansion=createDemoExpansion(stamp),life=createDemoLife(stamp),data={profile:seed.profile};
 for(const collection of ['sources','facts','people','agents','relationships','events','conversations','goals','agentRooms'])data[collection]=[...(seed[collection]??[]),...(expansion[collection]??[]),...(life[collection]??[])];
 refreshFictionalDemo(store,data,stamp);
 applyDemoPortraits(store,data,stamp);
}
