import {useState, type DragEvent, type KeyboardEvent} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {ArrowRight, Check, Document, Download, Edit, Group, Plus, User} from '@openai/apps-sdk-ui/components/Icon';
import {AgentAvatar, AgentBadgeStage} from '../../src/agents/AgentIdentity';
import {ArtifactCard} from '../../src/design-system/ArtifactCard';
import {SourcePill} from '../../src/design-system/SourcePill';
import {ArtifactPreview} from '../../src/artifacts/ArtifactPreview';
import type {AgentProfile} from '../../shared/contracts';
import {useSiteLanguage} from './site-language';
import {SiteChoice} from './SiteChoice';
import TaskPlayground from './TaskPlayground';
import './product-playground.css';

type Language = 'zh' | 'en';
type Translate = (zh: string, en: string) => string;

// Each language has its own example and editing state. Switching the site's
// language never replaces a person's draft or translates their saved changes.
function useLanguageState<T>(initial: (language: Language) => T) {
 const {language} = useSiteLanguage();
 const [states, setStates] = useState<Record<Language, T>>(() => ({zh: initial('zh'), en: initial('en')}));
 function update(change: (previous: T) => T) {
  setStates(previous => ({...previous, [language]: change(previous[language])}));
 }
 return [states[language], update] as const;
}

function specialistProfiles(t: Translate): AgentProfile[] {
 return [
  {id:'site-researcher', name:t('研究专家','Researcher'), role:t('回到原文，核对每一个判断','Check each claim against its source'), instructions:t('只根据选定资料整理发现，保留出处，区分证据与推断。','Work from selected sources, retain references, and distinguish evidence from interpretation.'), avatarStyle:'notionists', createdAt:'2026-10-01'},
  {id:'site-planner', name:t('计划负责人','Planning lead'), role:t('拆解目标，汇总团队的工作','Break down the goal and bring the work together'), instructions:t('明确目标与约束，按需分派工作，汇总结果并指出仍需决定的部分。','Clarify goals and constraints, delegate as needed, and summarize results and decisions still to be made.'), avatarStyle:'notionists', createdAt:'2026-10-01'},
  {id:'site-reviewer', name:t('质量评审','Reviewer'), role:t('检查遗漏与可验证的完成条件','Find gaps and check what is complete'), instructions:t('核对成果与要求，列出遗漏、证据不足和需要用户确认的事项。','Check results against the requirements. Identify gaps, unsupported claims, and decisions that need the user.'), avatarStyle:'notionists', createdAt:'2026-10-01'},
 ];
}

function UnderstandingDemo() {
 const {t} = useSiteLanguage();
 const [state, update] = useLanguageState(language => {
  const first = language === 'zh' ? '做重要决定前，习惯先比较不同方案，再决定下一步。' : 'Before an important decision, I like to compare a few options before choosing the next step.';
  return {versions:[first], editing:false, draft:first, sourceOpen:true};
 });
 const {versions, editing, draft, sourceOpen} = state;
 const current = versions.at(-1)!;
 function save() {
  const next = draft.trim();
  if (!next || next === current) return;
  update(previous => ({...previous, versions:[...previous.versions, next], editing:false}));
 }
 return <div className="spg-understanding spg-two-column">
  <section className="spg-context-card">
   <div className="spg-eyebrow"><User/>{t('个人背景','Personal context')}<span>v{versions.length}</span></div>
   <h3>{t('做事方式','Working style')}</h3>
   {editing ? <>
    <Textarea aria-label={t('修正这条理解','Correct this understanding')} variant="soft" value={draft} onChange={event => update(previous => ({...previous, draft:event.target.value}))} rows={4}/>
    <div className="spg-actions"><Button color="secondary" variant="ghost" size="sm" onClick={() => update(previous => ({...previous, editing:false}))}>{t('取消','Cancel')}</Button><Button color="primary" size="sm" disabled={!draft.trim() || draft.trim() === current} onClick={save}><Check/>{t('确认修正','Save correction')}</Button></div>
   </> : <>
    <p className="spg-understanding-copy">{current}</p>
    <div className="spg-actions"><SourcePill title={t('虚构访谈笔记','Fictional interview notes')} onOpen={() => update(previous => ({...previous, sourceOpen:!previous.sourceOpen}))}/><Button color="secondary" variant="outline" size="sm" onClick={() => update(previous => ({...previous, draft:current, editing:true}))}><Edit/>{t('修正理解','Correct')}</Button></div>
   </>}
   <div className="spg-context-use"><small>{t('如何用于任务','How this informs a task')}</small><p>{t('这条已确认的理解可用于安排计划和比较方案。修正后，原始依据和旧版本仍会保留。','This confirmed preference can inform plans and comparisons. Corrections preserve the source and earlier versions.')}</p></div>
  </section>
  <aside className="spg-evidence">
   <div className="spg-evidence-title"><Document/><h3>{t('查看这条理解的依据','Trace this understanding to its source')}</h3></div>
   <button className="spg-text-link" type="button" aria-expanded={sourceOpen} onClick={() => update(previous => ({...previous, sourceOpen:!previous.sourceOpen}))}>{sourceOpen ? t('收起原始记录','Hide original note') : t('查看原始记录','Read original note')}</button>
   {sourceOpen && <blockquote>{t('“做重要决定时，我会先把两三种方案摆出来比较，想清楚取舍，再确定下一步。”','“When making an important decision, I compare two or three options, think through the tradeoffs, then decide what comes next.”')}<cite>{t('虚构访谈记录','Fictional interview note')}</cite></blockquote>}
   <details className="spg-version-history" open={versions.length > 1}><summary>{t(`修订记录（${versions.length} 个版本）`,`Revision history (${versions.length} ${versions.length === 1 ? 'version' : 'versions'})`)}</summary>{versions.map((value, index) => <div key={index}><span>v{index + 1}{index === versions.length - 1 ? t('（当前）',' (current)') : ''}</span><p>{value}</p></div>)}</details>
  </aside>
 </div>;
}

