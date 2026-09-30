import type { TimelineItem } from '../../shared/timeline-feed.mjs';
export interface TimelineYearGroup { year: string; items: TimelineItem[]; titles: string[] }
export function timelineYearGroups(items: TimelineItem[]): TimelineYearGroup[];
export function readTimelineYearState(serialized: string | null): Record<string, boolean>;
export function timelineYearIsOpen(year: string, overrides: Record<string, boolean>, currentYear: string): boolean;
