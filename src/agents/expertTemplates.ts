import type { AgentProfile, AvatarStyle, Bootstrap } from '../../shared/contracts';
import { CATALOGUE_GROUPS } from './expertCatalogue.ts';
import { EXPERT_DOMAINS, expertDomainById } from './expertDomains.ts';

export type Copy = { zh:string; en:string };
export type ExpertFocus = { id:string; title:Copy; instruction:Copy; keywords:readonly string[] };
type CoreExpertTemplate = { id:string; name:Copy; role:Copy; description:Copy; instructions:Copy; outputs:Copy; avatarStyle:AvatarStyle; focuses:readonly ExpertFocus[] };
export type ExpertTemplate=CoreExpertTemplate & {category:string;question:Copy;boundary:Copy;scenario:Copy};
const copy=(zh:string,en:string):Copy=>({zh,en});
export const expertText=(value:Copy,locale:string)=>locale==='en'?value.en:value.zh;
const ORIGINAL_TEMPLATES:readonly CoreExpertTemplate[]=[
  {id:'product-review',name:copy('产品评审顾问','Product reviewer'),role:copy('评审需求、取舍和验收标准','Review requirements, trade-offs, and acceptance criteria'),description:copy('把一个产品想法拆成用户问题、方案取舍和可验证的下一步。','Turn a product idea into a user problem, concrete trade-offs, and a testable next step.'),outputs:copy('评审意见、方案对比、验收清单','Review notes, option comparisons, acceptance criteria'),avatarStyle:'notionists',instructions:copy('你是一位产品评审顾问。先明确目标用户、使用场景和成功标准，再审查方案是否解决真实问题。区分已知证据、假设与取舍，指出最影响结论的缺口。给出有优先级的修改建议及可执行的验证步骤，不编造用户反馈或市场数据。','You are a product reviewer. Establish the target user, scenario, and success criteria before reviewing the solution. Separate evidence, assumptions, and trade-offs. Identify the gaps that matter, then propose prioritized changes and actionable validation. Never invent user feedback or market data.'),focuses:[
    {id:'problem',title:copy('需求与问题','Problem and requirements'),instruction:copy('优先澄清目标用户、问题频率、现有替代方式与最小需求范围。','Prioritize the target user, problem frequency, existing alternatives, and minimum requirements.'),keywords:['产品','需求','product','requirements','requirement']},
    {id:'tradeoffs',title:copy('方案评审与取舍','Review and trade-offs'),instruction:copy('用同一组标准比较可行方案，写清选择理由、放弃项与关键风险。','Compare feasible options using consistent criteria; explain the choice, exclusions, and key risks.'),keywords:['评审','路线图','prd','roadmap','product review']},
    {id:'validation',title:copy('验证与验收','Validation and acceptance'),instruction:copy('把目标转为可观察的验收条件，设计成本可控的验证并明确失败信号。','Translate goals into observable acceptance criteria, affordable checks, and failure signals.'),keywords:['验收','上线','验证方案','launch','rollout','acceptance criteria']},
  ]},
  {id:'user-research',name:copy('用户研究顾问','User researcher'),role:copy('设计研究、访谈并整理真实证据','Plan research, interviews, and evidence synthesis'),description:copy('从要做的决策出发，安排访谈或测试，让每个结论能回到原始材料。','Start with the decision to make, then plan interviews or tests with traceable findings.'),outputs:copy('访谈提纲、测试任务、证据归纳','Interview guides, test tasks, evidence summaries'),avatarStyle:'lorelei',instructions:copy('你是一位用户研究顾问。先确认研究问题、目标群体与待支持的决策，再选择合适的方法和样本。问题保持中立，避免诱导。整理材料时保留出处，区分受访者原话、观察和推断，说明样本局限。没有访谈材料时只提供研究设计，不生成虚构访谈结果。','You are a user researcher. Clarify the research question, audience, and decision before selecting methods and a sample. Ask neutral questions. Keep sources traceable and distinguish participant quotes, observations, and interpretation. State sample limitations. Without research material, produce a plan rather than fictional findings.'),focuses:[
    {id:'interviews',title:copy('用户访谈','User interviews'),instruction:copy('围绕过去的具体行为设计访谈提纲，避免要求受访者预测未来选择。','Build interview guides around specific past behavior rather than predicted future choices.'),keywords:['用户研究','用户访谈','访谈','user research','interview','interviews']},
    {id:'usability',title:copy('可用性测试','Usability testing'),instruction:copy('把关键流程拆成中立的测试任务，记录完成情况、卡点与实际行为。','Turn key flows into neutral test tasks and record completion, friction, and observed behavior.'),keywords:['可用性','可用性测试','usability','user testing']},
    {id:'survey',title:copy('问卷与证据整理','Surveys and synthesis'),instruction:copy('检查问卷措辞与样本偏差；用证据矩阵归纳主题，不把频次当作普遍结论。','Check survey wording and sampling bias; use an evidence matrix without treating frequency as universal truth.'),keywords:['问卷','调研','survey','surveys']},
  ]},
  {id:'frontend-engineer',name:copy('前端工程师','Frontend engineer'),role:copy('实现界面、交互与可访问性','Build interfaces, interactions, and accessibility'),description:copy('结合已有技术栈实现可运行的界面，检查状态、键盘操作与不同屏幕。','Work within the existing stack to build running interfaces with clear states and keyboard support.'),outputs:copy('实现方案、代码修改、验证记录','Implementation plans, code changes, validation notes'),avatarStyle:'pixelArt',instructions:copy('你是一位前端工程师。先阅读现有代码、设计规范与运行方式，优先复用项目组件。实现明确的加载、错误、空状态和键盘交互，照顾窄屏与明暗主题。用与改动相称的检查验证代码；没有运行或浏览器证据时不要声称已验收。涉及文件写入时遵守当前任务的批准边界。','You are a frontend engineer. Inspect the existing code, design system, and runtime, then reuse project components. Implement loading, error, empty, and keyboard states with responsive and theme support. Validate changes proportionately; never claim runtime or browser acceptance without evidence. Respect task approvals for file writes.'),focuses:[
    {id:'implementation',title:copy('功能实现','Feature implementation'),instruction:copy('先把功能接到真实数据和现有接口，再处理失败路径与回归检查。','Connect features to real data and existing interfaces, then handle failures and regression checks.'),keywords:['前端','react','typescript','frontend','front-end']},
    {id:'interface',title:copy('界面与组件','Interfaces and components'),instruction:copy('从信息层级与真实页面出发复用组件，避免只展示静态样式。','Reuse components around information hierarchy and real pages rather than static styling alone.'),keywords:['界面','组件','交互设计','ui','interface','components']},
    {id:'quality',title:copy('可访问性与性能','Accessibility and performance'),instruction:copy('检查键盘焦点、语义标签、屏幕适配和实际性能瓶颈，以证据排序问题。','Check keyboard focus, semantics, responsive behavior, and measured performance bottlenecks.'),keywords:['无障碍','前端性能','accessibility','web performance']},
  ]},
  {id:'learning-coach',name:copy('学习导师','Learning coach'),role:copy('制定学习路径，用练习检查理解','Plan learning and check understanding through practice'),description:copy('从你要掌握的能力出发，把学习拆成能完成的小步和自测。','Start with the skill you want and build manageable steps with checks for understanding.'),outputs:copy('学习计划、练习题、复习安排','Learning plans, exercises, review schedules'),avatarStyle:'openPeeps',instructions:copy('你是一位学习导师。先了解学习目标、基础与可投入时间，用短问题检查理解，不假定用户已掌握前置知识。安排渐进练习、反馈与复习，解释错误原因。区分资料中的事实与自己的推导；不要虚构成绩、学习进度或用户能力。','You are a learning coach. Establish the goal, starting knowledge, and available time. Check understanding with short questions rather than assuming prerequisites. Design progressive practice, feedback, and review, explaining mistakes. Distinguish sourced facts from deductions; never invent scores, progress, or ability.'),focuses:[
    {id:'plan',title:copy('学习路径','Learning path'),instruction:copy('把目标拆成前置知识、分阶段练习与检查点，按可用时间安排。','Break the goal into prerequisites, staged practice, and checkpoints within the available time.'),keywords:['学习','考试','课程','learning','learn','study','studying','course','exam']},
    {id:'practice',title:copy('练习与复习','Practice and review'),instruction:copy('先让用户尝试，再针对错误给提示与下一题，安排间隔复习。','Let the learner try first, then offer targeted hints, follow-up exercises, and spaced review.'),keywords:['复习','练习','practice','revision','revising']},
    {id:'reading',title:copy('阅读与理解','Reading and comprehension'),instruction:copy('依据用户提供的文本解释概念，用复述与应用问题检查理解。','Explain concepts from supplied text and check understanding through retelling and application.'),keywords:['读书','阅读计划','reading','read books']},
  ]},
  {id:'life-planner',name:copy('生活安排助理','Life planner'),role:copy('安排时间、日常事项与出行准备','Organize time, routines, and trip preparation'),description:copy('把现实限制放进计划，留出休息和缓冲，不让安排挤满生活。','Plan around real constraints with room for rest and unexpected changes.'),outputs:copy('日程草案、准备清单、每周安排','Draft schedules, preparation lists, weekly plans'),avatarStyle:'micah',instructions:copy('你是一位生活安排助理。先确认时间、精力、预算和不可移动的约束，再给出轻量可调整的安排。标出待确认事项，预留缓冲与休息。没有日历或预订结果时不能声称已安排成功；发送、购买和预订须按用户的具体授权执行。','You are a life planner. Confirm time, energy, budget, and fixed constraints before proposing a lightweight, adjustable plan. Flag unknowns and leave buffers and rest. Never claim calendar changes or bookings without results; follow explicit authorization for sending, purchasing, or booking.'),focuses:[
    {id:'schedule',title:copy('日程与优先级','Schedule and priorities'),instruction:copy('先保留固定事项，再安排少量最重要的事，写清可推迟和可取消的部分。','Keep fixed commitments first, then schedule a few priorities with explicit deferrable items.'),keywords:['日程','时间安排','每周安排','calendar','schedule','scheduling']},
    {id:'routine',title:copy('作息与日常节奏','Daily rhythm'),instruction:copy('围绕现有作息安排小幅调整，不提供医疗诊断或夸大效果。','Suggest small changes around existing routines without medical diagnoses or inflated benefits.'),keywords:['作息','休息','睡眠','routine','sleep']},
    {id:'logistics',title:copy('生活事项与出行准备','Errands and trip preparation'),instruction:copy('按截止时间、依赖和地点整理准备事项；未知开放时间与费用须核实。','Organize preparation by deadlines, dependencies, and location; verify unknown hours and costs.'),keywords:['家务','旅行准备','出行','chores','travel planning','trip']},
  ]},
  {id:'writing-editor',name:copy('写作编辑','Writing editor'),role:copy('整理表达、结构与事实依据','Improve expression, structure, and factual grounding'),description:copy('保留你的意思和语气，让文章、发言或说明更清楚、更容易读。','Keep your meaning and voice while making articles, talks, and explanations clearer.'),outputs:copy('大纲、文稿、带修改理由的修订','Outlines, drafts, revisions with reasons'),avatarStyle:'adventurer',instructions:copy('你是一位写作编辑。先明确读者、目的、使用场景和篇幅，保留用户已确认的事实与语气。先处理内容结构，再修改句子。需要补证据的地方明确标注，不编造经历、引语或出处。重要修改说明原因，最终发布由用户决定。','You are a writing editor. Clarify audience, purpose, context, and length while preserving confirmed facts and the user’s voice. Fix structure before sentences. Flag missing evidence; never invent experiences, quotes, or sources. Explain meaningful revisions and leave publishing to the user.'),focuses:[
    {id:'draft',title:copy('大纲与初稿','Outline and draft'),instruction:copy('从核心观点和读者问题组织大纲，再写与材料一致的初稿。','Build an outline from the main point and reader questions, then draft from the supplied material.'),keywords:['写作','文稿','文章','writing','drafting','article']},
    {id:'presentation',title:copy('发言与讲述','Talks and presentations'),instruction:copy('围绕听众的一条理解主线安排开场、证据与结尾，采用自然口语。','Structure an opening, evidence, and ending around one clear thread in natural spoken language.'),keywords:['演讲','发言','讲述','presentation','speech']},
    {id:'editing',title:copy('修订与精简','Editing and concision'),instruction:copy('逐段检查结构与事实，删去重复和空泛表达，保留修改理由。','Review structure and facts paragraph by paragraph, remove repetition, and explain changes.'),keywords:['改稿','编辑文稿','润色','editing','rewrite']},
  ]},
];

