# 资源连接器

这里的连接器接入资料和工具；模型服务仍由原有模型连接管理。本实现沿用 Codex app-server 的执行循环，没有新增模型循环。

## 官方参照与取舍

2026-09-29 查阅的官方资料：

- [Manus MCP Connectors](https://manus.im/docs/integrations/mcp-connectors)、[Custom MCP](https://manus.im/docs/integrations/custom-mcp)：先连接与授权，再发现工具，并在任务中选择需要的连接。原生服务的账号授权由各服务和 Manus 管理。
- [Manus API connectors](https://open.manus.im/docs/v2/connectors)：任务显式选择已安装的连接器，不以显示品牌图标代替实际接通。
- [Grok Connectors](https://docs.x.ai/grok/connectors)：提供官方集成与自定义 MCP。账号授权和远端服务可达性是实际前提。
- [Codex app-server](https://developers.openai.com/codex/app-server/)：客户端通过 `thread/start.dynamicTools` 声明工具，通过 `item/tool/call` 接收调用并返回结果；需要开启实验协议能力。工具随线程持久化，恢复线程时不能再传 `dynamicTools`。
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)：初始化、初始化通知、工具发现与工具调用遵循 JSON-RPC，通过 HTTP JSON 或 SSE 返回。

Hither 首批实现如下。没有宣称 Google Drive、Slack、Notion 等第三方 OAuth 已接通。

| 类型 | 实际可用能力 | 必要条件 |
| --- | --- | --- |
| 本机资料库 | 搜索及读取当前空间的来源记录、已保存成果 | 用户添加连接并在对话中显式选择 |
| 本地项目 | 浏览普通目录、读取限长文本文件 | 已绑定且仍可读取的本地项目；对话中显式选择 |
| 自定义 MCP HTTP | 真实 initialize、tools/list、逐次批准后的 tools/call | HTTPS 端点，或明确允许的本机服务；可选 Bearer token；先通过连接测试 |

未实现 OAuth 自动登录、原生第三方目录、stdio/SSE 旧式双端点传输、MCP resources/prompts、服务端 sampling/elicitation。连接测试仅证明握手与工具发现成功，不代表已执行工具，也不替代模型可用性测试。

## 状态与执行

配置和任务选择均保存在本机 SQLite。凭据复用独立的 0600 文件与恢复日志，不进入实体、导出或活动记录。资料库不会默认选中，也不会预先把整库内容放进提示词。

`ready` 对本地资源表示当前路径或库可读；对 MCP 表示最近一次测试通过。每轮开始再次握手并核验工具定义；配置更新改变 revision，地址或凭据改变会清除已有测试和工具缓存。所选资源、配置版本或数字分身状态改变时，会创建新模型线程，保留原有消息和成果。

模型看到的动态工具名称由连接器和工具标识生成；内容只在实际调用后返回。资料内容始终标记为未验证证据，不授予操作权限。本地工具仅只读；每次 MCP 调用展示服务地址、工具名、参数和配置版本，等待一次性确认。拒绝、取消、等待期间配置改变或重复 callId 均不会发送对应 tools/call。远端工具声明的 readOnlyHint 不绕过确认。

网络层只允许 HTTPS 公网地址；用户显式开启后可以连接精确的 localhost/127.0.0.1/::1，Hither 自己的端口除外。DNS 所有结果均检查并固定到已验证地址；不跟随重定向，不把凭据转发给新地址。地址不能夹带账号、密码、查询或片段。解析、请求、返回大小、分页和工具数量均有限制。

项目读取排除隐藏文件、凭据文件、依赖目录、符号链接、硬链接、路径越界及超过 1 MB 的文件。返回文本有长度限制并检查敏感字段。删除连接只删除配置及其凭据；被会话引用时要求停用，保留来源与历史。

## 前端契约

精确类型位于 `shared/connectors.ts`，由 `shared/contracts.ts` 统一导出。

| API | 返回 |
| --- | --- |
| `GET /api/connectors` | `Connector[]` |
| `GET /api/connectors/:id` | `Connector` |
| `POST /api/connectors` | 新建 `Connector` |
| `PUT /api/connectors/:id` | 更新 `Connector` |
| `POST /api/connectors/:id/test` | `ConnectorTestResult`；测试中配置变化为 HTTP 409 + stale |
| `DELETE /api/connectors/:id` | `{ok:true}`；仍被引用为 HTTP 409 |

Bootstrap 包含 `connectors`。Task、CreateTask、AgentRoom 接受 `connectorIds?: string[]`，最多 8 项；新一轮使用前必须可用。Task 空闲时可以 PUT 切换所选连接器，运行或等待审批时拒绝修改。既有未指定选择的会话保持空选择。

## 验证边界

`tests/connectors.test.mjs` 使用真实本机 HTTP MCP 夹具验证握手、JSON/SSE、会话头、测试失效、一次审批一次调用、配置竞态、来源读取、路径限制与 API 到现有 runner 的接线；不调用付费模型或真实第三方账号。

`tests/codex.test.mjs` 核验 dynamicTools 和真实计划事件的协议字段、重复调用防护、恢复参数。`HITHER_TEST_REAL_CODEX=1` 已验证本机 Codex 接受动态工具定义，并在 thread 创建后中断，确保没有开始外部模型轮次。另一个真实运行时测试已跑通：本机模型协议夹具 → Codex 动态工具请求 → 一次确认 → 本机 MCP tools/call → 结果返回同一个执行循环；共两次本机模型协议请求、一次 MCP 工具调用，没有付费模型请求。本机核对版本为 `codex-cli 0.158.0-alpha.2.1`；该版本的计划状态字段是 `inProgress`。
