# 模型与语音控件

`ModelPicker` 与 `VoiceInput` 直接使用官方 Apps SDK UI 的 Menu、Popover、Button 和 Icon，样式由 `composer.css` 自行载入。

## 模型

`ModelPicker` 的必要参数为 `settings`、`mode`、`onMode`、`onSettings`，可传 `disabled`。它只展示本地演示与实际已保存的连接，不提供虚构模型列表。没有密钥时标明等待连接；存在密钥不等同于模型已验证可用。

可选 `connections`、`defaultConnectionId`、`connectionId`、`onConnection(id | undefined)` 支持选择已保存的连接；`undefined` 表示继承默认。私聊选择写入 Agent 的绑定。群聊通过 `agentModels` 与 `onAgent` 展示成员各自的连接，不以一个总模型覆盖全部成员。Assistant 的任务覆盖与最终优先级由任务 API 决定，选择组件不静默修改全局默认值。

## 语音

`VoiceInput({onTranscript,disabled?,contextKey?})` 在首次点击时先显示语音服务提示，用户再次点击“开始语音输入”才启动识别。浏览器可能向自己的语音服务传输音频；界面不声称本地处理。之后在同一组件中的明确点击可直接开始。

它使用 `SpeechRecognition` 或 `webkitSpeechRecognition`，只接收浏览器转写文本，不保存录音。识别结束时，仅最终结果追加到草稿；不会发送消息。停止会等待最终识别结果，取消、关闭浮层、切换 `contextKey`、禁用或卸载会 abort 并丢弃结果。父组件应把任务或房间 ID 传入 `contextKey`，防止旧会话结果进入新草稿。

权限拒绝、没有麦克风、无语音、网络失败、服务不可用、开始超时及结束超时都显示实际错误，不用示例文本替代。构造器存在也不代表语音服务能连接。

2026-09-29 核读的桌面壳 `desktop/main.cjs` 使用 Electron 38.1.2，并拒绝所有权限请求；没有原生语音识别桥。当前 Electron 环境因此只显示明确的系统听写建议，不尝试绕过权限。真正的桌面语音能力需要另行实现原生或明确授权的语音服务，并处理系统权限、模型资源和许可。

本轮通过类型检查，以及不使用麦克风的 5 组假识别器生命周期检查：最终结果去重与停止、取消后的迟到回调、权限拒绝、无语音、网络失败。未请求麦克风、未采集现场音频、未连接语音服务，因此未将实际转写质量记为验收通过。

核读依据：[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)、[stop](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/stop)、[Electron session 权限接口](https://www.electronjs.org/docs/latest/api/session)，读取日期 2026-09-29。当前系统听写的实际可用性由用户的系统配置决定。

## 附件与链接

`useAttachments({contextKey,onUpload?})` 为每个任务或房间保留独立草稿，支持文件选择、剪贴板文件和拖拽。默认通过本机 `POST /attachments` 保存原件，最多 6 个、每个 8 MiB；它不向模型或外站发送内容。上传失败保留原始 File 供重试，移除或卸载会取消未完成请求并释放预览。移除草稿不会删除已保存消息或服务端的原件。

把 `AttachmentDrafts` 放在输入区，文件按钮调用 `inputRef.current?.click()`。输入容器可接 `onDragOver`、`onDrop`；粘贴先交给 `onPaste`，未处理文件时再调用 `pasteComposerLinks(event,value,onChange)`。发送条件为有正文或附件，并且 `busy`、`hasErrors` 均为 false；把 `attachmentIds` 传给消息接口，仅在消息成功保存后移除本次提交的草稿 ID。异步发送期间切换会话时，不得清空新会话的草稿。

`MessageAttachments` 按附件元数据展示本机原图或下载链接，点图片可以放大；不自动访问远程图片。`RichText` 的 markdown 链接使用 `LinkChip`，保留手写标签与完整目标，裸 URL 显示主机名和短路径，不请求远程站点图标。富 HTML 粘贴恢复锚点的真实 href，包含 URL fragment；不读取剪贴板 HTML 的脚本或样式。

交互适配来自用户明确指定的 Greenroom 本地 `origin/main@e8beec13`：`ComposerView`、`use-composer`、`composer-input`、`linkify`、`LinkChip`。使用 Hither 的 Apps SDK UI 与本机附件 API，没有复制 Greenroom 的账户、托管服务、计费、品牌或远程读图调用。是否能理解图片由 Hither 实际模型通路决定，预览成功不代表模型已经读取。

定向测试覆盖选择上限、失败重试、移除后的迟到回调、原件与预览分离、链接目标与中文标点、纯附件发送条件。浏览器粘贴、拖拽、消息保存后重开和模型 fixture 由集成验收核对。
