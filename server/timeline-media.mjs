import { getAttachment } from './attachments.mjs';
import { HttpError } from './store.mjs';
import { timelinePlatforms } from '../shared/timeline-feed.mjs';

export const TIMELINE_IMAGE_LIMIT = 9;

export function timelineMedia(store, value) {
  const ids = value.attachmentIds ?? [];
  if (!Array.isArray(ids) || ids.length > TIMELINE_IMAGE_LIMIT || ids.some(id => typeof id !== 'string')) {
    throw new HttpError(400, '每条记录最多添加 9 张已保存在当前空间的图片。', 'invalid_timeline_images');
  }
  const attachmentIds = [...new Set(ids)];
  for (const id of attachmentIds) {
    if (getAttachment(store, id).kind !== 'image') throw new HttpError(400, '时间轴只接受图片附件。', 'invalid_timeline_image');
  }
  const platform = value.platform === undefined ? 'hither' : value.platform;
  if (!timelinePlatforms.includes(platform)) throw new HttpError(400, '请选择有效的记录来源。', 'invalid_timeline_platform');
  const location = value.location ?? '';
  if (typeof location !== 'string' || location.length > 300) throw new HttpError(400, '地点应为 300 字以内的文本。', 'invalid_timeline_location');
  return { attachmentIds, platform, ...(location.trim() ? { location: location.trim() } : {}) };
}
