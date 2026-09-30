import { chineseDemoPart } from './demo-zh-data.mjs';
import { createSeed } from './seed.mjs';
import { createDemoLife } from './demo-life.mjs';
import { createDemoStories } from './demo-stories.mjs';
import { refreshFictionalDemo, DEMO_MATCHER_VERSION } from './demo-refresh.mjs';
import { applyDemoPortraits, DEMO_PORTRAIT_MARKER } from './demo-portraits.mjs';
export const DEMO_VERSION=6;
export function createDemoExpansion(stamp) {
 const data=chineseDemoPart('expansion',stamp),stories=createDemoStories(stamp);
 for(const collection of ['sources','conversations','events'])data[collection].push(...stories[collection]);
 return data;
}
export function applyDemoExpansion(store,stamp){
 if(!store.meta('profile').demo)return;
 if(store.get('meta','demo-engineer-v4')?.value?.matcherVersion>=DEMO_MATCHER_VERSION&&store.get('meta',DEMO_PORTRAIT_MARKER))return;
 const seed=createSeed(stamp),expansion=createDemoExpansion(stamp),life=createDemoLife(stamp),data={profile:seed.profile};
 for(const collection of ['sources','facts','people','agents','relationships','events','conversations','goals','agentRooms'])data[collection]=[...(seed[collection]??[]),...(expansion[collection]??[]),...(life[collection]??[])];
 refreshFictionalDemo(store,data,stamp);
 applyDemoPortraits(store,data,stamp);
}
