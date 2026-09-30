import { useEffect, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { ArrowLeft, ArrowRight, CheckCircleFilled, Brain, User, Group, Folder, Glasses, Link, Loop, Desktop, InfoCircle } from '@openai/apps-sdk-ui/components/Icon';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Dialog, ErrorNotice } from '../components';
import { t, getLocale } from '../i18n';
import { enterLocalSpace } from '../LocalSpaces';
import { currentSpace, exampleSpaceForLocale, isExampleSpace, PERSONAL_SPACE } from '../space';
import { messageOf } from '../api';
import { getGuideChapters, readGuideProgress, saveGuideProgress, completeGuideChapter, type GuideChapterId } from './guideContent';
import { GuideFilm } from './GuideFilms';
import './guide.css';
export { hasSeenProductGuide } from './guideContent';
export type ProductGuideProps = {onClose:()=>void;onNavigate:(target:string)=>void;initialChapter?:GuideChapterId};

const chapterIcons = { vision: User, cognition: Brain, life: Desktop, experts: Group, projects: Folder, devices: Glasses, world: Link, history: Loop };

export function ProductGuide({onClose,onNavigate,initialChapter}:ProductGuideProps) {
  const [index,setIndex]=useState(()=>initialChapter?Math.max(0,getGuideChapters().findIndex(chapter=>chapter.id===initialChapter)):readGuideProgress().index);
  const [completed,setCompleted]=useState(()=>readGuideProgress().completed);
  const [openingExample,setOpeningExample]=useState(false),[exampleError,setExampleError]=useState('');
  const scrollRef=useRef<HTMLDivElement>(null);
  const chapters=getGuideChapters();const chapter=chapters[index];
  useEffect(()=>{saveGuideProgress(index,readGuideProgress().seen);scrollRef.current?.scrollTo({top:0});},[index]);
  function chapterTo(next:number){setIndex(next);}
  function close(){saveGuideProgress(index,true);onClose();}
  async function explore(){if(chapter.id==='vision'){setOpeningExample(true);setExampleError('');try{saveGuideProgress(index,true);await enterLocalSpace(isExampleSpace(currentSpace())?PERSONAL_SPACE:exampleSpaceForLocale(getLocale()));}catch(error){setExampleError(messageOf(error));setOpeningExample(false);}return;}if(!chapter.target){chapterTo(Math.min(index+1,chapters.length-1));return;}saveGuideProgress(index,true);onNavigate(chapter.target);onClose();}
  return <Dialog title={t('探索 SecondU','Explore SecondU')} onClose={close} className="product-guide-dialog">
    <div className="product-guide">
      <aside className="guide-chapters"><nav aria-label={t('产品介绍章节','Product guide chapters')}>{chapters.map((item,i)=>{const Icon=chapterIcons[item.id];return <button type="button" key={item.id} aria-current={i===index?'step':undefined} onClick={()=>chapterTo(i)}><Icon className="guide-chapter-icon" aria-hidden="true"/><span>{item.label}</span>{completed.includes(item.id)&&<CheckCircleFilled className="guide-chapter-check" aria-label={t('已看完','Completed')}/>}</button>;})}</nav><Button color="secondary" variant="ghost" size="sm" onClick={close}>{t('先去使用','Explore on my own')}</Button></aside>
      <section className="guide-page" aria-labelledby="guide-chapter-title">
        <div className="guide-page-scroll" ref={scrollRef}><header className="guide-copy"><div className="guide-title-line"><h3 id="guide-chapter-title">{chapter.title}</h3><Popover key={chapter.id}><Popover.Trigger><Button className="guide-scope-trigger" color="secondary" variant="ghost" size="sm" aria-label={t('查看演示说明','About this demo')}><span>{chapter.preview?'Dev':t('操作演示','Product demo')}</span><InfoCircle/></Button></Popover.Trigger><Popover.Content side="bottom" align="end" width={340} className="guide-scope-popover"><p>{chapter.note}</p></Popover.Content></Popover></div><p>{chapter.description}</p><ErrorNotice error={exampleError}/></header>
        <div className="guide-media-space"><div className="guide-preview" data-scene={chapter.id}>
          <GuideFilm key={chapter.id} id={chapter.id} onComplete={()=>setCompleted(completeGuideChapter(chapter.id))}/>
        </div></div>
        </div><footer className="guide-footer"><Button color="primary" size="md" loading={openingExample} disabled={openingExample} onClick={()=>void explore()}>{chapter.id==='vision'?(isExampleSpace(currentSpace())?t('返回我的空间','Back to my space'):t('查看示例','View example')):chapter.action}<ArrowRight/></Button><div><span className="guide-page-count">{index+1} / {chapters.length}</span>{index>0&&<Button color="secondary" variant="outline" uniform size="md" aria-label={t('上一章','Previous chapter')} onClick={()=>chapterTo(index-1)}><ArrowLeft/></Button>}<Button color="secondary" variant="outline" size="md" onClick={()=>index===chapters.length-1?close():chapterTo(index+1)}>{index===chapters.length-1?t('开始使用','Get started'):t('下一页','Next')}<ArrowRight/></Button></div></footer>
      </section>
    </div>
  </Dialog>;
}
