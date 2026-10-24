const MAX_DISMISSED = 240;
const recentWindow = 14 * 24 * 60 * 60 * 1000;
const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const shortened = (value, length) => {
  const result = text(value);
  return result.length > length ? `${result.slice(0, length).trimEnd()}…` : result;
};
const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const identity = value => /^[A-Za-z0-9_-]{1,160}$/.test(text(value)) ? value : undefined;
const normalizedTitle = value => text(value).normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
const isGreeting = value => /^(hi|hello|hey|你好|您好|嗨|哈喽)[.!?，,。！？～~]*$/iu.test(text(value));
const isGreetingTask = task => {
  const messages = list(task.messages).filter(item => item.role === 'user');
  return isGreeting(task.title) && isGreeting(task.prompt || messages[0]?.content)
    && messages.every(item => isGreeting(item.content));
};
const taskRequest = task => {
  const request = list(task.messages).filter(item => item.role === 'user' && text(item.content) && !isGreeting(item.content)).at(-1)?.content;
  return text(request) || (!isGreeting(task.prompt) && text(task.prompt)) || text(task.prompt);
};
const taskRecommendationTitle = task => {
  if (!isGreeting(task.title)) return text(task.title);
  return shortened(taskRequest(task) || task.title, 120);
};
const fingerprint = value => {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.codePointAt(0), 16777619);
  return (result >>> 0).toString(36);
};

/** Validate supplied destinations. No request, hostname guessing or URL extraction. */
export function homeExternalLink(value) {
  if (typeof value !== 'string' || value.length > 4096 || !/^https?:\/\//i.test(value) || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return undefined;
    const host = url.hostname.replace(/^www\./, '');
    const known = {
      'github.com': ['GitHub', 'github'],
      'gitlab.com': ['GitLab', undefined],
      'notion.so': ['Notion', 'notion'],
      'notion.site': ['Notion', 'notion'],
      'docs.google.com': ['Google Docs', undefined],
      'drive.google.com': ['Google Drive', undefined],
      'figma.com': ['Figma', 'figma'],
    }[host];
    return { href: url.href, host, label: known?.[0] || host, ...(known?.[1] ? { brand: known[1] } : {}) };
  } catch { return undefined; }
}

export function homeSuggestionStorageKey(space) {
  return `hither.homeSuggestions.dismissed.v1:${encodeURIComponent(text(space) || 'main')}`;
}

const validDismissal = value => typeof value === 'string' && value.length <= 240 && /^[a-z]+:[A-Za-z0-9_-]+@[a-z0-9]+$/.test(value);
export function readHomeDismissals(storage, key) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || 'null');
    return parsed?.version === 1 ? [...new Set(list(parsed.items).filter(validDismissal))].slice(-MAX_DISMISSED) : [];
  } catch { return []; }
}
export function writeHomeDismissals(storage, key, values) {
  const items = [...new Set(list(values).filter(validDismissal))].slice(-MAX_DISMISSED);
  try {
    if (!storage) return false;
    if (items.length) storage.setItem(key, JSON.stringify({ version: 1, items }));
    else storage.removeItem(key);
    return true;
  } catch { return false; }
}

export function dismissHomeSuggestion(values, suggestion) {
  return [...new Set([...list(values).filter(validDismissal), suggestion.dismissKey].filter(validDismissal))].slice(-MAX_DISMISSED);
}

