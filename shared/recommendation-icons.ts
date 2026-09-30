/** Local icon vocabulary. It describes a recommendation; it never sends or stores its text. */
export const recommendationSemantics = [
 {id:'research',label:['资料研究','Research'],icon:'Search',group:'work',keywords:['调研','研究资料','查资料','研究','research','sources','investigate']},
 {id:'write',label:['写作整理','Writing'],icon:'Edit',group:'create',keywords:['写作','文案','撰写','写一份','write','writing','draft','copywriting']},
 {id:'feedback',label:['反馈评审','Feedback'],icon:'Chat',group:'work',keywords:['用户反馈','产品评审','反馈','feedback','user review','review comments']},
 {id:'presentation',label:['演示汇报','Presentations'],icon:'FilePresentation',group:'create',keywords:['演示','汇报','幻灯片','presentation','slides','slideshow','demo','ppt']},
 {id:'trip',label:['旅行行程','Travel'],icon:'Calendar',group:'life',keywords:['行程','旅行','旅游','航班','酒店','trip','travel','itinerary','flight','hotel']},
 {id:'family',label:['家庭亲友','Family'],icon:'UserHeart',group:'life',keywords:['父母','家人','陪伴孩子','家庭','family','parents','children','relatives']},
 {id:'health',label:['健康就医','Health'],icon:'Stethoscope',group:'life',keywords:['健康','体检','就医','用药','health','medical','doctor','medication']},
 {id:'calendar',label:['日程安排','Calendar'],icon:'CalendarToday',group:'organize',keywords:['日程','日历','安排时间','预约','calendar','schedule','appointment']},
 {id:'budget',label:['预算账单','Budget'],icon:'DollarCircle',group:'life',keywords:['预算','报销','账单','开支','budget','invoice','expense','spending']},
 {id:'shopping',label:['购物比较','Shopping'],icon:'ShoppingBag',group:'life',keywords:['购物','买什么','选购','购物清单','shopping','purchase','buy','wishlist']},
 {id:'coding',label:['编程开发','Coding'],icon:'Code',group:'work',keywords:['编程','代码','修复 bug','代码审查','coding','code','debug','bug','pull request']},
 {id:'learning',label:['学习练习','Learning'],icon:'Education',group:'life',keywords:['学习','课程','练习','备考','learning','study','course','practice','exam']},
 {id:'job',label:['求职职业','Career'],icon:'SuitcaseWorkBusiness',group:'work',keywords:['求职','面试','简历','招聘','job','interview','resume','career','recruiting']},
 {id:'music',label:['音乐声音','Music'],icon:'Headphones',group:'create',keywords:['音乐','歌单','歌曲','播客','music','playlist','song','podcast']},
 {id:'photo',label:['照片摄影','Photography'],icon:'Camera',group:'create',keywords:['照片','摄影','拍照','相册','photo','photos','photography','album']},
 {id:'food',label:['饮食餐厅','Food'],icon:'DiningEvents',group:'life',keywords:['餐厅','菜谱','晚餐','早餐','饮食','food','restaurant','recipe','dinner','breakfast']},
 {id:'fitness',label:['运动训练','Fitness'],icon:'Dumbbell',group:'life',keywords:['运动','健身','跑步','训练计划','fitness','workout','running','exercise']},
 {id:'reading',label:['阅读书籍','Reading'],icon:'BookOpen',group:'life',keywords:['阅读','读书','书单','书籍','reading','book','books','literature']},
 {id:'email',label:['邮件沟通','Email'],icon:'Mail',group:'work',keywords:['邮件','邮箱','email','mail','inbox']},
 {id:'meeting',label:['会议协作','Meetings'],icon:'Group',group:'work',keywords:['会议','协作','会议纪要','meeting','minutes','collaboration','workshop']},
 {id:'analysis',label:['数据分析','Analysis'],icon:'AnalyzeData',group:'work',keywords:['数据分析','报表','指标','统计','analysis','analytics','metrics','statistics','spreadsheet']},
 {id:'translation',label:['翻译语言','Translation'],icon:'Translate',group:'create',keywords:['翻译','译成','双语','translate','translation','bilingual','localize']},
 {id:'design',label:['设计创意','Design'],icon:'ColorTheme',group:'create',keywords:['设计','配色','排版','视觉','design','layout','typography','palette']},
 {id:'video',label:['视频剪辑','Video'],icon:'Video',group:'create',keywords:['视频','剪辑','短片','video','film','footage','editing footage']},
 {id:'organize',label:['文件归档','Organization'],icon:'Folder',group:'organize',keywords:['归档','文件夹','整理文件','去重','archive','folder','organize files','deduplicate']},
 {id:'automation',label:['提醒跟进','Follow-ups'],icon:'Clock',group:'organize',keywords:['自动化','定期','提醒','跟进','automation','reminder','recurring','follow up']},
 {id:'chat',label:['对话讨论','Conversation'],icon:'Chat',group:'organize',keywords:['聊聊','讨论','问一下','chat','discuss','conversation']},
 {id:'file',label:['文档文件','Documents'],icon:'Document',group:'organize',keywords:['文档','文件','document','file','pdf']},
] as const;
export type RecommendationKind = typeof recommendationSemantics[number]['id'];
export type RecommendationIconName = typeof recommendationSemantics[number]['icon'];
export type RecommendationGroup = typeof recommendationSemantics[number]['group'];
export const recommendationPlatforms = [
 {id:'wechat',label:['微信','WeChat'],aliases:['微信','wechat'],keywords:['微信','wechat']},
 {id:'wecom',label:['企业微信','WeCom'],aliases:['企业微信','wecom','wework'],keywords:['企业微信','wecom','wework']},
 {id:'qq',label:['QQ','QQ'],aliases:['qq'],keywords:['qq']},
 {id:'feishu',label:['飞书','Feishu / Lark'],aliases:['飞书','feishu','lark'],keywords:['飞书','feishu','lark app']},
 {id:'dingtalk',label:['钉钉','DingTalk'],aliases:['钉钉','dingtalk'],keywords:['钉钉','dingtalk']},
 {id:'slack',label:['Slack','Slack'],aliases:['slack'],keywords:['slack']},
 {id:'teams',label:['Microsoft Teams','Microsoft Teams'],aliases:['teams','msteams','microsoft teams'],keywords:['microsoft teams','teams频道','teams channel']},
 {id:'telegram',label:['Telegram','Telegram'],aliases:['telegram'],keywords:['telegram']},
 {id:'discord',label:['Discord','Discord'],aliases:['discord'],keywords:['discord']},
 {id:'signal',label:['Signal','Signal'],aliases:['signal'],keywords:['signal app','signal messenger','signal消息']},
 {id:'line',label:['LINE','LINE'],aliases:['line'],keywords:['line app','line消息','line聊天']},
 {id:'messenger',label:['Messenger','Messenger'],aliases:['messenger','facebook messenger'],keywords:['facebook messenger','messenger消息']},
 {id:'imessage',label:['iMessage','iMessage'],aliases:['imessage'],keywords:['imessage']},
 {id:'instagram',label:['Instagram','Instagram'],aliases:['instagram'],keywords:['instagram']},
 {id:'whatsapp',label:['WhatsApp','WhatsApp'],aliases:['whatsapp'],keywords:['whatsapp']},
 {id:'googlechat',label:['Google Chat','Google Chat'],aliases:['googlechat','google chat'],keywords:['google chat']},
 {id:'matrix',label:['Matrix','Matrix'],aliases:['matrix'],keywords:['matrix chat','matrix聊天']},
 {id:'mattermost',label:['Mattermost','Mattermost'],aliases:['mattermost'],keywords:['mattermost']},
] as const;
export type RecommendationPlatform = typeof recommendationPlatforms[number]['id'];
export type RecommendationIconInput = {app?:string;kind?:string;text?:string;fallback?:'chat'|'file'};
export type ResolvedRecommendationIcon =
 | {type:'semantic';id:RecommendationKind;icon:RecommendationIconName;reason:'explicit-kind'|'keyword'|'fallback';matched?:string}
 | {type:'platform';id:RecommendationPlatform;platform:RecommendationPlatform;reason:'explicit-app'|'keyword';matched?:string};
