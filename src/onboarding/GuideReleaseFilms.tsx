import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Chart, Check, ChevronRight, CreditCard, Desktop, Folder, Link, Plus, Settings } from '@openai/apps-sdk-ui/components/Icon';
import { AllocationDonut, type AllocationGroup } from '../finance/AllocationDonut';
import { ActivityEdge } from '../design-system/ActivityEdge';
import { HitherWordmark } from '../HitherWordmark';
import { t } from '../i18n';
import { MotionAppear } from './filmMotion';
import './guideReleaseFilms.css';

// Authored examples only. These scenes make no requests and never use a space's records.
export function GuideFinanceFilm({time}:{time:number}) {
 const groups:AllocationGroup[]=[
  {id:'guide-cash',name:t('现金与存款','Cash and deposits'),amount:12000000n,assetType:'cash',color:''},
  {id:'guide-fund',name:t('基金','Funds'),amount:9000000n,assetType:'fund',color:''},
  {id:'guide-gold',name:t('黄金','Gold'),amount:3000000n,assetType:'gold',color:''},
 ];
 const sections=[t('财务总览','Overview'),t('我的账户','Accounts'),t('投资持仓','Holdings'),t('市场行情','Market'),t('负债与还款','Debt and repayments'),t('收支记录','Transactions'),t('财务规划','Planning')];
 return <div className="guide-release-window guide-finance-film">
  <aside><HitherWordmark/><strong><Chart/>{t('财务','Finance')}</strong>{sections.map((label,index)=><span key={label} className={(time<11000?index===0:index===5)?'is-current':''}>{label}</span>)}<small>{t('从「更多」打开，按需固定','Open from More and pin when useful')}</small></aside>
  <main><header><h2>{time<11000?sections[0]:sections[5]}</h2><Badge color="secondary" variant="soft">{t('虚构示例','Fictional example')}</Badge></header>
   <MotionAppear at={0} until={11000} className="guide-finance-overview">
    <dl><div><dt>{t('总资产（CNY）','Total assets (CNY)')}</dt><dd>240,000.00</dd></div><div><dt>{t('已记录负债','Recorded debt')}</dt><dd>24,000.00</dd></div><div><dt>{t('净资产','Net worth')}</dt><dd>216,000.00</dd></div></dl>
    <div className="guide-finance-view"><strong>{t('资产全景','Asset panorama')}</strong><SegmentedControl aria-label={t('资产全景视图','Asset panorama view')} value="allocation" onChange={()=>{}} size="md" pill={false}><SegmentedControl.Option value="structure">{t('结构','Structure')}</SegmentedControl.Option><SegmentedControl.Option value="allocation">{t('占比','Allocation')}</SegmentedControl.Option><SegmentedControl.Option value="details">{t('明细','Details')}</SegmentedControl.Option></SegmentedControl></div>
    <div className="finance-workspace finance-panorama"><AllocationDonut groups={groups} currency="CNY" hidden={false} embedded label={t('按资产类型','By asset type')} onSelect={()=>{}}/></div>
    <p className="guide-release-footnote">{t('按账户、机构或币种查看；每项数据保留来源与日期。','Explore by account, institution or currency, with sources and dates for every record.')}</p>
   </MotionAppear>
   <MotionAppear at={11400} className="guide-finance-transactions">
    <div className="guide-release-toolbar"><Button color="secondary" variant="outline" size="md">{t('全部分类','All categories')}</Button><Button color="primary" size="md"><Plus/>{t('记一笔','Add transaction')}</Button></div>
    {[{name:t('工资收入','Salary'),date:'10/23',amount:'+18,000.00'},{name:t('房租','Rent'),date:'10/24',amount:'−4,500.00'},{name:t('日常采购','Groceries'),date:'10/24',amount:'−320.00'}].map(row=><div className="guide-finance-transaction" key={row.name}><CreditCard/><span><strong>{row.name}</strong><small>{row.date} · {t('手动记录','Manual entry')}</small></span><b>{row.amount} CNY</b></div>)}
    <MotionAppear at={14100} className="guide-finance-report"><Folder/><div><strong>{t('把本周变化带入讨论','Discuss this week’s changes')}</strong><p>{t('审阅账户、收支和数据缺口，准备财务周报或任务草稿。','Review accounts, transactions and missing data to prepare a weekly report or task draft.')}</p></div><ChevronRight/></MotionAppear>
    <p className="guide-release-footnote">{t('连接器只读。买卖、转账和自动理财不在执行范围内。','Read-only connectors. Trading, transfers and automated investing are not performed.')}</p>
   </MotionAppear>
  </main>
 </div>;
}

