import {randomUUID} from 'node:crypto';
import {baseMarker,currency,date,decimal,digest,fail,fields,fixed,fraction,minor,money,multiply,operationKey,sum,text,valuation} from './arithmetic.mjs';
import {POSITION_TYPES,accountTypeOf,isValuedAssetType} from '../../shared/asset-taxonomy.mjs';
import {accountClassification,normalizeAssetDetails,withAccountProfile,requiresAssetDetails} from './asset-profile.mjs';

const ACCOUNT_FIELDS=['idempotencyKey','name','kind','currency','amount','asOf','description','provider','assetType','liabilityType','assetDetails'];
const UPDATE_FIELDS=['idempotencyKey','accountId','kind','amount','currency','asOf','note','expectedAccountRevision','assetType','liabilityType','assetDetails'];
const POSITION_FIELDS=['idempotencyKey','accountId','name','symbol','kind','quantity','costPrice','recordedMarketValue','currency','asOf','exchange','note'];
const POSITION_UPDATE_FIELDS=['idempotencyKey','positionId','accountId','expectedRevision','baseMarker','quantity','costPrice','currency','asOf','recordedMarketValue','note','accountBalance'];
const empty=()=>({version:1,accounts:[],positions:[],updates:[],positionUpdates:[],providerSync:{},metadata:{onboarding:{completed:false,displayCurrency:'CNY',method:null}}});
const positionKind=value=>{if(!POSITION_TYPES.some(row=>row.value===value))fail('请选择支持的持仓类型。');return value;};
const accountKind=value=>{if(!['asset','liability'].includes(value))fail('账户类型须为资产或负债。');return value;};
const totals=rows=>Object.fromEntries([...new Set(rows.map(row=>row.currency))].map(code=>[code,sum(rows.filter(row=>row.currency===code).map(row=>row.amount))]));
const canAddNativePosition=account=>account.kind==='asset'&&account.provider==='manual'&&account.readOnly===false&&!isValuedAssetType(accountTypeOf(account));
export function positionsRevision(accounts,positions){return digest({accounts:accounts.map(baseMarker),positions});}

