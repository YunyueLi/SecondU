import React, {useEffect} from 'react';
import { createRoot } from 'react-dom/client';
import { AppsSDKUIProvider } from '@openai/apps-sdk-ui/components/AppsSDKUIProvider';
import { LanguageSwitcher, SiteLanguageProvider, useSiteLanguage } from './site-language';
import { SiteThemeProvider, ThemeSwitcher } from './site-theme';
import Benchmark from './Benchmark';
import './site.css';
import './site-header.css';
function BenchmarkPage() {
    const { language, t } = useSiteLanguage();
    useEffect(() => {
        const frame = requestAnimationFrame(() => { document.title = language === 'zh' ? 'SecondU · 个人上下文评测' : 'SecondU · Context benchmark'; });
        return () => cancelAnimationFrame(frame);
    }, [language]);
    const base = import.meta.env.BASE_URL === './' ? '../' : import.meta.env.BASE_URL;
    return <><header className="benchmark-page-header"><a href={`${base}?lang=${language}#benchmark`} aria-label={t('返回 SecondU', 'Back to SecondU')}><img src={`${base}assets/secondu-mark.svg`} alt=""/><span>SecondU</span></a><div><LanguageSwitcher /><ThemeSwitcher /></div></header><main><Benchmark standalone/></main><footer className="benchmark-page-footer">{t('公开的合成评测。原始回复保留原语言。', 'A public synthetic evaluation. Original replies retain their language.')}</footer></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><SiteLanguageProvider><SiteThemeProvider><AppsSDKUIProvider linkComponent="a"><BenchmarkPage /></AppsSDKUIProvider></SiteThemeProvider></SiteLanguageProvider></React.StrictMode>);
