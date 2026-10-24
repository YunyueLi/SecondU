import {createHash} from 'node:crypto';

const DAY=86_400_000;
const CURRENCIES=new Set(['CNY','CNH','USD','HKD','SGD','JPY','KRW','MYR','AUD','CAD','EUR','GBP']);
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0?String(value):typeof value==='string'&&/^(?:0|[1-9]\d{0,39})(?:\.\d{1,20})?$/.test(value)&&Number(value)>0?value:null;
const chartUrl=symbol=>`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
const dateOnly=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const fraction=value=>{const [whole,tail='']=value.split('.');return {n:BigInt(whole+tail),d:10n**BigInt(tail.length)};};
function divide(left,right){const a=fraction(left),b=fraction(right),scale=10n**12n,n=a.n*b.d*scale,d=a.d*b.n,r=(n*2n+d)/(d*2n);return `${r/scale}.${String(r%scale).padStart(12,'0')}`.replace(/\.?0+$/,'');}
const publicDefinition=({provider,...item})=>item;
const initialQuote=definition=>({...publicDefinition(definition),price:null,asOf:null,receivedAt:null,status:definition.provider==='unmapped'?'unmapped':'unavailable',marketState:null,delayMinutes:null,message:definition.provider==='unmapped'?'待确认产品代码与市场。':'等待更新。'});

export class FinanceMarketError extends Error{
  constructor(code,message,status=503){super(message);this.name='FinanceMarketError';this.code=code;this.status=status;}
}

// A symbol is only useful when its market and unit are known. Account labels,
// balances and credentials are never sent to a quote provider.
export function financeQuoteDefinition(position){
  const source=String(position.code||position.quoteSymbol||position.identity?.symbol||position.symbol||'').trim();
  const prefix=/^(US|HK|CN)\.(.+)$/i.exec(source);
  const market=String(prefix?.[1]||position.exchange||position.market||position.identity?.market||'').toUpperCase();
  const symbol=String(prefix?.[2]||position.identity?.symbol||position.symbol||source).trim();
  const currency=String(position.currency||position.identity?.currency||'');
  const kind=typeof position.kind==='string'&&position.kind.trim()?position.kind.trim():'stock';
  const name=typeof position.name==='string'?position.name.slice(0,200):symbol;
  const positionIds=typeof position.id==='string'?[position.id]:[];
  const common={symbol,name,currency,kind,positionIds,sourceSymbol:source};
  if(position.identityVerified===false||position.publiclyListed===false)return {...common,id:`unmapped:${position.id||digest(common).slice(0,16)}`,provider:'unmapped',sourceName:'',sourceUrl:null};
  if(market==='US'&&currency==='USD'&&['stock','etf'].includes(kind)&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol))return {...common,id:symbol,provider:'yahoo',unit:'股',sourceName:'Yahoo Finance',sourceUrl:chartUrl(symbol)};
  if(market==='HK'&&currency==='HKD'&&['stock','etf'].includes(kind)&&/^\d{1,5}(?:\.HK)?$/.test(symbol)){
    const code=symbol.replace(/\.HK$/,'').replace(/^0+(?=\d)/,'').padStart(4,'0')+'.HK';
    return {...common,id:code,symbol:code,provider:'yahoo',unit:'股',sourceName:'Yahoo Finance',sourceUrl:chartUrl(code)};
  }
  if(market==='CN'&&currency==='CNY'&&kind==='fund'&&/^\d{6}$/.test(symbol))return {...common,id:`fund-${symbol}`,provider:'fund',unit:'份',sourceName:'天天基金',sourceUrl:`https://fund.eastmoney.com/pingzhongdata/${symbol}.js`};
  return {...common,id:`unmapped:${position.id||digest(common).slice(0,16)}`,provider:'unmapped',sourceName:'',sourceUrl:null};
}

export function parseFinanceYahoo(payload,definition,receivedAt){
  const meta=payload?.chart?.result?.[0]?.meta,price=positive(meta?.regularMarketPrice);
  const time=meta?.regularMarketTime;
  if(!meta||payload.chart.error||meta.symbol!==definition.symbol||meta.currency!==definition.currency||!price||!Number.isFinite(time)||time<=0)throw new Error('未返回匹配的产品价格。');
  const at=time*1000,now=Date.parse(receivedAt);
  if(!Number.isFinite(at)||at>now+300_000||!Number.isFinite(new Date(at).getTime()))throw new Error('报价时间无效。');
  const asOf=new Date(at).toISOString(),period=meta.currentTradingPeriod?.regular;
  const marketState=meta.marketState||(period?(now>=period.start*1000&&now<=period.end*1000?'REGULAR':'CLOSED'):'UNKNOWN');
  const closed=['CLOSED','POST','PRE','POSTPOST','PREPRE'].includes(marketState);
  const delayMinutes=Number.isFinite(meta.exchangeDataDelayedBy)&&meta.exchangeDataDelayedBy>=0?meta.exchangeDataDelayedBy:null;
  const stale=now-at>(closed?7*DAY:Math.max(20*60_000,((delayMinutes||0)+3)*60_000));
  const previous=positive(meta.chartPreviousClose??meta.previousClose);
  return {...publicDefinition(definition),price,asOf,receivedAt,status:stale?'stale':closed?'closed':delayMinutes===null?'unknown':delayMinutes===0?'live':'delayed',marketState,delayMinutes,...(previous?{change:String(Number((Number(price)-Number(previous)).toFixed(8))),changePct:String(Number(((Number(price)/Number(previous)-1)*100).toFixed(6)))}:{}),message:stale?'报价待更新。':closed?'最近收盘价。':delayMinutes>0?`延迟 ${delayMinutes} 分钟。`:''};
}

