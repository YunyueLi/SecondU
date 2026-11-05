# 内置 Codex CLI 与版本更新

SecondU 的桌面构建内置固定版本的 Codex CLI，通过本地 `stdio` app-server 驱动任务。CLI 随应用整体升级。用户只安装 SecondU，然后配置自己的模型连接；无需另装 Codex App、Node.js 或 CLI。从 v0.3.0 起，桌面发行包包含该组件；以往版本的归档不变。

## 版本与打包

- 唯一版本清单：[`shared/codex-runtime.json`](../shared/codex-runtime.json)。仅接受明确的稳定版本、官方 npm 地址、目标架构和 SHA-512 完整性值。
- [`scripts/package-codex-runtime.mjs`](../scripts/package-codex-runtime.mjs) 在构建时下载并校验原始包；缓存也要重新校验。每次从原始包重新解压，核对版本、布局和可执行文件，保留配套程序、资源与上游声明。
- `npm run desktop:package` 将组件放入 `SecondU.app/Contents/Resources/app/runtime/codex/`，再完成应用签名。源码仓库只保存清单与许可证；下载缓存和应用产物均忽略跟踪。
- 已打包应用只接受自身组件。组件缺失或版本不符时报告不可用，不借用 PATH、其他应用或开发环境指定的 CLI。源码开发保留 `HITHER_CODEX_BIN` 和原有发现方式。
- CLI 状态继续使用 SecondU 原有隔离目录；应用更新不改用户的独立 Codex 安装及其账户目录。组件构建记录进入后端身份，避免复用不同组件的旧服务。

当前桌面打包器仍只支持 macOS；清单中的 Linux x64 用于兼容性 CI。macOS arm64 已在本机验证；Intel Mac 与 Linux 的运行结果以对应 CI 为准，不能由文件存在推定通过。

## 跟进上游

[`ci.yml`](../.github/workflows/ci.yml) 对固定版本运行真实 CLI 与本地合成模型的协议检查；不使用私人数据、提供方密钥或收费模型请求。检查涵盖启动、权限、工具进程、取消、结构化抽取、三种接口、动态工具、文件结果和跨进程恢复。

[`codex-compatibility.yml`](../.github/workflows/codex-compatibility.yml) 每天检查官方稳定版，也支持手动触发。有新版本时，下载明确版本的候选组件和声明，在 macOS 与 Linux 执行兼容性检查。候选仅写入 `.local`，不改正式版本清单，也不自动发布。

维护者流程：

1. 审阅候选测试结果、上游变更和许可证变化。
2. 将已通过的候选清单更新到 `shared/codex-runtime.json`，保留对应 `docs/licenses/codex-版本-LICENSE.txt`、`NOTICE.txt`。
3. 构建桌面应用，检查实际任务、旧会话恢复、资料保留和安装包。
4. 按原有应用发布流程生成签名更新与发布说明。应用后台发现更新；安装与重启继续经过现有任务、保存状态检查，不在任务中途替换 CLI。

本地检查命令：

```sh
node scripts/check-codex-update.mjs
node scripts/check-codex-update.mjs --prepare
node scripts/package-codex-runtime.mjs .local/codex-candidate/runtime .local/codex-candidate/lock.json .local/codex-candidate/notices
HITHER_CODEX_BIN="$PWD/.local/codex-candidate/runtime/bin/codex" HITHER_TEST_REAL_CODEX=1 node --test tests/codex.test.mjs tests/codex-extraction-runtime.test.mjs tests/codex-runtime-integration.test.mjs
```

自动检查只有在工作流进入 GitHub 默认分支后才会按计划运行。本地文件和测试通过不代表公开发布或远端 CI 已启用。

## 安装与升级验收

隔离验收使用 `HITHER_USER_DATA_DIR` 指定新的桌面资料目录，或 `HITHER_DATA_DIR` 指定后端资料目录。默认用户目录保持原位置。验收使用干净 PATH、故意无效的外部 CLI 覆盖，核对应用报告的内置版本、实际工具结果及会话恢复。

本机隔离目录验收与另一台全新设备、真实模型提供方、正式签名更新下载和安装分别记录。未完成的项目不得用协议夹具、旧版本验收或成功构建替代。

参考：[OpenAI app-server 文档](https://learn.chatgpt.com/docs/app-server)。该接口用于产品嵌入，协议结构与具体 CLI 版本对应。