function TeamDemo() {
 const {t} = useSiteLanguage();
 const specialists = specialistProfiles(t);
 const [selected, setSelected] = useState<string[]>(['site-planner']);
 const [lead, setLead] = useState('site-planner');
 const [preview, setPreview] = useState('site-researcher');
 const [face, setFace] = useState<'identity' | 'role' | 'history'>('identity');
 const [over, setOver] = useState(false);
 const agent = specialists.find(item => item.id === preview)!;
 function add(id: string) {
  if (!specialists.some(item => item.id === id)) return;
  setSelected(previous => previous.includes(id) ? previous : [...previous, id]);
  if (!lead) setLead(id);
  setPreview(id); setFace('identity');
 }
 function remove(id: string) {
  const next = selected.filter(item => item !== id);
  setSelected(next);
  if (lead === id) setLead(next[0] || '');
 }
 function drag(event: DragEvent, id: string) {
  event.dataTransfer.setData('application/x-secondu-specialist', id);
  event.dataTransfer.effectAllowed = 'copy'; setPreview(id); setFace('identity');
 }
 return <div className="spg-team">
  <aside className="spg-badge-preview"><div className="spg-badge-stage"><AgentBadgeStage agent={agent} face={face} onFaceChange={setFace}/></div><p>{t('点击工牌的「角色说明」可以翻面。','Select “Role” on the badge to turn it over.')}</p></aside>
  <div className="spg-team-controls"><h3>{t('按任务选择专家','Choose experts for the task')}</h3><p className="spg-muted">{t('加入研究、规划或评审专家，再指定一位负责人。也可以将列表中的专家拖入团队。','Add research, planning or review expertise, then choose a lead. You can also drag experts from the list into the team.')}</p>
   <div className="spg-specialists">{specialists.map(item => <div className="spg-specialist" key={item.id} draggable onDragStart={event => drag(event, item.id)}>
    <button type="button" className="spg-specialist-preview" aria-pressed={preview === item.id} onClick={() => {setPreview(item.id); setFace('identity');}}><AgentAvatar agent={item} size={36}/><span><strong>{item.name}</strong><small>{item.role}</small></span></button>
    <Button color="secondary" variant="ghost" uniform size="sm" disabled={selected.includes(item.id)} aria-label={selected.includes(item.id) ? t(`${item.name}已加入`,`${item.name} is on the team`) : t(`加入${item.name}`,`Add ${item.name}`)} onClick={() => add(item.id)}>{selected.includes(item.id) ? <Check/> : <Plus/>}</Button>
   </div>)}</div>
   <section className={`spg-team-drop ${over ? 'is-over' : ''}`} aria-label={t('已选团队成员','Selected team members')} onDragOver={event => {event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setOver(true);}} onDragLeave={event => {if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false);}} onDrop={event => {event.preventDefault(); setOver(false); add(event.dataTransfer.getData('application/x-secondu-specialist'));}}>
    <header><strong><Group/>{t('当前团队','Your team')}</strong><span>{t(`${selected.length} 位成员`,`${selected.length} ${selected.length === 1 ? 'member' : 'members'}`)}</span></header>
    {!selected.length ? <p className="spg-drop-hint">{t('把专家拖到这里，或点击上方加号。','Drag an expert here, or use the add buttons above.')}</p> : selected.map(id => {
     const item = specialists.find(member => member.id === id)!;
     return <div className="spg-team-member" key={id}><AgentAvatar agent={item} size={30}/><span>{item.name}</span><Button color="secondary" variant="ghost" size="sm" selected={lead === id} aria-pressed={lead === id} onClick={() => setLead(id)}>{lead === id ? <><Check/>{t('负责人','Lead')}</> : t('设为负责人','Make lead')}</Button><button type="button" className="spg-text-link" aria-label={t(`移除${item.name}`,`Remove ${item.name}`)} onClick={() => remove(id)}>{t('移除','Remove')}</button></div>;
    })}
   </section>
   <p className="spg-demo-note" role="status">{lead ? t(`${specialists.find(item => item.id === lead)?.name}负责统筹，其余成员按需参与。`,`${specialists.find(item => item.id === lead)?.name} coordinates; others contribute as needed. `) : t('先选择一位成员。','Choose a member to begin. ')}{t('团队配置仅保留在本页，不调用模型。','This team configuration stays on this page. No model is called.')}</p>
  </div>
 </div>;
}

