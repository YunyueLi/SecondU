import { useEffect, useState } from 'react';
import type { Attachment } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { ArrowLeft, ArrowRight, Download, ImageSquare } from '@openai/apps-sdk-ui/components/Icon';
import { Dialog } from '../components';
import { t } from '../i18n';
import { timelinePhotoUrl } from './timelinePresentation';

export function TimelineImages({ images, onOpen }: { images: Attachment[]; onOpen: (index: number) => void }) {
  const [failed, setFailed] = useState<string[]>([]);
  return <div className={`timeline-images count-${images.length}`} aria-label={t(`${images.length} 张图片`, `${images.length} photos`)}>
    {images.map((image, index) => <button key={image.id} type="button" className="timeline-image" aria-label={t(`查看第 ${index + 1} 张图片：${image.name}`, `View photo ${index + 1}: ${image.name}`)} onClick={() => onOpen(index)}>
      {failed.includes(image.id) || !timelinePhotoUrl(image.id) ? <span className="timeline-image-unavailable"><ImageSquare />{t('图片暂时不可用', 'Photo unavailable')}</span> : <img src={timelinePhotoUrl(image.id)} alt={image.name} loading="lazy" onError={() => setFailed(items => [...items, image.id])} />}
    </button>)}
  </div>;
}

export function TimelinePhotoViewer({ images, initialIndex, onClose }: { images: Attachment[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex), [failed, setFailed] = useState<string[]>([]);
  const image = images[index];
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); setIndex(value => Math.max(0, value - 1)); }
      if (event.key === 'ArrowRight') { event.preventDefault(); setIndex(value => Math.min(images.length - 1, value + 1)); }
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, [images.length]);
  if (!image) return null;
  return <Dialog title={`${image.name} (${index + 1} / ${images.length})`} onClose={onClose} className="timeline-photo-dialog">
    <div className="timeline-photo-stage">{failed.includes(image.id) || !timelinePhotoUrl(image.id) ? <p role="status">{t('本机原图暂时无法读取，请回到记录重新添加。', 'The local original could not be read. Re-add it from the record.')}</p> : <img src={timelinePhotoUrl(image.id)} alt={image.name} onError={() => setFailed(items => [...items, image.id])} />}</div>
    <div className="timeline-photo-controls"><Button color="secondary" variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex(value => value - 1)}><ArrowLeft />{t('上一张', 'Previous')}</Button><a href={timelinePhotoUrl(image.id)} download={image.name}><Download />{t('原图', 'Original')}</a><Button color="secondary" variant="ghost" size="sm" disabled={index === images.length - 1} onClick={() => setIndex(value => value + 1)}>{t('下一张', 'Next')}<ArrowRight /></Button></div>
  </Dialog>;
}
