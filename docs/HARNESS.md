# SecondU 的实际执行底座与身份边界

初始核查：2026-09-29；当前上下文与通信接入说明更新于 2026-10-01。本文区分代码已经实现的路径、纯本地验证和仍需真实提供方验收的行为。

## 产品身份

SecondU 是用户的个人 Agent，也是产品中所说的数字分身：依据用户确认的背景、偏好和目标持续协作，在授权内处理事务。它不会冒充用户本人，不会补造经历或承诺，也不宣称拥有完整终身记忆。命名 Agent 是这个体系中承担具体分工的角色。

实现统一在 [`server/identity.mjs`](../server/identity.mjs)。`baseInstructions` 明确产品身份，`developerInstructions` 限定证据、工具与授权范围；[`buildPrompt`](../server/runner.mjs) 每轮再次提供身份、当前消息及所选证据。原来的泛化 `personal agent` 描述不足以覆盖上游编码助手默认定位。此次改用 app-server 支持的明确基础指令，不更改工具协议、权限配置或审批处理。

数字分身开关控制个人上下文。`digitalTwinEnabled=true` 时，[`personalContextFor`](../server/personal-context.mjs) 根据本轮消息、显式引用、领域和用途，检索已确认认知与相关人物、关系、事件、目标、项目；条目保留各自状态。普通用途排除候选与推断，只有明确的核对用途单列未确认项。当前上限包括 32 条事实、8 位人物、12 条关系，实际还受合并字符预算限制；默认 20,000 字符，可设 4,000–40,000。结构化上下文与来源摘录分别分配预算，记录来源 SHA-256、版本、偏移和截断。`false` 时不注入个人档案或认知；旧任务继续兼容既有字段。