/** Pure selection over already-loaded local records. It does not generate new facts. */
export function buildHomeSuggestionCandidates(data, { locale = 'zh-CN', now = Date.now() } = {}) {
  const copy = (zh, en) => locale.startsWith('en') ? en : zh;
  const sources = new Map(list(data.sources).filter(item => identity(item?.id)).map(item => [item.id, item]));
  const tasks = list(data.tasks).filter(item => identity(item?.id) && !item.archived && !item.roomId);
  const taskMap = new Map(tasks.map(item => [item.id, item]));
  const goals = list(data.goals).filter(item => identity(item?.id));
  const goalMap = new Map(goals.map(item => [item.id, item]));
  const projects = list(data.projects).filter(item => identity(item?.id) && !item.archived);
  const activities = list(data.dailyActivities);
  const candidates = [];
  const sourceReferences = ids => [...new Set(list(ids))].flatMap(id => {
    const source = sources.get(id);
    if (!source) return [];
    const activity = activities.find(item => list(item.sourceIds).includes(id) && homeExternalLink(item.sourceUrl));
    return [{ id: `source:${id}`, kind: 'source', sourceId: id, title: text(source.title) || copy('未命名资料', 'Untitled source'),
      label: source.demo ? copy('示例资料', 'Example source') : copy('资料来源', 'Saved source'),
      excerpt: shortened(source.text, 700), date: text(source.createdAt), href: `#building/${id}`,
      external: homeExternalLink(activity?.sourceUrl) }];
  });
  const projectReference = project => ({ id: `project:${project.id}`, kind: 'project', title: text(project.name), label: copy('项目', 'Project'),
    excerpt: shortened(project.description, 700), date: text(project.updatedAt), href: `#projects/${project.id}`, external: homeExternalLink(project.url) });
  const taskReferences = task => {
    const activity = activities.find(item => item.taskId === task.id && homeExternalLink(item.sourceUrl));
    const messages = list(task.messages);
    const requestIndex = messages.findLastIndex(item => item.role === 'user' && text(item.content) && !isGreeting(item.content));
    const nextRequestIndex = messages.findIndex((item, index) => index > requestIndex && item.role === 'user');
    const reply = requestIndex < 0 ? '' : text(messages.slice(requestIndex + 1, nextRequestIndex < 0 ? undefined : nextRequestIndex).findLast(item => item.role === 'assistant' && text(item.content))?.content);
    const status = {
      awaiting_approval: copy('任务正在等待批准。', 'The task is awaiting approval.'),
      needs_input: copy('任务正在等待补充信息。', 'The task needs more information.'),
      interrupted: copy('上一次执行已中断。', 'The previous run was interrupted.'),
      failed: copy('上一次执行未完成。', 'The previous run did not complete.'),
      completed: copy('任务已完成。', 'The task is completed.'),
    }[task.status];
    // A task's retrieved context is not evidence for this recommendation.
    // Keep this preview on the task's own request, state and direct reply.
    return [{ id: `task:${task.id}`, kind: 'task', title: text(task.title), label: copy('原对话', 'Original conversation'),
      displayTitle: taskRecommendationTitle(task), excerpt: [status, taskRequest(task), reply].filter(Boolean).join('\n\n'),
      date: text(task.updatedAt), href: `#task/${task.id}`, external: homeExternalLink(activity?.sourceUrl) }];
  };
  const add = (kind, entity, values) => {
    const id = `${kind}:${entity.id}`;
    // Locale changes only presentation. A dismissal changes when its saved
    // record changes, or when a generic starter receives an explicit revision.
    const version = kind === 'starter' ? 'starter-v1' : JSON.stringify([
      entity.revision ?? '', entity.updatedAt || '', entity.createdAt || '',
      entity.status || '', entity.title || '', entity.name || '', entity.description || '',
    ]);
    candidates.push({ id, dismissKey: `${id}@${fingerprint(version)}`, kind, ...values,
      previewPrompt: values.action.type === 'draft' ? values.action.prompt : text(values.previewPrompt) || values.detail || values.title });
  };
  const taskLink = (task, label) => ({ type: 'navigate', label, href: `#task/${task.id}` });

  if (data.profile?.demo) {
    const ordered = [...list(data.profile.exampleTaskIds).map(id => taskMap.get(id)).filter(Boolean),
      ...[...tasks].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))];
    for (const task of ordered) {
      if (task.status !== 'completed' || !text(task.title)) continue;
      add('example', task, { title: text(task.title), label: copy('示例对话', 'Example conversation'),
        previewPrompt: taskRequest(task),
        detail: copy('这是一份已保存的虚构示例。可以查看原对话、资料依据和成果。', 'A saved fictional example. Read the conversation, its sources and results.'),
        sources: taskReferences(task), action: taskLink(task, copy('查看示例', 'View example')),
        dedupe: [`task:${task.id}`, `title:${normalizedTitle(task.title)}`], time: timestamp(task.updatedAt) });
    }
  } else {
    for (const suggestion of [...list(data.twinBuilding?.suggestions)].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))) {
      if (!identity(suggestion?.id) || suggestion.status !== 'pending' || !text(suggestion.title)) continue;
      const source = sources.get(suggestion.sourceId);
      const task = suggestion.taskId ? taskMap.get(suggestion.taskId) : undefined;
      const goal = suggestion.goalId ? goalMap.get(suggestion.goalId) : undefined;
      if (!source || source.demo || suggestion.goalId && goal?.status !== 'active' || suggestion.taskId && (!task || ['completed', 'cancelled'].includes(task.status))) continue;
      const refs = [...sourceReferences([source.id]), ...(task ? taskReferences(task) : []), ...(goal ? [{ id: `goal:${goal.id}`, kind: 'goal', title: text(goal.title), label: copy('待办记录', 'Saved goal'), excerpt: shortened(goal.description, 700), date: text(goal.updatedAt), href: '#life' }] : [])];
      const context = [copy(`相关资料：${source.title}`, `Related source: ${source.title}`), ...(goal ? [copy(`当前目标：${goal.title}`, `Current goal: ${goal.title}`)] : []), ...(task ? [copy(`相关对话：${task.title}`, `Related conversation: ${task.title}`)] : [])].join('\n');
      add('pending', suggestion, { title: text(suggestion.title), label: copy('待查看建议', 'Saved suggestion'),
        detail: text(suggestion.description) || copy('这条建议已保存在分身建设中，尚未处理。', 'This saved suggestion has not been reviewed yet.'),
        sources: refs, action: { type: 'draft', label: copy('准备草稿', 'Prepare draft'), prompt: `${suggestion.title}\n\n${context}${suggestion.description ? `\n\n${suggestion.description}` : ''}` },
        dedupe: [task ? `task:${task.id}` : goal ? `goal:${goal.id}` : `source:${source.id}`, `title:${normalizedTitle(suggestion.title)}`], time: timestamp(suggestion.updatedAt) });
    }

    const backgroundTasks = new Set(list(data.twinBuilding?.captures).flatMap(capture => list(capture.taskIds)));
    const personalTasks = tasks.filter(task => task.mode !== 'demo' && !task.proactive && !task.financeWeekly && !backgroundTasks.has(task.id) && text(task.title) && !isGreetingTask(task));
    const statusCopy = {
      awaiting_approval: [copy('查看待批准操作', 'Review pending approval'), copy('等待批准', 'Awaiting approval'), copy('任务正在等待你的批准。打开原对话可查看具体操作与范围；此入口不会批准或继续执行。', 'This task is waiting for your decision. Open the conversation to inspect the action and its scope; this link does not approve or resume it.')],
      needs_input: [copy('补充任务信息', 'Add task details'), copy('等待补充', 'Needs input'), copy('任务已保存，正在等待补充信息。打开原对话后可以继续编辑。', 'The saved task is waiting for more information. Open the conversation to continue editing.')],
      interrupted: [copy('查看中断的任务', 'Review interrupted task'), copy('执行中断', 'Interrupted'), copy('上一次执行已中断，已有对话仍保留。打开后先核对进展，再决定是否继续。', 'The previous run was interrupted and its conversation is saved. Review its progress before deciding to continue.')],
      failed: [copy('查看未完成的任务', 'Review unfinished task'), copy('执行未完成', 'Run failed'), copy('上一次执行没有完成。可以打开原对话查看原因，已有内容不会被清空。', 'The last run did not complete. Open the original conversation to review the cause and saved work.')],
    };
    const statusOrder = Object.keys(statusCopy);
    for (const task of personalTasks.filter(item => statusOrder.includes(item.status)).sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || timestamp(b.updatedAt) - timestamp(a.updatedAt))) {
      const [verb, label, detail] = statusCopy[task.status];
      add('task', task, { title: `${verb}${copy('：', ': ')}${taskRecommendationTitle(task)}`, label, detail, sources: taskReferences(task),
        previewPrompt: taskRequest(task),
        action: taskLink(task, copy('打开原对话', 'Open conversation')), dedupe: [`task:${task.id}`, `title:${normalizedTitle(task.title)}`], time: timestamp(task.updatedAt) });
    }

    for (const goal of goals.filter(item => item.status === 'active' && text(item.title)).sort((a, b) => Number(!!b.flagged) - Number(!!a.flagged) || timestamp(b.updatedAt || b.createdAt) - timestamp(a.updatedAt || a.createdAt))) {
      const detail = text(goal.description);
      const refs = [{ id: `goal:${goal.id}`, kind: 'goal', title: text(goal.title), label: copy('待办记录', 'Saved goal'), excerpt: shortened(detail, 700), date: text(goal.updatedAt || goal.createdAt), href: '#life', ...(goal.dueDate ? { dueDate: goal.dueDate } : {}) }, ...sourceReferences(goal.sourceIds)];
      add('goal', goal, { title: copy(`推进「${goal.title}」`, `Work on “${goal.title}”`), label: copy('进行中目标', 'Active goal'),
        detail: detail || copy('这项目标在你的待办中标为进行中。', 'This goal is marked active in your saved goals.'), sources: refs,
        action: { type: 'draft', label: copy('准备草稿', 'Prepare draft'), prompt: copy(`我想推进「${goal.title}」。${detail ? `\n\n现有记录：\n${shortened(detail, 2000)}` : ''}\n\n请帮我梳理接下来可以做的事。`, `I want to work on “${goal.title}”.${detail ? `\n\nSaved context:\n${shortened(detail, 2000)}` : ''}\n\nHelp me work out the next steps.`) },
        dedupe: [`goal:${goal.id}`, `title:${normalizedTitle(goal.title)}`], time: timestamp(goal.updatedAt || goal.createdAt) });
    }

    for (const project of [...projects].filter(item => text(item.name)).sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))) {
      add('project', project, { title: copy(`继续「${project.name}」项目`, `Continue the “${project.name}” project`), label: copy('项目', 'Project'),
        previewPrompt: [copy(`继续「${project.name}」项目。`, `Continue the “${project.name}” project.`), text(project.description)].filter(Boolean).join('\n\n'),
        detail: text(project.description) || copy('打开已保存的项目，查看文件与相关对话。', 'Open the saved project to review its files and conversations.'), sources: [projectReference(project)],
        action: { type: 'navigate', label: copy('打开项目', 'Open project'), href: `#projects/${project.id}` },
        dedupe: [`project:${project.id}`, `title:${normalizedTitle(project.name)}`], time: timestamp(project.updatedAt) });
    }
    for (const task of personalTasks.filter(item => item.status === 'completed' && timestamp(item.updatedAt) >= now - recentWindow && timestamp(item.updatedAt) <= now).sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))) {
      const title = taskRecommendationTitle(task);
      add('recent', task, { title: copy(`回顾「${title}」`, `Revisit “${title}”`), label: copy('已完成对话', 'Completed conversation'),
        previewPrompt: taskRequest(task),
        detail: copy('这项任务已标为完成。可以回看原对话和成果；它不作为未完成待办。', 'This task is marked completed. Revisit its conversation and results; it is not an unfinished task.'),
        sources: taskReferences(task), action: taskLink(task, copy('回看原对话', 'Revisit conversation')), dedupe: [`task:${task.id}`, `title:${normalizedTitle(task.title)}`], time: timestamp(task.updatedAt) });
    }
  }

  const starters = [
    { id: 'read', title: copy('整理一份资料，提炼关键内容', 'Summarize a document and its key points'), kind: 'research', prompt: copy('我想整理一份资料。请先等我添加文件或粘贴内容，再帮我提炼关键内容。', 'I want to organize a document. Wait for me to add a file or paste its content, then help me identify the key points.'), detail: copy('添加文件或粘贴内容后，可以整理摘要、要点和待确认的问题。', 'Add a file or paste content to organize a summary, key points and open questions.') },
    { id: 'write', title: copy('起草一段文字，再一起修改', 'Draft a piece of writing and refine it'), kind: 'write', prompt: copy('我想起草一段文字。请先帮我明确用途、读者和要表达的内容。', 'I want to draft a piece of writing. Help me clarify the purpose, audience and what I want to say.'), detail: copy('先说明用途和读者，再起草邮件、说明或其他文字。此入口只准备草稿。', 'Describe the purpose and audience, then draft an email, note or other text. This starter only prepares a draft.') },
    { id: 'plan', title: copy('把一个想法拆成可执行的步骤', 'Turn an idea into practical next steps'), kind: 'chat', prompt: copy('我想把一个想法拆成可执行的步骤。请先帮我明确目标和限制。', 'I want to turn an idea into practical next steps. Help me clarify the goal and constraints first.'), detail: copy('从你接下来提供的目标与限制出发，整理步骤。不会假设你已有某项待办。', 'Use the goal and constraints you provide to plan steps. This does not assume an existing personal task.') },
  ];
  for (const starter of starters) add('starter', starter, { title: starter.title, label: copy('可以试试', 'Try this'), detail: starter.detail, iconKind: starter.kind,
    sources: [], action: { type: 'draft', label: copy('准备草稿', 'Prepare draft'), prompt: starter.prompt }, dedupe: [`starter:${starter.id}`], time: 0 });

  return candidates;
}

export function selectHomeSuggestions(candidates, dismissed = [], limit = 3) {
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(3, Math.floor(limit))) : 3;
  if (!count) return [];
  const hidden = new Set(list(dismissed));
  const seen = new Set();
  const selected = [];
  for (const candidate of list(candidates)) {
    if (candidate.dedupe.some(key => seen.has(key))) continue;
    candidate.dedupe.forEach(key => seen.add(key));
    // A hidden recommendation must not immediately return via a lower-ranked
    // task/goal candidate for that same saved object.
    if (hidden.has(candidate.dismissKey)) continue;
    selected.push(candidate);
    if (selected.length >= count) break;
  }
  return selected;
}
