import { chineseDemoPart } from './demo-zh-data.mjs';

export function createDemoLife(stamp) { return chineseDemoPart('life',stamp); }
export function applyDemoLifeTimeline(store,stamp){
 if(!store.meta('profile').demo||store.get('meta','demo-engineer-v4'))return;
 const data=createDemoLife(stamp);
 store.transaction(()=>{for(const collection of ['sources','events'])for(const entity of data[collection])if(!store.get(collection,entity.id))store.put(collection,entity);});
}