const aliases:Record<string,RecommendationKind>={writing:'write',travel:'trip',review:'feedback',slides:'presentation',finance:'budget',career:'job',photography:'photo',document:'file',files:'file',reminder:'automation'};
const normalize=(value:unknown)=>typeof value==='string'?value.normalize('NFKC').trim().toLowerCase():'';
function containsTerm(text:string,term:string){
 const keyword=normalize(term);
 if(/[^a-z0-9\s-]/.test(keyword))return text.includes(keyword);
 const escaped=keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
 return new RegExp(`(^|[^a-z0-9_])${escaped}($|[^a-z0-9_])`,'i').test(text);
}
function keywordScore(term:string){return /[\u3400-\u9fff]/.test(term)?Math.min(term.length,6):term.split(/\s+/).length+2;}
/** Explicit app > explicit kind > branded text > semantic keywords > safe fallback. */
export function resolveRecommendationIcon(input:RecommendationIconInput={}):ResolvedRecommendationIcon{
 const app=normalize(input.app),kind=normalize(input.kind);
 const platform=recommendationPlatforms.find(item=>item.id===app||item.aliases.some(alias=>normalize(alias)===app));
 if(platform)return {type:'platform',id:platform.id,platform:platform.id,reason:'explicit-app'};
 const semantic=recommendationSemantics.find(item=>item.id===(aliases[kind]||kind));
 if(semantic)return {type:'semantic',id:semantic.id,icon:semantic.icon,reason:'explicit-kind'};
 const text=normalize(input.text).slice(0,2000);
 const appMatches=recommendationPlatforms.flatMap(item=>item.keywords.filter(word=>containsTerm(text,word)).map(word=>({item,word,score:word.length})));
 appMatches.sort((a,b)=>b.score-a.score);
 if(appMatches[0]){const {item,word}=appMatches[0];return {type:'platform',id:item.id,platform:item.id,reason:'keyword',matched:word};}
 const matches=recommendationSemantics.map((item,index)=>{const words=item.keywords.filter(word=>containsTerm(text,word));return {item,index,words,score:words.reduce((sum,word)=>sum+keywordScore(word),0)};}).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
 if(matches[0]){const {item,words}=matches[0];return {type:'semantic',id:item.id,icon:item.icon,reason:'keyword',matched:words.join(', ')};}
 const fallback=input.fallback==='file'||/\.(?:md|txt|pdf|docx?|xlsx?|csv|pptx?)(?:\s|$|[?，。])/i.test(text)?'file':'chat';
 const entry=recommendationSemantics.find(item=>item.id===fallback)!;
 return {type:'semantic',id:entry.id,icon:entry.icon,reason:'fallback'};
}
