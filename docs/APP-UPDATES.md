# 应用内更新

本页记录 macOS 更新的实现、交互和发布约定。v0.1.5 已于北京时间 2026-10-10 00:48:45 正式公开发布；隔离两版本升级、正式本机安装、生产签名和真实 feed 检查分别留证。正式 App 的原有「通用」设置与 Sparkle 窗口均确认 0.1.5 为最新版本。最新结果见 [公开交付记录](DEVELOPMENT.md#2026-10-10-v015-公开交付) 与 [发布说明](releases/v0.1.5.md)。

## 实现边界

更新引擎直接使用 [Sparkle 2.9.6 官方分发](https://github.com/sparkle-project/Sparkle/releases/tag/2.9.6)。SecondU 的 Objective-C++ / N-API 适配只转接标准更新窗口、可公开读取的状态和重启握手；下载、验签、解压、替换和重启由 Sparkle 处理。适配源码位于 `desktop/native/`，主进程白名单位于 `desktop/updater.cjs`。没有自行复制替换正在运行的 `.app`，也不要求用户关闭系统安全检查。

正式更新源固定为 `https://github.com/YunyueLi/SecondU/releases/latest/download/appcast.xml`。`desktop/native/updater-config.json` 保存此地址及 Ed25519 公钥，打包时写入 `SUFeedURL` / `SUPublicEDKey`。下载和安装始终由用户操作。Sparkle 自带的自动弹窗调度、自动下载和静默安装保持关闭；本轮另行接入主进程的信息检查：启动约 10 秒后、此后每 6 小时，仅在空闲且没有进行中的更新会话时调用公开 `checkForUpdateInformation`，发现版本后显示应用入口，不自动弹窗或下载。该 API 尊重用户跳过的版本，主进程不得重置跳过记录。开启 `SUVerifyUpdateBeforeExtraction`，关闭系统画像上报与更新说明中的 JavaScript。当前应用未启用 `SURequireSignedFeed`：HTTPS 保护传输，封包的 Ed25519 签名验证更新代码；不可把这写成整个 feed 已有密码学签名。完整后台检查周期及跳过保留尚未原生实测；发布后的手动检查已实际读取正式 feed 并确认当前版本。

私钥只由官方 `sign_update` 从专用 macOS Keychain 账户 `im.hither.desktop.local.sparkle` 读取，不放入仓库、环境变量、更新 feed 或日志，也不导出给 Node、前端或外部模型。公钥可以公开。首次安装包自身的来源验证、Developer ID / notarization 和后续更新封包验签是不同环节；当前本机构建使用 ad-hoc 签名，不由此宣称获得 Apple 公证。首次启用更新前的旧版本没有更新入口，需要手动安装首个具备更新功能的版本。

## 交互约定与参考依据

现有「通用」设置中的「应用更新」分组和 macOS 应用菜单提供检查入口，产品没有独立更新页面；进行中的更新通过同一原生窗口继续。无更新、版本领先于 feed、系统不兼容、网络失败、验签失败和不可安装位置须呈现真实原因，不能统一显示「已是最新版本」。下载取消、下载和安装操作保留 Sparkle 标准 UI。网页和开发环境不假装具备原生安装能力。

本轮参考来自本机 Codex **26.1002.52244** 安装包的静态前端代码：`app-initial` 中的 `dGo` 使用页脚蓝色圆形下载入口，展开侧栏中的圆点高 20 px、白色 Download 图标；悬停或键盘聚焦时以 220 ms 展开「更新」，下载时持续显示进度，准备完成后点击安装。折叠侧栏为 24 px 圆形入口，提示「有可用更新」。原代码仅在 ready / downloading / installing 显示。参考副本仅保留在忽略目录 `.local/updater/codex-reference`，不提交、分发或发给外部模型。工具限制不允许本轮操作 Codex 实屏；本机官方更新检查返回 up_to_date。这些证据证明静态机制和该次检查结果，不能写成已操作其更新窗口。

SecondU 采用该入口的位置、视觉和聚焦展开方式，同时明确保留首轮适配：由于采用手动下载，**发现更新但尚未下载的 available 状态也显示入口**，点击打开 Sparkle 窗口，由用户开始下载。ready 对应可继续安装；下载、解压、准备重启等活动状态映射为可恢复原生流程的入口。它不与 Codex 的 phase 值逐项同义，也不宣称逐像素复刻或使用 Codex 更新引擎。

最初适配只有下载阶段通知，侧栏仅显示活动指示；本轮追加公开 `SPUStandardUserDriver` 小子类，用 `showDownloadInitiatedWithCancellation:` 重置计数、`showDownloadDidReceiveExpectedContentLength:` 接收总量、`showDownloadDidReceiveDataOfLength:` 累计真实增量，每个方法继续调用 `super`，保留 Sparkle 的标准窗口和取消逻辑。预期长度为零、缺失或非法时使用活动指示，不按时间猜测百分比。该方式通过公开 `SPUUpdater` 初始化器接入，取代薄标准 controller 包装，不改造下载器或安装器。2026-10-10 的隔离原生窗口已显示真实下载字节，完整传输由本机服务回执核对；本轮未同时对照侧栏百分比与原生窗口，前端合成百分比也不能替代该项验证。主进程只向前端传递版本、阶段、能力开关、时间、合法字节数量与经整理的错误；原生重启 token、安装回调、路径、原始错误对象和任何任务内容不进入前端更新状态。

## 安全退出

普通退出与更新重启共用 `desktop/quit-coordinator.cjs`。先检查所有编辑器的未保存／进行中状态；前端只返回 `{unsaved,busy}`，不传草稿正文或密钥。允许准备退出后冻结界面；可恢复的拒绝通过取消通知恢复交互。

退出保护在应用入口根部注册，覆盖启动中、启动错误及工作区。macOS 红色关闭按钮隐藏并保留窗口与草稿；重新激活应用恢复同一个窗口。真正退出与更新重启仍须完整握手。关闭资源后发生不可恢复的失败时，主进程保留失败状态并禁止重开服务；启动重试也不得覆盖仍存活的自有后端引用。跳过某一更新会清除该版本的提示，后续静默检查继续尊重 Sparkle 的跳过记录。

后端的 `server/update-lifecycle.mjs` 仅接受其可信父进程 IPC，没有网络退出接口：

| 阶段 | 行为 |
| --- | --- |
| `second-u:prepare-quit` + requestId | 同步冻结 HTTP、委派服务与 OAuth 回调的新请求，暂停定时调度；先排空已接纳请求，再检查主空间、已加载和未加载子空间。未加载空间只读 SQLite，不启动恢复流程。 |
| `second-u:quit-readiness` | 只返回 requestId、ready、数量和原因。运行／等待授权的本地任务、委派调用、未结束或执行器仍未确认的远端任务，以及未结束的连接操作均阻止退出。准备成功仍保持数据库和监听器打开。 |
| `second-u:commit-quit` | 同步复查任务状态，进入 closing，等待所有子空间、连接、runner、监听器与数据库关闭，完成后退出 0。宿主必须观察真实子进程退出，不能仅依据 ready 退出。 |
| `second-u:cancel-quit` / 准备超时 | commit 前释放冻结。排空期限与准备成功后的租约各为 10 秒；父进程等待期限为 15 秒。超时不强杀任务或后端。 |

关闭资源不是可回滚事务；commit 后失败或超时必须保持错误／冻结状态，不能把部分关闭的服务恢复成正常工作区。实际关闭错误返回 `shutdown_failed`、`recoverable:false`。更新不能接管并关闭一个由其他实例拥有的复用后端。Sparkle 重启 continuation 只在主进程完成安全退出确认后调用，同一 token 只消费一次；所有宿主退出仍须经过最终的 `before-quit` 检查。

## 构建与封包顺序

1. 完成本轮源码、类型、构建与对应界面检查；将 release version 固定到根包、原生 bundle 和 runtime 的一致值。
2. `desktop/build-updater.mjs` 根据 `desktop/native/vendor-lock.json` 下载并校验固定版本归档，重新解出 Sparkle 和 Node headers，编译本机 N-API 适配。构建依赖 macOS、Xcode Command Line Tools 和 SDK。
3. 保留 Sparkle 原始 framework 字节、权限与符号链接，嵌入 `Contents/Frameworks/Sparkle.framework`；写入已编译的适配、资源、许可证和最终 Info.plist。
4. 由内向外签署自有适配与 Electron 代码，再签外层应用；保留官方 Sparkle helpers 的签名和 entitlement，不递归覆盖它们。用严格验证与 framework 清单核对复制、签名前后的完整性。
5. 以保留符号链接的方式封装同名 `SecondU.app`，并在发布前完成对应构建的原生验收及独立解压检查。可使用官方建议的 `ditto -c -k --sequesterRsrc --keepParent`；输出名固定为 `SecondU-vVERSION-macos-arm64.zip`。封包后不再修改 app、包内文档、版本或 ZIP 内容。事后验收与发布回执只追加到源码文档，保留包内文档的封包时点。
6. 用下述脚本签署最终 ZIP、生成 appcast，并保存返回的字节数和 SHA-256。脚本不发布 Release，也不修改 ZIP。签名后若改动封包，必须重新验收和签署。

```sh
node scripts/generate-appcast.mjs \
  --zip out/SecondU-v0.1.5-macos-arm64.zip \
  --output out/appcast.xml \
  --version 0.1.5 \
  --release-notes docs/releases/v0.1.5.md \
  --published-at 2026-10-09T00:00:00Z
```

这是参数格式示例，不代表示例日期已有发布。实际执行前使用最终发布说明与日期，输出目录必须已存在且目标 `appcast.xml` 不存在。可用 `--account` 选择明确的专属 Keychain 账户，但对应公钥必须匹配应用。脚本拒绝自定义下载域名、私钥文件或私钥参数、版本与文件名不一致、非法说明文本、变化的 ZIP 和覆写已生成 feed。先核验固定官方归档及其 `sign_update` 字节，原生工具只输出签名；脚本再对嵌入公钥验签，记录 ZIP 大小／SHA-256，写入固定 GitHub asset URL、版本和 arm64 要求。最低系统版本复用构建脚本的 `minimumMacOSVersion`，目前生成 13.0.0。说明使用 Sparkle 2.9 支持的内嵌 Markdown，XML 转义后写入。生成器属于源码发布工具，不随应用承担周期检查或下载任务。

正式发布应先在同一受审 Release 中准备最终 ZIP、`SHA256SUMS` 和 `appcast.xml`，再核验实际公开下载的字节、签名与版本。更新 feed 的 latest 地址只指向已发布且被标为 latest 的 Release；公开前的 404 或当前 feed 尚未包含候选版本不代表新实现已经升级成功。不得把私钥、参考安装包源码、`.local` 日志、个人数据或测试 feed 加入公开资产。

## 验收清单与当前证据

已完成的退出专项覆盖慢 POST 请求体、子空间转发、全部空间任务检查、等待审批、不确定远端执行、独立委派入口、定时调度暂停／恢复、OAuth 过期回调收尾、取消与超时、失败后保持冻结，以及真实 fork 的 prepare 存活和 commit 后退出。已有 backend、delegation、remote、spaces、execution-policy、connector 回归保留各自范围；不要把专项数量累计为一次整套运行。

appcast 的模拟签名测试验证固定 URL、摘要／长度保留、XML 转义、非法参数、签名期间文件变化和禁止覆写。测试未接触 Keychain，不能替代正式 ZIP 签名或 Sparkle 实际验签。官方许可证已逐字节复制到 [Sparkle-2.9.6.txt](licenses/Sparkle-2.9.6.txt)。

2026-10-10 已补录以下隔离原生验收。测试使用独立 bundle、资料目录、签名账户与 loopback feed；两个版本都内置本轮 updater，测试的 0.1.4 标签不代表历史已发布 0.1.4 具有更新能力。

| 实测范围 | 结果与证据边界 |
| --- | --- |
| 错误签名 | App 完整下载测试归档后，Sparkle 明确提示签名无效并拒绝更新；关闭提示后旧版本 0.1.4、严格签名、合成任务、成果两版本与文件字节保持。 |
| 侧栏入口与有效下载 | 主窗口侧栏底部实际出现蓝色 Download 图标；由该图标打开标准 Sparkle 窗口，观察到 `9.5 MB / 223.2 MB`。服务回执确认传输 223,224,768 字节，未以合成状态代替下载。 |
| 草稿拒绝与再次尝试 | 未发送的合成草稿阻止更新重启，正文保留；只清空该自建草稿后，通过「重启完成更新」继续，App 实际退出并自动运行 0.1.5。旧后端进程退出、新进程与新 runtime 身份通过核验。 |
| 数据保留与无更新 | 升级后任务记录、成果两个版本及文件字节与基线一致，实际任务界面可见第 2 版成果；菜单再次检查显示测试 App 的 0.1.5 为当前最新版本。随后普通菜单退出成功，测试服务已结束。 |

本机证据位于忽略目录 `.local/updater/acceptance/` 的 `native-install-acceptance-20261010.json`、`verified-0.1.4.json` 和 `verified-0.1.5.json`；原生操作由主验收会话完成，独立审计核对版本、进程、签名和持久化文件。生产冻结包基于 `2cef8a6`，其源码／原生桥／主进程／更新及退出逻辑与隔离验收对应；隔离包未包含最后一项反馈保存期间禁用输入的前端修复，因此两者不宣称字节相同。

冻结 ZIP 为 **223,094,255 字节**，SHA-256 为 `79a34b04852520dab05c446192496ab993507eb7646acd0270ce5a4f4493e72f`。源 app 和独立解压 app 均通过严格签名；2,521 个目录项（2,042 个文件、23 个符号链接）逐项一致，348 个 Git 源文件匹配冻结提交，官方 Sparkle 签名树保持。生产 feed／公钥和 HTTPS 限制核对通过，未发现测试传输例外、测试公钥、私钥块或私人运行路径进入包。独立空资料后端启动、文档访问边界、prepare／commit 与真实退出 0 通过。审计留在 `.local/updater/release-candidate-2cef8a6/`。

最新完整本机源码检查为 **775 项：765 通过、10 项既有环境条件跳过、0 失败**；最后的反馈表单修复另通过类型检查和 5 项相关检查，并已进入冻结包。[CI 37913866982](https://github.com/YunyueLi/SecondU/actions/runs/37913866982) 在相同提交的 macOS 和 Ubuntu 均成功。专项、完整本机检查和 CI 不相加计数。

尚未由本轮原生操作覆盖：侧栏与原生百分比同步对照、浅／深色及折叠／键盘组合、完整后台检查周期与跳过保留、断网及其他网络失败、活动任务阻止重启、不可写安装位置／权限错误。活动任务和异常退出已有源码及真实子进程专项，但不写成原生 UI 实测。正式 App 已安装并启动且既有领域记录和成果文件比较无差异；实际「设置 → 通用」显示原有页面内的更新分组。发布后由该分组检查正式 HTTPS feed，Sparkle 确认 0.1.5 为最新版本；关闭提示后，设置同步显示「检查更新」「已是最新版本」及上次检查时间。发布前的 404 曾真实显示连接错误，该历史过程留在开发记录中。

[v0.1.5](https://github.com/YunyueLi/SecondU/releases/tag/v0.1.5) 已正式公开并标为 latest，标签指向 `2cef8a6`；对应 [CI 37960044495](https://github.com/YunyueLi/SecondU/actions/runs/37960044495) 和 [Product website 37960044610](https://github.com/YunyueLi/SecondU/actions/runs/37960044610) 成功。官方 `sign_update` 从 Keychain 签署正式 ZIP，独立 Ed25519 验签通过，私钥未导出且系统授权未绕过。三项上传资产的大小与平台 SHA-256 匹配冻结文件；匿名 HTTPS 实际下载的 ZIP、latest feed 和校验文件亦匹配，生产公钥对公开 ZIP 的独立 Ed25519 验签通过，feed 的版本、架构、最低系统要求和资产地址均核对一致；详细资产表见 [发布说明](releases/v0.1.5.md#公开发布)。Dock 只保留标准安装入口，其余固定项和偏好不变。封包和公开资产保持不变，发布回执仅追记源码文档。

本轮已用本产品的合成状态截图和对应差异运行 Kimi K3 max 视觉辅助复核，反馈未发现截图范围内的阻断问题。采纳展开侧栏减少重复 tooltip、字号跟随产品设置两项建议；保留已核对的 Codex 下载图标约定。该合成页只用于开发验收，未进入产品路由或封包；它不证明原生升级成功。Codex 安装包参考代码及个人资料未提交给该复核。

官方接口和发布规则：[Sparkle API](https://sparkle-project.github.io/)、[集成指南](https://sparkle-project.org/documentation/)、[发布更新](https://sparkle-project.org/documentation/publishing/)、[签名要求](https://sparkle-project.org/documentation/code-signing/)。
