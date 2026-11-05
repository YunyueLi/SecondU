import {Select, type SelectProps} from '@openai/apps-sdk-ui/components/Select';
import cn from './flags/cn.svg';
import us from './flags/us.svg';
import hk from './flags/hk.svg';
import sg from './flags/sg.svg';
import eu from './flags/eu.svg';
import gb from './flags/gb.svg';
import jp from './flags/jp.svg';
import au from './flags/au.svg';
import ca from './flags/ca.svg';
import './currency-select.css';

const flags:Record<string,string>={CNY:cn,CNH:cn,USD:us,HKD:hk,SGD:sg,EUR:eu,GBP:gb,JPY:jp,AUD:au,CAD:ca};
type CurrencyOption={value:string;label:string};
type CurrencySelectProps=Omit<SelectProps<CurrencyOption>,'multiple'|'value'|'onChange'|'TriggerView'|'OptionView'>&{value:string;onChange:(option:CurrencyOption)=>void;codeOnly?:boolean};
function CurrencyOptionView({value,label,title}:CurrencyOption&{title?:string}){
  return <span className="finance-currency-option" title={title}>{flags[value]&&<img src={flags[value]} alt="" aria-hidden="true" width={20} height={15}/>}<span>{label}</span></span>;
}
function CurrencyCodeView({value,label}:CurrencyOption){
  return <CurrencyOptionView value={value} label={value} title={label}/>;
}
export function CurrencySelect({codeOnly=false,...props}:CurrencySelectProps){
  return <Select {...props} OptionView={CurrencyOptionView} TriggerView={codeOnly?CurrencyCodeView:CurrencyOptionView}/>;
}
