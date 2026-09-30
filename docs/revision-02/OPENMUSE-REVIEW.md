# OpenMuse 源码审阅与 SecondU 可实施差距

核验日期：2026-09-29。固定源码版本 `34b15bc80340e582fb8c25573646cfb0bbc5184d`。本次只 clone 与阅读源码、测试和官方文档；**未安装依赖、启动项目、执行测试、观看演示视频或连接任何账户**。本文“已实现”指有对应实现路径，不等于本机运行通过。离线副本在 `.local/research/openmuse/`，核验文件清单在 `.local/research/openmuse-source-manifest.json`，不进入产品 Git。

## 1. 先作决定

OpenMuse 值得借鉴的是三套机制：**对话之外持续存在的任务；可以查看同一现场的电脑；绑定具体动作与账户版本的审批回执**。它提供了真实后端，并非只有竞品外观。SecondU 应保留官方 Apps SDK UI 与已有 Codex 执行适配，移植这些机制的契约和验证思路；不需要整包换成 React Native / CopilotKit，也不应再套一层模型循环。

最小可以立刻实施的增量是：**在一个明确的“先审阅再应用”项目文件任务中，隔离生成修改 → 展示准确 diff → 批准本版本 → 检查原文件未变 → 写入并留下回执**。这复用现有项目、成果版本和审批基础，产生真实结果。它不是添加尚未接入的邮箱、电话或钱包卡片。详细验收见第 7 节。

## 2. 身份、许可与实际依赖

