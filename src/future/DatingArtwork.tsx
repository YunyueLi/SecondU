import {t} from '../i18n';

export function DatingArtwork({className=''}:{className?:string}) {
  return <img className={`dating-artwork ${className}`} src="/art/dating-oil-meeting-v2.png" width={1254} height={1254} draggable={false} alt={t('油画：奶油色与灰粉色天空下，两位成年人在安静的公园小径相遇。','An oil painting of two adults meeting on a quiet park path beneath a cream and dusty-rose sky.')}/>;
}
