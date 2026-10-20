# 联系人结构化画像

联系人资料可以由概况逐步补成身份、背景、偏好、经历、目标、边界与观察。所有内容来自用户明确编辑；导入消息仅成为证据，不自动生成性格判断，不自动进入个人认知或任务上下文。

## 数据与接口

`Person` 兼容原有 `name/role/description/sourceIds`，新增可选 `portrait`。旧记录不会因为升级被改写为已确认事实。保存沿用 `POST /api/people`、`PUT /api/people/:id`；读取来自原有 people/bootstrap。

```json
{
  "name": "虚构联系人",
  "role": "项目同事",
  "description": "用户填写的简短概况",
  "sourceIds": [],
  "basePortraitVersion": 0,
  "portrait": {
    "schema": "hither.person.v1",
    "entries": [{
      "id": "entry-example",
      "kind": "preference",
      "statement": "希望在会议前收到议程。",
      "status": "candidate",
      "sourceIds": [],
      "privacy": "private",
      "validFrom": "2026-09",
      "note": "虚构格式示例，尚未确认。"
    }]
  }
}
```

`kind` 为 identity/background/preference/experience/goal/boundary/note。`status` 为 candidate/inferred/confirmed/superseded，新增默认为待确认。`privacy` 仅 private/sensitive，不提供公开授权标记。时效允许年份、月份或日期，拒绝无效日期与倒置区间。每份画像最多 100 条，每条最多 5000 字；每条来源最多 50 个，整份含历史最多 200 个。

后端生成条目的首次 `recordedAt`、画像 `version/updatedAt` 和不可覆盖的版本快照 `history`。JSON 不能伪造服务端历史。已有画像的保存必须带匹配 `basePortraitVersion`，不匹配返回 409。旧调用未提交 portrait 时保留已有画像；提交空 entries 表示明确清空当前条目，历史与来源引用仍保留。

关系仍由唯一 `Relationship` 记录承载，避免复制出第二套互相矛盾的关系。图谱和联系人详情可查看关系及其证据，既有关系可进入关系编辑表单。

## 界面与治理

- 图谱人物资料、联系人会话详情共用画像展示：分区条目、确认状态、敏感标记、适用时间、原始来源链接。
- 人物编辑支持分项和 JSON。JSON 需先应用到表单，才能保存人物；无效 JSON 不会丢失正在编辑的内容。
- 结构化 JSON 和历史可查看。表单修改不会改变原始聊天消息、源文件或正式个人事实。
- 去掉敏感标记、确认一条观察或内容经过脱敏，都不构成公开或外发许可。没有在这轮增加模型自动抽取或关系推断。
- 删除画像条目不会让历史证据失去引用保护；被历史引用的来源仍不能直接删除。

## 本轮证据

`tests/person-portrait.test.mjs` 覆盖版本冲突、重开持久化、历史保留、来源删除保护、旧调用兼容、非法状态/隐私/时效、服务端历史不可伪造。`tests/chat-platforms.test.mjs` 覆盖 16 平台规范文件、Slack/Telegram/飞书专用格式与边界；原 Instagram/通用导入的 3 项定向回归也已通过。

2026-09-29 的浏览器检查使用虚构 Slack 会话，完成联系人编辑、待确认偏好、来源关联、月份精度与隐私标记保存；刷新后内容、来源和 v1 修订记录保留。

无效 JSON 显示错误并保留表单；修正后可将条目保存为 `inferred`。v1 的 candidate 与 v2 的 inferred 历史、首次记录时间和来源引用均保留，不自动转为 confirmed。

本批未覆盖暗色、窄窗口、关闭后的焦点、外部账号或模型抽取。来源多选触发了 React 受控状态告警，保存与重开未受影响；后续修复和窄窗口检查见下文。

### 来源多选告警修复与实屏复验（2026-09-30）

源码定位到 Apps SDK UI 0.2.2 的 `SelectTrigger`：接收 `id` 的多选框生成隐藏输入，值来自 `value[0]`。旧 `Field` 自动注入 `id`，空来源数组转为首个来源时，隐藏输入会从 `undefined` 变成字符串。问题不在画像正文、日期或持久化结构。

新增认知局部组件 `SourceSelectField`，供人物概况来源、画像条目来源、关系来源复用。继续使用官方 `Select`，通过 `fieldset/legend` 命名分组，稳定的 `TriggerView` 为触发器提供可访问名称，不给 SDK 传 `id/name`。实际来源仍为原 ID 数组；没有加入空选项、重挂载选择器、隐藏新错误或修改依赖包。

修复后的浏览器检查完成空来源选择、取消、再次选择与保存，未再出现该告警。新条目保持 candidate，`sourceIds` 仅含有效来源 ID，v1/v2 历史保留。此项覆盖画像条目来源选择；其他共用入口未逐一检查。

### 画像表单宽窄布局复验（2026-09-30）

同时修复了既有布局缺陷：分类与状态触发器在官方组件中为 `span`，旧样式只约束 `div`，使状态和移除按钮被挤到右侧。`portrait.css` 已在原规则处改为两个 `minmax(0,1fr)` 选择列加 32px 移除列；新增条目区同步约束实际选择器。外层禁用字段组改为具有明确间距的网格，移除全体 `fieldset {display:contents}`，来源字段的 legend 和选择器保持独立布局。

1280px 和 390×844 视口下，分类、状态、删除及底部保存／取消均可达，来源字段间距正常；窄窗口对话框宽度与内容宽度均为 356px，无横向溢出。暗色与关闭后的焦点未在本批检查。
