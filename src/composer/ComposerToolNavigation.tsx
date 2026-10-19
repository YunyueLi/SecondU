import {createContext,useContext,useId,type ReactNode} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {ChevronRight} from '@openai/apps-sdk-ui/components/Icon';

import './composer-tool-navigation.css';

type ToolView={id:string;title:string};
export const ComposerToolNavigation=createContext<{view?:ToolView;open:(view:ToolView)=>void;back:()=>void;dismiss:()=>void}|null>(null);
export function useComposerToolView(title:string){
  const navigation=useContext(ComposerToolNavigation),id=useId();
  return navigation?{active:navigation.view?.id===id,hidden:!!navigation.view&&navigation.view.id!==id,show:()=>navigation.open({id,title}),back:navigation.back,dismiss:navigation.dismiss}:null;
}
export function ComposerToolRow({icon,label,detail,disabled,onClick}:{icon:ReactNode;label:string;detail?:string;disabled?:boolean;onClick:()=>void}){
  return <Button type="button" color="secondary" variant="ghost" pill={false} className="composer-tool-row" disabled={disabled} onClick={onClick}>{icon}<span className="composer-tool-copy"><strong>{label}</strong>{detail&&<small>{detail}</small>}</span><ChevronRight/></Button>;
}

export function ComposerToolAction({icon,label,disabled,onAction}:{icon:ReactNode;label:string;disabled?:boolean;onAction:()=>void}){
  const navigation=useContext(ComposerToolNavigation);
  if(navigation?.view)return null;
  return <ComposerToolRow icon={icon} label={label} disabled={disabled} onClick={()=>{navigation?.dismiss();onAction();}}/>;
}
