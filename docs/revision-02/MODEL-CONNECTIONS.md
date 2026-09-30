# 模型连接输入与 OpenRouter 修复

2026-09-29。用户截图中的模型 ID 是 `OpenRouter`，这是平台名，不是具体模型标识。未为这条错误配置发送真实模型请求，也未替换已保存的模型或默认连接。

前后端共用 `shared/model-validation.mjs` 拦截明显误填。OpenRouter 支持目录中的 `provider/model`、官方 preset 和 latest alias 格式；自定义兼容服务保留本地别名。这个校验只检查明显输入错误，不代表模型在线或工具兼容。

表单提供显式「选用 openrouter/free」按钮和官方模型目录链接，须由用户选择。公开模型目录本次确有该路由，标注文本输入/输出单价为 0；模型选择、限额和可用性由 OpenRouter 决定。免费路由不等于所有模型免费，也不代表完成真实工具验收。既有配置原样显示。

保存失败保留所有字段；保存成功但测试失败时保留填写内容及密码输入，并保留已保存 connection ID，重试会更新同一连接。保存或测试完整成功后清空密码输入，只显示「密钥已保存」的遮罩占位，不把真实密钥回传。密码仅在当前表单内存中，不放浏览器草稿缓存。

提供方错误只显示长度受限的标准 error.message/code；原始 metadata 不显示、不落库。保存前后所有本机密钥及常见 token/Bearer 格式均脱敏。过时测试仍返回 409，不覆盖新配置。

验证：`tests/model-form.test.mjs` 检查失败输入保留、已保存 ID 防重复、成功确认清空；`tests/provider-errors.test.mjs` 检查本机拒绝、错误细节、脱敏、读取限额和过时结果。使用本地伪上游，无第三方模型请求。浏览器实屏由主任务验收。

官方依据：

- [Quickstart](https://openrouter.ai/docs/quickstart)：完整模型 slug、官方目录及公开 `/api/v1/models`。
- [Free Models Router](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground)：免费模型路由入口。
- [Error handling](https://openrouter.ai/docs/api_reference/errors-and-debugging)：标准错误对象与状态。
- [Public model catalogue](https://openrouter.ai/api/v1/models)：本次选定行已归档至 `sources/openrouter-free-model.json`，文件内记录实际抓取时间，仅公共信息。