- 这是 **CopilotKit 的 OpenMuse**。官方页面和仓库以个人 Agent 开源模板定位；本次检索的 README、路线图与核心文档没有给出它与 Meta Muse 的授权、合作、代码继承或实现等同关系。不能称其为“Meta Muse 官方开源版”，也不能因名字相近而套用之前 Muse 宣传片的能力。与 Muse 的体验比较可以继续，产品关系保持未证实。[CopilotKit 官方页](https://www.copilotkit.ai/openmuse)、[仓库定位](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/README.md#L39)。
- 仓库是 MIT，版权归 OpenMuse contributors，复制实质代码须保留声明。**CopilotKit Intelligence 是单独服务，不包括在仓库 MIT 许可内**；依赖、第三方内容和账户权限另计。[LICENSE](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/LICENSE)、[docs/RICH-THREADS.md](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/docs/RICH-THREADS.md)。
- 当前源码 `config.ts:55–73,108` 强制 `CPK_INTELLIGENCE_API_KEY`，缺少会启动失败。官方网站的免 Intelligence subscription 示例描述不能被读成“本版本完全无服务依赖”；应以固定版本代码为准。`Rich Threads` 把对话持久化／重放交给 Intelligence，不应默认把 SecondU 私人资料转存过去。[apps/server/src/config.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/config.ts#L55)。
- 应用是 Expo / React Native / Web，Hono API，CopilotKit + AG-UI；模型执行走 TanStack adapter（OpenAI、Anthropic、Google；远程 AG-UI 另有适配）；PGlite 或 PostgreSQL 保存领域状态。单 API、独立任务 worker 可共享 PostgreSQL，嵌入 PGlite 不能多进程同时打开。[package.json](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/package.json)、[apps/server/src/engine/tanstack-agent.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/engine/tanstack-agent.ts#L19)、[apps/server/src/db.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/db.ts#L122)、[README.md](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/README.md#L132)。

## 3. 可以落到文件的机制

| 机制 | 实际源码与行为 | 对 SecondU 的价值和边界 |
|---|---|---|
| 任务离开聊天继续运行 | [apps/server/src/engine/worker.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/engine/worker.ts#L64)：扫描到期任务，最多一批 3 个；SQL CAS 抢占 `leaseId`，默认 60 秒租约，约三分之一周期续约。每次 checkpoint 检查 lease/status，丢失租约 abort | SecondU 当前单进程 `Runner.active`，重启置 interrupted，用户核对后继续。若需要服务端常驻、多个 worker，再加入租约；不能把本机应用退出叫云端继续 |
| 可恢复的工具工作 | [apps/server/src/engine/model.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/engine/model.ts#L28)：工具串行队列、参数 hash 对已完成操作缓存、持久 state；`ask_user` 和 prepare 动作暂停；单次最多 16 steps、5 分钟 | 借鉴 checkpoint 与“等待用户”继续的明确边界。进程崩溃发生在外部动作成功和写 checkpoint 之间，仍须独立动作回执，缓存本身不能保证 exactly-once |
| 任务控制 | [apps/server/src/engine/service.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/engine/service.ts#L231)：暂停／取消令旧 lease 失效，旧 worker 不能再回写；有不确定动作时不允许直接重试 | SecondU 的 cancelled/interrupted 已诚实区分。可补 `paused` 与保存的计划，但不把恢复写成无条件重放 |
| 长期监测 | [apps/server/src/engine/service.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/engine/service.ts#L1005)：页面 text hash、首次基线、条件首次命中／变化通知、去重；[apps/server/src/engine/service.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/engine/service.ts#L758)：指数退避、连续 5 次失败暂停 | 可以落实“帮我持续留意”而不是固定重复对话。只是公开页面文本变化与美元价格正则；不等同自主长期规划、订位或订单追踪 |
| 主动建议 | [apps/server/src/engine/service.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/engine/service.ts#L521)：邮件附件/约见关键词和没有里程碑的 goal 触发；排除已处理来源，accept/edit/dismiss | 证据→建议→用户决定→任务的机制可借鉴。当前主要规则匹配，不能称高精度数字分身主动推理 |
| 个人化 | [packages/domain/src/agent.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/packages/domain/src/agent.ts#L94)、[apps/server/src/engine/routes.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/engine/routes.ts#L84)：name/tone/avatar、用户可编辑/删除的 text+source memories；[apps/server/src/engine/model.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/engine/model.ts#L290) 将 memories 与已有任务状态注入模型 | 比 SecondU 的人物／关系／事实修订／证据结构更轻；没有证据证明“判断接近本人”、反迎合评估或人格校准。保留 SecondU 认知主线，不能以多存几条记忆替代验证 |
| 同一结果到多端 | [apps/mobile/src/chat.tsx](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/mobile/src/chat.tsx#L35) 用 tool hooks 渲染任务／邮件／浏览器卡片；[apps/mobile/src/agent-ui.tsx](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/mobile/src/agent-ui.tsx#L347) 根据真实 task/action 请求最新审阅 | 学习结果引用和状态刷新。颜色、组件和大卡排版不搬；SecondU 继续 Apps SDK UI。手机/眼镜仍需实际各端实现 |
| 草稿与前台消息队列 | [apps/mobile/src/conversation-queue.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/mobile/src/conversation-queue.ts)、[apps/mobile/src/chat.tsx](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/mobile/src/chat.tsx#L308)：停回复暂停队列且保留草稿；不会取消已委派任务 | 停止回复、取消任务、停止外部动作应分别表达。前台队列是内存数据，关 app 不能保证送达，不能混称持久任务队列 |

## 4. 外部动作审批：应借鉴完整对象，不只按钮

[apps/server/src/actions.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/actions.ts#L39) 的 `propose` 将具体 recipient/body/event payload、`connectionId`、account、目标对象版本一起计算 hash，存为 `awaiting_review`，默认 30 分钟过期；幂等键重复时返回原 proposal。

[apps/server/src/actions.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/actions.ts#L103) 的 `decide` 校验用户看到的 hash、任务仍可执行、未过期、账号仍连接且 connection/account 未替换，再由 [apps/server/src/db.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/db.ts#L78) 原子 claim 为 executing。实际 adapter 完成后存 succeeded/failed/outcome_unknown 和回执。日历修改另外检查已审阅对象版本，见 [apps/server/src/workspace.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/workspace.ts#L330)。

**关键恢复规则：**重启时已在 executing 的外部动作变 `outcome_unknown`，提示先查供应商结果；不会因为没有成功响应就自动重发。已经批准且在途的调用可能在取消后完成，取消不能保证撤销外部世界。[apps/server/src/db.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/db.ts#L91)、[README.md](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/README.md#L136)。

建议 SecondU 独立 `ActionProposal`，绑定 `spaceId/taskId/agentId/resourceId/connectionId/payloadHash/targetVersion/expiresAt`；秘密保留在凭据层，UI 只给账户名称和可审 payload。状态至少区分待审、执行中、成功、失败、结果待核查、拒绝、过期。不要把现有 Codex 进程内批准承诺为邮件／订单的持久审批闭环。

对应可借鉴测试：[tests/actions.test.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/tests/actions.test.ts) 有重复批准、过期、错 owner、旧 hash、断连；[tests/persistence.test.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/tests/persistence.test.ts) 有重启后不确定动作恢复。**本次仅读测试，没有运行这些测试。**

## 5. 浏览器、终端和文件：真实能力与接管缺口

### 浏览器

- [apps/worker/src/browser.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/worker/src/browser.ts#L152) 用 Playwright `launchPersistentContext(profileDir)`；真实读取页标题、最终 URL、可见文字；截图为 1280×800。同一会话的操作串行，profile、cookie 与 PDF 下载保留。
- [apps/server/src/browser.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/browser.ts#L101) 按 owner 验证 session；创建前先保存 UUID，失败后可以重试原会话；[apps/server/src/browser.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/browser.ts#L181) 将 thread 绑定固定 session。
- [apps/server/src/browser-console.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/browser-console.ts) 控制台只呈现真实截图，按点击坐标、文字、键盘、滚动发送输入；不是在应用 origin 执行远站页面。签名 URL 15 分钟，离开后停轮询并释放对象 URL。[apps/server/src/auth.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/auth.ts#L42)。
- [apps/mobile/src/browser-tool-card.tsx](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/mobile/src/browser-tool-card.tsx#L83) 明确区分旧 observation 与当前 session：浏览器后来去了另一页，不把新截图冒充旧来源。这一点适合直接复用在 SecondU 的来源证据和活动时间线。
- worker 仅允许公开 HTTP(S) 80/443，DNS/IP 固定校验，禁私网、WebSocket、popup、service worker。3 个活动 session，20 个保存 profile。复杂登录／结账页面可能不兼容。其文档承认应用级出口校验不是内核防火墙，当前 Chromium 默认启动未启用内部 sandbox；不当作敌对多租户隔离方案。[apps/worker/README.md](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/worker/README.md#L49)。

**实际接管限制：**在本次浏览器服务／worker／UI 路径中看到串行队列，但没有 `human | agent` 控制权租约与拒绝 Agent 导航的锁。手动输入结束后，后续 Agent 仍可能导航同一页；因此“打开同一浏览器”已实现，“明确把控制权交给人并冻结 Agent”不能据此宣称完成。OpenBot 文档另有控制权协议，但适配默认关闭、无 live 接入，不可混作当前能力。[apps/server/src/browser.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/browser.ts#L57)、[apps/server/src/browser.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/browser.ts#L174)、[docs/OPENBOT-INTEGRATION.md](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/docs/OPENBOT-INTEGRATION.md#L57)。

SecondU 若建浏览器工位，应有 `resourceId + sessionId + taskId + controller + controlRevision + leaseExpiresAt`。接管原子切换为 human、停止 Agent 新输入；归还前重新观察页面，所有旧 snapshot 引用失效；断线仍可清楚判断谁有控制权。截图、浏览器运行状态、观察证据三个对象分开，不把一次页面抓取包装为全功能电脑。

### 终端和文件

[apps/server/src/computer.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/computer.ts#L113) 按 deployment+owner 生成 container 和 volume identity；检查标签、只读 root、nonroot、能力／内存／PID 限制、唯一 `/workspace` volume，拒绝挂接隔离状态不符的容器。只有 Docker 子进程，无 Docker 失败后回退宿主 shell。[apps/server/src/computer.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/computer.ts#L38)、[apps/server/src/computer.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/computer.ts#L225)。

命令有独立 idempotencyKey、保存输出／退出状态、30 秒上限；容器停止保留 volume。文件工具限定 `/workspace`，256 KiB 文本，支持 PDF 导入／导出。不是 PTY，没有完整桌面应用；终端网络关闭，不能据此声称可 git clone、包安装或一般联网代码任务。浏览器与终端分开，PDF 需显式搬运。[apps/server/src/computer-tools.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/computer-tools.ts#L11)、[docs/COMPUTER.md](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/docs/COMPUTER.md)。

SecondU 当前在用户本机项目目录执行，和 OpenMuse 隔离私有 Linux 工位是不同模型。未来新增资源可选远端容器，但不要把用户现有项目静默搬家，也不要在无容器时假显示“云电脑在线”。

## 6. 资源身份、Cue 与真实差距

| 用户关心的能力 | OpenMuse 此版本 | SecondU 当前／应做差距 |
|---|---|---|
| 每助理邮箱 | 连接 owner 的 Google 账户；代码 session owner 固定 `local-user`，不为每个 Agent 开户 | 当前无邮件连接器；应建明确资源归属和 scoped grant，再选择实际邮件服务，不给一串虚构地址充当已开通 |
| 电话与钱包 | 没有拨号／号码分配／钱包／支付实现；购买与预约列路线图 | 无对应服务。可以描述后续资源契约，不能称已具备 Cue 的真实能力 |
| 每助理电脑 | 每 owner 一个 Linux 工位，浏览器可有多个 session；不是每助理独立 VM | 现有多 Agent 共享本机、各任务/模型状态隔离；“角色多”不等于各自拥有独立电脑、账户和资金 |
| 群聊分工 | 主要是一个个人 Agent 加主聊/side chats；未见多助理群聊调度实现 | SecondU 已有角色顺序轮次与专属模型；尚不是持久资源权限与自治委派协作系统 |
| 扫餐厅二维码点单 | 无订单/商户/菜单/支付连接器，autonomous checkout 路线图 | 目前 Agent 名片/来源二维码导入，不是商户点单。真实点单需要商户能力发现、菜单与库存、准确订单、付款授权和回执 |
| 个人认知 | 编辑式记忆+语气，规则 Ideas | SecondU 已有证据/事实修订/关系/人生数据；仍缺真实本人判断评估、错误纠正如何改变下一次判断的指标 |

单 owner 事实见 [apps/server/src/auth.ts](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/apps/server/src/auth.ts#L15)；资源实现见第 5 节；缺口与路线图见 [ROADMAP.md](https://github.com/CopilotKit/openmuse/blob/34b15bc80340e582fb8c25573646cfb0bbc5184d/ROADMAP.md)。这里是 **OpenMuse 当前源码边界**。主任务已核实的 Manus 2.0 / Cue 邮箱、电话、钱包、电脑、群聊、餐厅扫码公开能力另存其官方资料；不能因 OpenMuse 未做而否定 Cue，也不能把 Cue 宣传直接当作 SecondU 完成证明。

建议资源实体把 `owner/agent/session/task` 区分开：资源长期归属不随一次聊天变化，任务只获得明确能力的引用；撤销账户/换模型不重写历史回执。每个界面从真实 resource status 渲染，只提供已经能够完成的操作。

## 7. 最小真实增量：项目改稿审批

这是**建议，尚未实现或验收**。建议作为新任务模式，不承诺拦截现有任意 shell 写入。

1. 用户在本地项目提出一次文档修改，Agent 在隔离候选目录生成目标文本；原项目保持原样。单个 UTF-8 文件先做完整闭环，避免一开始承诺整个仓库原子提交。
2. 服务端保存 proposal：project/path、源文件 hash、候选 hash、diff、任务/Agent、有效期、状态。候选成果与原文件链接明确，不再把回复强制保存为文件。
3. 用户查看准确 diff 并批准这一版；重新校验空间、项目路径、symlink、原文件 hash、候选 hash、未过期，再原子替换并保留原权限和版本历史。若任何一项变了，失效并重审；用户手改不被覆盖。
4. 写前日志+写后 hash/回执将 interrupted 与 succeeded 区分；重启后源=after 可补回执、源=before 可标未执行、其他结果待核查，不能盲目重写。拒绝与过期均零写入。
5. 验收：正常批准一次；双击批准只写一次；批准前用户编辑→409；切换空间后不能批准另空间；重启在写后/回执前→核查不重放；拒绝原文件不变；源删除/链接替换不越界。

可利用 SecondU `server/projects.mjs`、`workspace-files.mjs`、成果版本冲突与 `Runner.approval` 的显示基础；独立增加持久 proposal 状态，不能直接复用只存在于 `Runner.active` 的 promise 作为跨重启授权。任何借鉴 OpenMuse 实质代码时连同 MIT 声明保存来源；首轮优先独立实现机制。

## 8. 核验边界与后续顺序

本轮确实阅读了领域类型、任务引擎、动作服务、浏览器服务/worker、Docker 电脑服务、关键聊天/工具卡 UI、个人化与相关测试；不是全部源码审计。未运行 OpenMuse，也未验证 Chromium、Docker、Google、Intelligence、手机或长时间稳定性。官方演示文档说明模型部分使用 AI Mock，本轮没有观看视频，不能写成真实模型视频走查。

建议先完成上述一个可审、可取消、可恢复的文件任务；再单独实施真实浏览器工位和人机控制权；邮件/电话/钱包/商户按实际供应商能力逐个验收。当前不会安装 OpenMuse、复制私有数据、创建外部账户、运行支付或以空白资源卡替代集成。
