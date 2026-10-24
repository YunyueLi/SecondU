import {useState,type CSSProperties} from 'react';
import {CreditCard,Chart} from '@openai/apps-sdk-ui/components/Icon';
import {t} from '../i18n';
import './BrandIcon.css';
const brands:Record<string,{name:string;file:string}>={
 cmb:{name:'招商银行',file:'bank-cmb.svg'},icbc:{name:'中国工商银行',file:'bank-icbc.svg'},boc:{name:'中国银行',file:'bank-bochk.png'},abc:{name:'中国农业银行',file:'bank-abc.svg'},dbs:{name:'DBS星展银行',file:'bank-dbs.svg'},scb:{name:'渣打银行',file:'bank-scb.png'},moomoo:{name:'Moomoo',file:'bank-moomoo.png'},ibkr:{name:'Interactive Brokers',file:'bank-ibkr.png'},hsbc:{name:'HSBC汇丰银行',file:'bank-hsbc.png'},bochk:{name:'中国银行香港',file:'bank-bochk.png'},alipay:{name:'支付宝',file:'bank-alipay.svg'},
 chase:{name:'Chase',file:'bank-chase.jpg'},ally:{name:'Ally',file:'bank-ally.svg'},fidelity:{name:'Fidelity Investments',file:'bank-fidelity.jpg'},schwab:{name:'Charles Schwab',file:'bank-schwab.png'},
 NVDA:{name:'NVIDIA',file:'stock-nvda.svg'},GOOGL:{name:'Google',file:'stock-googl.png'},SNDK:{name:'Sandisk',file:'stock-sndk.svg'},AAPL:{name:'Apple',file:'stock-aapl.svg'},TSLA:{name:'Tesla',file:'stock-tsla.svg'},BABA:{name:'Alibaba Group',file:'stock-baba.svg'},MRNA:{name:'Moderna',file:'stock-mrna.png'},MSFT:{name:'Microsoft',file:'stock-msft.png'},VTI:{name:'Vanguard',file:'stock-vanguard.svg'},VXUS:{name:'Vanguard',file:'stock-vanguard.svg'},BND:{name:'Vanguard',file:'stock-vanguard.svg'},VOO:{name:'Vanguard',file:'stock-vanguard.svg'},SCHB:{name:'Charles Schwab',file:'bank-schwab.png'},SCHF:{name:'Charles Schwab',file:'bank-schwab.png'},SCHZ:{name:'Charles Schwab',file:'bank-schwab.png'},QQQ:{name:'Invesco',file:'stock-invesco.png'},SGOV:{name:'iShares by BlackRock',file:'stock-ishares.ico'},
};
export function BrandIcon({id,size=32}:{id:string;size?:number}) {
 const [failed,setFailed]=useState<string|null>(null);
 const upper=id.replace(/^stock-/i,'').toUpperCase(),lower=id.toLowerCase();
 const key=brands[upper]?upper:['bochk','cmb','icbc','boc','abc','dbs','scb','moomoo','ibkr','hsbc','alipay','chase','ally','fidelity','schwab'].find(prefix=>lower===prefix||lower.startsWith(`${prefix}-`));
 const brand=key?brands[key]:undefined;
 const security=Boolean(brands[upper])||/^[A-Z0-9.]+$/.test(id)||lower.startsWith('stock-');
 const Fallback=security?Chart:CreditCard;
 const label=brand?.name||(security?t('证券品牌待核对','Security brand not verified'):t('账户','Account'));
 return <span className="brand-icon" role="img" aria-label={label} title={label} style={{'--brand-default-size':`${size}px`} as CSSProperties}>{brand&&failed!==brand.file?<img src={`/finance/brands/${brand.file}`} alt="" draggable={false} onError={()=>setFailed(brand.file)}/>:<Fallback aria-hidden="true"/>}</span>;
}
