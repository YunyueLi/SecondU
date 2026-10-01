import { displayProfileName } from './profile';
import { UserAvatar } from './UserAvatar';
import {ConnectorsSettings,ConnectorGlyph} from './connectors/Connectors';
import { t } from './i18n';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Bootstrap } from '../shared/contracts';
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { AppearanceSettings } from './AppearanceSettings';
import { GeneralSettings } from './GeneralSettings';
import type { Appearance, AppearanceStatus } from './appearance';
import { Download, Check, ApiKey, MoonSunSystem, User, Desktop, Folder, ChevronDown, ArrowRight, Group, Document, SettingsSlider } from '@openai/apps-sdk-ui/components/Icon';
import { ErrorNotice, Field } from './components';
import { api, apiUrl, write, messageOf } from './api';
import { LocalSpaces } from './LocalSpaces';
import './settings.css';
import { ModelSettings } from './models/ModelSettings';
import { RecentChatArchives } from './RecentChatArchives';
import { MemoryImportEntry } from './cognition/MemoryImport';
import { TwinMcpSettings } from './cognition/TwinMcpSettings';
import { RemoteComputers } from './remote/RemoteComputers';

export type Theme = 'light' | 'dark' | 'system';
type SettingsCategory = 'general' | 'personal' | 'model' | 'computer' | 'appearance' | 'data' | 'connectors';
const getCategories = () => [
  { id: 'general', label: t('通用', 'General'), Icon: SettingsSlider },
  { id: 'personal', label: t("个人信息", "Profile"), Icon: User },
  { id: 'model', label: t("模型连接", "Model connections"), Icon: ApiKey },
  { id: 'connectors', label: t('连接器','Connectors'), Icon: ConnectorGlyph },
  { id: 'computer', label: t("电脑", "Computers"), Icon: Desktop },
  { id: 'appearance', label: t("外观", "Appearance"), Icon: MoonSunSystem },
  { id: 'data', label: t("资料", "Your data"), Icon: Folder },
] as const;

function PanelHeading({ id, title, description, status }: { id: string; title: string; description: string; status?: ReactNode }) {
  return <header className="settings-panel-heading">
    <div className="settings-title-row"><h2 id={id}>{title}</h2>{status}</div>
    <p>{description}</p>
  </header>;
}

