# OpenJarvis 的借鉴与当前落地

截至本次实现，Hither **没有安装或运行 OpenJarvis，没有复制其源码，也没有嵌套第二套 Agent 循环**。当前真实执行适配器仍是 Codex app-server；本地演示是独立且明确标注的确定性流程。OpenJarvis 是模块边界与测量方式的设计参考，不能将参考行为描述为完成集成。

依据来自已核查的公开提交 [`52659ca7c221703265fe46ff28c5b0a6e2b64c4a`](https://github.com/open-jarvis/OpenJarvis/tree/52659ca7c221703265fe46ff28c5b0a6e2b64c4a)。该项目代码为 [Apache-2.0](https://github.com/open-jarvis/OpenJarvis/blob/52659ca7c221703265fe46ff28c5b0a6e2b64c4a/LICENSE)，包元数据仍标 Alpha。Hither 未从这些信息推定其真实模型、桌面发行或跨端执行已经验收。

## 从参考到实现

| 参考机制 | Hither 已落地 | 仍未完成 |
| --- | --- | --- |
| 模型、引擎、Agent、工具/记忆各自负责状态 | `store/domain` 管个人认知和产品实体；`runner` 管任务、分工、审批、产物；`codex` 管执行协议；`rooms` 管会话与任务关联 | 可替换执行适配器的第二实现；不以新接口存在冒充已切换运行时 |
| 引擎能力登记和健康检查 | `GET /api/runtime/capabilities` 返回本机执行器可用性、模型配置状态、文本连接测试及能力边界 | 工具、流式与多模态要逐提供方/模型验收，不能从 Responses 名称推定兼容 |
| 逐轮执行轨迹 | `GET /api/tasks/:id/trace` 返回原始事件、运行尝试、角色、审批和产物计数；每次开始记录当时 adapter/provider/model/api，密钥不入轨迹 | 统一跨设备轨迹、外部动作结果对账、可移植检查点 |
| 质量与性能分开评测 | 本地测试核对证据选择、审批、恢复、版本保护、会话、导入和迁移；轨迹汇总真实本地墙钟耗时 | 模型质量评测、真实成本/能耗与同模型同任务比较，尚未测量的字段返回 null |
| 记忆与可追溯来源 | 只向任务传所选认知和有限来源摘录；原始来源与事实修订留在 Hither 数据层 | 自动检索、向量索引、模型抽取候选的完整验收；不会让自动抽取覆盖正式认知 |

公开依据：[官方架构](https://github.com/open-jarvis/OpenJarvis/blob/52659ca7c221703265fe46ff28c5b0a6e2b64c4a/docs/architecture/overview.md#L10-L54)、[InferenceEngine](https://github.com/open-jarvis/OpenJarvis/blob/52659ca7c221703265fe46ff28c5b0a6e2b64c4a/src/openjarvis/engine/_stubs.py#L54-L131)、[工具规格](https://github.com/open-jarvis/OpenJarvis/blob/52659ca7c221703265fe46ff28c5b0a6e2b64c4a/src/openjarvis/tools/_stubs.py#L119-L148)、[质量/性能评测区别](https://github.com/open-jarvis/OpenJarvis/blob/52659ca7c221703265fe46ff28c5b0a6e2b64c4a/docs/user-guide/evaluations.md#L3-L56)、[多轮轨迹执行器](https://github.com/open-jarvis/OpenJarvis/blob/52659ca7c221703265fe46ff28c5b0a6e2b64c4a/src/openjarvis/evals/core/agentic_runner.py#L1-L62)。

## 当前测量接口

`GET /api/runtime/capabilities` 返回 `RuntimeCapabilities`。`codex-app-server.available` 仅说明本机能识别 Codex 可执行程序；`provider.configured` 仅说明当前配置有密钥。`textConnectionTest` 只检验文本 Responses 请求，不能作为工具兼容证明。`openJarvis` 明确返回 `integration:'design-reference'`、`codeReused:false`、`installed:false`。

`GET /api/tasks/:id/trace` 返回 `TaskTrace`：

- `attempts` 由真实 `started` 和终态事件组成，包含起止时间、结果和当时配置快照。旧任务未记录配置时返回 `runtime:null`，不补造历史。
- `measurements.wallClockMs` 是各尝试的本地事件时钟差，包含等待审批和用户介入，不是模型推理耗时。运行中的尝试持续增加。
- `agentRunCount`、`approvalRequestCount`、`artifactCount` 来自持久任务记录，不推断外部工作已完成。
- `inputTokens`、`outputTokens`、`costUsd`、`energyJoules` 当前为 `null`；`quality:'not_assessed'`。没有将未知填成 0，也没有把任务 completed 等同于用户验收通过。

## 采用第二执行器前需要证明的事

应使用同一模型、同一工具权限与同一组中文任务，对比所选认知与原文利用、用户纠正、任务实际完成、可编辑成果、中断后恢复、首个有效反馈、总耗时和真实费用。OpenJarvis 的引擎/工具/评测模块是候选复用对象，是否引入依赖由这些结果决定。

既有源码核查还发现：对应提交的 DeepSeek 非流式请求未转发 tools/tool_choice；浏览器工具启动独立无头 Chromium；检查点不能单独证明外部动作恰好执行一次。见 [DeepSeek 请求实现](https://github.com/open-jarvis/OpenJarvis/blob/52659ca7c221703265fe46ff28c5b0a6e2b64c4a/src/openjarvis/engine/cloud.py#L1211-L1261)、[浏览器实现](https://github.com/open-jarvis/OpenJarvis/blob/52659ca7c221703265fe46ff28c5b0a6e2b64c4a/src/openjarvis/tools/browser.py#L14-L32)、[恢复接口](https://github.com/open-jarvis/OpenJarvis/blob/52659ca7c221703265fe46ff28c5b0a6e2b64c4a/src/openjarvis/agents/manager.py#L377-L437)。这些是固定提交的静态边界，当前未重跑上游验证，不能泛化为未来版本能力。
