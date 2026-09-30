export const WORKBENCH_DEFAULT_WIDTH: number;
export const WORKBENCH_MIN_WIDTH: number;
export const WORKBENCH_CHAT_MIN_WIDTH: number;
export const WORKBENCH_SPLIT_MIN_WIDTH: number;
export type WorkbenchLayout = {overlay:boolean;min:number;max:number;width:number};
export function workbenchLayout(available:number,preferred?:number):WorkbenchLayout;
export function workbenchKeyWidth(key:string,current:number,bounds:WorkbenchLayout,shift?:boolean):number|undefined;
