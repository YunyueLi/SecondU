import {useState} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {SegmentedControl} from '@openai/apps-sdk-ui/components/SegmentedControl';
import {ArrowUp} from '@openai/apps-sdk-ui/components/Icon';
import type {ApprovalMode,AgentProfile,Project,ProviderSettings} from '../../shared/contracts';
import {AgentBadgeStage} from '../agents/AgentIdentity';
import {ComposerSurface} from '../composer/ComposerSurface';
import {ComposerTools,ComposerContextBar,DigitalTwinMode} from '../composer/ComposerTools';
import {ModelPicker} from '../composer/ModelPicker';
import {ApprovalPicker,ContextUsage} from '../composer/ExecutionControls';
import {ProjectPicker} from '../ProjectWorkspace';
import {ConnectorPicker} from '../connectors/Connectors';
import {PlatformFilter} from '../cognition/PlatformFilter';
import {SpotIllustration} from '../SpotIllustration';
import {StartupScreen} from '../StartupScreen';
import type {Appearance} from '../appearance';
import {t} from '../i18n';
import '../agents/agents.css';
import '../agents/experts.css';

export function BadgeExample(){
 const [kind,setKind]=useState('self'),[face,setFace]=useState<'identity'|'role'|'history'>('identity');
 const agent:AgentProfile={id:kind==='self'?'hither':'catalogue-agent',name:kind==='self'?'SecondU':t('澄','Caspian'),role:kind==='long'?t('整理研究与生活中的线索，陪你把复杂想法变成下一步','Connect research and everyday context, then turn complex ideas into practical next steps'):kind==='self'?t('更懂你的数字分身','Your digital twin'):t('研究伙伴','Research partner'),instructions:t('这是用于展示工牌结构、文字换行和翻面的虚构角色。','A fictional role for demonstrating badge layout, wrapping, and flipping.'),avatarStyle:'notionists',createdAt:'2026-09-30T00:00:00.000Z'};
 return <><SegmentedControl value={kind} onChange={value=>{setKind(value);setFace('identity');}} aria-label={t('工牌示例','Badge example')}><SegmentedControl.Option value="self">SecondU</SegmentedControl.Option><SegmentedControl.Option value="short">{t('简短介绍','Short role')}</SegmentedControl.Option><SegmentedControl.Option value="long">{t('两行介绍','Two-line role')}</SegmentedControl.Option></SegmentedControl><div className="catalogue-badge-stage expert-showcase-stage"><AgentBadgeStage agent={agent} face={face} onFaceChange={setFace}/></div></>;
}
export function ComposerExample(){
 const [approval,setApproval]=useState<ApprovalMode|null>(null);
 const [layout,setLayout]=useState('home'),[text,setText]=useState(''),[twin,setTwin]=useState(true),[mode,setMode]=useState<'demo'|'live'>('live'),[project,setProject]=useState<string>(),[connectors,setConnectors]=useState<string[]>([]),[notice,setNotice]=useState('');
 const settings:ProviderSettings={provider:'moonshot',model:'kimi-k2.5',baseUrl:'https://api.moonshot.cn/v1',api:'chat_completions',hasKey:false,reasoningEffort:'medium'};
 const projects:Project[]=[{id:'catalogue-project',name:t('周末计划','Weekend plan'),kind:'local',description:'',archived:false,createdAt:'2026-09-30T00:00:00.000Z',updatedAt:'2026-09-30T00:00:00.000Z',execution:{status:'unavailable'}}];
 const localNotice=()=>setNotice(t('此入口仅展示界面；没有打开设置或连接服务。','This example does not open settings or connect to a service.'));
 const contextTools=<><ConnectorPicker data={{connectors:[]}} value={connectors} onChange={setConnectors} onManage={localNotice}/><DigitalTwinMode enabled={twin} onChange={setTwin} onManage={localNotice}/></>;
 return <><SegmentedControl value={layout} onChange={setLayout} aria-label={t('输入框场景','Composer scene')}><SegmentedControl.Option value="home">{t('新对话','New chat')}</SegmentedControl.Option><SegmentedControl.Option value="conversation">{t('已有对话','Existing chat')}</SegmentedControl.Option></SegmentedControl><div className={`catalogue-composer-stage ${layout==='home'?'is-home':''}`}><ComposerSurface compact={layout==='home'&&!text.includes('\n')&&text.length<48} onSubmit={event=>{event.preventDefault();setNotice(t('草稿留在示例中，没有发送或创建任务。','The draft stays in this example. Nothing was sent or created.'));}} context={layout==='home'&&<ComposerContextBar><ProjectPicker data={{projects}} value={project} onChange={setProject}/>{contextTools}<ApprovalPicker value={approval} onChange={setApproval}/></ComposerContextBar>}><div className="composer-leading"><ComposerTools onAttach={()=>setNotice(t('附件菜单已响应，本示例不读取文件。','Attachment action received. This example reads no files.'))}>{layout==='conversation'&&contextTools}</ComposerTools>{layout==='conversation'&&<ApprovalPicker value={approval} onChange={setApproval}/>}</div><div className="composer-input"><Textarea aria-label={t('组件示例对话草稿','Composer example draft')} value={text} onChange={event=>setText(event.target.value)} rows={1} autoResize maxRows={6} variant="soft" placeholder={t('写一句话，或换行继续…','Write a thought, or add another line…')}/></div><div className="composer-trailing"><ModelPicker settings={settings} mode={mode} onMode={setMode} onSettings={localNotice}/><ContextUsage/><Button type="submit" color="primary" uniform disabled={!text.trim()} aria-label={t('预览发送反馈','Preview send feedback')}><ArrowUp/></Button></div></ComposerSurface></div>{notice&&<p className="ui-result" role="status">{notice}</p>}</>;
}
export function PlatformFilterExample(){
 const [platform,setPlatform]=useState('all');const options=[{value:'all',label:t('所有平台','All platforms')},{value:'wechat',label:t('微信','WeChat')},{value:'slack',label:'Slack'},{value:'feishu',label:t('飞书','Feishu')},{value:'hither',label:'SecondU'}];
 return <><PlatformFilter value={platform} options={options} onChange={setPlatform} label={t('筛选平台示例','Filter platform example')}/><p className="ui-result" role="status">{t('当前显示：','Showing: ')}{options.find(item=>item.value===platform)?.label}</p></>;
}
export function IllustrationExample(){return <div className="catalogue-illustrations">{(['conversation','archive','milestone','rhythm'] as const).map((scene,index)=><figure key={scene}><SpotIllustration scene={scene}/><figcaption>{[t('开始交流','Conversation'),t('项目归档','Project'),t('记录一刻','Moment'),t('日常节奏','Routine')][index]}</figcaption></figure>)}</div>;}
export function StartupExample({appearance}:{appearance?:Partial<Appearance>}){const [state,setState]=useState('loading'),[retries,setRetries]=useState(0);return <><SegmentedControl value={state} onChange={setState} aria-label={t('启动示例状态','Startup example state')}><SegmentedControl.Option value="loading">{t('加载','Loading')}</SegmentedControl.Option><SegmentedControl.Option value="error">{t('错误','Error')}</SegmentedControl.Option></SegmentedControl><StartupScreen contained appearance={appearance} state={state==='error'?'error':'loading'} error={state==='error'?t('虚构示例：本机服务暂未响应。','Fictional example: the local service did not respond.'):undefined} onRetry={()=>{setRetries(count=>count+1);setState('loading');}}/><p className="ui-result">{t(`重试演示 ${retries} 次，未连接服务。`,`Retry demonstrated ${retries} times. No service was contacted.`)}</p></>;}
