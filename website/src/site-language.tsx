import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {Globe} from '@openai/apps-sdk-ui/components/Icon';
import {SiteChoice} from './SiteChoice';
import { setLocale } from '../../src/i18n';

type Language = 'zh' | 'en';
type SiteLanguage = { language: Language; setLanguage: (language: Language) => void; t: (zh: string, en: string) => string };
const Context = createContext<SiteLanguage>({ language: 'zh', setLanguage: () => {}, t: zh => zh });
export function SiteLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    let initial: Language = 'zh';
    try { initial = localStorage.getItem('secondu.website.language') === 'en' ? 'en' : 'zh'; } catch { /* Default to Chinese. */ }
    setLocale(initial === 'zh' ? 'zh-CN' : 'en');
    return initial;
  });
  function setLanguage(next: Language) {
    // Shared presentation components read their locale while rendering. Update
    // it before the provider rerenders, without mounting any application state.
    setLocale(next === 'zh' ? 'zh-CN' : 'en');
    setLanguageState(next);
  }
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = language === 'zh' ? 'SecondU，另一个你' : 'SecondU — another you';
    setLocale(language === 'zh' ? 'zh-CN' : 'en');
    try { localStorage.setItem('secondu.website.language', language); } catch { /* The page works without storage. */ }
  }, [language]);
  return <Context.Provider value={{ language, setLanguage, t: (zh, en) => language === 'zh' ? zh : en }}>{children}</Context.Provider>;
}
export function useSiteLanguage() { return useContext(Context); }
export function LanguageSwitcher({side='bottom'}:{side?:'top'|'bottom'}) {
 const {language,setLanguage,t}=useSiteLanguage();
 return <SiteChoice compact side={side} label={t('网站语言','Website language')} value={language} icon={<Globe/>} options={[{value:'zh',label:'中文'},{value:'en',label:'English'}]} onChange={next=>{if(next==='zh'||next==='en')setLanguage(next);}}/>;
}
