# 模型连接预设

2026-09-29 核对官方接入文档，新增以下预设。均使用 Bearer API Key 与 Chat Completions，完整请求地址为 Base URL 后追加 `/chat/completions`。

| 服务 | 默认 Base URL | 官方依据 |
| --- | --- | --- |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | [Google OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai) |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | [百炼 Base URL 总览](https://help.aliyun.com/zh/model-studio/base-url) |
| GLM | `https://open.bigmodel.cn/api/paas/v4` | [智谱 OpenAI SDK](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) |
| Doubao | `https://ark.cn-beijing.volces.com/api/v3` | [方舟 OpenAI SDK](https://docs.volcengine.com/docs/ark/compatible-with-openai-sdk?lang=zh)、[鉴权](https://docs.volcengine.com/docs/ark/base-url-and-authentication?lang=en) |
| MiniMax | `https://api.minimax.cn/v1` | [MiniMax OpenAI SDK](https://platform.minimax.cn/docs/api-reference/text-openai-api) |

Qwen 默认北京地域；地域、业务空间和计费方案须与密钥匹配。GLM 是通用 API，Coding Plan 使用专用地址。Doubao 使用方舟 API Key，模型 ID 以账号已开通的模型或推理接入点为准。MiniMax 中文官方文档当前重定向到 minimax.cn，默认采用该文档的中国站 API，国际账号按对应控制台修改地址。

这些预设仅用于用户新建连接。没有迁移、替换已保存的地址、模型、密钥、默认连接或助理绑定；新服务的模型 ID 留空，由用户从官方说明选择。没有静态猜测的模型列表。不同模型的思考参数不统一，这五家预设使用模型默认思考，不自动发送通用 `reasoning_effort`。

`tests/provider-presets.test.mjs` 核对预设、SVG 来源与哈希、实际本机 Chat 请求、保存和编辑后模型保留、原有默认连接不变。夹具只访问临时本机服务，没有调用真实云模型；真实模型的工具、多轮推理和图片兼容性仍需用用户选定模型分别验证。

图标沿用 `public/brand/providers/` 的 Lobe Icons MIT 来源、固定版本和逐文件哈希，使用彩色符号，不使用 wordmark 填充选择器。
