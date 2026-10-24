import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import {Sun,Moon} from '@openai/apps-sdk-ui/components/Icon';
import {SiteChoice} from './SiteChoice';
import { useSiteLanguage } from './site-language';
import { themeColors, themeQuery, themeStorageKey } from '../theme-bootstrap.mjs';

type Theme = 'light' | 'dark';
type Preference = Theme | 'system';
type SiteTheme = { preference: Preference; theme: Theme; setPreference: (preference: Preference) => void };
const storageKey = themeStorageKey;
const query = themeQuery;
const isPreference = (value: unknown): value is Preference => value === 'light' || value === 'dark' || value === 'system';
const Context = createContext<SiteTheme>({ preference: 'system', theme: 'light', setPreference: () => {} });

export function SiteThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<Preference>(() => {
    try { const saved = localStorage.getItem(storageKey); return isPreference(saved) ? saved : 'system'; }
    catch { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  const theme: Theme = preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
  function setPreference(next: Preference) {
    if (!isPreference(next)) return;
    setPreferenceState(next);
    try { localStorage.setItem(storageKey, next); } catch { /* The switch also works without storage. */ }
  }
  useEffect(() => {
    const media = window.matchMedia(query);
    const onMediaChange = () => setSystemDark(media.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) setPreferenceState(isPreference(event.newValue) ? event.newValue : 'system');
    };
    onMediaChange();
    media.addEventListener('change', onMediaChange);
    window.addEventListener('storage', onStorage);
    return () => { media.removeEventListener('change', onMediaChange); window.removeEventListener('storage', onStorage); };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[theme]);
  }, [theme]);
  return <Context.Provider value={{ preference, theme, setPreference }}>{children}</Context.Provider>;
}

export function useSiteTheme() { return useContext(Context); }

function SystemThemeIcon(){return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor"/></svg>;}
export function ThemeSwitcher({side='bottom',iconOnly=false,surface='page'}:{side?:'top'|'bottom';iconOnly?:boolean;surface?:'page'|'dark'}) {
 const {preference,setPreference}=useSiteTheme();
 const {t}=useSiteLanguage();
 const options=[{value:'system',label:t('跟随系统','System'),icon:<SystemThemeIcon/>},{value:'light',label:t('浅色','Light'),icon:<Sun/>},{value:'dark',label:t('深色','Dark'),icon:<Moon/>}];
 return <SiteChoice compact iconOnly={iconOnly} side={side} surface={surface} label={t('网站外观','Website appearance')} value={preference} icon={options.find(item=>item.value===preference)?.icon} options={options} onChange={next=>{if(isPreference(next))setPreference(next);}}/>;
}