function PersonalSpace({ data, onRefresh }: { data: Bootstrap; onRefresh: () => Promise<void> }) {
  const [name, setName] = useState(data.profile.name);
  const [description, setDescription] = useState(data.profile.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [avatar, setAvatar] = useState<string>();
  const [readingImage, setReadingImage] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const imageRequest = useRef(0);
  useEffect(() => () => { imageRequest.current++; }, []);
  const dirty = name !== data.profile.name || description !== data.profile.description || avatar !== undefined;

  async function chooseAvatar(file?: File) {
    if (!file) return;
    const request = ++imageRequest.current;
    setError(''); setSaved(false); setReadingImage(true);
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error(t('请选择 PNG、JPEG 或 WebP 图片', 'Choose a PNG, JPEG, or WebP image.'));
      if (file.size > 3 * 1024 * 1024) throw new Error(t('头像图片不能超过 3 MB', 'Avatar images must be 3 MB or smaller.'));
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= 16384 && bitmap.height <= 16384 && bitmap.width * bitmap.height <= 40_000_000;
      bitmap.close();
      if (!valid) throw new Error(t('图片尺寸过大，请选择较小的图片。', 'This image is too large. Choose a smaller image.'));
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(t('图片读取失败，请重新选择。', 'The image could not be read. Try selecting it again.')));
        reader.readAsDataURL(file);
      });
      if (request === imageRequest.current) setAvatar(image);
    } catch (e) { if (request === imageRequest.current) setError(messageOf(e)); }
    finally { if (request === imageRequest.current) setReadingImage(false); }
  }

  async function save() {
    setBusy(true); setError(''); setSaved(false);
    try {
      await write('/profile', { name: name.trim(), description: description.trim(), demo: data.profile.demo, ...(avatar === '' ? { clearAvatar: true } : avatar ? { avatarDataUrl: avatar } : {}) }, 'PUT');
      await onRefresh();
      setName(name.trim()); setDescription(description.trim()); setAvatar(undefined); setSaved(true);
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  return <>
    <div className="settings-profile-heading"><PanelHeading id="settings-personal-title" title={t("个人信息", "Profile")} description="" /></div>
    {data.profile.demo && <LocalSpaces compact />}

    <div className="settings-avatar-editor">
      <UserAvatar src={avatar ?? data.profile.avatarImage} size={64}/>
      <div><strong>{t('个人头像', 'Your avatar')}</strong><div className="settings-avatar-actions">
        <input ref={avatarInput} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label={t('选择个人头像', 'Choose your avatar')} onChange={event => { void chooseAvatar(event.target.files?.[0]); event.target.value = ''; }}/>
        <Button color="secondary" variant="outline" size="sm" disabled={busy || readingImage} loading={readingImage} onClick={() => avatarInput.current?.click()}>{t('上传图片', 'Upload image')}</Button>
        {(avatar ?? data.profile.avatarImage) && <Button color="secondary" variant="ghost" size="sm" disabled={busy || readingImage} onClick={() => { setAvatar(data.profile.avatarImage ? '' : undefined); setSaved(false); }}>{t('恢复默认', 'Use default')}</Button>}
      </div><p>{t('PNG、JPEG 或 WebP，最大 3 MB。保存后用于当前空间。', 'PNG, JPEG or WebP, up to 3 MB. Saved in this workspace.')}</p></div>
    </div>
    <div className="settings-form">
      <Field label={t("怎么称呼你", "What should we call you?")}><Input size="md" aria-label={t("我的称呼", "Your name")} value={name} disabled={busy} onChange={event => { setName(event.target.value); setSaved(false); }} placeholder={t("你的名字或习惯的称呼", "Your name or preferred name")} /></Field>
      <Field label={t("简单介绍自己", "A little about you")} hint={t("写下你正在做的事，以及目前对你重要的事。", "Share what you are working on and what matters to you.")}><Textarea size="md" aria-label={t("个人介绍", "Personal introduction")} value={description} disabled={busy} onChange={event => { setDescription(event.target.value); setSaved(false); }} rows={4} placeholder={t("你正在做什么，什么对你比较重要", "What are you working on? What matters to you?")} /></Field>
    </div>
    <ErrorNotice error={error} />
    <div className="settings-save-row">
      <Button color="primary" size="md" disabled={busy || readingImage || !name.trim() || !dirty} loading={busy} onClick={save}>{t("保存", "Save")}</Button>
      <span className="settings-save-status" role="status">{saved ? <><Check />{t("个人信息已保存", "Profile saved")}</> : dirty ? t("有未保存的修改", "Unsaved changes") : ''}</span>
    </div>
  </>;
}

export function SettingsWorkspace({ data, onRefresh, theme, onTheme, initialCategory, appearance, appearanceStatus, onAppearance }: { data: Bootstrap; onRefresh: () => Promise<void>; theme: Theme; onTheme: (theme: Theme) => void; initialCategory?:string; appearance:Appearance; appearanceStatus:AppearanceStatus; onAppearance:(update:Partial<Appearance>)=>void }) {
  const categories = getCategories();
  const [category, setCategory] = useState<SettingsCategory>('general');
  const platformName=({darwin:'macOS',win32:'Windows',linux:'Linux'} as Record<string,string>)[data.computer.platform]||data.computer.platform;
  useEffect(()=>{if(categories.some(item=>item.id===initialCategory))setCategory(initialCategory as SettingsCategory);},[initialCategory]);

  return <div className="settings-workspace settings-type-scale">

    <div className="settings-layout">
      <aside className="settings-navigation"><h1>{t("设置", "Settings")}</h1>
        <nav aria-label={t("设置分类", "Settings categories")}>
          {categories.map(({ id, label, Icon }) => <Button key={id} color="secondary" variant="ghost" size="md" pill={false} className="settings-category" selected={category === id} aria-current={category === id ? 'page' : undefined} aria-controls={`settings-${id}`} onClick={() => { setCategory(id); location.hash=`settings/${id}`; }}><Icon /><span>{label}</span></Button>)}
        </nav>
        <div className="settings-space-note"><span>{data.profile.demo ? t("示例空间", "Demo space") : t("个人空间", "Personal space")}</span><strong>{displayProfileName(data.profile)}</strong><p>{t("资料保存在当前电脑", "Data stays on this computer")}</p></div>
      </aside>
      <div className="settings-detail">
        {/* Keep each category mounted with its own scroll container, preserving unsaved input and reading position. */}
        <section id="settings-general" className="settings-panel" hidden={category !== 'general'} aria-labelledby="settings-general-title"><GeneralSettings value={appearance} status={appearanceStatus} onChange={onAppearance} data={data} onRefresh={onRefresh} /></section>
        <section id="settings-personal" className="settings-panel" hidden={category !== 'personal'} aria-labelledby="settings-personal-title"><PersonalSpace data={data} onRefresh={onRefresh} /></section>

        <section id="settings-model" className="settings-panel" hidden={category !== 'model'} aria-labelledby="settings-model-title">
          <ModelSettings data={data} onRefresh={onRefresh} />
        </section>

        <section id="settings-connectors" className="settings-panel" hidden={category !== 'connectors'} aria-labelledby="settings-connectors-title"><ConnectorsSettings data={data} onRefresh={onRefresh}/></section>

        <section id="settings-computer" className="settings-panel" hidden={category !== 'computer'} aria-labelledby="settings-computer-title">
          <PanelHeading id="settings-computer-title" title={t("当前电脑", "This computer")} description={t("SecondU 在这里处理任务，保存你的资料。", "SecondU runs tasks and keeps your data here.")} />
          <div className="settings-device-summary"><div className="settings-device-identity"><span className="settings-device-icon"><Desktop/></span><div><h3>{data.computer.name}</h3><p>{platformName}<span className={`settings-device-state ${data.computer.status==='online'?'is-online':''}`}><i aria-hidden="true"/>{data.computer.status==='online'?t('在线','Online'):t('离线','Offline')}</span></p></div></div>
          <div className="settings-runtime-row"><div><strong>{t('任务执行','Task execution')}</strong><p>{data.computer.codexAvailable?t('本机运行环境已就绪，可使用已配置的模型。','The local runtime is ready to use your configured models.'):t('尚未检测到 Codex 运行环境，模型任务暂时无法执行。','The Codex runtime was not detected. Model tasks are unavailable.')}</p></div><span className={`settings-runtime-status ${data.computer.codexAvailable?'is-ready':''}`}>{data.computer.codexAvailable?<Check/>:<Desktop/>}{data.computer.codexAvailable?t('已就绪','Ready'):t('未就绪','Not ready')}</span></div>
          </div><p className="settings-device-note">{t('保持电脑唤醒并运行 SecondU，任务与自动化才能继续。','Keep this computer awake and SecondU running for tasks and automations to continue.')}</p>
          <details className="settings-technical"><summary>{t('技术详情','Technical details')}<ChevronDown/></summary><dl><div><dt>{t('运行环境','Runtime')}</dt><dd>{data.computer.codexAvailable?'Codex':t('未检测到','Not detected')}</dd></div><div><dt>{t('版本','Version')}</dt><dd>{data.computer.codexVersion||t('暂无版本信息','Version unavailable')}</dd></div><div><dt>{t('系统标识','System identifier')}</dt><dd>{data.computer.platform}</dd></div><div><dt>{t('工作目录','Workspace')}</dt><dd className="settings-path">{data.computer.workspace}</dd></div></dl></details>
          <RemoteComputers data={data} onRefresh={onRefresh}/>
        </section>

        <section id="settings-appearance" className="settings-panel" hidden={category !== 'appearance'} aria-labelledby="settings-appearance-title">
          <AppearanceSettings theme={theme} onTheme={onTheme} value={appearance} status={appearanceStatus} onChange={onAppearance} />
        </section>

        <section id="settings-data" className="settings-panel" hidden={category !== 'data'} aria-labelledby="settings-data-title">
          <PanelHeading id="settings-data-title" title={t("你的资料", "Your data")} description={t("保存在这台电脑，随时整理或导出。", "Kept on this computer, ready to organize or export.")} />
          {!data.profile.demo&&<MemoryImportEntry onRefresh={onRefresh}/>}
          <div className="settings-data-summary"><div className="settings-data-space"><Folder/><div><strong>{displayProfileName(data.profile)}</strong><p>{data.profile.demo?t('包含虚构示例资料','Contains fictional demo data'):t('你的个人空间','Your personal space')}</p></div><span>{t('本地保存','Stored locally')}</span></div><div className="settings-data-counts"><span>{t(`${data.sources.length} 份来源`,`${data.sources.length} sources`)}</span><span>{t(`${data.facts.length} 条认识`,`${data.facts.length} insights`)}</span><span>{t(`${data.people.length} 位人物`,`${data.people.length} people`)}</span><span>{t(`${data.relationships.length} 条关系`,`${data.relationships.length} relationships`)}</span><span>{t(`${data.tasks.length} 个任务`,`${data.tasks.length} tasks`)}</span><span>{t(`${data.artifacts.length} 份成果`,`${data.artifacts.length} files`)}</span></div></div>
          <div className="settings-data-actions">
            <RecentChatArchives data={data} onRefresh={onRefresh}/>
            <div className="settings-data-action"><span className="settings-action-icon"><Document/></span><div><h3>{t('资料库','Library')}</h3><p>{t('导入文件，查看来源与已创建的内容。','Import files and review your sources and created content.')}</p></div><ButtonLink as="a" color="secondary" variant="ghost" size="sm" href="#artifacts">{t('打开','Open')}<ArrowRight/></ButtonLink></div>
            <div className="settings-data-action"><span className="settings-action-icon"><Group/></span><div><h3>{t('联系人记录','Contact records')}</h3><p>{t('预览并导入微信、Instagram、WhatsApp 的导出文件。','Preview and import WeChat, Instagram, and WhatsApp exports.')}</p></div><ButtonLink as="a" color="secondary" variant="ghost" size="sm" href="#conversations">{t('导入','Import')}<ArrowRight/></ButtonLink></div>
            <div className="settings-data-action"><span className="settings-action-icon"><Download/></span><div><h3>{t('导出资料副本','Export a copy')}</h3><p>{t('包含来源、认识、关系、任务与成果。','Includes sources, insights, relationships, tasks, and files.')}</p></div><ButtonLink as="a" color="secondary" variant="outline" size="sm" href={apiUrl('/export')}>{t('导出','Export')}</ButtonLink></div>
          </div><TwinMcpSettings active={category==='data'} showcase={data.executionPolicy==='showcase'}/><p className="settings-data-note">{t('模型密钥只保存在本机，不包含在资料导出中。','Model keys stay on this computer and are excluded from data exports.')}</p>
        </section>
      </div>
    </div>
  </div>;
}
