import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import {Sun,Moon,MoonSunSystem} from '@openai/apps-sdk-ui/components/Icon';
import {SiteChoice} from './SiteChoice';
import { useSiteLanguage } from './site-language';

type Theme = 'light' | 'dark';
type Preference = Theme | 'system';
type SiteTheme = { preference: Preference; theme: Theme; setPreference: (preference: Preference) => void };
const storageKey = 'secondu.website.theme';
const query = '(prefers-color-scheme: dark)';
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161616' : '#f8f7f4');
  }, [theme]);
  return <Context.Provider value={{ preference, theme, setPreference }}>{children}</Context.Provider>;
}

export function useSiteTheme() { return useContext(Context); }

export function ThemeSwitcher({side='bottom'}:{side?:'top'|'bottom'}) {
 const {preference,setPreference}=useSiteTheme();
 const {t}=useSiteLanguage();
 const options=[{value:'light',label:t('浅色','Light'),icon:<Sun/>},{value:'dark',label:t('深色','Dark'),icon:<Moon/>},{value:'system',label:t('跟随系统','System'),icon:<MoonSunSystem/>}];
 return <SiteChoice compact side={side} label={t('网站外观','Website appearance')} value={preference} icon={options.find(item=>item.value===preference)?.icon} options={options} onChange={next=>{if(isPreference(next))setPreference(next);}}/>;
}
