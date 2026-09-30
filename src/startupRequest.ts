export class StartupTimeoutError extends Error {
  constructor(){super('The local service took too long to respond.');this.name='StartupTimeoutError';}
}

/** A workspace request settles on timeout or unmount, even across a service restart. */
export function createStartupRequest<T>(load:(signal:AbortSignal)=>Promise<T>,timeoutMs=15000){
  const controller=new AbortController();
  let onAbort:()=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{
    onAbort=()=>reject(controller.signal.reason);
    controller.signal.addEventListener('abort',onAbort,{once:true});
  });
  const timer=setTimeout(()=>controller.abort(new StartupTimeoutError()),timeoutMs);
  const pending=Promise.resolve().then(()=>{
    controller.signal.throwIfAborted();
    return load(controller.signal);
  });
  const promise=Promise.race([pending,aborted]).finally(()=>{
    clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);
  });
  return {promise,signal:controller.signal,abort:()=>controller.abort()};
}
