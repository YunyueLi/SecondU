import {Agent,Brain,Calendar,Chat,Clock,Document,Edit,Folder,Nodes,Search,UserGpts,User} from '@openai/apps-sdk-ui/components/Icon';
import {t} from './i18n';

export type NavigationItem={id:string;label:string;Icon:typeof Chat};

/** Desktop and phone render the same destinations; only their containers differ. */
export function getAppNavigation(){
  return {
    newChat:{id:'assistant',label:t('新对话','New chat'),Icon:Edit},
    digitalTwin:{id:'twin',label:t('数字分身','Digital twin'),Icon:Brain},
    search:{id:'history',label:t('搜索对话','Search chats'),Icon:Search},
    projects:{id:'projects',label:t('项目','Projects'),Icon:Folder},
    workspaces:[
      {id:'agents',label:'Agents',Icon:Agent},
      {id:'artifacts',label:t('资料库','Library'),Icon:Document},
      {id:'automations',label:t('自动化','Automations'),Icon:Clock},
    ],
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
