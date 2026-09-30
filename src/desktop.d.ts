export {};

declare global {
  interface Window {
    hitherDesktop?: {
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
