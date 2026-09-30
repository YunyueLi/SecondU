# Anthropic Messages 接入

Hither 原生向 Anthropic 的 `/v1/messages` 发请求，不经过 OpenRouter。执行仍由本机 Codex app-server 负责工具、安全边界与逐次审批。

## 配置

连接选择 `provider: anthropic`、`api: messages`，默认地址 `https://api.anthropic.com/v1`。官方当前模型页面列出 `claude-sonnet-5-5`；模型 ID 可由用户填写，账号权限与实际可用性以自己的连接测试为准。已有连接和默认模型不会被替换。

请求使用 `x-api-key` 和 `anthropic-version: 2023-06-01`。密钥沿用每连接隔离的本机凭据文件，不进入 bootstrap、事件或导出。仅支持标准 API key 认证；未接入多工作区密钥选择、OAuth、Bedrock 或 Vertex IAM。

## 已实现

- 原生非流式文本连接测试，检查完整 `end_turn` 与非空文本，HTTP 200 空对象不会通过。
- Codex Responses 请求到 Messages `system`、`messages`、客户端 `tools/input_schema` 的转换；函数命名空间和自由文本工具保留身份，结果回送为紧接调用的 `user/tool_result`。
- 本机随机令牌保护转接入口。上游完整响应后向 Codex 交付 Responses 事件；不宣称逐 token 流式。
- `end_turn`、`tool_use` 严格校验。截断、空响应、未知内容块、未声明工具、HTTP 错误明确失败，不重试、不换模型、不补造成功结果。
- 取消会中止上游请求，清理本机桥和 Codex 执行进程；普通回复仅作为消息，只有真实任务文件进入成果。

## 思考和继续执行的边界

当前 Anthropic 新模型不能统一设置 `thinking: disabled`。Hither 不发送 OpenAI `reasoning_effort`，也不设置 Anthropic `thinking/output_config`，使用模型自身默认设置。设置页隐藏这条连接的思考强度。

工具回合可能包含 `thinking`、`redacted_thinking` 和签名，官方要求原样回送。桥只在单次执行的内存内保留完整消息块，并核对原始前缀后回送；不会把原始思考暴露为活动摘要或保存到 Hither 的事件、对话或导出。缓存上限为 256 个工具调用、16 MiB。

用户继续任务时会新建 Codex thread，从本任务已有对话与工作区文件重建上下文，不尝试恢复缺失签名块的旧工具历史。先前对话作为未验证材料进入提示词，最近 30 条保留角色；用户指令及纠正另有完整列表。旧文件与审批记录保留，不自动重放动作。

当前桥明确拒绝图片、音频、文档块、Anthropic 服务端工具、强制工具选择和 Responses 服务端会话状态。它不等于 Anthropic 全部能力。最大输出默认 8192 tokens，单次上游请求超时 120 秒；模型/账号限额仍可能更低。

## 验证

`tests/anthropic.test.mjs` 覆盖原生认证/文本测试、签名消息的工具回送、无原始思考泄漏、不支持内容、HTTP 错误和取消。可选本机 Codex 回归使用纯本地 Anthropic fixture，实际执行 `printf`，验证工具结果往返、普通回复零产物，以及继续任务使用新 thread。

本轮实际运行：`HITHER_TEST_REAL_CODEX=1 node --test tests/anthropic.test.mjs`，7 项通过。未调用用户密钥或真实付费模型，不代表真实 Claude 账号、所有模型、长上下文或多模态已验收。

## 官方依据（2026-09-29 核对）

- [API overview：端点与认证](https://platform.claude.com/docs/en/api/overview)
- [Models overview：当前模型 ID](https://platform.claude.com/docs/en/models/overview)
- [Using the Messages API：完整对话历史与消息结构](https://platform.claude.com/docs/en/build-with-claude/working-with-messages)
- [Handle tool calls：tool_use/tool_result 与顺序约束](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)
- [API errors：思考块不可改写、不能禁用思考的模型、错误结构](https://platform.claude.com/docs/en/api/errors)