function parseFund(text,definition,receivedAt){
  const code=/var\s+fS_code\s*=\s*["'](\d{6})["']\s*;/.exec(text)?.[1];
  const name=/var\s+fS_name\s*=\s*["']([^"']+)["']\s*;/.exec(text)?.[1];
  const series=/var\s+Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/.exec(text)?.[1];
  if(code!==definition.symbol||!name||!series)throw new Error('基金代码或净值数据不匹配。');
  const points=JSON.parse(series),last=Array.isArray(points)?points.at(-1):null,price=positive(last?.y);
  if(!price||!Number.isFinite(last.x)||last.x<=0||last.x>Date.parse(receivedAt)+DAY)throw new Error('净值日期或价格无效。');
  const stale=Date.parse(receivedAt)-last.x>10*DAY;
  return {...publicDefinition(definition),sourceProductName:name,price,asOf:dateOnly(last.x),receivedAt,status:stale?'stale':'closed',marketState:'PUBLISHED_NAV',delayMinutes:null,changePct:Number.isFinite(last.equityReturn)?String(last.equityReturn):null,message:'已公布净值。'};
}

export function createFinanceMarket({fetchImpl=globalThis.fetch,now=()=>Date.now(),onChange=()=>{},timeoutMs=8000,cooldownMs=15000,initialState}={}){
  let state={status:'idle',quotes:[],rates:[],updatedAt:null,issues:[],revision:'',refreshIntervalMs:60000,nextRefreshAt:null};
  let active,activeInput,lastInput,lastAttempt=-Infinity,closed=false;
  const controllers=new Set();
  if(initialState&&Array.isArray(initialState.quotes)){
    const quotes=initialState.quotes.filter(q=>q&&positive(q.price)&&CURRENCIES.has(q.currency)&&typeof q.id==='string'&&Number.isFinite(Date.parse(q.asOf))).slice(0,1000).map(q=>({...q,status:'stale',message:'等待更新。'}));
    const rates=(Array.isArray(initialState.rates)?initialState.rates:[]).filter(r=>r&&CURRENCIES.has(r.currency)&&r.baseCurrency==='CNY'&&positive(r.rate)&&Number.isFinite(Date.parse(r.asOf))).map(r=>({...r,status:'stale'}));
    state={...state,quotes,rates,updatedAt:typeof initialState.updatedAt==='string'?initialState.updatedAt:null,status:quotes.length||rates.length?'stale':'idle'};
  }
  state.revision=digest(state);
  async function request(url,type){
    const controller=new AbortController();controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(url,{signal:controller.signal,redirect:'error',cache:'no-store',headers:{Accept:type==='text'?'text/plain':'application/json'}});
      if(!response.ok)throw new Error(`行情暂时不可用（${response.status}）。`);
      if(response.url&&response.url!==url)throw new Error('行情来源不匹配。');
      if(!response.body?.getReader||Number(response.headers.get('content-length')||0)>4*1024*1024)throw new Error('行情响应无效。');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024){await reader.cancel();throw new Error('行情响应过大。');}chunks.push(value);}}finally{reader.releaseLock();}
      const text=Buffer.concat(chunks).toString('utf8');return type==='text'?text:JSON.parse(text);
    }catch(error){if(error instanceof Error&&/^行情/.test(error.message))throw error;throw new Error('暂时无法更新行情。');}
    finally{clearTimeout(timer);controllers.delete(controller);}
  }
  async function refresh({positions=[],currencies=[],displayCurrency='CNY'}={}){
    if(closed)return clone(state);
    if(!Array.isArray(positions)||positions.length>5000||!Array.isArray(currencies)||currencies.length>100||!CURRENCIES.has(displayCurrency))throw new FinanceMarketError('INVALID_MARKET_INPUT','行情查询范围无效。',400);
    const definitions=new Map();
    for(const p of positions){if(!p||typeof p!=='object')continue;const d=financeQuoteDefinition(p),old=definitions.get(d.id);if(old)old.positionIds.push(...d.positionIds);else definitions.set(d.id,d);}
    if(definitions.size>500)throw new FinanceMarketError('MARKET_LIMIT','一次最多更新 500 个产品。',400);
    const requested=[...new Set([...currencies,displayCurrency].filter(c=>CURRENCIES.has(c)))].sort();
    const signature=digest({definitions:[...definitions.values()],requested});
    if(active){if(signature===activeInput)return active;await active;if(closed)return clone(state);return refresh({positions,currencies,displayCurrency});}
    if(signature===lastInput&&now()-lastAttempt<cooldownMs)throw new FinanceMarketError('MARKET_REFRESH_COOLDOWN','行情刚刚更新，请稍后再试。',429);
    lastInput=activeInput=signature;lastAttempt=now();
    active=(async()=>{
      const old=new Map(state.quotes.map(q=>[q.id,q])),results=new Map(),rawFx=new Map(),issues=[];
      const jobs=[...definitions.values()].filter(d=>d.provider!=='unmapped').map(definition=>({definition}));
      if(requested.some(c=>c!=='CNY'))for(const currency of [...new Set(['CNY',...requested.filter(c=>c!=='USD')])])jobs.push({currency});
      let cursor=0;state={...state,status:'refreshing'};
      await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
        while(!closed&&cursor<jobs.length){const job=jobs[cursor++];
          if(job.currency){const symbol=`${job.currency}=X`,definition={id:symbol,symbol,currency:job.currency,kind:'fx',name:symbol,sourceName:'Yahoo Finance',sourceUrl:chartUrl(symbol)};try{rawFx.set(job.currency,parseFinanceYahoo(await request(definition.sourceUrl),definition,new Date(now()).toISOString()));}catch{rawFx.set(job.currency,null);}continue;}
          const definition=job.definition;
          try{results.set(definition.id,definition.provider==='fund'?parseFund(await request(definition.sourceUrl,'text'),definition,new Date(now()).toISOString()):parseFinanceYahoo(await request(definition.sourceUrl),definition,new Date(now()).toISOString()));}
          catch(error){const previous=old.get(definition.id);results.set(definition.id,{...(previous||initialQuote(definition)),...publicDefinition(definition),status:previous?.price?'stale':'unavailable',message:error.message});issues.push({id:definition.id,message:error.message});}
        }
      }));
      if(closed)return clone(state);
      const receivedAt=new Date(now()).toISOString(),rates=[{currency:'CNY',rate:'1',baseCurrency:'CNY',asOf:receivedAt,sourceName:'基准币种',sourceUrl:null,status:'live'}],fxQuotes=[];
      for(const currency of requested.filter(c=>c!=='CNY')){
        const cny=rawFx.get('CNY'),other=currency==='USD'?null:rawFx.get(currency),id=`fx-${currency.toLowerCase()}-cny`;
        const definition={id,symbol:`${currency}/CNY`,name:`${currency} / CNY`,kind:'fx',currency:'CNY',base:currency,unit:`1 ${currency}`,sourceName:'Yahoo Finance',sourceUrl:chartUrl('CNY=X')};
        if(!cny||currency!=='USD'&&!other){const previous=old.get(id);fxQuotes.push({...definition,...(previous||{}),status:previous?.price?'stale':'unavailable',message:'汇率待更新。'});const previousRate=state.rates.find(r=>r.currency===currency);if(previousRate)rates.push({...previousRate,status:'stale'});issues.push({id,message:'汇率待更新。'});continue;}
        const sourceQuotes=[cny,other].filter(Boolean),asOf=sourceQuotes.map(q=>q.asOf).sort()[0],status=sourceQuotes.some(q=>q.status==='stale')?'stale':sourceQuotes.every(q=>q.status==='closed')?'closed':sourceQuotes.every(q=>q.status==='live')?'live':'unknown',price=other?divide(cny.price,other.price):cny.price;
        rates.push({currency,rate:price,baseCurrency:'CNY',asOf,sourceName:'Yahoo Finance',sourceUrl:definition.sourceUrl,status});
        fxQuotes.push({...definition,price,asOf,receivedAt,status,marketState:'FX_REFERENCE',delayMinutes:null,sourceQuotes:sourceQuotes.map(q=>({symbol:q.symbol,price:q.price,asOf:q.asOf,sourceUrl:q.sourceUrl})),message:''});
      }
      const quotes=[...[...definitions.values()].map(d=>results.get(d.id)||initialQuote(d)),...fxQuotes];
      state={status:issues.length?'degraded':jobs.length?'ready':'idle',quotes,rates,updatedAt:jobs.length?receivedAt:null,issues,revision:'',refreshIntervalMs:60000,nextRefreshAt:null};state.revision=digest(state);
      await onChange(clone(state));return clone(state);
    })();
    try{return await active;}finally{active=undefined;activeInput=undefined;}
  }
  return {getState:()=>clone(state),refresh,async close(){closed=true;for(const controller of controllers)controller.abort();await active?.catch(()=>{});}};
}