export class NativeFinanceStore{
  constructor(store,{now=()=>Date.now()}={}){this.store=store;this.now=now;}
  document(){return this.store.get('meta','finance')?.value||empty();}
  save(document){this.store.setMeta('finance',document);}
  stamp(){return new Date(Number(this.now())).toISOString();}
  replay(key,input){const prior=this.store.get('financeOperations',key);if(prior&&prior.fingerprint!==digest(input))fail('此更新标识已用于其他内容，请刷新后重试。','finance_idempotency_conflict',409);return prior?.result;}
  mutate(key,input,change){
    const replay=this.replay(key,input);if(replay)return {...replay,replayed:true};
    return this.store.transaction(()=>{const doc=this.document(),result=change(doc);this.save(doc);this.store.put('financeOperations',{id:key,fingerprint:digest(input),result,createdAt:this.stamp()});return {...result,replayed:false};});
  }
  onboarding(input){
    fields(input,['completed','displayCurrency','method']);
    if(typeof input.completed!=='boolean'||!['manual','connector','later',null].includes(input.method??null))fail('财务引导状态无效。');
    const value={completed:input.completed,displayCurrency:currency(input.displayCurrency),method:input.method??null};
    const doc=this.document();doc.metadata.onboarding=value;this.save(doc);return value;
  }
  archiveAccount(input, accounts){
    fields(input,['accountId','archived']);
    const id=text(input.accountId,'账户标识');
    if(typeof input.archived!=='boolean')fail('账户状态无效。');
    if(!accounts.some(account=>account.id===id))fail('账户不存在于当前空间。','finance_account_not_found',404);
    const doc=this.document(),ids=new Set(doc.metadata.archivedAccountIds||[]);
    if(input.archived)ids.add(id);else ids.delete(id);
    doc.metadata.archivedAccountIds=[...ids];this.save(doc);
  }
  createAccount(input,{accounts=[]}={}){
    fields(input,ACCOUNT_FIELDS);const normalized={idempotencyKey:operationKey(input.idempotencyKey),name:text(input.name,'账户名称'),kind:accountKind(input.kind),currency:currency(input.currency),amount:money(input.amount),asOf:date(input.asOf,this.now()),description:text(input.description,'账户说明',2000,true)};
    Object.assign(normalized,accountClassification(input,normalized.kind));
    if(input.assetDetails!==undefined)normalized.assetDetails=input.assetDetails;
    if(input.provider!==undefined&&input.provider!=='manual')fail('手工账户不能指定官方数据来源。');
    return this.mutate(normalized.idempotencyKey,{operation:'account.create',...normalized},doc=>{
      if(doc.accounts.length>=500)fail('当前空间的账户数量已达上限。');
      const stamp=this.stamp(),account={id:'finance-account-'+randomUUID(),...normalized,provider:'manual',readOnly:false,createdAt:stamp,updatedAt:stamp,recordedAt:stamp,observationType:'manual',detailCurrent:true};delete account.idempotencyKey;
      const assetDetails=normalizeAssetDetails(input.assetDetails,{assetType:normalized.assetType,amount:normalized.amount,asOf:normalized.asOf,accounts,now:this.now()});
      if(assetDetails)account.assetDetails=assetDetails;else delete account.assetDetails;
      doc.accounts.push(account);return {accountId:account.id};
    });
  }
  updateAccount(input,{accounts=[]}={}){
    fields(input,UPDATE_FIELDS);const normalized={idempotencyKey:operationKey(input.idempotencyKey),accountId:text(input.accountId,'账户标识'),kind:accountKind(input.kind),amount:money(input.amount),currency:currency(input.currency),asOf:date(input.asOf,this.now()),note:text(input.note,'更新说明',2000)};
    Object.assign(normalized,accountClassification(input,normalized.kind));
    if(input.expectedAccountRevision!==undefined)normalized.expectedAccountRevision=text(input.expectedAccountRevision,'账户版本');
    if(input.assetDetails!==undefined)normalized.assetDetails=input.assetDetails;
    return this.mutate(normalized.idempotencyKey,{operation:'account.update',...normalized},doc=>{
      const account=doc.accounts.find(row=>row.id===normalized.accountId&&row.kind===normalized.kind);
      if(!account)fail('账户不存在于当前空间。','finance_account_not_found',404);
      if(account.readOnly)fail('官方账户金额请通过连接器同步。','finance_official_read_only',409);
      const typed={...account,...accountClassification(input,account.kind)},current=withAccountProfile(account,doc.metadata.accountProfiles);
      if(requiresAssetDetails(typed)&&doc.positions.some(row=>row.accountId===account.id))fail('已有投资持仓的账户不能改为独立资产，请另建资产记录。','finance_asset_has_positions',409);
      if((requiresAssetDetails(typed)||input.assetType!==undefined||input.liabilityType!==undefined||input.assetDetails!==undefined)&&!normalized.expectedAccountRevision)fail('更新资产资料需要当前账户版本，请刷新后重试。','finance_account_revision_required',409);
      if(normalized.expectedAccountRevision&&normalized.expectedAccountRevision!==current.accountRevision)fail('账户资料已变化，请刷新后重试。','finance_account_revision_conflict',409);
      if(account.currency!==normalized.currency)fail('更新币种与账户原币不一致。','finance_currency_mismatch',409);
      if(Date.parse(normalized.asOf)<Date.parse(account.asOf))fail('更新日期不能早于现有账户记录。','finance_older_observation',409);
      const assetDetails=requiresAssetDetails(typed)?normalizeAssetDetails(input.assetDetails,{assetType:typed.assetType,amount:normalized.amount,asOf:normalized.asOf,accounts,now:this.now()}):null;
      if(!requiresAssetDetails(typed)&&input.assetDetails!=null)fail('此账户分类不使用独立资产估值资料。');
      const stamp=this.stamp(),update={...normalized,...(assetDetails?{assetDetails}:{}),updateId:randomUUID(),recordedAt:stamp,previousAmount:account.amount,previousAsOf:account.asOf,previousAssetDetails:account.assetDetails??null,applied:true};
      Object.assign(account,accountClassification(input,account.kind),{amount:normalized.amount,asOf:normalized.asOf,updatedAt:stamp,recordedAt:stamp,latestUpdateId:update.updateId,observationType:'user_update',detailCurrent:false});
      if(assetDetails)account.assetDetails=assetDetails;else if(!requiresAssetDetails(typed))delete account.assetDetails;
      doc.updates.push(update);return {update};
    });
  }
  updateAccountProfile(input,{accounts=[]}={}){
    fields(input,['idempotencyKey','accountId','expectedAccountRevision','name','description','assetType','liabilityType','assetDetails']);
    const normalized={idempotencyKey:operationKey(input.idempotencyKey),accountId:text(input.accountId,'账户标识'),expectedAccountRevision:text(input.expectedAccountRevision,'账户版本'),name:text(input.name,'账户名称'),description:text(input.description,'账户说明',2000,true),...(input.assetType!==undefined?{assetType:input.assetType}:{}),...(input.liabilityType!==undefined?{liabilityType:input.liabilityType}:{}),...(input.assetDetails!==undefined?{assetDetails:input.assetDetails}:{})};
    return this.mutate(normalized.idempotencyKey,{operation:'account.profile',...normalized},doc=>{
      const native=doc.accounts.find(row=>row.id===normalized.accountId),external=accounts.find(row=>row.id===normalized.accountId),account=native?withAccountProfile(native,doc.metadata.accountProfiles):external?withAccountProfile(external,doc.metadata.accountProfiles):null;
      if(!account)fail('账户不存在于当前空间。','finance_account_not_found',404);
      if(account.accountRevision!==normalized.expectedAccountRevision)fail('账户资料已变化，请刷新后重试。','finance_account_revision_conflict',409);
      const classification=accountClassification(input,account.kind),typeKey=account.kind==='asset'?'assetType':'liabilityType';
      if(!classification[typeKey])fail('请选择资产或负债分类。');
      const stamp=this.stamp(),profile={kind:account.kind,name:normalized.name,description:normalized.description,...classification,updatedAt:stamp};
      if(native?.provider==='manual'&&native.readOnly===false){
        if(isValuedAssetType(classification.assetType)&&doc.positions.some(row=>row.accountId===account.id))fail('已有投资持仓的账户不能改为独立资产，请另建资产记录。','finance_asset_has_positions',409);
        const assetDetails=normalizeAssetDetails(input.assetDetails,{assetType:classification.assetType,amount:native.amount,asOf:native.asOf,accounts,now:this.now()});
        // Profile edits do not replace a balance observation or invalidate a
        // reconciled position baseline by changing its financial timestamp.
        Object.assign(native,{name:profile.name,description:profile.description,...classification,profileUpdatedAt:stamp});
        if(assetDetails)native.assetDetails=assetDetails;else delete native.assetDetails;
      }else{
        if(input.assetDetails!=null)fail('来源账户只支持本地分类，估值资料须由原始来源更新。','finance_source_profile_only',409);
        doc.metadata.accountProfiles={...(doc.metadata.accountProfiles||{}),[account.id]:profile};
      }
      const update={updateId:randomUUID(),accountId:account.id,kind:'account_profile',recordedAt:stamp,previousProfile:{name:account.name,description:account.description??'',assetType:account.assetType??null,liabilityType:account.liabilityType??null,assetDetails:account.assetDetails??null},profile,...(native?.assetDetails?{assetDetails:native.assetDetails}:{}),applied:true};
      doc.updates.push(update);return {accountId:account.id,update};
    });
  }
  positionValues(input){
    const quantity=decimal(input.quantity),value=money(input.recordedMarketValue);
    if(quantity==='0'&&value!=='0.00')fail('零份额持仓的记录市值必须为零。');
    return {quantity,costPrice:input.costPrice===null||input.costPrice===undefined||input.costPrice===''?null:decimal(input.costPrice),recordedMarketValue:value,currency:currency(input.currency),asOf:date(input.asOf,this.now())};
  }
  createPosition(input){
    fields(input,POSITION_FIELDS);
    const symbol=text(input.symbol,'产品代码',80,true),exchange=input.exchange??null;
    if(symbol&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(symbol)||exchange!==null&&!['US','HK','CN'].includes(exchange))fail('产品代码或市场无效。');
    const normalized={idempotencyKey:operationKey(input.idempotencyKey),accountId:text(input.accountId,'账户标识'),name:text(input.name,'持仓名称'),symbol,exchange,kind:positionKind(input.kind),...this.positionValues(input),note:text(input.note,'持仓说明',2000,true)};
    return this.mutate(normalized.idempotencyKey,{operation:'position.create',...normalized},doc=>{
      const account=doc.accounts.find(row=>row.id===normalized.accountId&&row.kind==='asset');
      if(!account)fail('请先选择当前空间的资产账户。','finance_account_not_found',404);
      if(account.readOnly)fail('官方账户持仓请通过连接器同步。','finance_official_read_only',409);
      if(!canAddNativePosition(account))fail('当前账户不支持手工新增持仓，请新建本机手工账户。','finance_position_create_unavailable',409);
      if(doc.positions.length>=5000)fail('当前空间的持仓数量已达上限。');
      const stamp=this.stamp(),position={id:'finance-position-'+randomUUID(),...normalized,provider:'manual',editable:true,createdAt:stamp,updatedAt:stamp,recordedAt:stamp,observationType:'manual',accountBaseMarker:baseMarker(account),identity:symbol?{symbol,currency:normalized.currency,...(exchange?{market:exchange}:{})}:null};delete position.idempotencyKey;
      doc.positions.push(position);return {positionId:position.id,accountId:account.id};
    });
  }
  updatePosition(input,{currentRevision}={}){
    fields(input,POSITION_UPDATE_FIELDS);const normalized={idempotencyKey:operationKey(input.idempotencyKey),positionId:text(input.positionId,'持仓标识'),accountId:text(input.accountId,'账户标识'),expectedRevision:text(input.expectedRevision,'持仓版本'),baseMarker:text(input.baseMarker,'账户版本'),...this.positionValues(input),note:text(input.note,'更新说明',2000)};
    if(input.accountBalance!==undefined){fields(input.accountBalance,['amount','currency','asOf']);normalized.accountBalance={amount:money(input.accountBalance.amount),currency:currency(input.accountBalance.currency),asOf:date(input.accountBalance.asOf,this.now())};if(normalized.accountBalance.asOf!==normalized.asOf)fail('账户与持仓须采用相同的核对日期。');}
    return this.mutate(normalized.idempotencyKey,{operation:'position.update',...normalized},doc=>{
      const account=doc.accounts.find(row=>row.id===normalized.accountId&&row.kind==='asset'),position=doc.positions.find(row=>row.id===normalized.positionId&&row.accountId===normalized.accountId);
      if(!account||!position)fail('持仓不存在于当前空间。','finance_position_not_found',404);
      if(account.readOnly||!position.editable)fail('官方持仓请通过连接器同步。','finance_official_read_only',409);
      if(normalized.expectedRevision!==(currentRevision??positionsRevision(doc.accounts,doc.positions)))fail('持仓记录已变化，请刷新后重试。','finance_position_revision_conflict',409);
      if(normalized.baseMarker!==baseMarker(account))fail('账户记录已变化，请刷新后重试。','finance_position_baseline_conflict',409);
      if(position.currency!==normalized.currency||normalized.accountBalance&&normalized.accountBalance.currency!==account.currency)fail('更新币种与原币记录不一致。','finance_currency_mismatch',409);
      if(Date.parse(normalized.asOf)<Math.max(Date.parse(account.asOf),Date.parse(position.asOf)))fail('更新日期不能早于已有账户或持仓记录。','finance_older_observation',409);
      const stamp=this.stamp(),update={...normalized,updateId:randomUUID(),recordedAt:stamp,applied:true};
      Object.assign(position,this.positionValues(normalized),{updatedAt:stamp,recordedAt:stamp,updateNote:normalized.note,latestPositionUpdateId:update.updateId,observationType:'position_update'});
      if(normalized.accountBalance)Object.assign(account,{...normalized.accountBalance,updatedAt:stamp,recordedAt:stamp,latestUpdateId:update.updateId,detailCurrent:true});
      position.accountBaseMarker=baseMarker(account);
      doc.positionUpdates.push(update);return {update};
    });
  }
  importMoomoo(preview,method){
    if(preview?.provider!=='moomoo'||preview.readOnly!==true||!Array.isArray(preview.accounts)||preview.accounts.length>50)fail('官方读取结果无效。','finance_invalid_provider_response',502);
    const fetchedAt=date(preview.fetchedAt,this.now()),accounts=[],positions=[];
    for(const source of preview.accounts){
      if(typeof source.accountRef!=='string'||!source.accountRef)fail('官方读取缺少账户标识。','finance_invalid_provider_response',502);
      const officialMoney=value=>{const parsed=fraction(decimal(String(value),{signed:true}));return fixed(parsed.n,parsed.d);};
      const id='finance-moomoo-'+digest({method,ref:source.accountRef}).slice(0,32),amount=officialMoney(source.funds?.total_assets),code=currency(source.funds.currency),suffix=source.cardSuffix||source.accountSuffix;
      const account={id,name:`Moomoo${suffix?' '+suffix:''}`,kind:'asset',amount,currency:code,asOf:fetchedAt,recordedAt:fetchedAt,updatedAt:fetchedAt,readOnly:true,provider:'moomoo',providerMethod:method,providerAccountRef:source.accountRef,description:source.securityFirm||'',observationType:'official',detailCurrent:true,readStatus:'current',funds:source.funds,accountSuffix:source.accountSuffix,cardSuffix:source.cardSuffix??null,unifiedCardSuffix:source.unifiedCardSuffix??null};accounts.push(account);
      if(!Array.isArray(source.positions)||source.positions.length>5000)fail('官方持仓列表无效。','finance_invalid_provider_response',502);
      for(const row of source.positions){
        const code=String(row.code),parts=code.split('.'),quantity=decimal(String(row.quantity),{signed:true}),recordedMarketValue=row.marketValue===null?null:officialMoney(row.marketValue);
        positions.push({id:id+':'+digest(code+'|'+(row.positionSide||'')).slice(0,20),accountId:id,name:row.name||code,symbol:parts.slice(1).join('.')||code,code,quoteSymbol:code,exchange:parts[0],kind:'stock',currency:currency(row.currency),quantity,costPrice:row.costPrice===null?null:decimal(String(row.costPrice),{signed:true}),recordedMarketValue,marketPrice:row.marketPrice,holdingPnl:row.holdingPnl,holdingPnlPct:row.holdingPnlPct,positionSide:row.positionSide||'NONE',asOf:fetchedAt,recordedAt:fetchedAt,updatedAt:fetchedAt,editable:false,provider:'moomoo',providerMethod:method,readStatus:'current',observationType:'official',identity:{symbol:code,currency:row.currency,market:parts[0]}});
      }
    }
    if(new Set(accounts.map(row=>row.id)).size!==accounts.length||new Set(positions.map(row=>row.id)).size!==positions.length)fail('官方账户或持仓标识重复。','finance_invalid_provider_response',502);
    // OAuth and AppKey return differently salted references. Replacing the
    // provider snapshot, rather than unioning both, prevents duplicate assets
    // when the same owner switches authentication methods.
    this.store.transaction(()=>{const doc=this.document(),oldIds=new Set(doc.accounts.filter(row=>row.provider==='moomoo').map(row=>row.id));doc.accounts=doc.accounts.filter(row=>!oldIds.has(row.id)).concat(accounts);doc.positions=doc.positions.filter(row=>!oldIds.has(row.accountId)).concat(positions);doc.providerSync[method]={lastSyncedAt:fetchedAt,syncStatus:'current',lastSyncError:null,syncedPositionCount:positions.length,accountIds:accounts.map(row=>row.id)};this.save(doc);});
    return {synced:true,persisted:true,readOnly:true,fetchedAt,accountId:accounts[0]?.id??null,accountIds:accounts.map(row=>row.id),positionCount:positions.length,readStatus:'current',unifiedCardSuffix:accounts[0]?.unifiedCardSuffix??null,cardSuffix:accounts[0]?.cardSuffix??null};
  }
  markMoomooFailure(method,code){const doc=this.document(),previous=doc.providerSync[method];if(!previous)return;const issue={code:typeof code==='string'?code:'READ_FAILED',message:'本次官方读取未完成，保留上次成功记录。'};doc.providerSync[method]={...previous,syncStatus:'stale',lastSyncError:issue};for(const row of [...doc.accounts,...doc.positions])if(row.provider==='moomoo'&&row.providerMethod===method)row.readStatus='stale';this.save(doc);}
  syncStatus(method){return this.document().providerSync[method]||{lastSyncedAt:null,syncStatus:'not_synced',lastSyncError:null,syncedPositionCount:0};}
  state(market={quotes:[],rates:[],issues:[],status:'idle',updatedAt:null}){return projectFinance(this.document(),market);}
}

