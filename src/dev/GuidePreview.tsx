import '../styles.css';
import '../desktop-refinement.css';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AppsSDKUIProvider} from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ProductGuide} from '../onboarding/ProductGuide';
import {getGuideChapters} from '../onboarding/guideContent';
import {exampleSpaceForLocale} from '../space';
import {getLocale,setLocale,useLocale,t} from '../i18n';
function Preview(){const [open,setOpen]=useState(true),locale=useLocale();const [initialChapter]=useState(()=>getGuideChapters().find(chapter=>chapter.id===new URLSearchParams(location.search).get('chapter'))?.id);return <><nav style={{padding:20,display:'flex',gap:12}}><Button color="secondary" onClick={()=>setOpen(true)}>{t('重新打开介绍','Reopen introduction')}</Button><Button color="secondary" onClick={()=>setLocale(getLocale()==='en'?'zh-CN':'en')}>{locale==='en'?'中文':'English'}</Button></nav>{open&&<ProductGuide initialChapter={initialChapter} onClose={()=>setOpen(false)} onNavigate={target=>location.href=`/?space=${exampleSpaceForLocale(getLocale())}#${target}`}/>}</>;}
if(import.meta.env.DEV)createRoot(document.getElementById('root')!).render(<AppsSDKUIProvider linkComponent="a"><Preview/></AppsSDKUIProvider>);
