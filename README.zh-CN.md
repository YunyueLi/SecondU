# SecondU

**SecondU 是以个人数字分身为核心的智能体产品。它持续理解一个人的背景、经历、偏好、目标、关系与现实处境，在不同任务、应用和设备之间延续这些理解，主动帮助用户处理工作与生活中的事务，并支持协作、社交和专业服务。专业智能体、工具与执行环境根据具体需要，在用户授权范围内参与。**

三个重点价值：

- 减少背景信息和既有判断的重复输入。
- 让完整的多模态上下文在设备和场景之间连续流转。
- 将经过授权、适当脱敏的个人专业能力分发出去，支持 Agent 之间的协作、社交和交易。

完整定位见 [产品说明](docs/PRODUCT.md)。当前是可运行原型，已实现范围、实际验收与后续规划分别记录；完整形态不等同于当前版本的交付声明。

- [English](README.md)
- [启动说明](QUICKSTART.md)
- [产品与体验路线](docs/PROTOTYPE.md)
- [完整产品路线](docs/ROADMAP.md)
- [项目网站](https://yunyueli.github.io/SecondU/)
- [构建过程](docs/DEVELOPMENT.md)

当前是**可运行原型**。示例、接口测试、本机运行、提供方调用和公开发布分别记录，不将其中一项通过等同于所有能力完成验收。

![SecondU 虚构示例空间的工作台首页](website/screenshots/workspace.png)

*首页截图使用虚构人物与项目；可见模型名称不代表正在执行模型任务。*

## 先看示例

推荐 Node.js **22.18 或更新版本**。运行时最低为 22.13；测试直接导入 TypeScript，较早版本需额外开启类型擦除。

```sh
git clone https://github.com/YunyueLi/SecondU.git
cd SecondU
npm ci
npm run build
npm start
```

打开 <http://127.0.0.1:58645>，选择示例空间即可无密钥浏览。中文与英文示例各自编写人物、关系、项目和经历，均明确标注为虚构。个人空间独立保存真实资料。

预编译应用面向 **Apple Silicon（arm64），macOS 13+**，已内置 Node 运行时；只有从源码启动或构建时才需要安装 Node.js 和 npm。下载文件见 [Releases](https://github.com/YunyueLi/SecondU/releases)。

构建后运行 `npm run desktop` 打开原生窗口；原生桌面要求 macOS 13 或更新版本；macOS 运行 `npm run desktop:package` 可生成 `out/SecondU.app`。应用仅做本机临时签名，尚未 Apple 公证。[完整要求与排错](QUICKSTART.md)

## 可以体验什么

| 模块 | 体验重点 |
| --- | --- |
| 个人认知 | 来源、聊天记录、人生时间轴、关系、目标与约束；区分确认、推断和待确认，保留修订。 |
| 对话 | 持久任务、表情、引用与修改问题后的分支，原始消息不会被覆盖。 |
| 团队 | 保存职责不同的 Agent，指定负责人，按需委派专家；成员与真实执行节点分开展示。 |
| 产物 | Markdown、代码高亮、CSV/TSV、静态 HTML/SVG、图片与 PDF；Office 可由本机 LibreOffice 转成只读 PDF，下载保留原文件。标题、预览和下载跟随选中的已保存版本。 |
| 本机工作 | 项目目录、模型连接、工具审批和服务在线时的定时任务。 |
| 评审 | 使用实际产品组件的引导、组件目录、可以更新的构建时间线及原始记录入口。 |

建议依次看个人背景、打开已有任务、比较文件版本，再查看团队分工与执行树。[产品说明](docs/PROTOTYPE.md) 提供具体体验路线和真实任务样例。

## 实现与边界

界面采用 React 和官方 **OpenAI Apps SDK UI**；本机 Node 服务维护 SQLite 记录、任务目录与版本历史；执行底层复用 **Codex CLI app-server**。个人上下文装配、任务状态、负责人委派、执行树和产物工作区由本项目实现。参见 [Harness](docs/HARNESS.md) 和 [API](docs/API.md)。

示例不调用模型。真实执行需要进入个人空间，安装 Codex CLI 并配置自己的模型凭据；缺少配置会明确等待，不自动替换成模拟结果。服务商预设不代表所有模型能力都已验证。

当前已记录一次真实 DeepSeek 最小团队任务，验证一名负责人委派一名专家、等待回传并汇总；这不证明复杂团队协作质量。自动化测试使用合成资料和本地协议服务，不将测试回复当作模型推理结果。

- 定时任务依赖本机服务在线；电脑休眠和关机时不会假装云端运行。
- 远端电脑已有本地协议与持久测试，用户真实 SSH 主机仍需单独验收。
- Office 预览需 LibreOffice，且为只读转换；HTML/SVG 不加载脚本与外部资源，不执行任意 TSX 模块。
- 手机、眼镜、市场、Dating 和部分通讯、资源页面明确标注 Dev，不代表真实设备同步、通话、支付或外部账户已接通。
- 原生桌面验收主要针对 macOS；Linux CI 检查构建与本地测试，Windows 和正式签名分发未宣称通过。

## 资料、权限与兼容

开发资料默认存于忽略的 `.hither/`；原生应用沿用 `~/Library/Application Support/Hither/`，可设置 `HITHER_DATA_DIR`。原生窗口只复用**资料空间与运行构建指纹都一致**的服务。

API 只监听回环地址并拒绝跨站写入。密钥存于限制权限的本机文件，**不等于系统钥匙串加密**。运行真实任务时，选中的个人上下文与有限来源摘录会发送给配置的模型提供方。详见 [安全说明](SECURITY.md)。

仓库不得包含私人数字分身记录、凭据或个人运行日志。内部 `Hither` 名称、目录和环境变量用于兼容已有资料，不是另一个产品。[品牌与兼容](docs/BRANDING.md)

## 参与开发

在两个终端分别运行 `npm run server` 和 `npm run dev`，打开 <http://127.0.0.1:58644>。提交前运行 `npm test` 与 `npm run build`，界面修改还需真实页面验收。

- [贡献规范](CONTRIBUTING.md)
- [测试说明](docs/TESTING.md)
- [设计规范](docs/DESIGN.md)
- [开发记录](docs/DEVELOPMENT.md)
- [迭代记录](docs/ITERATION.md)
- [更新记录](CHANGELOG.md)

代码采用 [MIT](LICENSE)。依赖、头像设计、品牌标识与字体分别保留原许可，[第三方说明](THIRD_PARTY_NOTICES.md) 列出归属。SecondU 与 OpenAI、模型提供方及参考项目无官方从属关系。
