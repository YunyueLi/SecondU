/** Platforms are labels for saved records; they never imply a connected account. */
export const timelinePlatforms = ['hither','wechat','wecom','qq','feishu','dingtalk','slack','teams','telegram','discord','signal','line','messenger','imessage','instagram','whatsapp','email','sms','xiaohongshu','weibo','photos','notes','other'];

function localDate(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function appPlatform(app) {
  const key = String(app || '').trim().toLowerCase();
  const aliases = { '微信':'wechat', 'wechat':'wechat', 'weixin':'wechat', '企业微信':'wecom', '飞书':'feishu', '钉钉':'dingtalk', '小红书':'xiaohongshu', '微博':'weibo', '照片':'photos', '相册':'photos', 'apple photos':'photos', '备忘录':'notes', 'apple notes':'notes' };
  return aliases[key] || (timelinePlatforms.includes(key) ? key : 'other');
}

/** Merge stored records without copying a manual life event into the feed twice. */
export function timelineFeed(data) {
  const sources = new Map((data.sources || []).map(source => [source.id, source]));
  const attachments = new Map((data.attachments || []).map(item => [item.id, item]));
  const events = data.events || [];
  const eventIds = new Set(events.map(event => event.id));
  const fromEvents = events.map(event => {
    const evidence = (event.sourceIds || []).flatMap(id => sources.get(id) || []);
    const importedPlatform = evidence.find(source => source.import?.platform)?.import?.platform;
    const platform = event.platform || importedPlatform || 'hither';
    return {
      id: `event:${event.id}`, eventId: event.id, scope: event.scope || 'milestone',
      date: event.date, endDate: event.endDate, title: event.title, description: event.description,
      category: event.category, platform, origin: importedPlatform ? 'source' : 'manual',
      personIds: event.personIds || [], sourceIds: event.sourceIds || [], location: event.location || '',
      attachmentIds: event.attachmentIds || [],
      attachments: (event.attachmentIds || []).flatMap(id => attachments.get(id)?.kind === 'image' ? [attachments.get(id)] : []),
      demo: evidence.length > 0 && evidence.every(source => source.demo),
    };
  });
  const fromActivities = (data.dailyActivities || []).filter(item => !(item.lifeEventId && eventIds.has(item.lifeEventId))).map(item => ({
    id: `activity:${item.id}`, activityId: item.id, scope: 'note', date: item.startAt ? localDate(item.startAt) : item.date || '',
    startAt: item.startAt, endAt: item.endAt, endDate: item.endDate, title: item.title, description: item.summary,
    category: item.kind, platform: item.kind === 'task' || item.kind === 'room' ? 'hither' : appPlatform(item.app),
    app: item.app, origin: item.kind === 'import' ? 'import' : item.kind === 'task' || item.kind === 'room' ? item.kind : 'manual',
    personIds: [], sourceIds: item.sourceIds || [], location: '', attachmentIds: [], attachments: [], demo: item.demo,
    taskId: item.taskId, roomId: item.roomId, sourceUrl: item.sourceUrl, status: item.status,
  }));
  // Date-only personal records come before automatic activity within that day;
  // no clock time is invented for them.
  return [...fromEvents, ...fromActivities].sort((a,b) => b.date.localeCompare(a.date) || Number(!!b.eventId) - Number(!!a.eventId) || (b.startAt || '').localeCompare(a.startAt || '') || a.id.localeCompare(b.id));
}
