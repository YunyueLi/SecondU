import type {ReactNode} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Menu} from '@openai/apps-sdk-ui/components/Menu';
import {Check,ChevronDown} from '@openai/apps-sdk-ui/components/Icon';

type Option = {value:string; label:string; icon?:ReactNode};
type Props = {label:string;value:string;options:Option[];onChange:(value:string)=>void;icon?:ReactNode;disabled?:boolean;compact?:boolean;iconOnly?:boolean;side?:'top'|'bottom';surface?:'page'|'dark'};
/** SDK menu semantics and keyboard navigation, with one shared website treatment. */
export function SiteChoice({label,value,options,onChange,icon,disabled=false,compact=false,iconOnly=false,side='bottom',surface='page'}:Props) {
 const selected=options.find(option=>option.value===value);
 return <Menu>
  <Menu.Trigger disabled={disabled}>
   <Button color="secondary" variant={compact?'ghost':'outline'} size="md" pill={false} uniform={iconOnly} disabled={disabled} data-surface={surface} className={`site-choice ${compact?'site-choice-compact':''}${iconOnly?' site-choice-icon-only':''}`} aria-label={`${label}: ${selected?.label??''}`} title={iconOnly?`${label}: ${selected?.label??''}`:undefined}>
    {icon&&<span className="site-choice-icon" aria-hidden="true">{icon}</span>}
    {!iconOnly&&<><span className="site-choice-label">{selected?.label}</span><ChevronDown className="site-choice-chevron"/></>}
   </Button>
  </Menu.Trigger>
  <Menu.Content side={side} sideOffset={8} align={side==='top'?'start':'end'} alignOffset={0} minWidth="auto" width={compact?(options.some(option=>option.icon)?144:168):240} maxHeight={360}>
   <div className="site-choice-menu" data-surface={surface}>
    <Menu.RadioGroup value={value} onChange={onChange}>
     {options.map(option=><Menu.RadioItem className="site-choice-item" key={option.value} value={option.value}>
      <span className="site-choice-option">{option.icon&&<span aria-hidden="true">{option.icon}</span>}<span>{option.label}</span><Check className="site-choice-check" aria-hidden="true" style={{visibility:value===option.value?'visible':'hidden'}}/></span>
     </Menu.RadioItem>)}
    </Menu.RadioGroup>
   </div>
  </Menu.Content>
 </Menu>;
}
