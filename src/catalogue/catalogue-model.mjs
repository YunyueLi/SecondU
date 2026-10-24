const groupAliases = {
  foundations: '基础 规范 设计 foundations basics design',
  controls: '输入 选择 控件 controls input selection',
  navigation: '导航 浮层 navigation overlays',
  feedback: '反馈 状态 feedback states',
  patterns: '业务 组合 patterns product',
  motion: '动效 动画 过渡 motion animation transitions',
};

const specAliases = {
  type: '文字 字体 字号 排版 层级 typography type hierarchy font text',
  'settings-scale': '配置 设置 详情 字号 settings configuration typography agent details',
  spacing: '空间 间距 形状 圆角 spacing shape radius dimensions',
  color: '颜色 语义 主题 色彩 color colour semantic tokens theme',
  identity: '图标 身份 头像 icons identity avatar',
  'recommendation-icons': '推荐 图标 目录 应用 品牌 recommendation icons catalogue apps brands',
  button: '按钮 操作 buttons actions',
  input: '单行 输入 输入框 文本 text input field',
  textarea: '长文本 多行 输入 文本域 文本框 textarea long multiline text',
  select: '下拉 选择 选择器 下拉框 select dropdown',
  'platform-select': '通信 平台 选择 platform selection messaging',
  checkbox: '复选 授权 勾选 checkbox consent',
  switch: '开关 即时 切换 switch toggle',
  radio: '互斥 单选 选择 radio group selection',
  slider: '连续 范围 滑块 slider range',
  segments: '同一 对象 视图 分段 切换 segmented control object views tabs',
  'section-link': '相关 页面 入口 链接 section link related page',
  menu: '操作 菜单 menu actions',
  popover: '就地 查看 依据 浮层 来源 popover inline context source',
  tooltip: '悬停 焦点 提示 复制 tooltip hover focus copy',
  dialog: '专注 对话框 弹窗 模态 dialog modal focused',
  badges: '状态 标签 徽标 badge task status needs_input needs input 等你补充',
  alert: '就地 反馈 提示 警告 alert inline feedback notice',
  'setup-hint': '接入 提示 连接 setup hint connection',
  loading: '加载 等待 进度 loading waiting indicator progress',
  recovery: '错误 恢复 校验 error recovery validation',
  empty: '空白 空态 无匹配 搜索 empty no results search',
  'agent-badge': '工牌 身份 角色 agent badge identity',
  composer: '对话 输入框 撰写 conversation composer chat',
  'platform-filter': '平台 筛选 过滤 platform filter',
  'suggestion-row': '推荐 任务 suggestion row suggested tasks',
  illustrations: '局部 插画 主题 illustrations spot theme',
  startup: '启动 重试 startup retry',
  graph: '关系 图谱 人物 relationship graph people map',
  task: '任务 活动 执行 task activity execution',
  approval: '单次 审批 批准 拒绝 授权 approval permission consent',
  cognition: '认知 理解 证据 事实 推断 来源 cognition understanding evidence facts',
  artifact: '成果 版本 编辑 预览 artifact versions editor preview',
};

export function normalizeCatalogueQuery(query) {
  return query.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
}

export function catalogueMatches(spec, query) {
  const terms = normalizeCatalogueQuery(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const text = normalizeCatalogueQuery([...spec, groupAliases[spec[1]] || '', specAliases[spec[0]] || ''].join(' '));
  return terms.every(term => text.includes(term));
}

export function catalogueGroupFromHash(hash, groups) {
  const match = /^#components\/([^/?#]+)$/u.exec(hash);
  if (!match) return undefined;
  try {
    const id = decodeURIComponent(match[1]);
    return groups.find(group => group === id);
  } catch { return undefined; }
}

/** Headings arrive in document order; the last one above the reading line owns it. */
export function catalogueGroupAtScroll(headings, readingLine) {
  let current = headings[0]?.id;
  for (const heading of headings) {
    if (heading.top > readingLine) break;
    current = heading.id;
  }
  return current;
}
