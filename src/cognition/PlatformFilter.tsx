import { t } from '../i18n';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { ChevronDown } from '@openai/apps-sdk-ui/components/Icon';
import { PlatformIcon, PlatformOption } from './PlatformIcon';
import './platform-filter.css';

export function PlatformFilter({value,options,onChange,label,align='start'}:{value:string;options:Array<{value:string;label:string}>;onChange:(value:string)=>void;label:string;align?:'start'|'end'}){
  const current=options.find(option=>option.value===value)||options[0];
  return <Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="sm" pill={false} className="platform-filter-trigger" aria-label={`${label}${t('：', ': ')}${current.label}`}><PlatformIcon platform={current.value}/><span>{current.label}</span><ChevronDown/></Button></Menu.Trigger><Menu.Content align={align} minWidth={184} maxHeight={320}><Menu.RadioGroup value={value} onChange={onChange}>{options.map(option=><Menu.RadioItem key={option.value} value={option.value}><PlatformOption {...option}/></Menu.RadioItem>)}</Menu.RadioGroup></Menu.Content></Menu>;
}
