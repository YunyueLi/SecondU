# 通信连接

SecondU 可以调用用户已配置的本机通信工具，读取指定会话、预览后保存记录，并在用户确认具体内容后发送文字消息。账号登录、平台凭据与平台权限由通信工具管理。SecondU 保存连接配置、导入来源和发送记录，不提供通用微信免凭据直读，也不解密平台私有数据库。

这里描述 2026-10-01 的实现。当前没有后台实时同步、自动轮询、自动回复或消息附件收发；读取与发送都由界面中的操作发起。文件导入另见 [IMPORTS.md](IMPORTS.md)，任务使用的资料与 MCP 工具连接另见 [CONNECTORS.md](CONNECTORS.md)。

## 使用流程

1. 打开聊天记录的「连接通信工具」。选择 SecondU 管理的独立 OpenClaw，按渠道安装固定版本、填写令牌或本人扫码；也可检测并选择原工具中已经授权的账号。随后限定一个明确的目标会话。
2. 检查连接。只有工具确认账号在线并声明相应能力后，SecondU 才开放读取或发送。
3. 读取时先显示预览，核对账号、会话、参与人和新增消息数量，再保存为来源与交流记录。读取本身不自动确认人物关系或个人认知。
4. 发送时先保存草稿，再核对渠道、账号、目标和完整正文。最后一次确认有效后才调用通信工具；检查连接、读取记录和保存草稿都不会发送消息。

连接配置改变会增加 `revision`，清除检查结果。旧草稿不能按新配置发送，旧读取预览须重新获取，通用文件导入接口也不能绕过此连接校验；检查或读取尚未返回时发生配置修改，旧操作结果会被拒绝。

## OpenClaw 适配

连接向导使用固定版本 OpenClaw 2026.9.7，为下表 13 个渠道提供按平台要求配置的入口；已有工具模式与高级 CLI 配置仍保留。独立环境需要兼容的系统 Node.js 与 npm，安装按钮才会下载程序。受管账号关闭自动回复，凭据只存本机；原工具的账号和服务不会被改写。

读取与发送按渠道分别适配。完成账号授权并通过检查后，才能使用对应操作：

| 渠道 | 读取指定会话 | 确认后发送文字 |
| --- | --- | --- |
| Slack、Discord | 已实现返回格式转换，单次请求最多 100 条 | 已实现调用 |
| 飞书 / Lark、QQ、企业微信、Google Chat、iMessage、Matrix、Mattermost、Microsoft Teams、Signal、Telegram、WhatsApp | 尚未实现返回格式转换 | 已实现调用 |

