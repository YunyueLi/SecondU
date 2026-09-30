# SecondU 的实际执行底座与身份边界

核查日期：2026-09-29。本文区分代码已经实现的路径、纯本地验证和仍需真实提供方验收的行为。

## 产品身份

SecondU 是用户的个人 Agent，也是产品中所说的数字分身：依据用户确认的背景、偏好和目标持续协作，在授权内处理事务。它不会冒充用户本人，不会补造经历或承诺，也不宣称拥有完整终身记忆。命名 Agent 是这个体系中承担具体分工的角色。

实现统一在 [`server/identity.mjs`](../server/identity.mjs)。`baseInstructions` 明确产品身份，`developerInstructions` 限定证据、工具与授权范围；[`buildPrompt`](../server/runner.mjs) 每轮再次提供身份、当前消息及所选证据。原来的泛化 `personal agent` 描述不足以覆盖上游编码助手默认定位。此次改用 app-server 支持的明确基础指令，不更改工具协议、权限配置或审批处理。

数字分身开关现在明确控制个人上下文：`digitalTwinEnabled=true` 时，每轮依据最新用户消息重新选择已确认认知，同时保留最多 4 条已确认身份／偏好作为基础背景，合计最多 8 条；用户档案的名称、描述与虚构标记一并提供。`false` 时不注入个人档案或认知；旧任务字段缺省时兼容原 `contextFactIds`。问候仍按 [`conversationKind`](../shared/conversation-intent.mjs) 的有限规则处理，但明确开启数字分身时也保留基础背景，不强制在回复中复述。选择器 [`selectPersonalContext`](../shared/personal-context.mjs) 仍是确定性的词项检索，不代表语义理解、自动人物分析或深层认知推理；候选与推断不会因此升级为 confirmed。

## 实际调用路径

| 环节 | 当前实现与可查入口 |
| --- | --- |
| 本地任务层 | [`TaskRunner`](../server/runner.mjs) 保存任务、消息、事实版本与有限来源摘录；真实模式调用 `runConfiguredCodex`。测试注入的 `runCodex` 仅用于夹具。 |
| Responses | [`runConfiguredCodex`](../server/chat-bridge.mjs) 直接调用 `runCodex`，由配置的提供方处理模型请求。 |
| Chat Completions / Anthropic Messages | 在本机启动明确的 Responses 转接层，再调用同一个 Codex 运行时。支持范围以转接器和协议测试为准，不宣称任意提供方、原生逐 token 流式或多模态全部兼容。 |
| 本机执行器 | [`AppServerTransport`](../server/codex.mjs) 启动真实 `codex app-server --listen stdio://`；依次 initialize、initialized、config/read、thread/start 或 thread/resume、turn/start。不是将普通模型文本假装成工具运行。 |
| 工具与审批 | 运行时返回真实工具事件；宿主处理逐次审批、明确拒绝与中断。先确认任务目录权限配置再建线程。最终回复作为消息；仅真实写入工作目录且通过边界检查的文件收录为产物。 |
| 演示 | [`demo.mjs`](../server/demo.mjs) 返回明确标注的本地固定示例，不调用模型，也不是真实模式失败后的替代。问候和身份问答无文件、无写文件审批。 |

本轮只读探测到本机版本 `codex-cli 0.158.0-alpha.2.1`；版本探测本身不代表模型兼容或任务成功。模型与执行器彼此独立，云模型仍接收完成当前请求所需的显式上下文。当前运行节点是用户本机，未接入远端执行器；没有把云端模型调用称为云电脑执行。

## 续聊是否接收新身份

每个 `runCodex` 调用启动一个新的 app-server 进程，在 finally 中关闭。新线程和冷恢复旧线程都显式发送同一版本的 `baseInstructions` 与 `developerInstructions`。模型连接、数字分身模式与所选连接器版本均未变时 Responses / Chat 路径可恢复原线程；这些绑定变化时重建运行时上下文，避免关闭数字分身后继续复用已含个人认知的线程。空闲会话可换模型或模式，运行与待批准期间拒绝改绑。Anthropic Messages 当前每次继续创建新运行时线程，并从持久任务对话重建文本上下文，避免伪造跨轮思考签名或工具历史。

