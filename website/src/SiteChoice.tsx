import type {ReactNode} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Menu} from '@openai/apps-sdk-ui/components/Menu';
import {ChevronDown} from '@openai/apps-sdk-ui/components/Icon';

type Option = {value:string; label:string; icon?:ReactNode};
/** The same SDK menu owns selection, keyboard navigation and focus restoration everywhere. */
export function SiteChoice({label,value,options,onChange,icon,disabled=false,compact=false,side='bottom'}:{label:string;value:string;options:Option[];onChange:(value:string)=>void;icon?:ReactNode;disabled?:boolean;compact?:boolean;side?:'top'|'bottom'}) {
 const selected=options.find(option=>option.value===value);
 return <Menu><Menu.Trigger disabled={disabled}><Button color="secondary" variant={compact?'ghost':'outline'} size="md" pill={compact} disabled={disabled} className={`site-choice ${compact?'site-choice-compact':''}`} aria-label={`${label}: ${selected?.label??''}`}><span className="site-choice-icon" aria-hidden="true">{icon}</span><span className="site-choice-label">{selected?.label}</span><ChevronDown/></Button></Menu.Trigger><Menu.Content side={side} align="end" minWidth="auto" width={compact?176:240} maxHeight={320}><div className="site-choice-menu"><Menu.RadioGroup value={value} onChange={onChange}>{options.map(option=><Menu.RadioItem key={option.value} value={option.value}><span className="site-choice-option">{option.icon&&<span aria-hidden="true">{option.icon}</span>}{option.label}</span></Menu.RadioItem>)}</Menu.RadioGroup></div></Menu.Content></Menu>;
}