function nativePortfolio(accounts,positions,market,rates){
  const convert=(amount,from,to)=>amount===null?null:valuation([{id:'value',amount,currency:from}],[],to,rates).assets;
  const holdings=positions.map(row=>{
    const official=row.observationType==='official'&&row.editable===false;
    const quote=official?{price:row.marketPrice,currency:row.currency,asOf:row.asOf,status:row.readStatus==='stale'?'stale':'official',sourceName:row.sourceName||'Moomoo Open API'}:(market.quotes||[]).find(item=>item.positionIds?.includes(row.id));
    const issues=[];
    let marketValue=official?row.recordedMarketValue:null;
    if(!official&&quote?.price&&quote.currency===row.currency&&!['unmapped','unavailable'].includes(quote.status)){
      if(Date.parse(quote.asOf)>=Date.parse(row.asOf))marketValue=multiply(row.quantity,quote.price);
      else issues.push({code:'QUOTE_PRECEDES_BASELINE',message:'可用报价早于持仓记录，暂不用于估值。'});
    }
    if(!official&&!row.baselineCurrent)issues.push({code:'ACCOUNT_BASELINE_CHANGED',message:'账户与持仓基线尚未同时核对。'});
    const costValue=row.costPrice===null?null:multiply(row.quantity,row.costPrice);
    const holdingPnl=official?row.holdingPnl:marketValue!==null&&costValue!==null?fixed(minor(marketValue)-minor(costValue)):null;
    const holdingPnlPct=official?row.holdingPnlPct:holdingPnl!==null&&costValue!==null&&minor(costValue)>0n?fixed(minor(holdingPnl)*100n,minor(costValue)):null;
    return {id:row.id,accountId:row.accountId,symbol:row.symbol,name:row.name,kind:row.kind,quantity:row.quantity,costPrice:row.costPrice,costValue,baselineValue:row.recordedMarketValue,baselineMarketValue:row.recordedMarketValue,baselinePrice:row.marketPrice??null,marketValue,price:quote?.price??null,valuationCurrency:row.currency,recordedCurrency:row.currency,baselineAsOf:row.asOf,quoteAsOf:quote?.asOf??null,quoteStatus:quote?.status??'unavailable',quote:quote??null,status:official?'official':marketValue===null?'recorded':quote.status==='stale'?'stale':'estimated',valuationBasis:official?'official_api':'public_quote',positionCurrent:row.baselineCurrent,latestPositionUpdateId:row.latestPositionUpdateId,linkedToAccount:false,priceChange:marketValue!==null&&row.recordedMarketValue!==null?fixed(minor(marketValue)-minor(row.recordedMarketValue)):null,holdingPnl,holdingPnlPct,recordedHoldingPnl:row.holdingPnl??null,issues,sourceName:official?(row.sourceName||'Moomoo Open API'):quote?.sourceName||'手工记录',observationType:row.observationType,readStatus:row.readStatus,readOnly:official,fetchedAt:official?row.asOf:null};
  });
  const projected=accounts.map(account=>{
    const own=holdings.filter(row=>row.accountId===account.id),official=account.readOnly===true&&account.observationType==='official',issues=[];
    const candidates=own.filter(row=>row.marketValue!==null&&(official||row.positionCurrent&&!row.issues.length)).map(row=>({row,current:convert(row.marketValue,row.valuationCurrency,account.currency),baseline:convert(row.baselineMarketValue,row.valuationCurrency,account.currency)})).filter(item=>item.current!==null&&item.baseline!==null);
    let accepted=candidates,reconciliationRequired=!official&&own.some(row=>!row.positionCurrent);
    if(!official&&minor(sum(candidates.map(item=>item.baseline)))>minor(account.amount)){
      accepted=[];reconciliationRequired=true;issues.push({code:'HOLDINGS_EXCEED_ACCOUNT',message:'已记录持仓超过账户基线，请核对账户与持仓金额。'});
    }
    let change=0n;
    for(const {row,current,baseline} of accepted){
      Object.assign(row,{linkedToAccount:true,accountCurrency:account.currency,marketValueInAccountCurrency:current,baselineValueInAccountCurrency:baseline,priceChangeInAccountCurrency:fixed(minor(current)-minor(baseline))});
      if(!official)change+=minor(current)-minor(baseline);
    }
    const coveredBookValue=sum(accepted.map(item=>item.baseline)),coveredCurrentValue=sum(accepted.map(item=>item.current));
    return {accountId:account.id,currency:account.currency,bookAmount:account.amount,estimatedAmount:fixed(minor(account.amount)+change),priceChange:fixed(change),coveredBookValue,coveredCurrentValue,bookResidual:fixed(minor(account.amount)-minor(coveredBookValue)),residualBasis:'balancing_term_at_current_fx_not_cash',coveredCount:accepted.length,holdingCount:own.length,status:official?account.readStatus==='stale'?'stale':'official':reconciliationRequired?'reconciliation_required':accepted.some(item=>item.row.status==='stale')?'stale':accepted.length?accepted.length<own.length?'partial':'estimated':'recorded',reconciliationRequired,bookAsOf:account.asOf,asOf:official?account.asOf:accepted.map(item=>item.row.quoteAsOf).filter(Boolean).sort()[0]||account.asOf,issues};
  });
  return {holdings,accounts:projected};
}