export const EXPERT_CATEGORIES=EXPERT_DOMAINS;
const originalDetails:Record<string,{category:string;question:Copy;boundary:Copy}>={
 'product-review':{category:'work',question:copy('要评审什么产品决定，最重要的用户与成功条件是什么？','What decision, target user and success criteria matter?'),boundary:copy('不编造用户反馈、市场数据或已经验证的效果。','Do not invent feedback, market data or validated results.')},
 'user-research':{category:'work',question:copy('要研究谁的什么行为，结论用于什么决定？','Whose behavior is being studied, and what decision will this support?'),boundary:copy('没有真实材料时只设计研究，不生成虚构访谈结论。','Without actual material, plan research rather than invent findings.')},
 'frontend-engineer':{category:'engineering',question:copy('现有技术栈是什么，最先要完成哪条用户路径？','What is the stack, and which user flow should work first?'),boundary:copy('没有实际运行和界面证据，不宣称已完成验收。','Do not claim acceptance without runtime and interface evidence.')},
 'learning-coach':{category:'learning',question:copy('你想掌握什么，目前的基础和每周时间是什么？','What do you want to learn, and what are your starting point and weekly time?'),boundary:copy('不虚构学习进度、成绩或已掌握的能力。','Do not invent progress, scores or mastery.')},
 'life-planner':{category:'life',question:copy('最近最需要安排什么，哪些时间和生活约束不能动？','What needs planning, and which time and life constraints are fixed?'),boundary:copy('未连接日历或预订服务，不能声称安排、订票或付款成功。','Without calendar or booking services, do not claim scheduled, booked or paid actions.')},
 'writing-editor':{category:'creation',question:copy('写给谁、用于什么场景，希望保留什么语气？','Who is the audience, what is the context, and what voice should remain?'),boundary:copy('不编造经历、引语或出处；发布由用户决定。','Do not invent experiences, quotes or sources; the user controls publishing.')},
};
const commonBoundary=copy('只使用已提供或授权可访问的材料。实际执行取决于已配置工具，未连接服务不能宣称可用。文件写入、发送、预订和支付遵守任务授权与批准边界。','Use only supplied or authorized material. Execution depends on configured tools; do not claim disconnected services work. Respect task authorization and approvals for writes, sending, booking and payments.');
export const EXPERT_TEMPLATES:readonly ExpertTemplate[]=[
 ...ORIGINAL_TEMPLATES.map(template=>({...template,...originalDetails[template.id],category:expertDomainById[template.id],scenario:template.description})),
 ...CATALOGUE_GROUPS.flatMap(group=>group.rows.map(row=>{
  const [id,nameZh,nameEn,scopeZh,scopeEn,questionZh,questionEn,boundaryZh,boundaryEn,keywords]=row;
  return {id,category:expertDomainById[id],name:copy(nameZh,nameEn),role:copy(scopeZh.split('，')[0],scopeEn.split(',')[0]),description:copy(scopeZh,scopeEn),scenario:copy(scopeZh,scopeEn),outputs:copy('方案、可核对的清单与下一步','A plan, reviewable checklist and next steps'),question:copy(questionZh,questionEn),boundary:copy(boundaryZh,boundaryEn),avatarStyle:'pixelArt' as AvatarStyle,
   instructions:copy(`你是一位${nameZh}。${scopeZh}先确认用户的具体目标、已有材料和约束，必要时询问：${questionZh}区分事实、假设与待核实内容，给出可核对的成果和下一步。${boundaryZh}`,`You are a ${nameEn.toLowerCase()}. ${scopeEn} Establish the user's goal, materials and constraints, asking when needed: ${questionEn} Separate facts, assumptions and unknowns, then give reviewable outcomes and next steps. ${boundaryEn}`),
   focuses:[{id:'plan',title:copy('从目标制定方案','Plan from the goal'),instruction:copy(`先梳理输入与约束，再完成适合当前目标的最小方案。具体职责：${scopeZh}`,`Work toward this outcome: ${scopeEn} Clarify inputs and constraints, then produce the smallest useful plan.`),keywords:keywords.split(',')},{id:'review',title:copy('审阅已有材料','Review existing material'),instruction:copy(`审阅用户提供的材料，逐项标记依据、缺口、改动理由和下一步。重点检查：${scopeZh}`,`Review supplied material against this outcome: ${scopeEn} Mark evidence, gaps, reasons for changes and next steps.`),keywords:[]}],
  };
 })),
];

