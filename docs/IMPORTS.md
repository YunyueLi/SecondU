# 联系人记录文件导入

SecondU 聚合用户主动选择的聊天导出文件。当前没有接通微信、Instagram 或 WhatsApp 账号，也不读取、解密平台私有数据库，不自动抓取消息或媒体。导入记录是来源证据，不会自动成为已确认认知；Agent 私聊和群聊保存在独立的 `agentRooms` 中，不混入外部联系人记录。

## 支持范围

| 选择的平台 | 当前可读取文件 | 未接入 |
| --- | --- | --- |
| 微信、企业微信、QQ、钉钉、Teams、Discord、Signal、LINE、Messenger、iMessage、WhatsApp | `hither.chat.v1` 规范 JSON | 账号连接、平台私有导出或加密数据库 |
| Slack | 规范 JSON；解压后的单频道消息数组，或 `{channel, messages, users?}` | ZIP 自动拆包、读取账号、跨频道猜测合并 |
| 飞书 | 规范 JSON；用户已保存的消息列表 JSON（`data.items` 或 `items`） | 调用 API、自动翻页、附件下载 |
| Telegram | 规范 JSON；Desktop 单会话 JSON 或 `result.json` 的 `chats.list` | 在线同步、附件下载 |
| Instagram | 规范 JSON；原生 `message_*.json` 的 participants/messages/title/thread_path | 账号登录、附件下载、平台发送 |
| 通用 | `hither.chat.v1` 规范 JSON | 任意 JSON 的自动猜测或执行 |

每份 UTF-8 文件最多 1 MiB，整个 HTTP JSON 请求最多 2 MiB。每文件最多 500 人、200 会话、10000 条消息；单条正文最多 30000 字符。预览每会话显示前 50 条，计数与导入仍包括全部有效消息。带 BOM 的 UTF-8 JSON 可读，原始文本不被改写。

## 规范 JSON

以下只有虚构测试内容；标识不要求是真实账号，但同一账号后续导入必须保持稳定。`people.id`、会话 `id` 与消息 `id` 应来自导出系统的稳定标识，不能使用每次变化的序号。消息时间必须包含时区。正文按原样保留，包括空格、换行和原文中的标点。

```json
{
  "format": "hither.chat.v1",
  "platform": "wechat",
  "accountId": "fictional-account",
  "people": [
    { "id": "self", "name": "示例本人", "isSelf": true },
    { "id": "friend", "name": "示例朋友" }
  ],
  "conversations": [
    {
      "id": "example-chat",
      "title": "虚构的会话示例",
      "kind": "direct",
      "participantIds": ["self", "friend"],
      "messages": [
        {
          "id": "example-message-1",
          "senderId": "friend",
          "text": "这是格式示例，不是真实私人记录。",
          "time": "2026-09-29T10:00:00+08:00"
        }
      ]
    }
  ]
}
```

`kind` 可为 `direct` 或 `group`，省略时按参与人数选择。所有发送人必须列于该会话 `participantIds`，所有参与人必须存在于 `people`。`isSelf` 只保留“导出中的本人”角色，不据此合并或覆盖 SecondU 当前个人资料。若原文件没有 `accountId`，用户可在预览请求中提供；两个值均存在但不一致时拒绝导入。两处均未提供时使用文件摘要隔离，预览会明确提示，这样无法跨文件自动增量合并。

Instagram 原生导出按 `sender_name` 和参与人名称建立文件身份，`timestamp_ms` 转为带时区时间。缺少平台消息 ID 时，使用发送人、时间、内容与附件字段的摘要去重；完全相同的导出记录无法区分两次独立发送。同名人物不证明为同一真实身份。附件只显示未下载提示，完整字段留在原始来源中。

## 预览与提交 API

