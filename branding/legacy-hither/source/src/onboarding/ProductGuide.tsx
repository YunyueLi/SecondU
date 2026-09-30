import { useEffect, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { ArrowLeft, ArrowRight, Check } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog } from '../components';
import { t } from '../i18n';
import { getGuideChapters, readGuideProgress, saveGuideProgress, completeGuideChapter } from './guideContent';
import { GuideFilm } from './GuideFilms';
import './guide.css';
export { hasSeenProductGuide } from './guideContent';
export type ProductGuideProps = {onClose:()=>void;onNavigate:(target:string)=>void};

export function ProductGuide({onClose,onNavigate}:ProductGuideProps) {
  const [index,setIndex]=useState(()=>readGuideProgress().index);
  const [completed,setCompleted]=useState(()=>readGuideProgress().completed);
  const chapters=getGuideChapters();const chapter=chapters[index];
  useEffect(()=>{saveGuideProgress(index,readGuideProgress().seen);},[index]);
  function chapterTo(next:number){setIndex(next);}
  function close(){saveGuideProgress(index,true);onClose();}
  function explore(){saveGuideProgress(index,true);onNavigate(chapter.target);onClose();}
  return <Dialog title={t('探索 Hither','Explore Hither')} onClose={close} className="product-guide-dialog">
    <div className="product-guide">
      <aside className="guide-chapters"><nav aria-label={t('产品介绍章节','Product guide chapters')}>{chapters.map((item,i)=><button type="button" key={item.id} aria-current={i===index?'step':undefined} onClick={()=>chapterTo(i)}><span className="guide-chapter-number">{String(i+1).padStart(2,'0')}</span><span>{item.label}</span>{completed.includes(item.id)&&<Check className="guide-chapter-check" aria-label={t('已看完','Completed')}/>}</button>)}</nav><Button color="secondary" variant="ghost" size="sm" onClick={close}>{t('先去使用','Explore on my own')}</Button></aside>
      <section className="guide-page" aria-labelledby="guide-chapter-title">
        <div className="guide-page-scroll"><header className="guide-copy"><h3 id="guide-chapter-title">{chapter.title}</h3><p>{chapter.description}</p></header>
        <div className="guide-preview" data-scene={chapter.id}>
          <GuideFilm key={chapter.id} id={chapter.id} onComplete={()=>setCompleted(completeGuideChapter(chapter.id))}/>
        </div>
        <details className="guide-boundary"><summary>{t('了解更多','Learn more')}</summary><p>{chapter.detail}</p><p>{chapter.note}</p><p>{t('预览使用虚构内容；这里的操作只改变画面，不会创建任务或执行外部动作。','The preview uses fictional content. Actions here only change the preview; they do not create tasks or perform external actions.')}</p></details>
        </div><footer className="guide-footer"><Button color="secondary" variant="ghost" size="md" onClick={explore}>{chapter.action}<ArrowRight/></Button><div><span className="guide-page-count">{index+1} / {chapters.length}</span>{index>0&&<Button color="secondary" variant="outline" uniform size="md" aria-label={t('上一章','Previous chapter')} onClick={()=>chapterTo(index-1)}><ArrowLeft/></Button>}<Button color="primary" size="md" onClick={()=>index===chapters.length-1?close():chapterTo(index+1)}>{index===chapters.length-1?t('开始使用','Get started'):t('下一页','Next')}<ArrowRight/></Button></div></footer>
      </section>
    </div>
  </Dialog>;
}
