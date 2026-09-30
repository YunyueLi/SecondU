import { useRef, useState, type AnchorHTMLAttributes } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Markdown } from '@openai/apps-sdk-ui/components/Markdown';
import { ArrowLeft, ArrowRight, BookOpen } from '@openai/apps-sdk-ui/components/Icon';
import { t } from '../i18n';
import './development.css';

const documents=import.meta.glob('../../docs/**/*.md',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
const key=(path:string)=>`../../docs/${path}`;
const entries=[['DEVELOPMENT.md','开发历程','Development'],['ITERATION.md','本轮工作清单','Iteration checklist'],['PRODUCT.md','产品定位与能力','Product & capabilities'],['RESEARCH.md','研究与设计取舍','Research & decisions'],['HARNESS.md','执行底座','Execution harness'],['revision-02/ACCEPTANCE.md','验收记录','Acceptance'],['DEVICES.md','多端协作','Devices']];

export function DevelopmentWorkspace({onExplore}:{onExplore:()=>void}) {
  const [path,setPath]=useState('DEVELOPMENT.md');const [history,setHistory]=useState<string[]>([]);const article=useRef<HTMLElement>(null);
  const source=documents[key(path)]||t('这份文档尚未随当前版本提供。','This document is not included in this build.');
  function open(next:string){if(!documents[key(next)])return;setHistory(current=>[...current,path]);setPath(next);article.current?.scrollTo(0,0);}
  function docTarget(href:string){if(!href||/^[a-z]+:/i.test(href)||href.startsWith('#'))return;const base=new URL(path,'https://hither-docs.invalid/docs/');const url=new URL(href,base);if(!url.pathname.startsWith('/docs/'))return;const next=decodeURIComponent(url.pathname.slice(6));return documents[key(next)]?next:undefined;}
  return <section className="development-workspace">
    <header className="development-heading"><div><Badge color="secondary" size="sm">{t('产品工程作业','Product engineering project')}</Badge><h1>{t('SecondU 的构建过程','Building SecondU')}</h1><p>{t('从研究与判断，到可以检查的实现。保留问题、取舍和每一次验证。','From research and decisions to inspectable work. Problems, trade-offs, and validation remain visible.')}</p></div><Button size="sm" color="secondary" variant="outline" onClick={onExplore}>{t('探索产品','Explore SecondU')}<ArrowRight/></Button></header>
    <div className="development-layout"><nav aria-label={t('项目资料','Project documentation')}>{entries.map(([target,zh,en])=><button type="button" key={target} aria-current={path===target?'page':undefined} onClick={()=>open(target)}>{t(zh,en)}<ArrowRight/></button>)}<p>{t('文档与项目源码共同维护。本页直接读取随当前应用构建的版本。','Documentation is maintained with the source and bundled with this build.')}</p></nav>
    <article ref={article} className="development-document"><div className="development-document-bar"><span><BookOpen/>{path}</span>{history.length>0&&<Button size="sm" color="secondary" variant="ghost" onClick={()=>{setPath(history.at(-1)!);setHistory(current=>current.slice(0,-1));article.current?.scrollTo(0,0);}}><ArrowLeft/>{t('返回上一篇','Back')}</Button>}</div>
    <Markdown className="rich-text" components={{a:({href,children}:AnchorHTMLAttributes<HTMLAnchorElement>)=>{const target=docTarget(href||'');if(target)return <button type="button" className="development-doc-link" onClick={()=>open(target)}>{children}</button>;return /^https?:\/\//i.test(href||'')?<a href={href} target="_blank" rel="noreferrer">{children}</a>:<span className="development-local-reference" title={href}>{children}</span>;}}}>{source}</Markdown></article></div>
  </section>;
}
