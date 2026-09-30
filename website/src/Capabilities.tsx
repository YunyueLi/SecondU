import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import {useSiteLanguage} from './site-language';
import {openProductRoute,type ProductRoute} from './product-navigation';
import './capabilities.css';

export default function Capabilities(){
 const {t}=useSiteLanguage();
 const groups:{title:string;body:string;links:{route:ProductRoute;title:string;detail:string}[]}[]=[
  {title:t('让理解有依据，也能被修正。','Understanding you, with room for correction.'),body:t('个人背景、偏好、经历和当前处境形成持续更新的认知。每条理解保留来源，事实与推断分别呈现。','Build an evolving understanding of your background, preferences, experiences and current circumstances. Retain sources and distinguish facts from interpretations.'),links:[
   {route:'self',title:t('个人画像','Personal profile'),detail:t('查看和修正已有理解','Review and correct personal context')},
   {route:'life',title:t('生活近况','Life now'),detail:t('目标、安排与当前处境','Goals, plans and current circumstances')},
   {route:'timeline',title:t('经历与关系','Experiences and relationships'),detail:t('沿时间回看人与事','Revisit people and events over time')},
   {route:'sources',title:t('资料与聊天来源','Sources and conversations'),detail:t('回到原始记录核对','Check the original record')},
  ]},
  {title:t('工作可以继续，成果可以积累。','Continue the work. Keep what you create.'),body:t('在同一个项目中保留对话、资料和决定。任务按授权调用工具，成果可继续编辑、保存版本并下载原件。','Keep conversations, sources and decisions in the same project. Tasks use authorized tools; edit results, retain versions and download the originals.'),links:[
   {route:'example-chat',title:t('对话与任务','Conversations and tasks'),detail:t('背景、权限与过程一起查看','Review context, permissions and activity')},
   {route:'projects',title:t('项目空间','Projects'),detail:t('围绕同一件事整理材料','Organize materials around one project')},
   {route:'artifacts',title:t('成果与版本','Artifacts and versions'),detail:t('编辑、预览和原件下载','Edit, preview and download originals')},
   {route:'automations',title:t('定期任务','Recurring work'),detail:t('按时间或资料导入触发','Trigger by time or source imports')},
  ]},
  {title:t('选择自己的模型、工具和边界。','Choose your models, tools and boundaries.'),body:t('资料保存在本机，模型与连接器分别配置。你决定每项任务的权限、执行环境和空间外观。','Keep data locally and configure models and connectors separately. Choose task permissions, execution environments and your workspace appearance.'),links:[
   {route:'settings/model',title:t('模型连接','Model connections'),detail:t('自选提供方或兼容 API','Choose a provider or compatible API')},
   {route:'settings/connectors',title:t('工具与连接器','Tools and connectors'),detail:t('逐项配置和授权','Configure and authorize each service')},
   {route:'settings/computer',title:t('电脑与执行环境','Computers and execution'),detail:t('查看本机与远程连接状态','Inspect local and remote connection states')},
   {route:'settings/appearance',title:t('语言与外观','Language and appearance'),detail:t('主题、装饰与阅读偏好','Themes, artwork and reading preferences')},
  ]},
 ];
 return <section className="site-section site-capabilities" id="capabilities"><div className="site-section-head"><h2>{t('从个人理解，到持续行动。','From personal context to ongoing work.')}</h2><p>{t('在上方产品窗口中查看这些能力。官网与桌面版使用同一套界面和中英文示例资料。','Explore these capabilities in the product window above. The website and desktop app share the same interface and Chinese and English example workspaces.')}</p></div><div className="cap-stories">{groups.map((group,index)=><article className="cap-story" key={index}><div className="cap-story-intro"><span className="cap-story-index" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><h3>{group.title}</h3><p>{group.body}</p></div><div className="cap-story-links">{group.links.map(link=><Button key={link.route} color="secondary" variant="ghost" className="cap-route" onClick={()=>openProductRoute(link.route)}><span><strong>{link.title}</strong><small>{link.detail}</small></span><ArrowRight/></Button>)}</div></article>)}</div><p className="cap-scope">{t('网页示例不调用模型，也不连接你的文件或账户。桌面版运行任务需配置模型并授权工具；定期任务需要本机保持在线。远程电脑和具体连接器按项目逐步验证。','The web example makes no model calls and connects to none of your files or accounts. Desktop tasks require a configured model and authorized tools; recurring work requires the local service to stay online. Remote computers and individual connectors are being validated in stages.')}</p></section>;
}