function financeRates(...sources){
  const selected=new Map([['CNY',{currency:'CNY',rate:'1',baseCurrency:'CNY',asOf:null,sourceName:'原币',sourceUrl:null}]]),times=new Map();
  for(const rows of sources){
    if(!Array.isArray(rows))continue;
    for(const row of rows){
      if(!row||row.currency==='CNY'||row.baseCurrency!=null&&row.baseCurrency!=='CNY')continue;
      let rate;try{currency(row.currency);rate=decimal(row.rate);if(fraction(rate).n<=0n)continue;}catch{continue;}
      let stamp=-Infinity;
      if(row.asOf!=null){
        if(typeof row.asOf!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(row.asOf))continue;
        stamp=Date.parse(row.asOf);const day=row.asOf.slice(0,10),dayStamp=Date.parse(day+'T00:00:00Z');
        if(!Number.isFinite(stamp)||!Number.isFinite(dayStamp)||new Date(dayStamp).toISOString().slice(0,10)!==day||row.asOf.length>10&&(Number(row.asOf.slice(11,13))>23||Number(row.asOf.slice(14,16))>59||Number(row.asOf.slice(17,19))>59))continue;
      }
      const previous=selected.get(row.currency),previousTime=times.get(row.currency);
      // Undated legacy rates are a fallback, never a replacement for a dated
      // observation. At the same instant retain a non-stale source if present.
      if(previous&&(stamp<previousTime||stamp===previousTime&&previous.status!=='stale'&&row.status==='stale'))continue;
      selected.set(row.currency,{...row,rate,baseCurrency:'CNY'});times.set(row.currency,stamp);
    }
  }
  return [...selected.values()];
}

