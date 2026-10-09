import type { DesktopUpdatesBridge } from './desktop-updates';

declare global {
  interface Window {
    hitherDesktop?: {
      platform?:string;
      updates?: DesktopUpdatesBridge;
      windowState?:{
        get:()=>Promise<{platform:string;fullscreen:boolean}>;
        onChange:(callback:(state:{platform:string;fullscreen:boolean})=>void)=>()=>void;
      };
      chooseDirectory:()=>Promise<string|null>;
      setLanguage:(language:'zh-CN'|'en')=>Promise<void>;
      screenShare?: {status:()=>Promise<{
        available:boolean;
        systemPickerPreferred?:boolean;
        screenPermission?:'granted'|'denied'|'restricted'|'not-determined'|'unknown';
        remoteControl:false;
        selection?:'idle'|'selecting'|'approved'|'cancelled'|'error';
        lastError?:{code:string;message:string}|null;
      }>};
    };
  }
}
