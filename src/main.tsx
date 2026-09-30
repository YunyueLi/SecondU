import './styles.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import { ErrorBoundary } from './components';
import { App } from './App';
import './desktop-refinement.css';
import {PERSONAL_SPACE} from './space';
import { StartupScreen } from './StartupScreen';
import { t } from './i18n';

function InitialWorkspace(){
  const [error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const explicit=new URLSearchParams(location.search).has('space');
  useEffect(()=>{
    if(explicit)return;
    let active=true;setError('');
    // Prepare the personal namespace before App can read or write any records.
    // Explicit links still open their own space, including preserved early data.
    void fetch(`/api/spaces/${PERSONAL_SPACE}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)})
      .then(response=>{if(!response.ok)throw new Error(t('本机服务暂未响应，请稍后重试。','The local service is not responding. Please try again.'));if(active){const url=new URL(location.href);url.searchParams.set('space',PERSONAL_SPACE);location.replace(url.href);}})
      .catch(error=>{if(active)setError(error instanceof Error?error.message:t('无法连接本机服务。','Could not connect to the local service.'));});
    return()=>{active=false;};
  },[explicit,attempt]);
  if(explicit)return <App/>;
  return <StartupScreen state={error?'error':'loading'} error={error} onRetry={()=>setAttempt(value=>value+1)} desktop={new URLSearchParams(location.search).get('desktop')==='1'}/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AppsSDKUIProvider linkComponent="a"><ErrorBoundary><InitialWorkspace /></ErrorBoundary></AppsSDKUIProvider></React.StrictMode>);
