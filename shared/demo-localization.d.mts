import type {Bootstrap} from './contracts';
export const demoTranslationEntries:Record<string,Record<string,Record<string,string>>>;
export function localizeDemoBootstrap<T extends Bootstrap>(data:T,locale:string):T;
export function canonicalDemoValue<T>(collection:string,id:string,value:T,locale?:string,originalRecord?:unknown):T;
