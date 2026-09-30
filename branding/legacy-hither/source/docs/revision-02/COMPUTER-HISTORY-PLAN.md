# 电脑历史：Dev 演示与正式采集计划

2026-09-29。用户明确调整本轮范围：电脑历史实现复杂，允许先做 Dev 前端完整交互，参考 OpenAI Codex CLI 公开代码。**原生采集计划已停止，本轮不写 Swift、不启动后台采集、不读取用户历史事件、记忆原文或键盘内容。** Hither 自己的任务活动可按真实记录展示；虚构电脑活动必须独立标注 Dev，不能借此声称已经观察过用户的电脑。

## 公开源码核查结论

本机只有已安装 CLI 与桌面资源，没有在本次有限路径检查中找到对应采集源码。随后只读获取官方 `openai/codex`，固定 commit `c248f6d48b97eb4a2aa56147a0b11b7d763278b9`，Apache-2.0。未安装依赖、构建、运行或反编译桌面程序。

核查完整文件树，并检索 `codex-rs/memories`、`app-server-protocol/src`、`app-server/src`、`ext`、`docs` 中的 `skysight / chronicle / computer history / interaction event`：**没有找到 Skysight 的 macOS 事件采集、10 分钟事件分段、系统权限控制或完整桌面历史界面实现**。发现 Chronicle 名称只出现在扩展资源保留／清理测试，不是采集器。这是固定版本和所查目录的结论，不宣称所有历史分支或其他私有仓库都没有。

公开代码可借鉴以下接口，不能等同桌面 Computer History 全部开源：

| 公开机制 | 准确来源 | 能借鉴什么／不能证明什么 |
|---|---|---|
| App Server thread/turn/item 协议 | [common.rs](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/app-server-protocol/src/protocol/common.rs#L557)：`thread/list`、`thread/read`、`thread/resume`、`turn/start`、`turn/interrupt`、`item/started`、`item/completed` | 建立 Hither 自己任务执行的可追溯活动；不是读取其他 App 活动的 API |
| 两阶段记忆 | [memories/README](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/memories/README.md)：rollout 提取，结构化 raw_memory/rollout_summary，脱敏、租约、重试退避、全局合并 | 参考事件摘要与长期记忆分层、去重和更新；输入主要是 Agent 对话 rollout，不能直接充当电脑行为采集 |
| 扩展摘要资源 | [prune.rs](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/memories/write/src/extensions/prune.rs)：扩展 instructions.md 与 resources/Markdown 的清理 | 可以定义外部摘要来源与保留策略；不会帮我们产生原始行为事件 |
| `memory/status` | [memory.rs](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/app-server-protocol/src/protocol/v2/memory.rs)：`minConsolidatedThreads`→`v2ConsolidatedThreads/v2Ready` | 是记忆就绪状态，不是电脑历史查询／采集接口，且标 experimental |
| ComputerUseConfig | [computer_use_config.rs](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/app-server-protocol/src/protocol/v2/computer_use_config.rs)：默认访问策略、macOS bundle_ids、Windows app/exe 条目 | 借鉴来源权限表达；这是计算机操作权限配置，不是历史收集器实现 |
| TUI ComputerActivityCell | [computer_activity.rs](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/tui/src/history_cell/computer_activity.rs) | 将本次 CUA 工具调用按 call ID 分组、保序和恢复展示；名字有 Computer Activity，内容仍是工具调用 transcript，不能当跨 App 电脑历史 |

[OpenAI 官方 Computer History 文档](https://learn.chatgpt.com/docs/customization/computer-history) 则描述桌面 macOS 的独立能力：用户主动启用、允许来源的交互事件与辅助功能上下文、周期摘要和本地 Markdown、暂停和清除；不以截图／录音组成历史。官方页面提到的本地收集、远端摘要和保留方式仅是该产品的行为，**不是 Hither 当前行为，也不是默认授权我们读取或上传它的数据**。

离线核验文件：`.local/research/codex-history-sources/manifest.json`（6 份关键官方源码／文档及 SHA-256），稀疏官方源码在 `.local/research/codex-public/`。没有读取本机 `memories/extensions/skysight/resources` 的私人内容；没有调用 Computer History 工具抓历史。

## 本轮 Dev 合同

由 `ComputerActivityDemo` 展示虚构应用活动、日期／来源过滤、摘要、展开详情、选择上下文，以及暂停／删除的模拟状态。顶部持续标记 Dev，首次简短说明“虚构电脑活动，仅用于体验流程”；演示状态不进入真实来源、正式事实、自动化、系统权限或后台任务。前端演示不声称已进行原生采集、云端分析或真实删除用户记录。

本文件记录授权和边界；实际实现及交互验证由对应任务完成后记入 [ACCEPTANCE](ACCEPTANCE.md)，不能以此文档代替验收。用户另授权工具与账户、电话／邮箱／钱包及餐厅扫码先完整展示 Dev 交互，真实服务另列计划；这些同样不能混进真实资产或外发消息。

## 后续正式采集接口建议（尚未实现）

将采集、摘要、事实分开，协议独立于 Codex 私有桌面服务：

- `CollectorStatus`：`enabled / paused / permission_required / error`，授权版本、上次采集时间、可读错误；明确请求的是辅助功能、浏览器扩展或其他具体能力。不给权限仍能使用手动导入和已有 Hither 活动。
- `Observation`：`id, deviceId, sourceApp, sourceUrl?, startedAt, endedAt, eventKind, permittedText?, contentHash, permissionRevision, demo:false`。默认只存必要上下文，不记录密码、安全输入、隐私浏览、未授权 App；无法可靠判断时跳过。浏览器 URL 不存 token/query 密钥。
- `ActivitySummary`：`id, windowStart, windowEnd, title, summary, appIds, observationIds, sourceHashes, processingStatus, revision, modelProvenance?, demo`。摘要需能回到来源窗口，重复窗口幂等；失败保留明确状态，不伪造成功摘要。
- `GET /activity/summaries?from&to&appId&cursor`、`POST /activity/summary-preview {observationIds}`、`POST /activity/context-selection {summaryIds,expectedRevisions}` 为建议接口。选择摘要只加入本次上下文；正式记忆／事实需独立确认，网页内容不能授予权限。
- `DELETE /activity/window` 在用户选择具体范围后删相关原事件、派生摘要、索引和引用缓存；删除后不可继续重建同一段历史。保留策略、暂停、排除规则可查看；修改规则只影响未来采集，清旧数据需明确操作。

正式引入前应先做本机最小采集，逐 App 许可，可见运行状态和一键暂停；诊断日志只存计数/状态，原文默认不出机。若需要外部模型摘要，先明确模型、目的、发送范围和保留策略，复用数字分身资料隐私规则；本轮 Dev 授权不包含这些真实采集和外传。

验收至少包含：拒绝权限→真实空态；切换 App 排除即时生效；私密输入不采；重复窗口不重复摘要；中途退出可恢复且不重复写；原事件与摘要区分；纠正保留版本；删除范围连带派生记录；Dev 数据永不混入真实上下文。
