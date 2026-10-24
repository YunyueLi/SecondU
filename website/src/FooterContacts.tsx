import moonTexture from '../../public/art/ungetsu-moon.webp';
import { useSiteLanguage } from './site-language';

function GitHubMark() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>;
}

function XMark() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M18.8 3H22l-7 8 8.2 10H16.8l-5-6.2L6.3 21H3l7.3-8.4L2.5 3H9l4.6 5.7L18.8 3Zm-1 16h1.3L8 5H6.6l11.2 14Z"/></svg>;
}

function LinkedInMark() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="4.5" cy="4.5" r="2.2"/><path d="M2.6 8h3.8v13H2.6V8Zm6.3 0h3.6v1.8c.8-1.4 2.1-2.1 3.9-2.1 3.5 0 5 2.2 5 5.8V21h-3.8v-6.9c0-2-.6-3.1-2.3-3.1-1.9 0-2.6 1.3-2.6 3.2V21H8.9V8Z"/></svg>;
}

export default function FooterContacts() {
  const { t } = useSiteLanguage();
  return <div className="site-footer-social">
    <a href="https://ungetsu.net/" target="_blank" rel="noreferrer" aria-label="SecondU author's personal website" title={t('作者的个人网站', "SecondU author's personal website")}><span className="site-contact-moon" aria-hidden="true" style={{ backgroundImage: `url(${moonTexture})` }}/></a>
    <a href="https://github.com/YunyueLi/SecondU" target="_blank" rel="noreferrer" aria-label="SecondU project on GitHub" title={t('SecondU 的 GitHub 仓库', 'SecondU project on GitHub')}><GitHubMark/></a>
    <a href="https://x.com/ungetsuli" target="_blank" rel="noreferrer" aria-label="SecondU author on X" title={t('作者的 X 主页', 'SecondU author on X')}><XMark/></a>
    <a href="https://www.linkedin.com/in/ungetsu/" target="_blank" rel="noreferrer" aria-label="SecondU author on LinkedIn" title={t('作者的 LinkedIn 主页', 'SecondU author on LinkedIn')}><LinkedInMark/></a>
  </div>;
}