选择方式是确定性词项与显式引用，不是全库语义理解。新记忆导入复用同一机制：只有本人确认的条目进入常规检索，来源摘录限于被选中的条目；相邻未选记忆不会随整份文件进入提示词。相关协议见 [MEMORY-IMPORT](MEMORY-IMPORT.md) 与 [API](API.md#personal-context-and-task-feedback)。

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

## 按需团队执行（2026-09-30）

群聊默认继续使用已有回应规则。只有显式保存 `team: {leadAgentId}` 的群聊才进入负责人调度：宿主先启动指定负责人，负责人可以自行回答，也可通过 `team_delegate` 选择当前团队中的专家、明确分派任务，再用 `team_wait` 收齐结果。没有实际派发就没有专家执行节点；只在负责人收齐全部已派发节点后，才能把该轮标记完成。专家失败会保留为 failed，负责人可以报告已收齐的部分结果，不能把失败节点改成成功。

执行仍由 Codex app-server 承担，模型供应商独立于调度。现有 Responses、Chat Completions、Anthropic Messages 适配均保留；不会仅因 Kimi 等厂商名称禁用。连接缺少密钥或协议不受支持时明确报错，没有演示回退。未派发专家无需预先调用模型或验证密钥。

宿主限制每轮最多 8 个节点（含负责人）、最多 4 位专家同时执行。每位专家是临时执行节点，复用已选专家的身份与模型连接；不创建新的持久 Agent。专家在独立任务目录执行，接收明确分派文字、本轮选中的认知、附件和连接器，不自动复制或共享原项目目录。当前交付是有长度边界的文本结果；专家工作目录的文件不会自动合并进负责人项目，也不声称具备共享仓库合并能力。

负责人和专家沿用用户选定的审批策略；MCP 等已有逐次审批仍然生效。宿主只给负责人三个团队工具，且通过运行时配置禁用原生再次委派；先用 `config/read` 确认 `multi_agent` 与 `multi_agent_v2` 均关闭再启动。取消会传播至所有活跃专家、拒绝未决审批并等待运行时结束；失败负责人同样收停专家。重启保留旧执行树并标记未结束节点 interrupted，不自动重放。

持久记录在任务的 `teamRuns` 中，包含父节点、角色、分工、真实状态、结果／错误和时间。结果先脱敏再保留前 16,000 字符；工具响应与执行图通过 `resultTruncated`、`resultOriginalChars` 明确节选与脱敏后的原长度，负责人不能假定节选包含完整结论。普通 Codex 任务的原生 `collabAgentToolCall`、`subAgentActivity` 另记为活动事件；其子线程回复不替换负责人最终回复，也不自动变成已配置团队。记录这些通知不等于开放原生子线程的额外工具审批。

对应检查是 [`team-runs.test.mjs`](../tests/team-runs.test.mjs) 与 [`codex.test.mjs`](../tests/codex.test.mjs)：覆盖派发和收齐、角色白名单、并发／总量上限、并行审批、失败、取消、重启、Kimi／Anthropic 注入式适配，以及原生协作通知。2026-09-30 本机 Codex `0.158.0-alpha.2.1` 接受团队动态工具和禁用再次委派的配置，实际任务目录读写边界通过；在 `turn/start` 前中止，没有调用真实付费模型。模型自主分工质量、真实提供方工具调用及最终桌面执行图仍需分别验收。

## PDF 与桌面构建握手（2026-09-30）

### Office 原件与本机预览

DOCX／XLSX／PPTX 以真实字节保存、收集和下载，选定历史版本可通过本机 LibreOffice 转为 PDF，再交给同一阅读器。没有安装转换器时明确显示不可用，原件仍可下载，不自动安装或上传第三方。

ZIP 容器检查覆盖路径、重复成员、CRC、压缩与解压大小、宏类型和主文档类型；收集前检查解压后的内容是否含凭据。预览另拒绝外部关系、嵌入对象及主动加载数据的结构，转换使用临时独立 profile、禁用宏／链接、20 秒超时与清理。这些是文件内容与进程边界，不声称有操作系统级网络沙箱。

2026-09-30 [`office-artifacts.test.mjs`](../tests/office-artifacts.test.mjs) 定向检查 7 项通过，1 项本机转换按环境开关运行；另在已安装 LibreOffice 上实际完成三种合成 OOXML 转换。随后用 python-docx、openpyxl 和 python-pptx 生成标准库文件，三份原件均转换为真实 PDF，覆盖合法的包内根路径引用。隔离验收服务的三种原件逐字节下载一致，DOCX 两个历史版本产生不同 PDF。这里只使用明确标示的合成文档，不读取私人文件；复杂文档保真与新版桌面包验收另行登记。

[`PdfPreview`](../src/artifacts/PdfPreview.tsx) 使用本地 PDF.js 单页画布，支持翻页、适宽、缩放和错误重试；切换文件或退出时取消绘制并销毁加载任务／worker。输入字节复制后交给 worker，保留原始下载内容。大页绘制上限为 16 MP，PDF 阅读器延迟加载。仅凭文件名、说明文字或通过 PDF 头检测不能宣称渲染成功。

本轮 `artifact-format.test.mjs` 与 `artifact-pdf.test.mjs` 合跑 8 项通过，覆盖两页不同尺寸 PDF 的真实解析、文字读取、非空画布像素、原始字节保留和损坏文件拒绝；TypeScript 与生产构建通过。旧生产服务曾因 `.mjs` MIME 不正确而阻止 worker，已修正。2026-09-30 根任务在 58646 新服务实屏确认本地合成单页 PDF 的 1/1 页画布和文字正常显示，原始字节下载也已通过。此浏览器结果仅覆盖该预设 PDF，不代表任意 PDF 保真或新版原生包已验收。

[`runtime-revision.mjs`](../server/runtime-revision.mjs) 在后台启动时固定构建指纹；[`desktop/main.cjs`](../desktop/main.cjs) 按应用、版本、资料空间和指纹完整握手。旧服务不被终止、不被冒充为新构建。`startup.test.mjs` 与 `runtime-revision.test.mjs` 合跑 10 项通过，包括真实 HTTP 健康响应、旧 listener 保持运行、开发／打包同内容同指纹、代码和前端入口变化，以及私人资料不参与指纹。新包是否实际使用对应服务仍需启动后核对。

完成打包并打开应用后，可在项目根目录运行以下只读检查。它输出实际包路径和每个候选端口的匹配状态；只读取包文件、资料目录路径及健康响应，不读取资料内容、不关闭进程。`matches` 证明该端口的握手信息匹配，窗口实际加载地址仍需单独核对。

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const packagedRoot = fs.realpathSync('out/SecondU.app/Contents/Resources/app');
const manifest = JSON.parse(fs.readFileSync(path.join(packagedRoot, 'package.json'), 'utf8'));
const { computeRuntimeRevision } = await import(pathToFileURL(path.join(packagedRoot, 'server/runtime-revision.mjs')).href);
const revision = computeRuntimeRevision(packagedRoot);
const dataDir = process.env.HITHER_DATA_DIR || path.join(os.homedir(), 'Library/Application Support/Hither/data');
const spaceId = fs.existsSync(dataDir) ? createHash('sha256').update(fs.realpathSync(dataDir)).digest('hex').slice(0, 24) : null;
console.log({ packagedRoot, expectedRevision: revision, expectedSpaceId: spaceId });
for (const port of [58645, 58646, 58647, 58648, 58649]) {
  try {
    const health = await (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) })).json();
    const matches = health.status === 'ok' && health.application === manifest.name && health.version === manifest.version && health.revision === revision && spaceId !== null && health.spaceId === spaceId;
    console.log({ port, matches, revision: health.revision, spaceId: health.spaceId });
  } catch { console.log({ port, matches: false, health: 'unavailable' }); }
}
NODE
```


## 通信运行环境与授权（2026-10-01）

[`ImSetupService`](../server/im-setup.mjs) 提供运行环境、账号授权、指定会话三步连接向导。SecondU 管理的环境位于当前空间的 `im/openclaw/`，使用固定版本 OpenClaw 2026.9.7，按渠道安装固定版本官方插件。13 个渠道的授权字段、系统条件和读取／发送范围分别列于 [COMMUNICATIONS.md](COMMUNICATIONS.md#授权方式与安装条件)。安装由明确按钮触发，校验版本与 npm 完整性记录，不改系统 Node.js 或全局 OpenClaw。其 Node 要求独立于 SecondU 主服务：24.16+ 的 24 系列，或 26.1+。

已有 OpenClaw 只作版本检测、渠道清单和用户要求的检查／消息调用，配置使用只读标志；SecondU 不替它登录、改凭据、安装插件或控制服务。受管配置保存在权限为 0600 的文件中，关闭自动回复与私信／群聊触发，不继承模型 Key。令牌不会进入命令行或 API 状态；WhatsApp 仅临时显示二维码矩阵，过期或结束即从内存清除，原始 CLI 输出不返回前端。

通信服务使用应用持有的前台子进程、独立配置和本机空闲端口，不安装系统守护进程。关闭或取消只停止本次持有的进程。运行进程不等于账号在线：账号必须通过结构化探测，读取再进入已有预览与明确保存流程。发送继续要求完整草稿复核和一次性确认。

本轮 `im-setup.test.mjs` 与 `im-cli.test.mjs` 共 20 项本地模拟检查通过，覆盖固定安装、凭据隔离、既有配置边界、13 渠道配置、写入失败恢复、候选连接、二维码、取消、重启、消息预览和回执。未安装真实平台插件、未登录或发送到真实账号；平台认证、消息权限和长期连接分别待实际授权验收。官方依据：[渠道 CLI](https://docs.openclaw.ai/cli/channels)、[固定版本源码](https://github.com/openclaw/openclaw/tree/v2026.9.7)、[MIT 许可](https://github.com/openclaw/openclaw/blob/v2026.9.7/LICENSE)。


## 个人上下文冷启动与对外读取（2026-10-01）

本地记忆导入支持主动选择文件或粘贴摘要，并在同层向导中逐条修正、明确确认、准备真实任务。普通 commit 仍只保存候选；独立 review 在一次事务中保留原文、候选第 1 版和确认第 2 版，幂等绑定完整核对内容。来源保留行号／JSON Pointer、哈希和修订。最后一步只打开现有 composer 并携带确认条目，发送前不调用模型。重复导入不覆盖后来的确认与纠正。已确认条目才进入常规任务；导出包保留状态、版本和简短证据，不包含完整聊天库或执行权限。

对外使用采用独立的只读 stdio MCP 服务。用户选择已确认条目、保存固定版本快照，再明确启用默认关闭的客户端授权；新导入或后续修订不会自动扩大授权。官方 SDK 提供协议，SecondU 负责条目、预算、路径、快照完整性与撤销边界。每次调用重读授权，禁用后阻止下一次读取，无法撤回已交给外部客户端的内容。

当前通过真实 SDK client→本地 stdio server、HTTP 授权与隔离依赖复制测试，以及记忆导入测试；未连接实际 Claude／Cursor 会话，也未据此验证外部模型的个性化质量。配置与精确范围见 [MEMORY-IMPORT](MEMORY-IMPORT.md) 和 [INTEROPERABILITY](INTEROPERABILITY.md)。