export function GuideSetupFilm({time}:{time:number}) {
 const appearance=time>=12000,computer=time>=5500&&!appearance;
 return <div className="guide-release-window guide-setup-film">
  <aside><HitherWordmark/><strong><Settings/>{t('工作区设置','Workspace settings')}</strong>{[t('导航','Navigation'),t('电脑','Computer'),t('外观','Appearance')].map((label,index)=><span key={label} className={index===(appearance?2:computer?1:0)?'is-current':''}>{label}</span>)}<small>{t('按需开启，保存你的选择','Enable what you need and keep your choices')}</small></aside>
  <main><header><h2>{appearance?t('让工作区适合你','Make the workspace yours'):computer?t('选择执行电脑','Choose a computer'):t('常用功能，就放在手边','Keep frequent features close')}</h2><Badge color="secondary" variant="soft">{t('虚构示例','Fictional example')}</Badge></header>
   <MotionAppear at={0} until={5300} className="guide-setup-body"><p>{t('「更多」收纳可选功能；固定后出现在侧栏。','More holds optional features. Pin one to keep it in the sidebar.')}</p>{[{icon:Chart,name:t('财务','Finance'),detail:t('账户、持仓、收支与规划','Accounts, holdings, transactions and planning')},{icon:Folder,name:t('资料库','Library'),detail:t('集中查看任务成果与版本','Browse task results and revisions')}].map(({icon:Icon,name,detail})=><div className="guide-setup-row" key={name}><Icon/><span><strong>{name}</strong><small>{detail}</small></span><Button color="secondary" variant="soft" size="md"><Check/>{t('已固定','Pinned')}</Button></div>)}<div className="guide-setup-source"><Link/>{t('首页建议可以先展开问题与来源，再决定是否继续。','Inspect a home suggestion and its sources before continuing.')}</div></MotionAppear>
   <MotionAppear at={5700} until={11800} className="guide-setup-body"><SegmentedControl aria-label={t('执行电脑','Execution computer')} value="local" onChange={()=>{}} size="md"><SegmentedControl.Option value="local">{t('本机','This computer')}</SegmentedControl.Option><SegmentedControl.Option value="remote">{t('远端电脑','Remote computers')}</SegmentedControl.Option></SegmentedControl><div className="guide-setup-row"><Desktop/><span><strong>{t('示例工作电脑','Example work computer')}</strong><small>{t('模型与工具按当前电脑分别检测','Models and tools are checked on this computer')}</small></span><Badge color="secondary" variant="soft">{t('检测示例','Example check')}</Badge></div><div className="guide-setup-path"><Folder/><span>{t('项目工作目录','Project directory')}<strong>~/Projects/example-project</strong></span></div><p>{t('先配置远端地址与工作目录，再连接并检查状态。任务沿用所选电脑的模型、工具和权限。','Configure a remote address and working directory, then connect and inspect its state. Tasks use the selected computer’s models, tools and permissions.')}</p></MotionAppear>
   <MotionAppear at={12200} className="guide-setup-body"><div className="guide-setup-row"><span><strong>{t('强调色','Accent')}</strong><small>{t('预设、自定义或多彩','Preset, custom or multicolor')}</small></span><div className="guide-setup-colors"><i/><i/><i/><i/></div></div><div className="guide-setup-row"><span><strong>{t('呼吸柔光','Breathing glow')}</strong><small>{t('默认多彩、柔和；可关闭或减少动态效果','Multicolor and subtle by default; turn off or reduce motion')}</small></span><Badge color="secondary" variant="soft">{t('柔和','Subtle')}</Badge></div><div className="guide-setup-composer"><ActivityEdge active palette="spectrum" intensity="subtle" radius={24}/><span>{t('生成中，柔光随任务出现','A soft glow accompanies active generation')}</span><footer><Plus/><span>{t('示例状态','Example state')}</span></footer></div></MotionAppear>
  </main>
 </div>;
}
