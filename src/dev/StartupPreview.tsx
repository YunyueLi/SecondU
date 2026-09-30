import '../styles.css';
import '../desktop-refinement.css';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AppsSDKUIProvider} from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {StartupScreen} from '../StartupScreen';
import {t,useLocale,setLocale} from '../i18n';
function Preview(){
 const locale=useLocale();
 const [state,setState]=useState<'loading'|'error'>('loading'),[retrying,setRetrying]=useState(false),[dark,setDark]=useState(false),[reduced,setReduced]=useState(false);
 return <div data-theme={dark?'dark':'light'} data-motion={reduced?'reduced':'system'}><nav aria-label={t('启动状态预览','Startup preview')} style={{position:'fixed',zIndex:5,top:14,left:14,display:'flex',flexWrap:'wrap',gap:6}}><Button size="sm" color="secondary" variant="outline" onClick={()=>{setState('loading');setRetrying(false);}}>{t('加载','Loading')}</Button><Button size="sm" color="secondary" variant="outline" onClick={()=>{setState('error');setRetrying(false);}}>{t('失败','Error')}</Button><Button size="sm" color="secondary" variant="outline" onClick={()=>setDark(v=>!v)}>{dark?t('浅色','Light'):t('深色','Dark')}</Button><Button size="sm" color="secondary" variant="outline" onClick={()=>setReduced(v=>!v)}>{reduced?t('开启动画','Enable motion'):t('减少动画','Reduce motion')}</Button><Button size="sm" color="secondary" variant="outline" onClick={()=>{setState('loading');setRetrying(false);}}>{t('完成重试','Finish retry')}</Button><Button size="sm" color="secondary" variant="outline" onClick={()=>setLocale(locale==='en'?'zh-CN':'en')}>{locale==='en'?'中文':'English'}</Button></nav><StartupScreen appearance={{theme:dark?'dark':'light',motion:reduced?'reduced':'system',fontSize:14,language:locale}} state={state} retrying={retrying} onRetry={()=>setRetrying(true)} error={t('本机服务暂未响应，请稍后重试。','The local service is not responding. Try again shortly.')}/></div>;
}
if(import.meta.env.DEV)createRoot(document.getElementById('root')!).render(<AppsSDKUIProvider linkComponent="a"><Preview/></AppsSDKUIProvider>);
