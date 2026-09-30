# 本机画面共享

这是用户主动发起的本地画面预览入口，不是远程控制、持续电脑记录或默认模型视觉输入。渲染端调用 `navigator.mediaDevices.getDisplayMedia({video:true,audio:false})`，得到真实 `MediaStream` 后才能显示正在共享；停止时必须停止全部 tracks，并监听 `ended`。此桥没有传输、录制或保存画面的功能。

Electron 入口是 `desktop/screen-share.cjs`，由 `desktop/main.cjs` 注册。只接受 SecondU 当前本机 origin 的主 frame 显示捕获请求；摄像头、麦克风等其它权限继续拒绝。回退处理额外检查用户手势，在选择结束时重新核对 frame/origin，拒绝过期或并发请求。

已针对 Electron 38 做版本限定的兼容：该版本实际将显示捕获报为 `media` 且 `mediaTypes: []`，不能只按最新文档判断 `display-capture`。兼容只接受带同源 `securityOrigin` 的空数组请求；`audio`、`video` 设备权限仍拒绝，初步 media permission check 也不自动放行。依据为 [v38.1.2 官方实现第 229–251 行](https://github.com/electron/electron/blob/v38.1.2/shell/browser/web_contents_permission_helper.cc#L229)。旧版 `getUserMedia` 的 `chromeMediaSource` 路径共用该空数组标记；SecondU 不提供该旧接口，产品使用 `getDisplayMedia` 与显式选择流程。后续升级 Electron 时须重验实际权限协议。

- 优先使用系统选择器。Electron 38 类型说明与官方文档均将 `useSystemPicker` 标为 macOS 15+ 实验能力；系统选择器可用时会绕过自定义选源处理，因此同源与主 frame 限制同时放在 permission check/request 层。用户手势与系统选择由浏览器及系统流程处理。
- 没有系统选择器时，弹出隔离的本地选择窗口。用户必须明确选择窗口或屏幕；不会自动选择第一个屏幕。关闭、取消、超时或失败均拒绝本次捕获。
- 回退列表只取来源名称和 ID，不取缩略图，不落盘保存窗口名称或画面。列表只在本地选择窗口展示，来源名称做 HTML 转义；选择 IPC 绑定该窗口及其主 frame。
- macOS 录屏权限需要用户在系统流程中授权。代码不会修改 TCC、自动批准权限或注入键鼠控制。

`window.hitherDesktop.screenShare.status()` 提供本机能力和最后一次回退选择状态。`selection: approved` 仅代表选源曾被批准，不代表当前仍在共享。系统选择器路径不会更新这项回退状态；UI 必须以自己的 MediaStream/track 状态为准。失败日志只记录固定错误码，不记录窗口标题或系统原始错误。

验证：`tests/screen-share.test.mjs` 使用本地 fixture 覆盖权限范围、明确选源、取消、失败、并发、来源过期、隔离窗口 IPC 与标题转义，4 项通过。尚未在真实 macOS 权限弹窗和真实媒体流上完成验收；测试通过不等于系统权限已获准。

一手依据：[Electron session 显示捕获与权限处理](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)、[Electron desktopCapturer 与 macOS 许可](https://www.electronjs.org/docs/latest/api/desktop-capturer)。实现还核对了本项目安装的 Electron 38.1.2 类型定义，没有升级依赖。
