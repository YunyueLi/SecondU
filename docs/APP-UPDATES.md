# 应用内更新

SecondU 从 v0.1.5 起提供 macOS 应用内更新。本页说明更新入口、安全机制与源码构建约定；版本变化和下载信息见 [发布说明](releases/v0.1.5.md) 与 [GitHub Releases](https://github.com/YunyueLi/SecondU/releases)。

## 实现边界

更新引擎直接使用 [Sparkle 2.9.6 官方分发](https://github.com/sparkle-project/Sparkle/releases/tag/2.9.6)。SecondU 的 Objective-C++ / N-API 适配只转接标准更新窗口、可公开读取的状态和重启握手；下载、验签、解压、替换和重启由 Sparkle 处理。适配源码位于 `desktop/native/`，主进程白名单位于 `desktop/updater.cjs`。没有自行复制替换正在运行的 `.app`，也不要求用户关闭系统安全检查。

正式更新源固定为 `https://github.com/YunyueLi/SecondU/releases/latest/download/appcast.xml`。`desktop/native/updater-config.json` 保存此地址及 Ed25519 公钥，打包时写入 `SUFeedURL` / `SUPublicEDKey`。下载和安装始终由用户操作。Sparkle 自带的自动弹窗调度、自动下载和静默安装保持关闭；主进程负责版本信息检查：启动约 10 秒后、此后每 6 小时，仅在空闲且没有进行中的更新会话时调用公开 `checkForUpdateInformation`，发现版本后显示应用入口，不自动弹窗或下载。该 API 尊重用户跳过的版本，主进程不得重置跳过记录。开启 `SUVerifyUpdateBeforeExtraction`，关闭系统画像上报与更新说明中的 JavaScript。当前应用未启用 `SURequireSignedFeed`：HTTPS 保护传输，封包的 Ed25519 签名验证更新代码；不可把这写成整个 feed 已有密码学签名。完整后台检查周期及跳过保留仍需独立的原生端到端测试。

更新包由官方 `sign_update` 使用受系统保护的签名凭据签署，应用只包含公开验证密钥。私钥不得进入仓库、环境变量、更新源、日志或前端。首次安装包来源、Developer ID / notarization 与后续更新包验签是不同环节；当前发行包使用 ad-hoc 签名，未经 Apple 公证。v0.1.4 及更早版本没有更新入口，需要先手动安装支持更新的版本。

## 交互约定与参考依据

现有「通用」设置中的「应用更新」分组和 macOS 应用菜单提供检查入口，产品没有独立更新页面；进行中的更新通过同一原生窗口继续。无更新、版本领先于 feed、系统不兼容、网络失败、验签失败和不可安装位置须呈现真实原因，不能统一显示「已是最新版本」。下载取消、下载和安装操作保留 Sparkle 标准 UI。网页和开发环境不假装具备原生安装能力。

侧栏入口参考 Codex 的底部下载图标与聚焦展开方式，使用 SecondU 自己的组件和 Sparkle 更新引擎。发现更新后显示入口，悬停或键盘聚焦时展开文字；点击打开原生窗口，由用户开始下载。下载、解压和准备重启期间，入口可继续打开正在进行的更新。

下载进度通过公开 `SPUStandardUserDriver` 子类获取：用 `showDownloadInitiatedWithCancellation:` 重置计数、`showDownloadDidReceiveExpectedContentLength:` 接收总量、`showDownloadDidReceiveDataOfLength:` 累计真实增量，每个方法继续调用 `super`，保留 Sparkle 的标准窗口和取消逻辑。预期长度为零、缺失或非法时使用活动指示，不按时间猜测百分比。该方式通过公开 `SPUUpdater` 初始化器接入，取代薄标准 controller 包装，不改造下载器或安装器。主进程只向前端传递版本、阶段、能力开关、时间、合法字节数量与经整理的错误；原生重启 token、安装回调、路径、原始错误对象和任何任务内容不进入前端更新状态。

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
5. 以保留符号链接的方式封装同名 `SecondU.app`，并在发布前完成对应构建的原生验收及独立解压检查。可使用官方建议的 `ditto -c -k --sequesterRsrc --keepParent`；输出名固定为 `SecondU-vVERSION-macos-arm64.zip`。封包后不再修改 app、包内文档、版本或 ZIP 内容，保证校验和与更新签名有效。
6. 用下述脚本签署最终 ZIP、生成 appcast，并保存返回的字节数和 SHA-256。脚本不发布 Release，也不修改 ZIP。签名后若改动封包，必须重新验收和签署。

```sh
node scripts/generate-appcast.mjs \
  --zip out/SecondU-v0.1.5-macos-arm64.zip \
  --output out/appcast.xml \
  --version 0.1.5 \
  --release-notes docs/releases/v0.1.5.md \
  --published-at 2026-10-09T00:00:00Z
```

以上为参数格式示例。实际执行前使用最终版本、发布说明与日期，输出目录必须已存在且目标 `appcast.xml` 不存在。可用 `--account` 选择签名凭据，对应公钥必须匹配应用。脚本拒绝自定义下载域名、私钥文件或私钥参数、版本与文件名不一致、非法说明文本、变化的 ZIP 和覆写已生成 feed。先核验固定官方归档及其 `sign_update` 字节，原生工具只输出签名；脚本再对嵌入公钥验签，记录 ZIP 大小／SHA-256，写入固定 GitHub asset URL、版本和 arm64 要求。最低系统版本复用构建脚本的 `minimumMacOSVersion`，目前生成 13.0.0。说明使用 Sparkle 2.9 支持的内嵌 Markdown，XML 转义后写入。生成器属于源码发布工具，不随应用承担周期检查或下载任务。

正式发布应先在同一受审 Release 中准备最终 ZIP、`SHA256SUMS` 和 `appcast.xml`，再核验实际公开下载的字节、签名与版本。更新 feed 的 latest 地址只指向已发布且被标为 latest 的 Release；公开前的 404 或当前 feed 尚未包含候选版本不代表新实现已经升级成功。公开资产不得包含私钥、个人数据、内部日志或测试更新源。

## 测试范围

退出相关测试覆盖慢请求、各空间活动任务、等待审批、不确定的远端执行、委派调用、调度暂停与恢复、取消、超时，以及失败后保持冻结。真实子进程检查分别确认准备退出时保持运行、提交退出后结束进程。

appcast 测试覆盖固定下载地址、摘要与长度、XML 转义、非法参数、签名期间文件变化和禁止覆盖。模拟签名测试不能替代正式更新包的签名验证。Sparkle 许可证见 [Sparkle-2.9.6.txt](licenses/Sparkle-2.9.6.txt)。

v0.1.5 的隔离原生测试覆盖以下场景。测试的两个应用都包含更新器，不代表历史发布的 v0.1.4 支持应用内更新。

| 场景 | 已验证行为 |
| --- | --- |
| 错误签名 | 完整下载后拒绝更新，旧版本和已有数据保持。 |
| 侧栏下载入口 | 打开标准 Sparkle 窗口，展示真实下载字节。 |
| 未发送草稿 | 草稿阻止更新重启，正文保留；处理草稿后可以重新尝试。 |
| 有效更新 | 完成安装、退出并启动新版本。 |
| 数据保留 | 任务记录、成果版本与文件内容保持一致。 |
| 手动检查 | 能读取正式更新源，并显示对应的版本结果。 |

安装包完成签名、独立解压完整性、更新源和公钥检查。完整后台检查周期、跳过版本保留、所有网络异常、安装权限错误、活动任务阻止重启的原生 UI，以及侧栏与原生窗口的百分比同步尚未全部覆盖。源码测试、模拟状态和真实安装测试各自保留范围。

公开版本的安装包摘要与更新源见 [v0.1.5 发布说明](releases/v0.1.5.md#公开发布)。

官方接口和发布规则：[Sparkle API](https://sparkle-project.github.io/)、[集成指南](https://sparkle-project.org/documentation/)、[发布更新](https://sparkle-project.org/documentation/publishing/)、[签名要求](https://sparkle-project.org/documentation/code-signing/)。
