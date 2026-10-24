import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Switch } from '@openai/apps-sdk-ui/components/Switch';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { ArrowUp, CheckCircle, Clock, CloseBold, Plus, Sparkles, Stop, User } from '@openai/apps-sdk-ui/components/Icon';
import { activityPaletteOptions } from '../../shared/appearance-options.mjs';
import { ActivityEdge, type ActivityEdgeProps } from '../design-system/ActivityEdge';
import { observeActivityEdgeVisibility } from '../design-system/activity-edge-visibility';
import { ComposerSurface } from '../composer/ComposerSurface';
import { ServiceIcon } from '../connectors/ConnectorServiceIcon';
import { getLightStudyPointer } from './light-study-pointer.mjs';
import { Field } from '../components';
import { t } from '../i18n';
import './motion-examples.css';

type Palette = NonNullable<ActivityEdgeProps['palette']>;
type Intensity = 'subtle' | 'expressive';
const paletteOptions = () => activityPaletteOptions.map(option => ({ value: option.id, label: t(option.labelZh, option.labelEn) }));
const previewThemes = ['light', 'dark'] as const;
const themeLabel = (theme: string) => theme === 'light' ? t('浅色', 'Light') : t('深色', 'Dark');
const activityStates = () => [
  { value: 'running', label: t('正在整理资料', 'Organizing research'), Icon: Sparkles },
  { value: 'queued', label: t('等待开始', 'Queued'), Icon: Clock },
  { value: 'approval', label: t('等待批准', 'Awaiting approval'), Icon: User },
  { value: 'input', label: t('需要补充信息', 'Needs input'), Icon: User },
  { value: 'completed', label: t('整理完成', 'Research organized'), Icon: CheckCircle },
  { value: 'failed', label: t('读取失败，请重试', 'Read failed. Try again.'), Icon: CloseBold },
  { value: 'stopped', label: t('已停止', 'Stopped'), Icon: CloseBold },
];

