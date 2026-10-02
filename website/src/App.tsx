import Hero from './Hero';
import HeroBackdrop from './HeroBackdrop';
import Development from './Development';
import SiteHeader from './SiteHeader';
import EmbeddedProduct from './EmbeddedProduct';
import FuturePlayground from './FuturePlayground';
import Capabilities from './Capabilities';
import PrivacySection from './PrivacySection';
import ExpertShowcase from './ExpertShowcase';
import UnderstandingSystem from './UnderstandingSystem';
import BenchmarkHome from './BenchmarkHome';
import { LanguageSwitcher, useSiteLanguage } from './site-language';
import { ThemeSwitcher } from './site-theme';
function GitHubMark() {return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>;}
function OpenSource(){const {t}=useSiteLanguage();return <section className="site-section site-open" id="open"><div><h2>{t('开始使用 SecondU','Get started with SecondU')}</h2><p>{t('从你的数字分身开始，探索更贴合自己的工作与生活方式。','Start with your digital twin and discover a way of working that feels more like you.')}</p><div className="site-open-actions"><a className="site-pill is-primary" href="https://github.com/YunyueLi/SecondU/releases/latest" target="_blank" rel="noreferrer">{t('下载桌面版','Download for desktop')}</a><a className="site-pill" href="https://github.com/YunyueLi/SecondU" target="_blank" rel="noreferrer"><GitHubMark/>{t('查看源码','View source')}</a></div><a className="site-install-guide" href="https://github.com/YunyueLi/SecondU/blob/main/QUICKSTART.md" target="_blank" rel="noreferrer">{t('安装说明','Installation guide')}</a></div></section>;}
function SiteFooter() {
  const { t } = useSiteLanguage();
  const repository = 'https://github.com/YunyueLi/SecondU';
  return <footer className="site-ending site-footer" data-theme="dark"><div className="site-footer-in">
    <nav className="site-footer-cols" aria-label={t('资料与项目链接', 'Documentation and project links')}>
      <div><h3>{t('SecondU', 'SecondU')}</h3><a href="#experience">{t('体验产品', 'Try SecondU')}</a><a href="#capabilities">{t('现有能力', 'Current capabilities')}</a><a href="#future">{t('未来方向', 'Future directions')}</a></div>
      <div><h3>{t('开始使用', 'Get started')}</h3><a href={`${repository}/releases/latest`}>{t('下载桌面版', 'Download for desktop')}</a><a href={`${repository}/blob/main/QUICKSTART.md`}>{t('安装与运行', 'Installation and setup')}</a><a href={repository}><GitHubMark/>GitHub</a></div>
      <div><h3>{t('设计与开发', 'Design and development')}</h3><a href={`${repository}/blob/main/docs/PRODUCT.md`}>{t('完整产品定位', 'Product vision')}</a><a href={`${repository}/blob/main/docs/ROADMAP.md`}>{t('产品路线', 'Product roadmap')}</a><a href="#build">{t('构建记录', 'Build record')}</a></div>
      <div><h3>{t('开放与信任', 'Openness and trust')}</h3><a href="#benchmark">{t('上下文评测', 'Context benchmark')}</a><a href={`${repository}/blob/main/SECURITY.md`}>{t('安全与隐私', 'Security and privacy')}</a><a href={`${repository}/blob/main/LICENSE`}>MIT License</a><a href={`${repository}/blob/main/THIRD_PARTY_NOTICES.md`}>{t('开源致谢', 'Open-source acknowledgments')}</a></div>
    </nav>
    <div className="site-footer-bar"><p>{t('SecondU，另一个你。独立开源项目。', 'SecondU, another you. An independent open-source project.')} <a className="site-footer-secret" href="#">{t('移动鼠标，发现藏在首页的 2ndU。', 'Move your cursor to discover the 2ndU hidden on the homepage.')}</a></p><div className="site-footer-preferences"><LanguageSwitcher side="top"/><ThemeSwitcher side="top"/></div></div>
  </div></footer>;
}
export default function App() { const { t } = useSiteLanguage(); return <><a className="site-skip" href="#experience">{t("跳到交互体验", "Skip to the interactive experience")}</a><SiteHeader/><main><div className="site-hero-stage"><HeroBackdrop/><Hero /></div><div id="experience"><EmbeddedProduct /></div><Capabilities /><ExpertShowcase /><FuturePlayground /><PrivacySection/><UnderstandingSystem/><BenchmarkHome/><Development /><div className="site-ending" data-theme="dark"><OpenSource /></div></main><SiteFooter /></>; }