1. `POST /api/imports/chat/preview`，正文 `{platform, filename, content, accountId?, conversationId?}`。返回 `ChatImportPreview`，包含 `previewId`、SHA-256、会话样本、参与人、总量/新增量/重复量、警告和有效期。预览不写入正式来源、人物、会话或认知；临时预览仅保存在当前本机 SQLite，30 分钟后失效，最多保留 20 份，后续预览时清理过期记录。
2. 用户核对后调用 `POST /api/imports/chat/commit`，正文 `{previewId}`。返回 `ChatImportResult`，含 `importId`、`sourceId`、`conversationIds`、实际新增量和 `alreadyImported`。提交重新检查当前数据库并在 SQLite 事务中完成；失败不会部分写入。

完整类型在 [shared/contracts.ts](../shared/contracts.ts)。此 API 不代用户授予外部发送、上传或账号访问权限。导入会触发现有已启用的本地 `source_import` 自动化；其任务仍保留模型配置检查、审批和在途防重叠规则。

## 幂等与来源保真

- 人物、会话按“平台、账号、外部标识”稳定映射；消息再加会话标识。不同平台和不同账号不自动合并同名联系人。
- 同一文件摘要在同一平台/账号重复提交不会重复新增。增量文件只补充新消息；重叠消息保留首个 `sourceId`，在 `sourceIds` 追加这次来源，不抹掉旧来源。
- 同一消息 ID 如出现不同正文、发送人或时间，返回 `409 import_conflict`，不选择其中一个覆盖。错误参与人、日期、超限或不支持的格式返回明确错误。
- 原始文件正文保存为 `Source.text`；`Source.import` 保存平台、账号标识、文件名、SHA-256 与导入时间，`demo=false`。导入的 Conversation 保留平台、账号和外部会话标识。来源 PUT 和导入会话 PUT 返回 `405`；纠正应另存反馈来源。
- 人物姓名或描述的既有用户修改不会被后续文件覆盖；新增来源只追加到人物来源列表。不推断关系，不自动确认事实，不下载附件。

## Agent 会话 API

`Bootstrap.agentRooms` 提供独立的 Agent 私聊/群聊。`POST /api/agent-rooms` 接收 `{kind, agentIds, title?, mode?, projectId?, digitalTwinEnabled?, connectorIds?}`；默认 `demo`，私聊恰好 1 个 Agent，群聊 2–12 个。`GET /api/agent-rooms/:id` 读取，`PUT` 修改标题、成员或配置；运行及待批准期间返回 `409 room_busy`，queued／needs_input 时仅允许模式、数字分身和连接器配置变更。数字分身字段缺省保留旧行为，明确 `false` 不注入个人认知。

`POST /api/agent-rooms/:id/messages {content, contextFactIds?, digitalTwinEnabled?, connectorIds?, attachmentIds?, recipientIds?, replyToMessageId?}` 返回 `{room, task}`，建立并启动真实持久任务。未在消息中指定数字分身和连接器配置时继承会话；指定成员必须属于该会话，引用消息必须存在于该会话。每条用户消息、Agent 输出都带 `taskId`，Agent 输出另带 `agentId`；后续通过 `/tasks/:id/message` 的补充也会同步回会话。缺密钥只产生 `needs_input`，不会生成伪造回复。演示内容明确标注不调用模型，写文件仍需审批。

`POST /api/agent-rooms/:id/tasks {prompt, contextFactIds?, digitalTwinEnabled?, connectorIds?, attachmentIds?, recipientIds?, replyToMessageId?, run?}` 从会话派生任务；默认 `run=false`，任务先 `queued`，由用户启动。审批、取消和继续沿用 `/tasks/:id/approval`、`cancel`、`run`；`activeTaskId` 指向 `queued/running/awaiting_approval/needs_input` 的待处理任务。有待处理任务时不另建重复任务；`needs_input` 的补充应使用原任务消息接口。任务保存本轮成员和有限会话历史快照，历史不能授予权限。关联会话的任务禁止直接删除，避免审批与对话链断裂。

## 虚构示例升级