上游官方文档说明 [`thread/resume` 可以接受与 `thread/start` 相同的配置覆盖](https://learn.chatgpt.com/docs/app-server)。固定提交 `a9118edae8b77bf23b7182fd071a7b6251898bed` 中，恢复处理器将两项指令转入配置覆盖（[thread_processor.rs](https://github.com/openai/codex/blob/a9118edae8b77bf23b7182fd071a7b6251898bed/codex-rs/app-server/src/request_processors/thread_processor.rs#L3899)），核心明确优先采用配置中的基础指令，其次才采用旧历史指令（[session/mod.rs](https://github.com/openai/codex/blob/a9118edae8b77bf23b7182fd071a7b6251898bed/codex-rs/core/src/session/mod.rs#L708)）。上游默认基础提示确实以编码助手定位开始（[默认提示源码](https://github.com/openai/codex/blob/a9118edae8b77bf23b7182fd071a7b6251898bed/codex-rs/protocol/src/prompts/base_instructions/default.md#L1)）。

重要边界：在同一 app-server 进程中恢复已运行线程时，上游会忽略这些指令覆盖并报告差异（[源码](https://github.com/openai/codex/blob/a9118edae8b77bf23b7182fd071a7b6251898bed/codex-rs/app-server/src/request_processors/thread_processor.rs#L218)）。当前一轮一进程避免了该分支；未来若改成长驻运行时，必须重新验收配置更新。旧回复保留为历史，指令要求对其中错误身份简短纠正，不改写用户记录。

## 能力与验收边界

- 当前认知输入是本轮选中的已确认事实、明确开启时的用户档案，以及事实关联来源的有限摘录，带版本、SHA-256 与截断标志。没有接入全库自动检索，也不能从不存在的上下文声称“记得你的一切”。
- 用户显式选中的本地资料库／项目文件夹连接可向真实 Codex 提供只读动态工具；自定义 MCP HTTP 先验证 initialize/tools/list，调用逐次批准并绑定工具、参数与连接版本。未选连接不自动注入，演示模式不实际调用连接器。详见 [连接器边界与验证](CONNECTORS.md)；这不代表第三方 OAuth 已接通。
- 电脑活动页当前是 Dev 前端示例。没有后台跨应用采集、读屏或权限申请流程；示例不自动进入模型。用户从示例追问时，草稿明确标注其虚构性质。
- 日常 SecondU 活动、人工记录和确认导入可在本地保存，不能自动升级为人生事实。外部平台、远程机器或浏览器接管只有实际接入并验证后才能承诺。
- 测试只证明指令交付、消息/工具协议、证据选择和状态处理符合断言。真实提供方是否稳定遵循定位、复杂长期协作的效果、完整外部系统操作仍需单独验收。

本轮相关回归：[`identity.test.mjs`](../tests/identity.test.mjs)、[`codex.test.mjs`](../tests/codex.test.mjs)、[`context-selection.test.mjs`](../tests/context-selection.test.mjs)、[`demo-replies.test.mjs`](../tests/demo-replies.test.mjs)、[`group-turns.test.mjs`](../tests/group-turns.test.mjs)。未读取用户密钥、私人电脑历史或调用真实付费模型。

实际结果：上述五个文件合跑 37 项，35 通过、2 个本机可选项跳过；随后启用本机检查单独运行 `codex.test.mjs`，20/20 通过，其中包含真实 app-server 接受完整配置与身份指令，以及模型请求开始前中断。后一次包含前一次已过的协议测试，不应相加声称为 57 个独立测试。模型端回答内容仅由夹具提供，不能称为真实提供方输出验收。

2026-09-30 对上述说明作当前代码核对，补齐数字分身每轮刷新、空闲模型切换和显式连接器边界。前述 37／20 项仍是对应批次的历史结果；数字分身配置与选择器的定向证据在 `tests/digital-twin-mode.test.mjs`、`tests/task-config.test.mjs`、`tests/context-selection.test.mjs`，连接器真实本机链路结果由 [CONNECTORS](CONNECTORS.md) 单独登记。不得将文档更新当作新增真实云模型验收。