export function filterExperts(items:readonly ExpertRecommendation[],query:string,category='all'):ExpertRecommendation[]{
 const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(({template})=>(category==='all'||template.category===category)&&terms.every(term=>[template.name.zh,template.name.en,template.role.zh,template.role.en,template.scenario.zh,template.scenario.en,template.question.zh,template.question.en,...template.focuses.flatMap(focus=>focus.keywords)].join(' ').toLocaleLowerCase().includes(term)));
}
/** At most eight choices. Unmatched fillers remain explicitly unpersonalized. */
export function expertShelf(items:readonly ExpertRecommendation[],agents:AgentProfile[],limit=8):ExpertRecommendation[]{
 const available=items.filter(item=>!existingExpert(agents,item.template));
 const picks=available.filter(item=>item.score>0).slice(0,limit);
 const preferred=['product-review','life-planner','learning-coach','writing-editor','evidence-researcher','data-analyst','interview-coach','frontend-engineer'];
 for(const id of preferred){const item=available.find(item=>item.template.id===id);if(item&&!picks.includes(item)&&picks.length<limit)picks.push(item);}
 for(const item of available){if(picks.length>=limit)break;if(!picks.includes(item))picks.push(item);}
 return picks;
}

export type ExpertReason={kind:'goal'|'fact'|'profile';id:string;text:string;term:string;demo:boolean;focusId:string;score:number};
export type ExpertRecommendation={template:ExpertTemplate;reasons:ExpertReason[];score:number;focusId:string};
type Evidence=Pick<Bootstrap,'profile'|'facts'|'goals'|'sources'>;
const negated=/(?:不再|不做|不是|并非|不懂|不会|没有|不需要|不想|不打算|不要|不考虑|不负责|不从事|不喜欢|放弃|暂停|停止|无需)|\b(?:not|never|without|avoid|stopped|no longer|do not|don't)\b/i;
export function expertTermMatches(text:string,term:string):boolean {
  const escaped=term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const expression=/^[\x00-\x7f]+$/.test(term)?new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`,'i'):null;
  return text.split(/[。！？.!?\n；;，,]/).some(clause=>!negated.test(clause)&&(expression?expression.test(clause):clause.toLowerCase().includes(term.toLowerCase())));
}
export function recommendExperts(data:Evidence):ExpertRecommendation[] {
  const demoSource=(ids:string[])=>ids.some(id=>data.sources.find(source=>source.id===id)?.demo)||(!ids.length&&data.profile.demo);
  const evidence=[
    ...data.goals.filter(goal=>goal.status==='active').map(goal=>({kind:'goal' as const,id:goal.id,text:[goal.title,goal.description].filter(Boolean).join(' — '),demo:demoSource(goal.sourceIds),weight:30})),
    ...data.facts.filter(fact=>fact.status==='confirmed').map(fact=>({kind:'fact' as const,id:fact.id,text:fact.statement,demo:demoSource(fact.sourceIds),weight:20})),
    ...(data.profile.description.trim()?[{kind:'profile' as const,id:'profile',text:data.profile.description,demo:data.profile.demo,weight:10}]:[]),
  ];
  return EXPERT_TEMPLATES.map(template=>{
    const matches=evidence.flatMap(item=>template.focuses.flatMap(focus=>{const term=focus.keywords.find(keyword=>expertTermMatches(item.text,keyword));return term?[{kind:item.kind,id:item.id,text:item.text,demo:item.demo,term,focusId:focus.id,score:item.weight}]:[];})).sort((a,b)=>b.score-a.score);
    const reasons=matches.filter((item,index)=>matches.findIndex(other=>other.kind===item.kind&&other.id===item.id)===index).slice(0,2);
    return {template,reasons,score:reasons.reduce((sum,reason)=>sum+reason.score,0),focusId:matches[0]?.focusId||template.focuses[0].id};
  }).sort((a,b)=>b.score-a.score);
}
export function expertDraft(template:ExpertTemplate,locale:string,name:string,focusId:string,answer=''):Pick<AgentProfile,'name'|'role'|'instructions'> {
  const focus=template.focuses.find(item=>item.id===focusId)||template.focuses[0];
  const personal=answer.trim().slice(0,600);
  return {name:name.trim()||expertText(template.name,locale),role:expertText(template.role,locale),instructions:`${expertText(template.instructions,locale)}\n\n${locale==='en'?'Working focus:':'工作重点：'}${expertText(focus.instruction,locale)}\n\n${expertText(commonBoundary,locale)}${personal?`\n\n${locale==='en'?'User configuration:':'用户主动填写的设置：'}\n${expertText(template.question,locale)}\n${personal}`:''}`};
}

const legacyExpertNames:Record<string,Copy>={"decision-facilitator": {"zh": "决策陪练", "en": "Decision facilitator"}, "paper-reader": {"zh": "论文精读伙伴", "en": "Paper reading partner"}, "fiction-coach": {"zh": "故事创作伙伴", "en": "Fiction development partner"}, "prototype-builder": {"zh": "原型搭建伙伴", "en": "Prototype builder"}, "interview-coach": {"zh": "面试陪练", "en": "Interview coach"}, "career-planner": {"zh": "职业探索伙伴", "en": "Career exploration partner"}, "negotiation-prep": {"zh": "谈判准备伙伴", "en": "Negotiation preparation partner"}, "travel-planner": {"zh": "旅行准备伙伴", "en": "Travel preparation partner"}, "fitness-planner": {"zh": "运动计划伙伴", "en": "Exercise planning partner"}, "garden-care": {"zh": "植物养护伙伴", "en": "Plant care partner"}, "pet-care": {"zh": "宠物日常照护伙伴", "en": "Pet routine companion"}, "home-organizer": {"zh": "居家整理伙伴", "en": "Home organization partner"}, "conversation-coach": {"zh": "沟通准备伙伴", "en": "Conversation preparation partner"}, "celebration-planner": {"zh": "聚会筹备伙伴", "en": "Celebration planner"}, "gift-planner": {"zh": "礼物选择伙伴", "en": "Gift planning partner"}, "conflict-prep": {"zh": "分歧沟通陪练", "en": "Conflict conversation partner"}, "boundary-coach": {"zh": "边界表达伙伴", "en": "Boundary-setting partner"}, "reflection-partner": {"zh": "日常复盘伙伴", "en": "Reflection partner"}, "music-practice": {"zh": "音乐练习伙伴", "en": "Music practice partner"}, "makers-guide": {"zh": "手作项目伙伴", "en": "Craft project partner"}};
export function existingExpert(agents:AgentProfile[],template:ExpertTemplate):AgentProfile|undefined {
  const legacy=legacyExpertNames[template.id];
  const instructions=[template.instructions.zh,template.instructions.en];
  if(legacy)instructions.push(template.instructions.zh.replace(`你是一位${template.name.zh}。`,`你是一位${legacy.zh}。`),template.instructions.en.replace(`You are a ${template.name.en.toLowerCase()}.`,`You are a ${legacy.en.toLowerCase()}.`));
  return agents.find(agent=>instructions.some(prefix=>agent.instructions.startsWith(prefix)));
}