版本 2 示例包含 22 人、13 个联系人会话/123 条消息、33 条关系、18 个时间轴事件、6 个 Agent 和 4 个 Agent 会话。所有新增来源和示例会话明确标记虚构；预置 Agent 会话只有系统说明，没有伪造的执行回复。

升级仅在 `profile.demo=true` 的空间运行，以固定命名空间追加缺少的记录并保存迁移版本。不会覆盖已有记录，不改旧任务、正式来源或用户修改，不向正式空间补示例，不在重启时反复恢复已删除示例。


## 新增原生格式的边界（2026-09-29）

- Slack 的消息 ID 使用完整 `ts` 字符串，时间转换不改变 ID。原生数组通常不含频道 ID，需要在界面填写稳定 `conversationId`，避免同日期不同频道误合并。可选 `users` 只用作名称映射；未提供时显示平台用户 ID。线程与编辑字段完整保留于来源，不把旧内容覆写成新事实。
- Telegram 从 Desktop 导出的 `date_unixtime` 读取时间；`text` 字符串或文字片段数组合成可读正文。可见参与者只包含文件中的发送人。附件/服务事件没有正文时明确标注，原字段仍在来源。
- 飞书解析 `message_id/chat_id/sender.id/create_time/msg_type/body.content`。正文只直接显示 `text` 类型，其他类型提示查看来源；`has_more` 提示还存在后续页。这里读取的是用户保存的 JSON，不是产品连接飞书获取记录。
- 18 个来源选项代表来源标记与上述文件支持范围，不等于账号连接。邮件和短信接受规范 JSON 文件，分别显示邮件与短信标识；不读取邮箱或手机，也不假定已具备发送能力。图标全部本地提供；微信、QQ、飞书、企业微信、钉钉、Slack、Teams、Telegram、Discord 等已使用各自品牌图形，Signal 等保留对应本地图标。新增彩色 SVG 的固定版本、摘要、改编说明与许可见 `src/cognition/platform-icons/sources.json`，原有资源说明见 `public/icons/platforms/expanded-sources.json`。Lobe UI 资源按 MIT 保留许可，企业微信图形依据 Arcticons 的 CC-BY-SA-4.0 资源改编并保留署名及同许可说明。

格式参考于 2026-09-29 读取： [Slack 官方导出说明](https://slack.com/help/articles/220556107-How-to-read-Slack-data-exports)、[Telegram Desktop 官方 JSON 导出代码](https://github.com/telegramdesktop/tdesktop/blob/dev/Telegram/SourceFiles/export/output/export_output_json.cpp)、[飞书官方消息结构](https://github.com/larksuite/oapi-sdk-python/blob/v2_main/lark_oapi/api/im/v1/model/message.py)及[分页响应结构](https://github.com/larksuite/oapi-sdk-python/blob/v2_main/lark_oapi/api/im/v1/model/list_message_response_body.py)。飞书网页正文未被工具读取，字段核对使用官方 SDK 源码。实现有定向 fixture 测试，真实账号与私人导出不在本次验收范围。

联系人结构化画像说明见 [PERSON-PORTRAITS.md](PERSON-PORTRAITS.md)。导入仅补来源和原始会话，不自动补写画像判断。

## 实际浏览器验收补记（2026-09-29 晚间）

在独立 `demo-engineer-v4` 示例空间，通过真实浏览器选择虚构 `slack-fictional-contact.json`，填写稳定账号和频道标识，预览显示 1 个会话、2 条消息、2 位参与者与“尚未导入”。确认后进入新增会话，打开来源看到原始 JSON；会话列表由 15 增为 16，刷新后保留。随后仅修改其中一位虚构联系人的名称及画像，来源原文不变。

截图保存在本机忽略目录 `.local/revision-02/cognition-final-qa/slack-source.png`；画像保存、JSON 修订和重开证据见 [人物画像](PERSON-PORTRAITS.md)。这批实际覆盖 Slack 文件路径，没有连接 Slack 账号，也不能替代其他平台原生格式或私人导出的专项验收。
