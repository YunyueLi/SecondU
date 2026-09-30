# 设计来源与采用理由

研究是持续资产。更换名称、模型、设备或交互主线时，保留原始材料、证据级别、产品拆解、Harness 分析、采用理由和暂缓事项。本文是可公开的实现索引，不替代本机完整研究档案。

| 来源 | 对当前桌面产品的影响 | 当前落实与边界 |
| --- | --- | --- |
| [Manus 2.0](https://manus.im/zh-cn/blog/introducing-manus-2-0) | 持久电脑、任务工作区、按需专业能力、定时与事件触发、交付编辑 | 本机独立工作区、Codex 能力适配、角色分工、时间/资料导入触发、成果编辑；未宣称复现 Cascade 或其性能收益 |
| [Cue](https://cue.im/) | 个人助理身份、多角色一起工作、现实世界的二维码入口 | 助理档案、共享任务的角色轮次、二维码导入/预览/创建；邮箱、号码与支付资源已有绑定和规则检查，真实通信、支付及点餐尚未接通 |
| Grok Bot | 个人助理与长期运行电脑的结合 | 保留竞品研究条目；当前选择用户自己的电脑，真实状态与本机离线边界；不把宣传视频等同于已测能力 |
| Muse | 人机共同推进复杂工作、电脑与多端界面 | 对话、过程、审批与成果共同可见；保留既有界面与视频拆解，未据此宣称实现完整云电脑服务 |
| [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) | 模型、引擎、Agent、工具、存储、追踪、评测分层 | 参考模块职责和评测方法；不在 Codex 外再包第二个相互竞争的 Agent 循环 |
| [Codex CLI](https://github.com/openai/codex) | 可实际使用的 Agent 执行、操作系统沙箱、事件与审批 | 首个真实执行适配器；配置、事件、审批、取消、恢复通过 app-server；模型兼容性单独验证 |
| [Apps SDK UI](https://github.com/openai/apps-sdk-ui) | 官方 ChatGPT 应用组件与视觉语言 | 直接依赖 0.2.2，按钮、输入、选择、徽标、Markdown、Alert、图标等实际使用；图谱和时间轴为业务组合 |
| 已有个人数字分身实践 | 来源、事实版本、经历、关系、当前生活、任务反馈的证据体系 | 抽象出通用实体与纠正流程；新库只使用虚构资料，不复制私密人物与消息 |

## 执行层决策

Codex 负责当前任务内的 Agent 循环与工具沙箱。应用负责个人认知、任务状态、跨轮次介入、单次批准记录、成果版本和本机自动化；这是两层不同职责。OpenJarvis 提供模块设计和评测参考，未来可实现同一执行接口的其他适配器，避免同时运行两个重复 Harness。

已研究的上游快照：Codex `a9118edae8b77bf23b7182fd071a7b6251898bed`；OpenJarvis `52659ca7c221703265fe46ff28c5b0a6e2b64c4a`。实际调用的本机 Codex 版本需在设置页查看，不能用源码快照替代运行版本。

OpenJarvis 当前研究快照为 Alpha，通用记忆不等于具备个人事实版本、时间性和纠错治理。其 DeepSeek 非流式工具参数转发需核对；既有检查点不能视作跨节点迁移或 exactly-once 保证。没有继承其默认遥测或未经验证的性能结论。

## 核心展示

让一次完整流程可见：用户能指出“你对我的理解过时了”，看到来源与版本，纠正预算或可用时间；下一任务采用更新后的上下文，过程可介入，交付可编辑。跨设备是这条任务链的入口扩展。

## 2026-09-30 界面复核与首次模型接入

**Agent 详情。** 复看已存 Cue 公开视频约 24 秒的角色页面，以及 Manus 官方文章的身份页截图：身份下方直接放置邮箱、电话、电脑、支付和应用入口，周期任务接在后面。Cue 当前官网的身份说明与该组织方式一致。这支持“从角色直接进入能力设置”，不证明其演示中的外部交易已实测成功。[Cue](https://cue.im/)、[Manus 2.0](https://manus.im/blog/introducing-manus-2-0)。

SecondU 的用户明确否定了工牌下方的大块两列列表，并允许恢复之前的工牌和一个详情浮层，随后指定“下面放一排”。当前采用方向是保留工牌，在其下排列紧凑能力入口；每个入口打开同一个详情浮层的相应位置，新增与编辑留在浮层内。代码与实屏验收单独记录在开发进展中。

**新用户前提。** 用户没有预先配置好的连接。首次接入不能要求先理解连接名称、协议、地址和模型 ID，也不能把“发现已有连接”当作主要解决方案。

| 产品与官方依据 | 官方首次使用路径 | SecondU 可借鉴之处与限制 |
| --- | --- | --- |
| [Cursor Quickstart](https://cursor.com/docs/get-started/quickstart) | 安装、登录、打开目录、开始第一个任务 | 模型服务的配置由产品承担；不能据此推断第三方可复用 Cursor 的登录或套餐 |
| [Claude Code 身份验证](https://code.claude.com/docs/en/authentication) | 首次启动打开浏览器登录，使用支持的账号类型 | 默认走账号路径；[Agent SDK](https://code.claude.com/docs/en/agent-sdk/quickstart) 对第三方产品的登录另有要求，不能照搬内部 OAuth |
| [Kimi Code Desktop](https://www.kimi.com/code/docs/en/kimi-code-desktop/getting-started.html) | 首次 Kimi 授权后取得账号可用模型；第三方 API 配置是另一条路径 | 登录后提供可用模型，避免空模型 ID；会员资格与账号授权仍是实际前提 |
| [Gemini CLI](https://geminicli.com/docs/get-started/authentication/) | 个人用户优先 Google 登录；API Key 与企业平台另列 | 普通路径与专业配置分开；其官方客户端登录不自动等于第三方应用准入 |
| [OpenCode Providers](https://opencode.ai/docs/providers) | 先连接服务，再从目录选择模型；OpenAI 项提供 ChatGPT 账号和手填 Key 两种方法 | 授权与模型选择分步；服务目录不等于当前账号已获模型使用权 |
| [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source) | 本地／开源应用可以请求用户授权套餐使用，返回后取得模型并完成请求 | 存在面向第三方本地应用的官方接入路径；需处理用户资格、授权、撤销和令牌续期，不能只画登录按钮 |
| [OpenRouter OAuth](https://openrouter.ai/docs/guides/overview/auth/oauth) | 服务商登录与授权后，以 PKCE 换取用户控制的访问密钥 | 用户无需手工复制 Key；额度、付款与模型选择仍由其账号决定 |

**工程决策待验证。** 优先评估官方账号授权，保留“使用 API 密钥”备选。API 路径应自动提供服务地址和协议，获取真实模型清单，再验证一次最小请求；用户只处理必要凭据与选择。自定义端点留在高级设置。登录、模型清单、文本请求成功和实际任务工具兼容分别验收。当前比较为官方文档与已存公开画面复核，未注册新账号、付款或完成第三方授权。

## 2026-09-30 Agent 网络与交友流程复核（历史方案，已被下文取代）

本轮查看官方说明及其公开界面图，将 Agent 网络放在「发现专家」之后，标记为 Dev。页面分为「找专业能力」与「认识新朋友」两种用途，入口沿用现有 Agent 目录；人物、图片、任务和互动全部为虚构示例。官方资料证明的产品行为、SecondU 的设计推断与当前实现分别记录如下。

| 官方来源与所见行为 | SecondU 的采用方式 | 证据与实现边界 |
| --- | --- | --- |
| [Second Me 快速开始](https://docs.second-me.cn/getting-started/quick-start) 与 [Avatar Hub](https://docs.second.me/features/avatar-hub)：围绕具体场景创建分身，配置任务说明、开场白和收费，分享入口，集中查看对话并支持本人接管 | 专业能力卡片先呈现人物、擅长事项、交付范围与价格；详情给出工作方式和示例成果，再进入需求与报价确认 | 查阅官方分身中心界面图及文档。委托、报价、交付、验收的阶段是本产品设计推断；资料不能证明竞品已有同等交易履约系统。当前仅在页面内模拟状态，无付款、真实委托或服务端任务 |
| [Hinge Discover Feed](https://help.hinge.co/hc/en-us/articles/36311592824595-Discover-Feed)：按偏好展示人物，对具体照片或回答表达兴趣，可附评论、略过或撤回最近操作；[匹配与聊天说明](https://help.hinge.co/hc/en-us/articles/360011090134-How-Do-I-Match-with-Someone-and-Start-Chatting)：接收方同意后进入匹配与聊天 | 先设定偏好，再逐人浏览完整档案；对照片或具体回答留下评论，表达兴趣后等待回应；只有示例中已有对方兴趣的对象才进入匹配 | 查阅官方 Discover 点赞与 Likes You 匹配两组界面图。其核心是具体内容上的双向同意；未采用会员限制或宣称复现推荐算法。当前偏好、点赞与对话保存在组件状态，离开页面会重置，无真人匹配或自动回复 |
| [Bumble New Era](https://bumble.com/en/the-buzz/bumble-new-era)：明确交友意图、突出共同兴趣，以 Opening Moves 降低开场负担 | 人物档案提供交友意图和共同兴趣；匹配后的开场从被点赞的内容继续，用户自己编辑并发送示例消息 | 本轮采用官方文字说明，未取得或声称验收 Bumble 登录后的真实界面。未接入定位、推荐服务或第三方账号 |

三张公开参考图及来源校验保留在本机既有研究档案中，包括 Second Me 分身中心、Hinge 内容点赞和 Hinge 双向匹配。页面人物使用另行生成的虚构成人肖像，不冒充竞品界面或真实用户。类型检查与浏览器验收分别记录；Dev 原型可操作不等于真实网络、交易或交友服务已接通。

## 原始研究保留约定

本机研究档案保留 Manus/Cue/Grok Bot/Muse 的页面快照、视频、拆解、Harness 讨论和来源校验；OpenJarvis 与命名研究已加入同一档案。存在的访问和视频覆盖缺口继续标记，不能因为桌面实现完成就自动改成“全部看过”。原始文件不因文档重写、构建或名称变化删除。

## 品牌暂定

产品在 2026-09-29 使用名称 Hither；2026-09-30 用户明确要求统一改名为 **SecondU**，并同步更换品牌素材、保留回退。当前名称以 SecondU 为准，历史素材和兼容身份见 [品牌与兼容性](BRANDING.md)。此前候选留在历史研究档案；未进行域名购买或商标注册。

## 2026-09-30 Agent 市场拆分与交易流程复核

用户随后否定将市场与交友放在同一个「Agent 网络」内，并明确市场应展示他人的 Agent 工牌，不能使用真人或生成肖像。上面的合并网络方案与照片目录属于已被否定的历史版本；当前采用「Agent 市场 Dev」和「Agent Dating Dev」两个独立页签，市场列表与服务详情均直接复用现有 `AgentBadgeStage`，包含原组件挂绳、材质、角色条和底部品牌，不自制替代工牌。

本轮重新核查公开市场，先看 Agent 身份、提供方、服务和交易对象，再决定本页结构：

| 官方来源 | 本轮实际核查的界面或行为 | 采用与边界 |
| --- | --- | --- |
| [Google Cloud 的 AI Agent 市场说明](https://docs.cloud.google.com/marketplace/docs/explore-ai-agents)、[官方发布与采购教程](https://cloud.google.com/blog/topics/developers-practitioners/publish-agents-in-gemini-enterprise-and-google-cloud-marketplace) | 按任务搜索并筛选；产品卡显示提供方和能力，详情包含价格与部署信息。下载官方采购 GIF，查看其中 Lovable Agent 产品详情：Agent 图标、提供方、能力摘要、订阅入口及 Overview/Pricing 等页签 | 市场先显示 Agent 和服务，详情展开范围、交付及价格；不复制企业部署流程，也不把 A2A 兼容标签当作已接入能力 |
| [Relevance Marketplace](https://marketplace.relevanceai.com/)、[官方上架教程](https://relevanceai.com/blog/how-to-submit-to-the-relevance-ai-marketplace) | 当前目录以 Agent、工具与用途组织；条目包含创建者、价格、依赖和示例结果。已下载并查看官方 Agent 上架截图，显示 Agent 身份、提示词、工具和提交入口 | 保留明确的提供方、专业能力和交付示例。未照搬克隆数或评分，不伪造平台使用记录；本轮公开页面文字与官方截图不等于已完成其真实交易 |
| [Oracle AI Agent Marketplace 官方产品资料](https://www.oracle.com/il-en/a/ocom/docs/oracle-fusion-apps-ai-agent-marketplace.pdf) | 实际查看第一页的 Agent Studio 市场截图：搜索、分类、独立 Agent 卡片、服务简介、合作方和 Copy Template 动作 | 借鉴按能力和提供方呈现 Agent；SecondU 使用自己的既有工牌，不使用人员照片、照片墙或仿造用户评价 |
| [Virtuals ACP 官方 SDK](https://github.com/Virtual-Protocol/acp-node-v2)、[官方 CLI 的服务与任务说明](https://www.npmjs.com/package/@virtuals-protocol/acp-cli) | 可发现 Agent 的 offering，显式定义价格、时限、输入要求与交付；任务经历提出需求、预算与资金、交付、完成或拒绝等状态 | 采用「选择服务—明确输入—确认报价—处理—交付—验收」的可检查顺序。SecondU 当前只演示本页状态，不接钱包、资金托管、支付或真实 A2A 调用；没有直接采用其链上结算机制 |

本轮参考原件与 SHA-256 记录保留在本机研究档案 `network-market-20260930`：Google 官方采购 GIF、首帧、Relevance 官方上架截图、Oracle 官方 PDF 与第一页。Agent.ai 访问时已跳转到 BuilderPack，未把旧 Agent.ai 市场印象作为当前证据。

**布局故障根因。** 原页复用了 `network-empty`，与认知图谱 `explorer.css` 中的同名绝对定位规则发生碰撞，造成「我的委托」空状态上浮和内容散开。市场改用独立 `agent-market-*` 样式类、明确的正常文档流和全宽容器；浏览与委托切换保留同一工具栏结构。类型与源码检查、实际浏览器验收分别记录，不用静态通过代替页面验收。

## 2026-09-30 Dating 与普通答复反馈的最终采用边界

当前目录为「我的 Agent」「发现专家」「Agent 市场 Dev」「Agent Dating Dev」四个一级页签。市场列表与详情均使用原有 `AgentBadgeStage`；合并网络、照片市场和自制工牌头保留为被用户否定的历史，不作为现行方案。导航独立占一行，完整头像风格入口、跨目录默认风格与「常用领域 + 更多」按最新反馈收口；这些布局仍在实际验收中。

**Dating。** 在前述 Hinge/Bumble 资料外，本轮核查 [Tinder 官方 Likes 说明](https://www.help.tinder.com/hc/en-us/articles/115005246123-Likes)：该页面描述查看已对自己表达兴趣的资料，再向左略过或向右同意的交互；其 Likes 付费资格不作为 SecondU 的产品规则。SecondU 借鉴逐人选择与明确表达意愿，补充可解释的推荐依据、可查看的 Agent 交流示例及可编辑开场白。页面中的「想认识」仅保存本人的本页选择，不显示真人双向匹配成功，也没有真正运行 Agent 初筛或发送消息。

Dating 先使用原创水彩与铅笔插画 `public/art/dating-first-meeting-v1.png`，随后依照用户反馈改用克制油画 `public/art/dating-oil-meeting-v2.png`；当前 `DatingArtwork` 引用后者。图片表现两位成年人在安静的公园小径相遇，既非竞品截图，也非用户照片或真实匹配证据。官方界面参考、原创氛围插画和虚构互动脚本分别保留来源，不相互替代。

**答复操作。** 按用户提供的 ChatGPT 操作参考，将普通赞踩、可选原因与认知纠正分开：普通评价只作用于这条答复；需要用于以后任务的个人理解仍须明确填写、作为候选保存，再单独确认。「继续修改」只生成带原答复引用的输入草稿；暂不采用一键重新生成，避免重放可能包含工具操作的任务。此为当前产品取舍，不宣称复制 ChatGPT 的内部反馈或学习机制；新增界面、接口与目录布局的实际验收尚在进行。

## 2026-09-30 Dots、DeepSeek Harness 与 Rakazo 的本轮采用

本节复核既有本机研究总档案（本机保留，不随开源仓库发布），没有重复调研。该入口及下列本机记录仅在本地完整；私人截图与运行记录不随产品仓库发布。

| 参考与实际证据 | SecondU 的采用与边界 |
| --- | --- |
| Dots：本机实机记录（本机保留，不随开源仓库发布）。在已有登录会话查看六个快捷表情、完整表情面板、已有回应的移除入口、Reply 子会话、资料面板及附件分类；未发送、应用回应或保存设置。官方补充：[Channels](https://learn.chatgpt.com/docs/dots/channels)、[Controls](https://learn.chatgpt.com/docs/dots/controls)。 | 采用紧凑消息动作、六项快捷表情与可移除回应；群聊回应独立持久化，不混入赞踩、认知纠正或任务执行。Dots 的用户问题编辑、正在执行任务和群聊设置本轮没有实机证据，不据此宣称完整复刻。 |
| DeepSeek Harness：本机源码核实（本机保留，不随开源仓库发布），官方固定提交 [`639ed015`](https://github.com/deepseek-ai/deepseek-harness/tree/639ed015397290b3745d163aafe02ffee4aa3f84)，MIT。只读核查预览注册、代码阅读器、隔离 HTML 和重试状态；未启动第三方应用。 | 按真实内容选择代码、Markdown、CSV/TSV、HTML/SVG、图片与 PDF 预览器，界面继续复用 Apps SDK UI。HTML 保留只读隔离边界。后续已补 PNG/JPEG/GIF/WebP/PDF 原始字节收录、版本与下载，并验证格式和项目增量保护；预览器和后端测试不等于真实云模型产物验收。 |
| Rakazo：本机工程核查（本机保留，不随开源仓库发布），官方固定提交 [`6c731814`](https://github.com/elie222/rakazo/tree/6c7318149b566bc1bd31fb3f61fd537500bf5c25)，Apache-2.0。核查临时子执行、常驻 Bot、群聊交接、持久作业与电脑适配；完整克隆超时，使用已校验公开源码样本。 | 将负责人、专家身份和当轮执行节点分开，采用受限派发、等待回传、取消及持久状态；继续使用现有 Codex 与本地 Store。未整包引入 Pi、数据库、部署与第三方账号。随后用现有 DeepSeek 连接完成一次合成算术团队验收：真实 Codex 运行时、负责人委派一名专家、等待回传并汇总，共 4 次模型请求，状态已持久化。该最小纯文本链路不代表复杂文件任务、多专家协作或宽泛模型质量已验收。 |

消息编辑是用户随后明确要求的本产品能力：现在于原消息位置打开单层编辑器，保存为可回看原版的修改分支；示例只保存预览，真实任务依照原范围与权限重新执行。它与上文早期的「继续修改」草稿分开，也不声称 Dots 或 DeepSeek 已验证相同机制。执行、浏览器和评审材料的最新证据统一见 [开发记录](DEVELOPMENT.md)与[迭代记录](ITERATION.md)。
