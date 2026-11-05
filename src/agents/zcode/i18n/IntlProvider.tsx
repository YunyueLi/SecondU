// SecondU host adapter; not upstream presentation.
import {useMemo} from 'react';
import {IntlMessageFormat} from 'intl-messageformat';
import {useLocale} from '../../../i18n';
import messages from './messages.json';
export function useZCodeIntl(){const lang=useLocale();return useMemo(()=>{const locale=lang==='en'?'en-US':'zh-CN';const dictionary:Record<string,string>=messages[locale];const cache=new Map<string,IntlMessageFormat>();return {locale,intl:{formatMessage({id}:{id:string},values?:Record<string,string|number>){let item=cache.get(id);if(!item){item=new IntlMessageFormat(dictionary[id]??id,locale);cache.set(id,item);}return String(item.format(values));}}};},[lang]);}