type DemoFile = {id: string; name: string; versions: string[]};
function initialFiles(language: Language): DemoFile[] {
 const zh = language === 'zh';
 return [
  {id:'plan', name:zh ? '周末阅读计划.md' : 'Weekend reading plan.md', versions:[zh ? '# 周末阅读计划\n\n为自己留一段安静的时间。\n\n## 周六\n\n- 阅读一篇长文，记录三个问题\n- 午后散步，整理新的想法\n\n## 周日\n\n- 回看笔记，选择下周要继续探索的主题\n\n> 这是可以直接修改的虚构示例。' : '# Weekend reading plan\n\nMake room for some quiet time.\n\n## Saturday\n\n- Read a long-form article and note three questions\n- Take an afternoon walk and reflect on new ideas\n\n## Sunday\n\n- Review your notes and choose a topic to explore next week\n\n> This is a fictional example you can edit.']},
  {id:'list', name:zh ? '阅读清单.csv' : 'Reading list.csv', versions:[zh ? '主题,安排,状态\n设计与日常,周六上午,待阅读\n城市与空间,周六下午,待阅读\n本周笔记,周日下午,待整理' : 'Topic,Schedule,Status\nDesign and everyday life,Saturday morning,To read\nCities and spaces,Saturday afternoon,To read\nWeekly notes,Sunday afternoon,To organize']},
  {id:'code', name:'reading.ts', versions:['type Reading = { title: string; finished: boolean };\n\nexport function completed(items: Reading[]) {\n  return items.filter(item => item.finished);\n}\n']},
 ];
}
function FilesDemo() {
 const {t} = useSiteLanguage();
 const [state, update] = useLanguageState(language => ({files:initialFiles(language), selected:'plan', version:0, editing:false, draft:''}));
 const {files, selected, version, editing, draft} = state;
 const file = files.find(item => item.id === selected)!;
 const content = file.versions[version] ?? file.versions.at(-1)!;
 function open(id: string) {
  const next = files.find(item => item.id === id)!;
  update(previous => ({...previous, selected:id, version:next.versions.length - 1, editing:false}));
 }
 function save() {
  if (draft === file.versions.at(-1)) return;
  update(previous => ({...previous, files:previous.files.map(item => item.id === selected ? {...item, versions:[...item.versions, draft]} : item), version:file.versions.length, editing:false}));
 }
 function download() {
  const url = URL.createObjectURL(new Blob([content], {type:file.name.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
 }
 return <div className="spg-files">
  <aside><h3>{t('在已有成果上继续修改','Revise the work you already have')}</h3><p className="spg-muted">{t('修改文档、表格或代码，保存新版本后仍可查看和下载旧版。','Edit a document, table or code file. Save a new version while keeping earlier versions available to view and download.')}</p>
   {files.map(item => <div className={item.id === selected ? 'is-selected' : ''} key={item.id}><ArtifactCard artifact={{name:item.name, version:item.versions.length, content:item.versions.at(-1)}} onOpen={() => open(item.id)}/></div>)}
   <small>{t('本页提供 Markdown、CSV 和代码文件。修改保留在当前页面，刷新后重置。','This page includes Markdown, CSV and code files. Changes stay here until you refresh.')}</small>
   <small>{t('桌面版还支持图片和 PDF 原件预览。DOCX、XLSX、PPTX 需本机 LibreOffice 转换为只读预览，原文件可下载。','The desktop app also previews original images and PDFs. DOCX, XLSX and PPTX require local LibreOffice conversion for read-only previews; original files remain available to download.')}</small>
  </aside>
  <section className="spg-file-editor"><header><strong>{file.name}</strong><SiteChoice label={t('查看文件版本','View a file version')} value={String(version)} disabled={editing} options={file.versions.map((_,index)=>({value:String(index),label:`v${index+1}${index===file.versions.length-1?t('（最新）',' (latest)'):''}`}))} onChange={next=>update(previous=>({...previous,version:Number(next)}))}/><Button color="secondary" variant="ghost" uniform size="sm" title={t('下载当前所选版本','Download the selected version')} aria-label={t('下载当前所选版本','Download the selected version')} disabled={editing} onClick={download}><Download/></Button>{!editing && <Button color="secondary" variant="outline" size="sm" onClick={() => update(previous => ({...previous, draft:content, editing:true}))}><Edit/>{t('编辑','Edit')}</Button>}</header>
   {editing ? <><Textarea className="spg-file-input" aria-label={t('文件内容','File contents')} value={draft} onChange={event => update(previous => ({...previous, draft:event.target.value}))} rows={13}/><div className="spg-file-save"><span>{t(`保存为 v${file.versions.length + 1}，已有版本保留。`,`Save as v${file.versions.length + 1}. Earlier versions are kept.`)}</span><Button color="secondary" variant="ghost" size="sm" onClick={() => update(previous => ({...previous, editing:false}))}>{t('取消','Cancel')}</Button><Button color="primary" size="sm" disabled={draft === file.versions.at(-1)} onClick={save}><Check/>{t('保存新版本','Save new version')}</Button></div></> : <div className="spg-file-preview"><ArtifactPreview artifact={{name:file.name, version:version + 1}} content={content}/></div>}
  </section>
 </div>;
}

export default function ProductPlayground() {
 const {t} = useSiteLanguage();
 const [tab, setTab] = useState('understanding');
 const tabs = [
  {id:'understanding', title:t('个人理解','Personal context'), Icon:User},
  {id:'task', title:t('任务推进','Follow a task'), Icon:ArrowRight},
  {id:'team', title:t('专家团队','Expert team'), Icon:Group},
  {id:'files', title:t('成果版本','File revisions'), Icon:Document},
 ];
 function moveTab(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const index = tabs.findIndex(item => item.id === tab);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault(); setTab(tabs[next].id);
  document.getElementById(`spg-tab-${tabs[next].id}`)?.focus();
 }
 return <section className="site-section spg" id="details">
  <div className="site-section-head"><div><span className="site-tag">{t('产品体验','Explore SecondU')}</span><h2>{t('把个人理解用到具体任务中。','Put personal context to work.')}</h2><p>{t('查看一条偏好的依据，为周末计划选择相关背景，配置专家团队，或修改并保存成果版本。','Check the source of a preference, select context for a weekend plan, assemble an expert team, or edit and save a file version.')}</p></div></div>
  <div className="spg-shell"><div className="spg-tabs" role="tablist" aria-label={t('产品交互体验','Interactive product examples')} onKeyDown={moveTab}>
   {tabs.map(({id, title, Icon}) => <Button key={id} role="tab" id={`spg-tab-${id}`} aria-selected={tab === id} aria-controls={`spg-panel-${id}`} tabIndex={tab === id ? 0 : -1} selected={tab === id} color="secondary" variant="ghost" size="md" onClick={() => setTab(id)}><Icon/>{title}</Button>)}<span>{t('虚构资料演示','Fictional data demo')}</span>
  </div>
  <div role="tabpanel" id="spg-panel-understanding" aria-labelledby="spg-tab-understanding" hidden={tab !== 'understanding'}><UnderstandingDemo/></div>
  <div role="tabpanel" id="spg-panel-task" aria-labelledby="spg-tab-task" hidden={tab !== 'task'}><TaskPlayground/></div>
  <div role="tabpanel" id="spg-panel-team" aria-labelledby="spg-tab-team" hidden={tab !== 'team'}><TeamDemo/></div>
  <div role="tabpanel" id="spg-panel-files" aria-labelledby="spg-tab-files" hidden={tab !== 'files'}><FilesDemo/></div></div>
  <p className="spg-outro">{t('本页操作不连接模型或个人资料，刷新后重置。桌面版在本机保存资料与版本；运行任务需配置模型并授权所需工具。','These interactions use no models or personal data and reset on refresh. The desktop app stores data and versions locally; tasks require a configured model and permission for the tools they use.')}<ArrowRight/></p>
 </section>;
}
