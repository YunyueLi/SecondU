import { useEffect, useState, type ReactNode } from 'react';
import { exampleSpaceForLocale, currentSpace, isExampleSpace, LEGACY_ENGINEER_SPACE } from './space';
import { t, useLocale } from './i18n';
import { StartupScreen } from './StartupScreen';
import { createStartupRequest, StartupTimeoutError } from './startupRequest';

/** An example's language selects a separate fictional life, never a text projection. */
export function ExampleLanguageGate({children}:{children:ReactNode}) {
  const locale=useLocale(),current=currentSpace(),target=exampleSpaceForLocale(locale);
  const switching=isExampleSpace(current)&&current!==LEGACY_ENGINEER_SPACE&&current!==target;
  const [error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!switching)return;
    let active=true;setError('');
    const request=createStartupRequest(signal=>fetch(`/api/spaces/${target}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal}));
    void request.promise
      .then(async response=>{if(!response.ok)throw new Error(t('示例暂时无法打开，请重试。','The example could not be opened. Please try again.'));if(!active)return;const url=new URL(location.href);url.searchParams.set('space',target);const [view]=url.hash.slice(1).split('/');url.hash=view==='settings'?'settings/general':view==='task'?'assistant':view||'assistant';location.replace(url.href);})
      .catch(error=>{if(active)setError(error instanceof StartupTimeoutError?t('本机服务响应超时，请重试。','The local service took too long to respond. Please try again.'):error instanceof Error?error.message:t('无法连接本机服务。','Could not connect to the local service.'));});
    return()=>{active=false;request.abort();};
  },[switching,target,attempt]);
  return switching?<StartupScreen phase="example-space" state={error?'error':'loading'} error={error} onRetry={()=>setAttempt(value=>value+1)}/>:children;
}
