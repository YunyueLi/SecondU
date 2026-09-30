// Authored conversations. English is a display translation of the same records.
const personIds={self:'person-self',qiao:'person-qiao',chen:'person-chen',xuan:'person-xuan'};
const names={self:['万叶','Caspian'],qiao:['乔宁','Qiao Ning'],chen:['陈禾','Chen He'],xuan:['许安','Xu An'],he:['何舟','He Zhou'],xu:['徐沐','Xu Mu'],liang:['梁秋','Liang Qiu'],wu:['吴桐','Wu Tong'],shen:['沈川','Shen Chuan'],ye:['叶澄','Ye Cheng'],han:['韩知','Han Zhi'],tang:['唐悦','Tang Yue'],qiu:['邱原','Qiu Yuan'],song:['宋岚','Song Lan'],du:['杜晴','Du Qing'],lin:['万建明','Wan Jianming'],jiang:['万晴','Wan Qing'],wei:['魏禾','Wei He'],gao:['高远','Gao Yuan'],zhou:['周芮','Zhou Rui']};
const id=key=>personIds[key]||`demo-v2-person-${key}`;
const stories=[
 ['qiao','乔宁','Qiao Ning','2026-09-27','feishu','career','内测邀请前再看一次范围','A final scope check before pilot invitations','乔宁和万叶确认首轮只验证一个任务的澄清、执行状态和中断恢复；工具扩展等用户反馈后再定。','Qiao Ning and Caspian agreed to test clarification, execution status and recovery within one task. Further integrations will follow user feedback.',[
  ['qiao','邀请发出前，我想再删一次范围。现在首页同时讲六种能力，有点散。','Before invitations go out, I want one more scope cut. The home page presents six capabilities and feels scattered.'],
  ['self','那入口只保留带一件自己的任务来，后面跟着澄清和结果。','Then the entry can simply ask people to bring one real task, followed by clarification and a result.'],
  ['qiao','中断以后能知道做到哪里，这件事留在首轮。','Keep showing where a task stopped in the first round.'],
  ['self','保留。更多工具的介绍先收起来，避免大家以为都已经接通。','Agreed. I will put the extra integrations aside so people do not assume they are all connected.'],
  ['qiao','梁秋说三个人问过同一个问题，这个取舍有依据。','Liang Qiu heard the same question from three participants. That supports the decision.'],
  ['self','我把原话连到范围说明里。十月八日先和徐沐验收，再决定能不能邀请。','I will link their exact comments in the scope note. We will check the flow with Xu Mu on October 8 before deciding whether to invite people.'],
  ['qiao','好，十月十二日仍是计划日期，别在邀请草稿里写成已经确定。','Good. October 12 is still planned; the invitation draft should not call it confirmed.'],
  ['self','记下了。今天先改入口和范围页，下午给你看。','Noted. I will update the entry and scope page today and show you this afternoon.'],
 ]],
 ['chen','陈禾','Chen He','2026-09-27','feishu','career','确认前先看清具体内容','Seeing the exact content before confirming','陈禾通过实际原型检查邮件确认，要求显示完整收件人与正文，并在取消后保留编辑内容。','Chen He tested the email confirmation prototype. It should show the full recipient and message, and retain edits after cancellation.',[
  ['chen','我刚按了一遍发送邮件的原型，收件人被缩成了一个名字。','I tried the email prototype. The recipient is shortened to a name.'],
  ['self','我展开成完整地址，主题和正文也直接放在确认区。','I will show the full address, subject and body in the confirmation area.'],
  ['chen','可以。取消以后不要清掉正文，我刚写的两句就丢了。','Yes. Also keep the body after cancellation; I just lost two sentences.'],
  ['self','这个确实有问题，草稿应该跟编辑区走，不能跟弹窗一起销毁。','That is a bug. The draft belongs to the editor and should survive closing the dialog.'],
  ['chen','按钮写发送这封邮件就够，不要写确认执行操作。','Label the button Send this email. Confirm action is too abstract.'],
  ['self','改好了再给你可点击的版本，截图看不出取消后发生什么。','I will send a clickable version after the fix; a screenshot cannot show what happens after cancellation.'],
  ['chen','下午三点我有二十分钟，可以再走一次。','I have twenty minutes at three this afternoon to try it again.'],
  ['self','好，这次一起看窄窗口和英文长地址。','Great. Let us check a narrow window and a long email address too.'],
 ]],
 ['qiu','邱原','Qiu Yuan','2026-09-28','feishu','career','验收前先修会丢内容的问题','Fixing lost content before acceptance','邱原与万叶将草稿丢失和版本覆盖列为阻塞项，外观微调放到核心流程之后。','Qiu Yuan and Caspian made lost drafts and overwritten versions blockers. Visual refinements will follow the core workflow.',[
  ['qiu','十月八日之前还剩哪些会挡住用户的事？','What could still block users before October 8?'],
  ['self','取消确认会丢草稿，还有继续任务时文件被外部改过的冲突提示。','Cancellation can lose a draft, and resume needs a conflict message when a file has changed externally.'],
  ['qiu','这两个先修。还有几处颜色和间距可以晚一点。','Fix those first. A few color and spacing changes can wait.'],
  ['self','我今天接草稿恢复，沈川明天给文件版本错误加明确文件名。','I will handle draft recovery today. Shen Chuan will include the affected filename in version errors tomorrow.'],
  ['qiu','验收别只看测试通过，再关软件打开走一遍。','Do not stop at passing tests. Close and reopen the app and walk through it.'],
  ['self','让徐沐从一个未完成任务开始，自己改一段，再继续。','Xu Mu can start with an unfinished task, edit a paragraph, then resume.'],
  ['qiu','如果还会覆盖内容，邀请时间就往后挪。','If it can still overwrite content, move the invitation date.'],
  ['self','同意。我在进度页标清这两个阻塞项，不再用总体完成百分比。','Agreed. I will show those two blockers in the progress note instead of an overall completion percentage.'],
 ]],
 ['han','韩知','Han Zhi','2026-09-28','feishu','career','把内测资料使用范围写清楚','Clarifying how pilot materials will be used','韩知建议邀请说明写明录屏选择、选定资料的使用范围和删除入口；发送前还需核对最终版本。','Han Zhi recommended clear recording choices, a defined scope for selected materials and a deletion entry. The final invitation still needs review before sending.',[
  ['self','韩知，邀请草稿里写会记录使用过程，这句话是不是太泛？','Han Zhi, the draft says we record the session. Is that too broad?'],
  ['han','是。录屏、访谈笔记和任务资料分别写，人可以不同意录屏。','Yes. Separate screen recording, interview notes and task materials. People can decline recording.'],
  ['self','任务资料只用他主动选择的几份，不需要整个文件夹。','We only need the documents they select, not the whole folder.'],
  ['han','这点写在开始前，也说明如何移除已经选的资料。','Say that before they start, including how to remove selected materials.'],
  ['self','回访里展示样例时，用户名和原始文件名也不直接带出来。','Examples in the follow-up will not expose usernames or original filenames.'],
  ['han','好。保留时间还没定就别编一个，先在内部定清楚。','Good. Do not invent a retention period. Agree on it internally first.'],
  ['self','我把待定项单独留在草稿里，明天和吴桐一起核对。','I will leave that as an open item and review it with Wu Tong tomorrow.'],
  ['han','最后发出前给我看一遍正文和附件，单看一句话不够。','Show me the full message and attachments before sending; one sentence is not enough.'],
 ]],
 ['pilot','工作台首轮内测','Workbench pilot','2026-09-29','feishu','career','先验证完整任务，再增加工具','Testing a complete task before adding tools','内测小组保留八位候选名单，五位已访谈；以十月八日核心流程验收作为邀请的前提。','The pilot group retained eight candidates, with five interviewed. Invitations depend on the core workflow check on October 8.',[
  ['qiao','今天把首轮范围落下来：澄清、执行状态、中断后继续。','Let us settle the first round: clarification, execution status and resuming interrupted work.'],
  ['liang','五次访谈里三个人在任务停下后不知道该怎么办，原话我已整理。','Three of five interviewees did not know what to do after a task stopped. I have collected their comments.'],
  ['he','评测按完整任务记结果，不只统计模型有没有回答。','Evaluation will track complete tasks, not merely whether the model answered.'],
  ['self','我把入口改成带自己的任务来，先只选需要的资料。','The entry now asks people to bring their own task and select only the necessary materials.'],
  ['xu','十月八日先测保存、中断、重启和版本冲突，有阻塞就不放行。','On October 8 we will test saving, interruption, restart and version conflicts. Blockers will hold the release.'],
  ['wu','名单先留八位，另外三位还没约齐。邀请保持草稿。','The list stays at eight. Three interviews are still being arranged, and invitations remain drafts.'],
  ['qiao','十月十二日作为计划日期写进安排，验收之后再确认。','Put October 12 in the plan and confirm it after acceptance.'],
  ['self','收到，范围、原话和阻塞项都放进同一个项目，周五一起看。','Understood. Scope, source comments and blockers are in one project for Friday review.'],
 ]],
 ['recovery','中断恢复联调','Recovery integration','2026-09-29','feishu','career','保留用户修改，再继续任务','Keeping user edits when a task resumes','联调确定中断恢复须保留草稿和最后完成步骤；文件版本冲突时先展示差异，不覆盖用户修改。','The team agreed to keep drafts and the last completed step. A version conflict should show differences before any user edit is overwritten.',[
  ['xu','复现了：保存一半时退出，重开以后标题显示完成，文件其实不完整。','Reproduced: quit during saving, reopen, and the title says complete even though the file is incomplete.'],
  ['shen','最后一条事件是写入中，我会让服务重启后明确标成中断。','The last event says writing. I will mark it interrupted after the service restarts.'],
  ['ye','前端只读状态字段，不能因为最后一句回复像结论就显示完成。','The UI should read the status field; a concluding sentence does not mean the task is complete.'],
  ['self','编辑区也保留本地草稿，重新打开时让用户先看到自己的版本。','The editor will keep the local draft and show the user their version after reopening.'],
  ['xu','另一条：我停下后自己改文件，再点继续，旧版本不应该盖回来。','Another case: I edit the file after stopping and then resume. The older version must not overwrite it.'],
  ['shen','请求带版本号，不一致就返回具体文件和冲突原因。','The request will carry a version number. A mismatch returns the file and the conflict reason.'],
  ['ye','我接一个查看差异入口，关闭后草稿还在。','I will add a comparison view and keep the draft when it closes.'],
  ['self','这两条修好后从重启再跑一遍，记录实际留下的内容。','Once fixed, run both cases from restart and record what content actually remains.'],
 ]],
 ['privacy','内测资料与授权','Pilot data and consent','2026-09-29','feishu','career','把录屏选择放在开始之前','Putting recording choices before the session','访谈说明拆分录屏、笔记和任务资料，用户可只提供选定文档；具体保留时间仍待内部确认。','The study note separates recording, notes and task materials. Participants can provide selected documents; the retention period is still pending internal agreement.',[
  ['han','使用说明第一页先讲三件事：会记什么、谁会看、怎么移除。','The first page should explain what is recorded, who can see it and how to remove it.'],
  ['tang','我把录屏选择放在开始前，默认不替用户勾选。','I will put recording choices before the start, with nothing preselected.'],
  ['liang','拒绝录屏也能访谈，我改成做文字笔记，不要让人以为必须同意。','People can still participate without recording. I can take notes instead.'],
  ['self','资料选择只显示勾选过的文件，撤掉选择后就不继续带进任务。','Only selected files will appear in the task context. Deselecting one removes it from subsequent work.'],
  ['han','保留多久还在讨论，草稿写待确认，不写成已经生效的承诺。','Retention is still being discussed. Mark it pending rather than making an active promise.'],
  ['tang','弹窗里就放操作和范围，长说明用展开阅读。','The dialog will show the action and scope, with the longer explanation available to expand.'],
  ['liang','回访引用原话之前，我会再检查名字和文件名。','I will check names and filenames before using interview quotes in the follow-up.'],
  ['self','今天先完成草稿，最终邀请和附件一起交韩知核对。','I will finish the draft today and have Han Zhi review the complete invitation and attachments.'],
 ]],
 ['design','工作台交互走查','Workbench design review','2026-09-30','feishu','career','长内容和窄窗口都实际点一次','Trying long content in a narrow window','设计与前端共同检查长标题、取消后草稿、焦点返回和英文地址换行，评审以实际操作为准。','Design and frontend reviewed long titles, draft retention, focus return and email wrapping through actual interaction.',[
  ['chen','宽屏看起来没问题，缩到小窗口后保存按钮掉到下面了。','It looks fine on a wide screen, but the Save button slips below the viewport in a small window.'],
  ['ye','我让标题和操作固定在顶部，正文自己滚动。','I will keep the title and actions at the top and scroll the content separately.'],
  ['tang','长地址可以换行，别只留一个看不完整的省略号。','Long addresses can wrap; an ellipsis hides information the user needs.'],
  ['self','我再放一段英文长标题测试，中文也看同样的宽度。','I will test a long English title and the Chinese version at the same width.'],
  ['chen','取消确认之后，刚编辑的内容这次留下来了。','The edited content survives cancelling confirmation this time.'],
  ['ye','侧栏关掉后焦点也回到原按钮，键盘可以接着走。','Closing the side panel now returns focus to the original button, so keyboard navigation can continue.'],
  ['tang','剩下空状态的说明有点长，保留一个动作就行。','The empty-state explanation is still long. Keep one clear action.'],
  ['self','好，改完用这组长内容再验收，不再换短文案截图。','Agreed. We will check again using this long content rather than short text for the screenshot.'],
 ]],
 ['cost','模型评测与预算','Model evaluation and budget','2026-09-30','feishu','career','两千元预算先跑小批量','Starting with a small batch within CNY 2,000','评测小组先跑十条完整任务，分别记录调用量、失败原因和重试成本；两千元是预算上限，尚非实际支出。','The evaluation group will start with ten complete tasks and record usage, failures and retry costs. CNY 2,000 is the budget cap, not actual spending.',[
  ['he','先跑十条完整任务。每条保留输入范围、工具调用和最后一步。','Let us start with ten complete tasks, keeping input scope, tool calls and the last completed step.'],
  ['self','预算上限两千元，记录里分开写估算和实际账单。','The cap is CNY 2,000. Estimates and actual bills should be separate.'],
  ['qiu','失败重试也算进调用量，不能只报成功那一次的成本。','Retries count too. Do not report only the successful attempt.'],
  ['he','明白。模型判断错误和工具超时我分成两类。','Understood. I will separate model decision errors from tool timeouts.'],
  ['self','工具超时以后有没有重复写文件，也一起检查。','Also check whether a timeout leads to writing the same file twice.'],
  ['qiu','如果小批量里已经看到同一类错误，先修再扩大样本。','If the small batch reveals repeated errors, fix them before expanding the sample.'],
  ['he','周四四点看十条记录，先不做大而全的排行榜。','We will review the ten records at four on Thursday, before attempting a broad ranking.'],
  ['self','我准备一页结果：完成条件、失败位置、实际调用量和下一步。','I will prepare one page with completion criteria, failure points, actual usage and the next step.'],
 ]],
 ['alumni','浙大老同学','Zhejiang University friends','2026-09-28','wechat','relationship','国庆回杭州，十月再约上海','Hangzhou for the holiday, Shanghai later','许安、宋岚和万叶聊起国庆安排；杭州吃面的时间等车次确认，上海见面也还未定日。','Xu An, Song Lan and Caspian discussed the holiday. Noodles in Hangzhou await the train plan, and the Shanghai visit has no fixed date yet.',[
  ['xuan','万叶二号回杭州的话，学校附近那家面馆还开着。','If Caspian comes back on the second, the noodle shop near campus is still open.'],
  ['self','先和家里吃饭，晚上有没有空要看车次，别先替我订位。','Family lunch comes first. Evening plans depend on the train, so do not reserve for me yet.'],
  ['song','我这次留上海，等你十月中旬过来再吃。','I am staying in Shanghai this holiday. We can eat when you visit in mid-October.'],
  ['xuan','还是以前你们两个点太多，最后都让我收尾。','You two used to order too much and leave me to finish it.'],
  ['self','这次一人一碗就好。许安，工作台试用后给我留三条最不顺的地方。','One bowl each this time. Xu An, after trying the workbench, leave me the three most awkward parts.'],
  ['xuan','可以，但吃饭时别开评审会。','Sure, but no review meeting over dinner.'],
  ['song','同意。上海那天我想沿苏州河走，电脑最多看十分钟。','Agreed. In Shanghai I want a walk by Suzhou Creek, with ten minutes of laptop time at most.'],
  ['self','成交。日期定下来再说，先别把休息日排满。','Deal. We will settle the dates later and leave some of the day open.'],
 ]],
 ['family','家里的饭桌','Family table','2026-09-29','wechat','life','回家那天下午留给家人','Keeping the afternoon at home for family','家人初步按十月二日中午准备，车次仍待确认；万叶想吃片儿川，妹妹的课程原型饭后再看。','The family is tentatively planning lunch on October 2, pending the train. Caspian requested pian-er-chuan noodles; his sister’s prototype can wait until after the meal.',[
  ['du','二号中午回来吃饭的话，提前一天告诉我们就行。','If you are back for lunch on the second, let us know the day before.'],
  ['self','车次还没定，想中午到。我会把那天下午空出来。','I have not booked the train yet. I hope to arrive around lunch and keep the afternoon free.'],
  ['lin','那做片儿川，不摆一大桌。雪菜和笋我到时去买。','Then I will make pian-er-chuan, not a huge spread. I will buy the greens and bamboo shoots then.'],
  ['jiang','我也回家。报名页面画完了，但先放新歌给你听。','I am coming home too. The signup prototype is done, but first I want to play you a new song.'],
  ['self','新歌优先。原型饭后看十分钟，下午我们出去走走。','Music first. Ten minutes for the prototype after lunch, then a walk.'],
  ['du','阳台的桂花开了，回来了先看看，别进门就找充电器。','The osmanthus on the balcony is blooming. Look at it before you start hunting for a charger.'],
  ['lin','车次定了把到站时间告诉我，不急着赶最早一班。','Tell me the arrival time once you choose a train. No need to take the earliest one.'],
  ['self','好，一号确认以后发到群里。先按家常饭准备就行。','Okay, I will confirm in the group on the first. A simple meal is all we need.'],
 ]],
 ['running','周日奥森慢跑','Sunday Olympic Forest Park run','2026-09-27','wechat','life','六公里也可以改成散步','Six kilometers, or a walk','跑步伙伴约周日下午四点在奥森南门见，按精力跑或走；出门前再看天气，跑后一起吃面。','The group planned to meet at the south gate at four on Sunday, run or walk according to energy, check the weather before leaving and have noodles afterward.',[
  ['wei','这周还是周日下午四点，奥森南门，六公里慢慢跑？','Same plan this week: Sunday at four, south gate, six easy kilometers?'],
  ['self','可以。我这周坐太久，跑不动就走一段。','Yes. I have been sitting too much this week; I may walk part of it.'],
  ['zhou','我只跑三公里，后半程在出口等你们。','I will do three kilometers and meet you at the exit.'],
  ['gao','我带小相机，结束后拍两张，跑步时不举着。','I will bring a small camera for a couple of photos afterward, not during the run.'],
  ['wei','停下来会凉，带件薄外套。下雨就改散步。','Bring a light jacket for afterward. If it rains, we can switch to a walk.'],
  ['self','工作消息我先收尾，跑的时候手机放包里。','I will wrap up work messages first and leave my phone in my bag while running.'],
  ['zhou','跑完去上次那家面馆？我记得还有番茄鸡蛋面。','Same noodle place afterward? I remember they have tomato and egg noodles.'],
  ['wei','就那家。出门前群里再确认天气，不临时拼配速。','That one. We will check the weather in the group before leaving, with no last-minute pace challenge.'],
 ]],
 ['photos','青岛十二张','Twelve photos of Qingdao','2026-09-30','wechat','life','先选片，再决定相册顺序','Choosing photographs before sequencing the album','高远、宋岚和万叶讨论青岛旅行相册：先留十二张，保留车窗与阴天海边的日常感，暂不追求统一滤镜。','Gao Yuan, Song Lan and Caspian discussed a twelve-photo Qingdao album, keeping the train reflections and overcast coast without forcing one filter.',[
  ['self','先选了十二张，车窗倒影想放开头，海边那张放结尾。','I have selected twelve. The train-window reflection could open the album and the coast could close it.'],
  ['gao','中间两张建筑太像，留有路人经过的那张，会更有呼吸。','The two building shots are similar. Keep the one with a passerby; it feels more alive.'],
  ['song','吃早餐那张也留着，旅行不只有景点。','Keep the breakfast photo too. A trip is more than landmarks.'],
  ['self','同意。我先不统一套滤镜，阴天和傍晚就让它们不一样。','Agreed. I will keep the cloudy and evening colors different rather than apply one filter.'],
  ['gao','封面一张就够，别同时塞日期、地点和一段感想。','One photo is enough for the cover. It does not need the date, place and a paragraph all at once.'],
  ['song','最后一页可以留一句路上随手写的，不用总结旅行的意义。','The last page could hold a line you wrote on the train. No need for a grand conclusion.'],
  ['self','我写的是下次少排两个地方，沿着路多走一会儿。','I wrote: next time, plan two fewer stops and spend more time walking.'],
  ['gao','这句就很好。先做小样，打印之前我们再看一次顺序。','That works. Make a small draft and we will check the sequence before printing.'],
 ]],
];
export function createDemoStories(stamp,locale='zh-CN'){
 const english=locale==='en',choose=(zh,en)=>english?en:zh,sources=[],conversations=[],events=[];
 for(const [key,title,titleEn,date,platform,category,topic,topicEn,summary,summaryEn,turns] of stories){
  const sourceId=`demo-story-source-${key}`,personIds=[...new Set(turns.map(([speaker])=>id(speaker)))],messages=turns.map(([speaker,zh,en],index)=>({id:`demo-story-message-${key}-${index+1}`,senderId:id(speaker),content:choose(zh,en),time:`${date}T08:${String(index).padStart(2,'0')}:00.000Z`,sourceId}));
  sources.push({id:sourceId,title:choose(topic,topicEn),kind:'conversation',text:turns.map(([speaker,zh,en])=>`${names[speaker][english?1:0]}${english?': ':'：'}${choose(zh,en)}`).join('\n'),createdAt:stamp,demo:true});
  conversations.push({id:`demo-story-chat-${key}`,title:choose(title,titleEn),kind:personIds.length===2?'direct':'group',personIds,platform,accountId:'fictional-demo',demo:true,messages});
  events.push({id:`demo-story-event-${key}`,date,title:choose(topic,topicEn),description:choose(summary,summaryEn),category,scope:'note',personIds,sourceIds:[sourceId],platform});
 }
 return {sources,conversations,events};
}
