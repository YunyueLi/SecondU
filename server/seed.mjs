import { chineseDemoPart } from './demo-zh-data.mjs';

/** Independent Chinese example: Wanye's work, family and everyday plans. */
export function createSeed(now = new Date().toISOString()) {
  return chineseDemoPart('seed', now);
}
