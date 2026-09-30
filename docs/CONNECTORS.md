# 资源连接器

这里的连接器接入资料和工具；模型服务仍由原有模型连接管理。本实现沿用 Codex app-server 的执行循环，没有新增模型循环。

## 官方参照与取舍

2026-09-29 查阅的官方资料：

- [Manus MCP Connectors](https://manus.im/docs/integrations/mcp-connectors)、[Custom MCP](https://manus.im/docs/integrations/custom-mcp)：先连接与授权，再发现工具，并在任务中选择需要的连接。原生服务的账号授权由各服务和 Manus 管理。
- [Manus API connectors](https://open.manus.im/docs/v2/connectors)：任务显式选择已安装的连接器，不以显示品牌图标代替实际接通。
- [Grok Connectors](https://docs.x.ai/grok/connectors)：提供官方集成与自定义 MCP。账号授权和远端服务可达性是实际前提。
- [Codex app-server](https://developers.openai.com/codex/app-server/)：客户端通过 `thread/start.dynamicTools` 声明工具，通过 `item/tool/call` 接收调用并返回结果；需要开启实验协议能力。工具随线程持久化，恢复线程时不能再传 `dynamicTools`。
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)：初始化、初始化通知、工具发现与工具调用遵循 JSON-RPC，通过 HTTP JSON 或 SSE 返回。

SecondU 已实现本地资源、MCP HTTP 和通用 OAuth 授权流程。服务目录中的条目是可配置入口，用户账号是否已授权、握手是否通过与业务调用是否成功分别记录。

| 类型 | 实际可用能力 | 必要条件 |
| --- | --- | --- |
| 本机资料库 | 搜索及读取当前空间的来源记录、已保存成果 | 用户添加连接并在对话中显式选择 |
| 本地项目 | 浏览普通目录、读取限长文本文件 | 已绑定且仍可读取的本地项目；对话中显式选择 |
| MCP HTTP | 真实 initialize、tools/list、逐次批准后的 tools/call | HTTPS 端点，或明确允许的本机服务；匿名、Bearer 或 OAuth；先通过连接测试 |
| MCP OAuth | 资源与授权服务器发现、PKCE S256、浏览器账号授权、本机回调、令牌刷新和撤销 | 服务提供兼容元数据；手工应用使用本人注册的 client ID，部分服务需要 client secret、管理员许可或客户端准入 |

未实现 stdio/SSE 旧式双端点传输、MCP resources/prompts、服务端 sampling/elicitation。连接测试仅证明握手与工具发现成功，不代表已执行工具，也不替代模型可用性测试。OAuth 不代填密码、不借用 Codex/Claude 等宿主应用的身份，也不会自动批准服务商授权页。

## OAuth 授权与凭据

实现遵循 [MCP Authorization 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)：首先解析 401 的资源元数据入口，随后尝试标准 well-known 入口；支持 RFC 8414 与 OIDC 两种授权服务器发现路径，校验 resource、issuer 与 PKCE S256。没有资源元数据的手工应用可以明确配置 issuer；仍须通过标准元数据与 S256 检查。客户端信息优先使用本人预注册的应用，未填写时仅对声明支持的服务使用动态注册。未提供公开托管的客户端元数据文档，因此没有假设存在 SecondU 的线上应用身份。

每次授权使用新的随机 state 和 PKCE verifier，绑定当前空间、连接 ID、地址、配置版本、签发者和回调地址。回调仅监听 `127.0.0.1`，地址为 `http://127.0.0.1:<port>/oauth/callback`；动态客户端默认使用空闲端口，手工应用可指定其已登记端口。尝试十分钟后失效，应用重启后不能继续使用旧尝试。重复、过期、不匹配或配置已变化的回调不会保存令牌。

访问令牌、刷新令牌和应用密钥分别保存在当前空间的本地 0600 凭据文件中；SQLite 仅存应用配置、签发者、期限和授权范围，不存上述秘密。凭据文件及事务恢复记录位于被忽略的运行目录，不随代码和导出分发。这里提供文件权限隔离，未宣称使用系统钥匙串或加密静态存储。

到期前取用令牌时会刷新，同一进程中的并发刷新共用一次请求，服务返回的新刷新令牌会替换旧值；失效授权要求重新登录，不会重试业务工具。`disconnect` 只清除本空间访问与刷新令牌；`revoke` 是用户单独选择的远端撤销请求，只有服务确认后才清除本地授权。未公布撤销端点的服务提示用户到其授权管理页处理。OAuth 所有网络请求使用既有公网地址校验与 DNS 固定机制，拒绝重定向；本机例外仅限所选 MCP 的同一 origin。

## 状态与执行

配置和任务选择均保存在本机 SQLite。凭据复用独立的 0600 文件与恢复日志，不进入实体、导出或活动记录。资料库不会默认选中，也不会预先把整库内容放进提示词。

`ready` 对本地资源表示当前路径或库可读；对 MCP 表示最近一次测试通过。每轮开始再次握手并核验工具定义；配置更新改变 revision，地址或凭据改变会清除已有测试和工具缓存。所选资源、配置版本或数字分身状态改变时，会创建新模型线程，保留原有消息和成果。

模型看到的动态工具名称由连接器和工具标识生成；内容只在实际调用后返回。资料内容始终标记为未验证证据，不授予操作权限。本地工具仅只读；每次 MCP 调用展示服务地址、工具名、参数和配置版本，等待一次性确认。拒绝、取消、等待期间配置改变或重复 callId 均不会发送对应 tools/call。远端工具声明的 readOnlyHint 不绕过确认。

网络层只允许 HTTPS 公网地址；用户显式开启后可以连接精确的 localhost/127.0.0.1/::1，SecondU 自己的端口除外。DNS 所有结果均检查并固定到已验证地址；不跟随重定向，不把凭据转发给新地址。地址不能夹带账号、密码、查询或片段。解析、请求、返回大小、分页和工具数量均有限制。

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
| `POST /api/connectors/:id/oauth/start` | `{authorizationUrl,attemptId,expiresAt,redirectUri}` |
| `GET /api/connectors/:id/oauth/status?attemptId=...` | `{status,message,connector?}`；pending / connected / error / expired |
| `POST /api/connectors/:id/oauth/refresh` | 刷新后的公开 `Connector`；不返回令牌 |
| `POST /api/connectors/:id/oauth/disconnect` | 本地断开后的 `Connector` |
| `POST /api/connectors/:id/oauth/revoke` | 服务确认撤销后的 `Connector` |

Bootstrap 包含 `connectors`。Task、CreateTask、AgentRoom 接受 `connectorIds?: string[]`，最多 8 项；新一轮使用前必须可用。Task 空闲时可以 PUT 切换所选连接器，运行或等待审批时拒绝修改。既有未指定选择的会话保持空选择。

保存 MCP 可传 `authMode: none | bearer | oauth`、仅用于目录识别的 `catalogId`，以及 `oauth: {clientId?,clientSecret?,clearClientSecret?,issuerUrl?,resourceUrl?,scopes?,callbackPort?}`。返回的 OAuth 配置仅提供 `hasClientSecret`、授权状态、期限与范围。个人空间沿用 `/api/spaces/personal/...`；其授权尝试和凭据不与原空间互通。

`scopes: null` 清除人工范围并恢复服务发现；`scopes: []` 明确省略 scope 参数。client ID、issuer/resource URL 以空字符串清除，回调端口以 `null` 或 `0` 恢复动态端口；省略字段表示保留原值。清空表单不能继续暗用旧应用配置。

## 验证边界

`tests/connectors.test.mjs` 使用真实本机 HTTP MCP 夹具验证握手、JSON/SSE、会话头、测试失效、一次审批一次调用、配置竞态、来源读取、路径限制与 API 到现有 runner 的接线；不调用付费模型或真实第三方账号。

2026-09-30 新增 `tests/connector-oauth.test.mjs`：真实本机 OAuth/HTTP 夹具检查动态与手工客户端、OIDC、state/PKCE、单次回调、期限、配置竞态、刷新轮换、失效授权、断开与撤销、重启保留、来源地址隔离，以及个人空间 API/导出不含凭据。本轮与原连接器测试合计 13 通过、0 失败、1 项可选执行器检查跳过；类型检查通过。

同日对 Linear、Notion、Slack、Figma、Google Drive、Asana、HubSpot、Atlassian、Canva、Miro、Stripe 官方端点进行未登录的资源与授权服务器发现，11 项均返回可校验的元数据与 S256 支持。此次没有动态注册真实客户端、登录账号、读取账户内容或执行业务工具。Slack、Google、Asana、HubSpot 要求预注册应用；Figma/Canva 的客户端准入要求仍以服务商为准。公开发现可用不等于本机用户已连接，M365 租户与飞书本机实例未在本轮实测。

`tests/codex.test.mjs` 核验 dynamicTools 和真实计划事件的协议字段、重复调用防护、恢复参数。`HITHER_TEST_REAL_CODEX=1` 已验证本机 Codex 接受动态工具定义，并在 thread 创建后中断，确保没有开始外部模型轮次。另一个真实运行时测试已跑通：本机模型协议夹具 → Codex 动态工具请求 → 一次确认 → 本机 MCP tools/call → 结果返回同一个执行循环；共两次本机模型协议请求、一次 MCP 工具调用，没有付费模型请求。本机核对版本为 `codex-cli 0.158.0-alpha.2.1`；该版本的计划状态字段是 `inProgress`。