export function projectFinance(doc,market,upstream=null){
  const archivedIds=new Set(doc.metadata.archivedAccountIds||[]);
  const profiles=doc.metadata.accountProfiles||{};
  const archivedAccounts=[...(upstream?.accounts||[]).map(row=>({...row,kind:'asset'})),...(upstream?.liabilities||[]).map(row=>({...row,kind:'liability'})),...doc.accounts].filter(row=>archivedIds.has(row.id)).map(row=>withAccountProfile(row,profiles));
  const activeAccount=row=>!archivedIds.has(row.id),activePosition=row=>!archivedIds.has(row.accountId);
  doc={...doc,accounts:doc.accounts.filter(activeAccount),positions:doc.positions.filter(activePosition)};
  if(upstream)upstream={...upstream,accounts:upstream.accounts.filter(activeAccount),liabilities:upstream.liabilities.filter(activeAccount),positions:{...upstream.positions,items:(upstream.positions?.items||[]).filter(activePosition)},portfolio:{...upstream.portfolio,accounts:(upstream.portfolio?.accounts||[]).filter(activePosition),holdings:(upstream.portfolio?.holdings||[]).filter(activePosition),summary:{...upstream.portfolio?.summary,reconciliationRequiredAccounts:(upstream.portfolio?.summary?.reconciliationRequiredAccounts||[]).filter(id=>!archivedIds.has(id))}},snapshot:upstream.snapshot?{...upstream.snapshot,assets_selected:(upstream.snapshot.assets_selected||[]).filter(activeAccount),liabilities:(upstream.snapshot.liabilities||[]).filter(activeAccount)}:undefined};
  const nativeAccounts=doc.accounts.map(row=>({...withAccountProfile(row,profiles),canAddPosition:canAddNativePosition(row)}));
  const nativeAssets=nativeAccounts.filter(row=>row.kind==='asset'),nativeLiabilities=nativeAccounts.filter(row=>row.kind==='liability');
  // The legacy adapter can edit existing observations, but exposes no create
  // position route. Derive capabilities here instead of trusting upstream flags.
  const accounts=[...(upstream?.accounts||[]).map(row=>({...withAccountProfile({...row,kind:'asset'},profiles),canAddPosition:false})),...nativeAssets],liabilities=[...(upstream?.liabilities||[]).map(row=>({...withAccountProfile({...row,kind:'liability'},profiles),canAddPosition:false})),...nativeLiabilities],byId=new Map(accounts.map(row=>[row.id,row]));
  const nativePositions=doc.positions.map(row=>{const account=byId.get(row.accountId),marker=baseMarker(account);return {...row,currentAccountBaseMarker:marker,baselineValue:row.recordedMarketValue,recordedCurrency:row.currency,baselineCurrent:account.asOf===row.asOf&&(row.observationType==='official'||row.accountBaseMarker===marker),sourceRefs:[]};});
  const positionItems=[...(upstream?.positions?.items||[]),...nativePositions],positionRevision=upstream?digest({upstream:upstream.positions?.revision,native:positionsRevision(doc.accounts,doc.positions)}):positionsRevision(doc.accounts,doc.positions);
  const rates=financeRates(upstream?.valuation?.rates,upstream?.portfolio?.rates,upstream?.market?.rates,market.rates);
  market={...market,rates};
  const displayCurrency=doc.metadata.onboarding.displayCurrency,converted=valuation(accounts,liabilities,displayCurrency,rates);
  const native=nativePortfolio(nativeAssets,nativePositions,market,rates),nativeHoldings=native.holdings;
  const portfolioAccounts=[...(upstream?.portfolio?.accounts||[]),...native.accounts];
  const estimatedAccounts=accounts.map(row=>({...row,amount:portfolioAccounts.find(item=>item.accountId===row.id)?.estimatedAmount??row.amount}));
  const portfolioValue=valuation(estimatedAccounts,liabilities,displayCurrency,rates);
  const reconciliationRequiredAccounts=[...new Set([...(upstream?.portfolio?.summary?.reconciliationRequiredAccounts||[]),...native.accounts.filter(row=>row.reconciliationRequired).map(row=>row.accountId)])];
  const observedAt=[upstream?.observedAt,...doc.accounts.map(row=>row.updatedAt),...doc.positions.map(row=>row.updatedAt)].filter(Boolean).sort().at(-1)||null;
  return {...(upstream||{}),revision:digest({doc,upstream:upstream?.revision,market:market.revision}),observedAt,accounts,liabilities,archivedAccounts,metadata:doc.metadata,source:{mode:upstream?'local-adapter':'native'},snapshot:upstream?.snapshot||{snapshot_id:'native',snapshot_date:observedAt?.slice(0,10)||null,recorded_at:observedAt,assets_selected:accounts,liabilities,sources:[],securities:[],account_details:{}},totals:{assetsByCurrency:totals(accounts),liabilitiesByCurrency:totals(liabilities)},updates:[...(upstream?.updates||[]),...doc.updates].sort((a,b)=>String(b.recordedAt).localeCompare(String(a.recordedAt))),positions:{items:positionItems,revision:positionRevision,updates:[...(upstream?.positions?.updates||[]),...doc.positionUpdates],reconciliationRequiredAccounts},valuation:converted,market,portfolio:{...(upstream?.portfolio||{}),version:1,basis:'recorded_balances',baseCurrency:displayCurrency,estimated:Boolean(upstream?.portfolio?.estimated)||nativeHoldings.some(row=>row.linkedToAccount&&row.valuationBasis!=='official_api'),holdings:[...(upstream?.portfolio?.holdings||[]),...nativeHoldings],accounts:portfolioAccounts,summary:{...portfolioValue,complete:portfolioValue.complete&&!reconciliationRequiredAccounts.length,bookAssetsAtCurrentFx:converted.assets,priceChange:portfolioValue.assets!==null&&converted.assets!==null?fixed(minor(portfolioValue.assets)-minor(converted.assets)):null,reconciliationRequiredAccounts,liabilityScope:'recorded_only'},rates:portfolioValue.rates,convertedAccounts:portfolioValue.convertedAccounts,issues:portfolioValue.issue?[portfolioValue.issue]:[],coverage:{linkedHoldingCount:(upstream?.portfolio?.coverage?.linkedHoldingCount||0)+nativeHoldings.filter(row=>row.linkedToAccount).length,totalHoldingCount:positionItems.length,pricedAccounts:(upstream?.portfolio?.coverage?.pricedAccounts||0)+native.accounts.filter(row=>row.coveredCount).length,totalAccounts:accounts.length}},connection:{mode:'local',bankConnected:Boolean([...accounts,...liabilities].some(row=>row.readOnly&&row.observationType==='official')),source:upstream?'local_adapter_and_manual':'workspace_finance',stream:'/api/finance/events'}};
}
