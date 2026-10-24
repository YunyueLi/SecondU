import {Agent,Brain,Calendar,Chat,Clock,Document,DollarCircle,Edit,Folder,Nodes,Search,UserGpts,User,Chart,BarChart,CreditCard,Globe,Heart,Suitcase,Group,BookOpen} from '@openai/apps-sdk-ui/components/Icon';
import {t} from './i18n';
import {AGENTS_SECTIONS} from './agents-navigation-model.mjs';
import {FINANCE_SECTIONS,WORKSPACE_ORDER} from './finance-navigation-model.mjs';
import {OPTIONAL_WORKSPACE_IDS,type OptionalWorkspace} from './optional-navigation-model.mjs';

export type NavigationItem={id:string;label:string;Icon:typeof Chat};
export const isOptionalWorkspace=(id:string):id is OptionalWorkspace=>OPTIONAL_WORKSPACE_IDS.some(item=>item===id);

/** Desktop and phone render the same destinations; only their containers differ. */
export function getAppNavigation(){
  const agents={id:'agents',label:'Agents',Icon:Agent};
  const agentIcons={mine:Group,discover:BookOpen,market:Suitcase,dating:Heart};
  const finance={id:'finance',label:t('财务','Finance'),Icon:DollarCircle};
  const workspaces={
    agents,
    artifacts:{id:'artifacts',label:t('资料库','Library'),Icon:Document},
    finance,
    automations:{id:'automations',label:t('自动化','Automations'),Icon:Clock},
  };
  const financeIcons={overview:Chart,accounts:CreditCard,holdings:BarChart,market:Globe,liabilities:Document,transactions:DollarCircle,planning:Calendar};
  return {
    newChat:{id:'assistant',label:t('新对话','New chat'),Icon:Edit},
    digitalTwin:{id:'twin',label:t('数字分身','Digital twin'),Icon:Brain},
    search:{id:'history',label:t('搜索对话','Search chats'),Icon:Search},
    projects:{id:'projects',label:t('项目','Projects'),Icon:Folder},
    finance,
    agents,
    agentSections:AGENTS_SECTIONS.map(section=>({...section,label:t(section.zh,section.en),Icon:agentIcons[section.id]})),
    financeSections:FINANCE_SECTIONS.map(section=>({id:section.id,label:t(section.zh,section.en),Icon:financeIcons[section.id]})),
    workspaces:WORKSPACE_ORDER.map(id=>workspaces[id]),
    optionalWorkspaces:OPTIONAL_WORKSPACE_IDS.map(id=>({...workspaces[id],id})),
    cognition:[
      {id:'building',label:t('分身建设','Grow your twin'),Icon:UserGpts},
      {id:'self',label:t('个人画像','About you'),Icon:User},
      {id:'life',label:t('生活近况','Life now'),Icon:Calendar},
      {id:'conversations',label:t('聊天记录','Chat history'),Icon:Chat},
      {id:'timeline',label:t('时间轴','Timeline'),Icon:Clock},
      {id:'relationships',label:t('关系图谱','Relationship map'),Icon:Nodes},
      {id:'sources',label:t('资料来源','Sources'),Icon:Folder},
    ],
    recentChats:t('最近对话','Recent chats'),
  };
}