这里的“已实现调用”指 SecondU 已接入命令和回执处理，实际可用性取决于本机工具、账号及平台权限。OpenClaw 官方的命令范围和目标格式见 [message 参考](https://docs.openclaw.ai/cli/message)；SecondU 的读取适配仅覆盖上表两项。

### 授权方式与安装条件

| 渠道 | 向导接入方式 | 必要条件 |
| --- | --- | --- |
| Slack、Discord、Telegram | 机器人令牌 | 本人在对应平台创建应用并授予所选会话的权限 |
| 飞书 / Lark | App ID、App Secret；选择平台 | 企业自建机器人，官方 WebSocket 长连接 |
| QQ | App ID、App Secret | 腾讯官方插件 `@tencent-connect/openclaw-qqbot@2.0.4`，使用对应会话 OpenID |
| 企业微信 | Bot ID、Secret | 官方插件 `@wecom/wecom-openclaw-plugin@2026.9.15`，智能机器人长连接 |
| WhatsApp | 关联设备二维码 | 本人使用 WhatsApp 扫描临时二维码 |
| Microsoft Teams、Google Chat | 平台应用与服务凭据 | 已配置平台要求的 HTTPS webhook；向导不开放公网端口 |
| Signal | 号码与本机服务地址 | 已授权并运行的本机 signal-cli HTTP 服务 |
| iMessage | imsg 路径，可选资料路径 | 已登录「信息」的 Mac，以及本人授予的 macOS 权限 |
| Matrix、Mattermost | 服务地址与令牌 | 已有账号或机器人及目标频道权限；Matrix 加密房间的设备验证未接入 |

Telegram 使用核心内置渠道。其余 OpenClaw 官方插件固定为 2026.9.7；QQ 与企业微信使用上表独立版本。安装与加载路径由 SecondU 管理，接口不接受任意包名。

微信和钉钉均有实际维护的官方插件，当前版本的自动入站行为与本向导的手动操作范围不兼容，因此未加入受管安装：腾讯微信插件 2.4.9 未提供关闭自动入站处理的配置；钉钉插件 0.8.26 没有禁用私聊的策略，禁用群聊后仍会自动回复拒绝消息。界面显示具体兼容性说明，聊天文件导入仍可使用。依据为[微信官方说明](https://docs.openclaw.ai/channels/wechat)和[钉钉官方插件源码](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector)。

SecondU 传给 OpenClaw 的操作是：

```text
openclaw channels status --channel <channel> --probe --json
openclaw message read --channel <channel> --account <accountId> --target=<target> --json --limit 100
openclaw message send --channel <channel> --account <accountId> --target=<target> --json --message=<confirmedText>
```

这些是参数说明，程序实际逐项传递参数，不通过 shell 解释。目标必须使用对应渠道支持的稳定标识；例如 Slack 的 `channel:C_FICTIONAL`、Discord 的 `channel:123456789`。Telegram 也接受负数群聊 ID（例如 `-1001234567890`）；适配器以 `--target=<值>` 的单一参数传递，避免被解释为命令选项。示例标识全部虚构。

读取结果必须包含匹配的 `action: "read"`、`channel` 和 `payload.messages`。Slack 转换 `user`／`bot_id`、`username`、`ts` 和 `text`；Discord 转换 `author.id`、`author.global_name`／`username`、`id`、`timestamp` 和 `content`。若消息返回频道标识，SecondU 会核对它属于指定会话。没有文字的消息显示附件未下载提示。来源中保存的是转换后的 `hither.chat.v1` 数据，包含保留下来的正文、身份标识与时间；不是完整 OpenClaw 返回包或媒体副本。

发送回执须为 `action: "send"`、匹配渠道、非 dry-run，且没有明确的失败标志。消息标识按 `messageId`、`payload.messageId`、`payload.result.messageId` 的顺序读取，须为非空字符串。OpenClaw 的顶层消息标识是可选字段，渠道专有结果可在 `payload` 内；参见[官方 JSON 返回说明](https://github.com/openclaw/openclaw/blob/main/docs/nodes/images.md)。OpenClaw 适配根据本次固定命令参数及该回执认定工具已接受提交，不把它描述为对方已收到或已读。

## 其他本机 CLI：`hither.im.v1`

其他工具通过一个本机可执行桥接程序接入。该程序负责调用自己支持的平台，将结果转换为以下协议；SecondU 不会猜测任意 CLI 的参数或输出。配置使用 `adapter: "hither-cli"`，`command` 是可执行文件的绝对路径，不能填写带参数的 shell 命令。

每次调用启动一个进程：SecondU 不附加命令行参数，通过标准输入写入一个 UTF-8 JSON 对象，然后关闭输入。桥接程序读取至 EOF，在标准输出返回恰好一个 JSON 对象，以退出码 `0` 结束；进度和诊断不能混入标准输出。当前每次调用限时 15 秒，标准输出与标准错误合计最多 1 MiB。SecondU 不把标准错误内容返回浏览器。账号凭据应由桥接工具自行管理，不放入下列请求或回执。

以下示例都是虚构账号与消息。三个操作共用 `protocol`、`channel`、`accountId`、`target`，各字段在该连接中保持稳定。`platform` 是 SecondU 的来源分类，完整取值见 [chat-adapters.mjs](../server/chat-adapters.mjs)。

### 检查：`probe`

请求：

```json
{
  "protocol": "hither.im.v1",
  "action": "probe",
  "channel": "slack",
  "accountId": "fictional-account",
  "target": "channel:C_FICTIONAL"
}
```

成功响应：

```json
{
  "protocol": "hither.im.v1",
  "channel": "slack",
  "accountId": "fictional-account",
  "connected": true,
  "capabilities": { "read": true, "send": true }
}
```

SecondU 核对协议、渠道和账号，且只在 `connected === true` 时采用明确为 `true` 的能力。工具不支持的能力应返回 `false`。检查通过只说明本次工具检查的结果，不能证明后续消息操作一定成功。

### 读取：`read`

请求：

```json
{
  "protocol": "hither.im.v1",
  "action": "read",
  "channel": "slack",
  "accountId": "fictional-account",
  "target": "channel:C_FICTIONAL",
  "limit": 100
}
```

响应中的 `data` 使用 `hither.chat.v1`，完整示例：

```json
{
  "protocol": "hither.im.v1",
  "data": {
    "format": "hither.chat.v1",
    "platform": "slack",
    "accountId": "fictional-account",
    "people": [
      { "id": "fictional-self", "name": "示例本人", "isSelf": true },
      { "id": "fictional-colleague", "name": "示例同事" }
    ],
    "conversations": [
      {
        "id": "channel:C_FICTIONAL",
        "title": "虚构的项目会话",
        "kind": "group",
        "participantIds": ["fictional-self", "fictional-colleague"],
        "messages": [
          {
            "id": "fictional-message-001",
            "senderId": "fictional-colleague",
            "text": "这是协议测试内容，不是真实私人记录。",
            "time": "2026-09-30T10:00:00+08:00"
          }
        ]
      }
    ]
  }
}
```

`data.platform` 与配置的平台一致，`data.accountId` 与配置的账号一致；`conversations` 必须恰好包含一个会话，其 `id` 必须与请求的 `target` 完全一致。所有消息发送人须属于会话参与人，所有参与人须存在于 `people`。时间包含时区，人物、会话和消息使用稳定标识，正文按读取结果保留。桥接程序应遵守请求的 `limit`，返回数据同时受[导入协议的数量与长度限制](IMPORTS.md)约束。

没有消息时可返回：

```json
{ "protocol": "hither.im.v1", "data": { "empty": true } }
```

非空返回会生成临时预览，确认保存后才写入正式来源和会话。预览有效期为 30 分钟。相同账号、会话、消息标识重复读取不会重复新增；同一消息标识出现不同正文、发送人或时间时返回冲突，不覆盖此前内容。

### 发送：`send`

以下请求仅会在 SecondU 的发送确认通过后交给桥接程序：

```json
{
  "protocol": "hither.im.v1",
  "action": "send",
  "channel": "slack",
  "accountId": "fictional-account",
  "target": "channel:C_FICTIONAL",
  "text": "这是已核对的虚构测试消息。",
  "requestId": "im-draft-fictional-001"
}
```

确认工具已接受该次提交时返回：

```json
{
  "protocol": "hither.im.v1",
  "channel": "slack",
  "accountId": "fictional-account",
  "target": "channel:C_FICTIONAL",
  "requestId": "im-draft-fictional-001",
  "accepted": true,
  "receipt": { "messageId": "fictional-platform-message-002" }
}
```

`channel`、`accountId`、`target` 和 `requestId` 都必须与本次请求精确匹配，协议必须为 `hither.im.v1`，`accepted` 必须明确为 `true`，`receipt.messageId` 必须是非空字符串。桥接程序不能用别次发送的回执补齐字段；应把 `requestId` 用于自身去重，并保存平台实际返回的消息标识。SecondU 不能验证一个任意自定义程序是否诚实，因此应选择用户信任且已自行配置的工具。

缺少明确回执、响应不匹配、超时、无效 JSON 或非零退出都不会显示为已提交。即使桥接程序返回 `accepted: false`，SecondU 也保留“结果不确定”，因为工具已启动后可能发生部分发送。

## 发送记录与恢复

| 状态 | 含义 |
| --- | --- |
| `draft` | 本机保存的草稿，尚未调用发送 |
| `sending` | 已在数据库占用本次发送，等待工具返回 |
| `accepted` | 工具返回了符合对应适配器要求的提交回执，不代表对方已读 |
| `failed` | 可确定工具未启动：文件不存在或没有执行权限 |
| `unknown` | 工具启动后的结果不确定，或应用在发送期间退出；应到原平台核对 |

每次确认绑定草稿内容与目标，包含随机令牌、摘要和 5 分钟有效期。发送前在 SQLite 事务中重读草稿、确认数据、连接版本和发送能力，再原子地改为 `sending`，随后才启动工具。同一草稿不能重复提交；已经提交、失败或待核对的草稿都不会自动重发。应用重启时遗留的 `sending` 改为 `unknown`。需要再次发送时，应先核对原平台结果，再创建并确认新草稿。

## 本机接口

| API | 用途 |
| --- | --- |
| `GET /api/im-connections` | 列出当前空间的连接 |
| `POST /api/im-connections` | 保存连接：`name, adapter, command, channel, accountId, target, platform?, selfId?` |
| `PUT /api/im-connections/:id` | 编辑连接，提交完整配置及当前 `revision` |
| `POST /api/im-connections/:id/probe` | 检查账号及能力 |
| `POST /api/im-connections/:id/preview` | 读取并生成导入预览，或返回 `{empty:true}` |
| `POST /api/im-connections/:id/commit` | 核对后提交 `{previewId}` |
| `POST /api/im-connections/:id/drafts` | 以 `{text}` 保存草稿 |
| `GET /api/im-outbox?connectionId=:id` | 列出该连接的草稿与发送记录 |
| `POST /api/im-outbox/:id/prepare` | 取得完整草稿与本次 `confirmation` |
| `POST /api/im-outbox/:id/send` | 提交核对后的 `{token, digest, confirmed:true}` |

`platform` 在通用桥接配置中必填，在 OpenClaw 配置中按渠道推导；`selfId` 仅用于 OpenClaw 读取时标记导出中的本人。连接和记录存于当前空间的本机 SQLite。实现入口为 [im-cli.mjs](../server/im-cli.mjs)、[index.mjs](../server/index.mjs) 与 [imports.mjs](../server/imports.mjs)。

## 验证边界

当前已用虚构数据核对协议、回执匹配、UTF-8 分块处理和嵌套 OpenClaw 消息标识。没有读取真实账号、发送真实消息或验证平台送达。新增渠道、升级通信工具或接入真实账号后，应分别验证账号检查、读取预览、确认保存、具体消息发送和异常后的原平台核对；文档与模拟结果不能替代这些验收。


## 内置连接向导的本轮证据

`server/im-setup.mjs` 与 `src/communications/ImSetupWizard.tsx` 将安装检测、授权、服务状态与会话范围接入同一对话框。直接入口为 `#conversations/connect`。配置、读取和发送保持独立；未选会话不读取任何聊天。

20 项定向测试使用临时目录、合成账号和模拟 CLI，确认凭据不出现在状态／参数中、不会改动已有运行环境、示例空间不能连接、二维码按时失效，13 个渠道的配置字段与策略映射、写入失败后的锁释放，以及原有预览／提交／一次发送契约。真实平台授权和消息接收仍待按渠道验收。API 细节见 [连接向导接口](API.md#messaging-connection-setup)。
