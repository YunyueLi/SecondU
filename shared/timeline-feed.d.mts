import type { Attachment, Bootstrap } from './contracts';
export const timelinePlatforms: readonly string[];
export interface TimelineItem {
  id: string; eventId?: string; activityId?: string; scope: 'milestone'|'note';
  date: string; endDate?: string; startAt?: string; endAt?: string;
  title: string; description: string; category: string; platform: string; app?: string;
  origin: 'source'|'manual'|'import'|'task'|'room'; personIds: string[]; sourceIds: string[];
  location: string; attachmentIds: string[]; attachments: Attachment[]; demo: boolean;
  taskId?: string; roomId?: string; sourceUrl?: string; status?: string;
}
export function timelineFeed(data: Pick<Bootstrap, 'events'|'sources'|'attachments'|'dailyActivities'>): TimelineItem[];