function ComposerGlowPreview({ status, intensity, palette, paused, onStatus }: {
  status: string; intensity: Intensity; palette: Palette; paused: boolean; onStatus: (status: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const state = activityStates().find(item => item.value === status)!;
  return <div className="motion-composer-stage is-home">
    <div className="motion-activity-title" data-state={status}><state.Icon aria-hidden="true"/><span role="status">{state.label}</span></div>
    <ComposerSurface compact={false} home activity={false} onSubmit={event => { event.preventDefault(); onStatus('running'); }}>
      <ActivityEdge active={status === 'running'} radius="var(--composer-activity-radius)" intensity={intensity} palette={palette} paused={paused}/>
      <div className="composer-input"><Textarea variant="soft" aria-label={t('输入框动效预览草稿', 'Composer motion preview draft')} placeholder={t('继续补充你的想法…', 'Add another thought…')} value={draft} onChange={event => setDraft(event.target.value)} rows={2} autoResize maxRows={4}/></div>
      <div className="composer-leading"><span className="motion-composer-tool" aria-hidden="true"><Plus/></span><span className="motion-composer-mode">{t('自动', 'Auto')}</span></div>
      <div className="composer-trailing"><span className="motion-composer-model">SecondU</span>{status === 'running'
        ? <Button type="button" size="sm" color="primary" uniform aria-label={t('停止预览任务', 'Stop preview task')} onClick={() => onStatus('stopped')}><Stop/></Button>
        : <Button type="submit" size="sm" color="primary" uniform aria-label={t('开始预览任务', 'Start preview task')}><ArrowUp/></Button>}</div>
    </ComposerSurface>
  </div>;
}

export function ActivityEdgeExample() {
  const [palette, setPalette] = useState<Palette>('theme');
  const [status, setStatus] = useState('running');
  const [shape, setShape] = useState('composer');
  const [intensity, setIntensity] = useState<Intensity>('expressive');
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const state = activityStates().find(item => item.value === status)!;
  return <div className="motion-example">
    <div className="motion-example-controls">
      <Field label={t('任务状态', 'Task state')}><Select value={status} options={activityStates().map(({ value, label }) => ({ value, label }))} onChange={option => setStatus(option.value)}/></Field>
      <Field label={t('容器', 'Container')}><Select value={shape} options={[{value:'composer',label:t('对话输入框','Composer')},{value:'panel',label:t('宽面板','Wide panel')},{value:'strip',label:t('紧凑状态条','Compact status')}]} onChange={option => setShape(option.value)}/></Field>
      <Field label={t('强调程度', 'Emphasis')}><Select value={intensity} options={[{value:'subtle',label:t('柔和','Subtle')},{value:'expressive',label:t('鲜明','Expressive')}]} onChange={option => setIntensity(option.value as Intensity)}/></Field>
      <Field label={t('柔光配色', 'Glow palette')}><Select value={palette} options={paletteOptions()} onChange={option => setPalette(option.value as Palette)}/></Field>
    </div>
    <div className="motion-preview-pair" data-motion={reduced ? 'reduced' : undefined}>
      {previewThemes.map(theme => <section key={theme} data-theme={theme} className="motion-preview-theme">
        <span className="motion-theme-label">{themeLabel(theme)}</span>
        <div className="motion-example-stage">{shape === 'composer'
          ? <ComposerGlowPreview status={status} intensity={intensity} palette={palette} paused={paused} onStatus={setStatus}/>
          : <div className="motion-activity-specimen" data-shape={shape} data-state={status}>
            <ActivityEdge active={status === 'running'} radius={shape === 'strip' ? 8 : 16} intensity={intensity} palette={palette} paused={paused}/>
            <div className="motion-activity-title"><state.Icon aria-hidden="true"/><span role="status">{state.label}</span></div>
            {shape === 'panel' && <p>{t('整理设计资料与来源，生成下一版方案。', 'Organizing design references and sources for the next draft.')}</p>}
          </div>}
        </div>
      </section>)}
    </div>
    <div className="motion-example-actions"><Button size="sm" color="secondary" variant="outline" disabled={status !== 'running' || reduced} onClick={() => setPaused(value => !value)}>{paused ? t('播放预览','Play preview') : t('暂停预览','Pause preview')}</Button><Switch checked={reduced} onCheckedChange={setReduced} label={t('静态预览','Static preview')}/></div>
    <p className="ui-example-note">{t('轮廓保持稳定，柔光阴影缓慢明灭与迁移；任务停止后立即收起。', 'The outline stays stable while soft shadows slowly breathe and drift. The glow disappears when the task stops.')}</p>
  </div>;
}

const lightFamilies = () => [
  {value:'aura',label:t('呼吸柔光','Breathing glow'),description:t('当前任务输入框采用的效果：稳定轮廓与缓慢明灭、迁移的柔光阴影。','The effect used by the current task composer: a stable outline with soft shadows that slowly breathe and drift.')},
  {value:'beam',label:t('沿边光束（研究）','Border beam (study)'),description:t('独立研究类别：亮核与渐隐尾迹沿轮廓移动。此处尚未展示独立动态实现。','An independent study of a bright core and fading trail moving along an outline. A dedicated animation is not shown here yet.')},
  {value:'gradient',label:t('渐变轮廓','Gradient border'),description:t('色彩沿边缘分布，保持静止。','Color is distributed along a static outline.')},
  {value:'spotlight',label:t('指针聚光','Pointer spotlight'),description:t('局部光点随指针移动，离开后淡出；键盘聚焦时保持居中。','A local light follows the pointer and fades on exit; keyboard focus holds it at the center.')},
  {value:'shimmer',label:t('内容占位扫光','Skeleton shimmer'),description:t('扫光穿过待加载的内容结构，加载完成后显示正文。','A highlight crosses the expected content structure, then gives way to loaded content.')},
  {value:'sweep',label:t('镜面扫光','Specular sweep'),description:t('指针进入或键盘聚焦时，一束斜光扫过表面。','A diagonal light crosses once on pointer entry or keyboard focus.')},
  {value:'rim',label:t('轮廓显现','Contour reveal'),description:t('指针靠近边缘时显出局部轮廓，离开后消退。','The nearby part of the outline lights up as the pointer approaches and recedes on exit.')},
];

function StudySurface({ family, palette, paused, loaded }: { family: string; palette: Palette; paused: boolean; loaded: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const selected = lightFamilies().find(item => item.value === family)!;
  const option = activityPaletteOptions.find(item => item.id === palette)!;
  const color = option.stops?.[0].color ?? option.color;
  const gradient = option.stops ? option.color : `linear-gradient(125deg, ${color}, color-mix(in srgb, ${color} 25%, var(--color-surface)) 45%, ${color})`;
  useEffect(() => {
    const stop = ref.current ? observeActivityEdgeVisibility(ref.current) : undefined;
    return () => { stop?.(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, []);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!['spotlight', 'rim'].includes(family) || event.pointerType === 'touch') return;
    pointer.current = { x: event.clientX, y: event.clientY };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const element = ref.current;
      if (!element) return;
      const position = getLightStudyPointer(element.getBoundingClientRect(), pointer.current.x, pointer.current.y);
      element.style.setProperty('--study-pointer-x', `${position.x}px`);
      element.style.setProperty('--study-pointer-y', `${position.y}px`);
      element.style.setProperty('--study-radius', `${position.radius}px`);
      element.dataset.pointer = 'true';
    });
  }
  function leave() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (ref.current) ref.current.dataset.pointer = 'false';
  }
  return <div ref={ref} className="light-study-surface" data-family={family} data-paused={String(paused)} data-visible="false" data-pointer="false"
    tabIndex={['spotlight', 'rim', 'sweep'].includes(family) ? 0 : undefined} aria-label={selected.label}
    onPointerEnter={move} onPointerMove={move} onPointerLeave={leave} onPointerCancel={leave}
    style={{ '--study-color': color, '--study-gradient': gradient } as CSSProperties}>
    <span className="light-study-material" aria-hidden="true"/>
    {family === 'shimmer' && !loaded
      ? <div className="light-study-loading"><span className="sr-only" role="status">{t('正在加载摘要', 'Loading summary')}</span><div className="light-study-skeleton" aria-hidden="true"><i className="light-study-avatar"/><div><i/><i/><i/></div></div></div>
      : <div className="light-study-copy"><span>{t('设计参考', 'DESIGN REFERENCE')}</span><strong>{family === 'shimmer' ? t('把注意力留给内容', 'Keep attention on the content') : selected.label}</strong><p>{family === 'shimmer' ? t('资料已整理完成，可继续阅读与比较。', 'The references are ready to read and compare.') : family === 'beam' ? t('仅保留研究类别，暂不展示光束动效。', 'Study category only. No beam animation is displayed yet.') : t('细节随交互显现，内容始终清晰。', 'Details respond to interaction. Content stays clear.')}</p></div>}
  </div>;
}

export function LightStudyExample() {
  const [palette, setPalette] = useState<Palette>('theme');
  const [family, setFamily] = useState('aura');
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('running');
  const selected = lightFamilies().find(item => item.value === family)!;
  return <div className="motion-example">
    <div className="motion-example-controls">
      <Field label={t('效果家族', 'Effect family')}><Select value={family} options={lightFamilies().map(({value,label}) => ({value,label}))} onChange={option => setFamily(option.value)}/></Field>
      <Field label={t('配色', 'Palette')}><Select value={palette} options={paletteOptions()} onChange={option => setPalette(option.value as Palette)}/></Field>
    </div>
    <div className="motion-preview-pair">{previewThemes.map(theme => <section key={theme} data-theme={theme} className="motion-preview-theme">
      <span className="motion-theme-label">{themeLabel(theme)}</span><div className="light-study-stage">{family === 'aura'
        ? <ComposerGlowPreview status={status} intensity="expressive" palette={palette} paused={paused} onStatus={setStatus}/>
        : <StudySurface key={`${family}-${theme}`} family={family} palette={palette} paused={paused} loaded={loaded}/>}
      </div>
    </section>)}</div>
    <div className="motion-example-actions">{['aura', 'shimmer'].includes(family) && <Button color="secondary" variant="outline" size="sm" disabled={family === 'shimmer' && loaded} onClick={() => setPaused(value => !value)}>{paused ? t('播放预览', 'Play preview') : t('暂停预览', 'Pause preview')}</Button>}{family === 'shimmer' && <Button color="secondary" variant="outline" size="sm" onClick={() => setLoaded(value => !value)}>{loaded ? t('重新加载', 'Reload') : t('显示加载完成', 'Show loaded content')}</Button>}</div>
    <p className="ui-example-note">{selected.description}</p>
  </div>;
}

export function ConnectorIconExample() {
  const services = [{id:'alpha-vantage',name:'Alpha Vantage'},{id:'factset',name:'FactSet'},{id:'daloopa',name:'Daloopa'},{id:'fiscal-ai',name:'Fiscal.ai'},{id:'crunchbase',name:'Crunchbase'},{id:'morningstar',name:'Morningstar'},{id:'quartr',name:'Quartr'},{id:'lseg',name:'LSEG'},{id:'fmp',name:'FMP'}];
  return <><div className="catalogue-brand-icons">{services.map(service => <div key={service.id}><ServiceIcon service={{...service,category:'finance'}}/><span>{service.name}</span></div>)}</div><p className="ui-example-note">{t('按业务中的 32px 原尺寸展示。优先官方矢量；位图核对实际细节与明暗背景，低清图不能通过放大成为高清图。', 'Shown at the actual 32px product size. Prefer official vectors; check raster detail in both themes. Upscaling does not create a high-resolution source.')}</p></>;
}
