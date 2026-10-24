import {randomUUID} from 'node:crypto';
import {financeQuoteDefinition} from './market.mjs';
import {isRecurringOccurrence} from './recurrence.mjs';
import {currency,date,digest,fail,fields,minor,money,operationKey,text,valuation} from './arithmetic.mjs';

export const FINANCE_WIDGET_IDS=Object.freeze(['net-worth','spend-by-category','spend-this-month','upcoming-payments','subscriptions','bills','portfolio-distribution','market-update','credit-score','transactions','goals','budgets','memories']);
export const FINANCE_JOURNAL_COLLECTIONS=Object.freeze(['transactions','recurring','creditRecords','goals','budgets','memories','watchlist']);
const storageCollection=collection=>`financeJournal:${collection}`;
const controls=['id','expectedRevision','idempotencyKey','source'];
const recordFields={
  transactions:['kind','occurredOn','amount','currency','merchant','category','subcategory','accountId','toAccountId','recurringId','recurringOccurrenceOn','note'],
  recurring:['kind','name','amount','currency','anchorDate','endDate','frequency','interval','accountId','category','subcategory','note'],
  creditRecords:['score','min','max','provider','model','asOf','factors','note'],
  goals:['name','targetAmount','currentAmount','currency','targetDate','description'],
  budgets:['name','month','amount','currency','category','subcategory','accountIds'],
  memories:['text','kind'],
  watchlist:['symbol','exchange','currency','kind','name'],
};
const defaultDashboard=()=>({revision:0,enabled:['net-worth','spend-by-category','spend-this-month','upcoming-payments','portfolio-distribution','market-update'],order:[...FINANCE_WIDGET_IDS],updatedAt:null});
const optional=(value,label,max=2000)=>text(value??'',label,max,true);
const choose=(value,allowed,label)=>{if(!allowed.includes(value))fail(`${label}无效。`);return value;};
const integer=(value,label,min=0,max=1_000_000_000)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail(`${label}无效。`);return value;};
const validCollection=collection=>choose(collection,FINANCE_JOURNAL_COLLECTIONS,'财务记录类型');
export const journalToday=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(now)));
export function journalDay(value,{future=true,today=journalToday()}={}){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('日期须为 YYYY-MM-DD。','finance_invalid_date');
  const stamp=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==value||(!future&&value>today))fail('记录日期无效或晚于当前日期。','finance_invalid_date');
  return value;
}
export function journalMonth(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}$/.test(value))fail('月份须为 YYYY-MM。','finance_invalid_date');
  journalDay(value+'-01');return value;
}
function sourceOf(value={kind:'manual'}){
  if(value?.kind==='manual'){fields(value,['kind']);return {kind:'manual'};}
  if(value?.kind==='connector')fail('服务商来源只能由连接同步写入。','finance_invalid_source');
  fields(value,['kind','fileName','fileHash','row','batchId']);
  if(value.kind!=='import')fail('财务记录来源须为手工记录或文件导入。','finance_invalid_source');
  const fileName=text(value.fileName,'原文件名称',255),fileHash=value.fileHash;
  if(/[\\/]/.test(fileName)||typeof fileHash!=='string'||!/^[a-f0-9]{64}$/i.test(fileHash))fail('导入来源需要原文件名及 SHA-256 校验值。','finance_invalid_source');
  return {kind:'import',fileName,fileHash:fileHash.toLowerCase(),row:integer(value.row,'原文件行号',1,10_000_000),batchId:operationKey(value.batchId)};
}
function accountRef(value,accounts){
  if(value===undefined||value===null||value==='')return null;
  const id=text(value,'账户标识');
  if(!accounts.some(row=>row.id===id))fail('关联账户不在当前空间。','finance_account_not_found',404);
  return id;
}
const importIdentity=source=>source?.kind==='import'?`${source.fileHash}:${source.row}`:null;
const providerIdentity=source=>digest({provider:source.provider,environment:source.environment,accountRef:source.accountRef,transactionRef:source.transactionRef});
const providerReadOnly=record=>{if(record?.source?.kind==='connector')fail('此交易由服务商同步，请在来源账户更正后重新同步。','finance_official_read_only',409);};

/** Stored independently from account/position balances. Every edit has a retained revision. */
export class FinanceJournal{
  constructor(store,{now=()=>Date.now()}={}){this.store=store;this.now=now;}
  stamp(){return new Date(Number(this.now())).toISOString();}
  read(){
    const doc={version:1};
    for(const collection of [...FINANCE_JOURNAL_COLLECTIONS,'snapshots'])doc[collection]=this.store.list(storageCollection(collection)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
    doc.dashboard=this.store.get('meta','financeDashboard')?.value??defaultDashboard();
    return {...doc,revision:digest(doc)};
  }
  mutate(key,input,change){
    const fingerprint=digest(input),prior=this.store.get('financeJournalOperations',key);
    if(prior){if(prior.fingerprint!==fingerprint)fail('此更新标识已用于其他财务记录，请重新操作。','finance_idempotency_conflict',409);return {...prior.result,replayed:true};}
    return this.store.transaction(()=>{
      const result=change();
      this.store.put('financeJournalOperations',{id:key,fingerprint,result,createdAt:this.stamp()});
      return {...result,replayed:false};
    });
  }
  retain(collection,before,after,operation){
    this.store.put(storageCollection(collection),after);
    this.store.put('financeJournalHistory',{id:'finance-journal-change-'+randomUUID(),collection,recordId:after.id,operation,before,after,recordedAt:this.stamp()});
  }
  normalize(collection,input,{accounts=[],previous}={}){
    fields(input,[...controls,...recordFields[collection]]);
    const source=sourceOf(input.source??previous?.source);
    if(previous&&digest(previous.source)!==digest(source))fail('原始来源不可改写；请保留来源并修订记录内容。','finance_source_immutable',409);
    const today=journalToday(this.now()),code=collection==='creditRecords'||collection==='memories'?null:currency(input.currency);
    if(collection==='transactions'){
      const kind=choose(input.kind,['expense','income','transfer'],'交易类型'),amount=money(input.amount,{signed:true});
      if(kind!=='expense'&&minor(amount)<=0n)fail('收入或转账金额须大于零。');
      const accountId=accountRef(input.accountId,accounts),toAccountId=accountRef(input.toAccountId,accounts);
      if(toAccountId&&(kind!=='transfer'||toAccountId===accountId))fail('转入账户须不同于转出账户，且仅用于转账记录。');
      const recurringId=input.recurringId?text(input.recurringId,'账单标识'):null;
      const recurringOccurrenceOn=input.recurringOccurrenceOn?journalDay(input.recurringOccurrenceOn):null;
      if(Boolean(recurringId)!==Boolean(recurringOccurrenceOn))fail('关联账单时须同时提供账单标识及本期日期。');
      if(recurringId){
        const recurring=this.store.get(storageCollection('recurring'),recurringId);
        if(!recurring)fail('关联账单不在当前空间。','finance_recurring_not_found',404);
        if(kind!==(recurring.kind==='income'?'income':'expense'))fail('交易类型与关联账单不一致。');
        if(recurring.currency!==code)fail('关联付款的原币须与账单一致。','finance_currency_mismatch',409);
        if(!isRecurringOccurrence(recurring,recurringOccurrenceOn))fail('关联日期不是该账单的有效期次。','finance_recurring_occurrence_invalid');
      }
      return {kind,occurredOn:journalDay(input.occurredOn,{future:false,today}),amount,currency:code,merchant:optional(input.merchant,'商户名称',300),category:optional(input.category,'分类',100),subcategory:optional(input.subcategory,'子分类',100),accountId,toAccountId,recurringId,recurringOccurrenceOn,note:optional(input.note,'交易说明'),source};
    }
    if(collection==='recurring'){
      const anchorDate=journalDay(input.anchorDate),endDate=input.endDate?journalDay(input.endDate):null;
      if(input.kind==='income'&&minor(money(input.amount))<=0n)fail('计划收入金额须大于零。');
      if(endDate&&endDate<anchorDate)fail('结束日期不能早于首期日期。');
      return {kind:choose(input.kind,['bill','subscription','income'],'循环记录类型'),name:text(input.name,'名称',300),amount:money(input.amount),currency:code,anchorDate,endDate,frequency:choose(input.frequency,['once','weekly','monthly','quarterly','yearly'],'账单周期'),interval:integer(input.interval??1,'周期间隔',1,120),accountId:accountRef(input.accountId,accounts),category:optional(input.category,'分类',100),subcategory:optional(input.subcategory,'子分类',100),note:optional(input.note,'账单说明'),source};
    }
    if(collection==='creditRecords'){
      const min=integer(input.min,'量表最低分'),max=integer(input.max,'量表最高分'),score=integer(input.score,'信用分');
      if(max<=min||score<min||score>max)fail('信用分须在所填写的量表范围内。');
      const factors=input.factors??[];
      if(!Array.isArray(factors)||factors.length>6)fail('信用报告因素最多六项。');
      return {score,min,max,provider:text(input.provider,'报告机构',200),model:text(input.model,'评分模型或量表名称',200),asOf:journalDay(input.asOf,{future:false,today}),factors:factors.map(item=>{fields(item,['name','value']);return {name:text(item.name,'因素名称',100),value:text(item.value,'报告中的因素值',500)};}),note:optional(input.note,'信用报告说明'),source};
    }
    if(collection==='goals'){
      const targetAmount=money(input.targetAmount);if(minor(targetAmount)<=0n)fail('目标金额须大于零。');
      return {name:text(input.name,'目标名称',300),targetAmount,currentAmount:input.currentAmount===undefined||input.currentAmount===null||input.currentAmount===''?null:money(input.currentAmount),currency:code,targetDate:input.targetDate?journalDay(input.targetDate):null,description:optional(input.description,'目标说明'),source};
    }
    if(collection==='budgets'){
      const ids=input.accountIds??[];if(!Array.isArray(ids)||ids.length>500)fail('预算账户范围无效。');
      const accountIds=ids.map(value=>accountRef(value,accounts));if(accountIds.some(id=>!id)||new Set(accountIds).size!==accountIds.length)fail('预算账户范围不能重复或为空。');
      return {name:text(input.name,'预算名称',300),month:journalMonth(input.month),amount:money(input.amount),currency:code,category:optional(input.category,'分类',100),subcategory:optional(input.subcategory,'子分类',100),accountIds,source};
    }
    if(collection==='watchlist'){
      if(source.kind!=='manual')fail('自选证券须由本人明确添加。','finance_watchlist_manual_only');
      const exchange=choose(input.exchange,['US','HK','CN'],'证券市场'),kind=choose(input.kind,['stock','etf','fund'],'证券类型');
      const rawSymbol=text(input.symbol,'证券代码',80).toUpperCase(),prefix=/^(US|HK|CN)\.(.+)$/.exec(rawSymbol);
      if(prefix&&prefix[1]!==exchange)fail('证券代码前缀与所选市场不一致。','finance_watchlist_identity_invalid');
      const symbol=prefix?prefix[2]:rawSymbol,name=text(input.name,'证券名称',200);
      const quote=financeQuoteDefinition({symbol,exchange,currency:code,kind,name});
      if(quote.provider==='unmapped')fail('当前不支持此市场、代码、币种与产品类型组合。','finance_watchlist_identity_invalid');
      return {symbol:quote.symbol,exchange,currency:code,kind,name,quoteId:quote.id,source};
    }
    if(source.kind!=='manual')fail('财务记忆须由本人明确保存。','finance_memory_requires_confirmation');
    return {text:text(input.text,'财务记忆',5000),kind:choose(input.kind,['preference','goal','constraint','note'],'财务记忆类型'),source};
  }
  prepareRecord(collection,input){
    validCollection(collection);fields(input,[...controls,...recordFields[collection]]);
    const key=operationKey(input.idempotencyKey),id=input.id===undefined||input.id===null||input.id===''?null:text(input.id,'记录标识');
    integer(input.expectedRevision,'记录版本');return {key,id};
  }
  commitRecord(collection,input,{accounts=[]}={}){
    const {id}=this.prepareRecord(collection,input),previous=id?this.store.get(storageCollection(collection),id):null;
    if(id&&!previous)fail('财务记录不在当前空间。','finance_journal_not_found',404);
    providerReadOnly(previous);
    if(input.expectedRevision!==(previous?.revision??0))fail('财务记录已变化，请刷新后再保存。','finance_journal_revision_conflict',409);
    const normalized=this.normalize(collection,input,{accounts,previous});
    if(collection==='watchlist'&&this.store.list(storageCollection(collection)).some(row=>row.id!==id&&row.exchange===normalized.exchange&&row.symbol===normalized.symbol&&row.currency===normalized.currency))fail('此证券已在自选记录中；如已归档，请恢复原记录。','finance_watchlist_duplicate',409);
    const imported=!id&&importIdentity(normalized.source);
    const importKey=imported?digest({collection,source:importIdentity(normalized.source)}):null;
    const importFingerprint=imported?digest({...normalized,source:{kind:'import',fileHash:normalized.source.fileHash,row:normalized.source.row}}):null;
    if(importKey){
      const prior=this.store.get('financeJournalImports',importKey);
      if(prior){
        if(prior.fingerprint!==importFingerprint)fail(`原文件第 ${normalized.source.row} 行已按不同内容导入，请打开原记录修订。`,'finance_import_source_conflict',409);
        return {record:this.store.require(storageCollection(collection),prior.recordId),deduplicated:true};
      }
    }
    const stamp=this.stamp(),record={...normalized,id:id??`finance-${collection}-`+randomUUID(),revision:(previous?.revision??0)+1,archived:previous?.archived??false,createdAt:previous?.createdAt??stamp,updatedAt:stamp};
    this.retain(collection,previous,record,previous?'update':'create');
    if(importKey)this.store.put('financeJournalImports',{id:importKey,recordId:record.id,fingerprint:importFingerprint});
    return {record};
  }
  saveRecord(collection,input,{accounts=[]}={}){
    const {key}=this.prepareRecord(collection,input);
    return this.mutate(key,{operation:'record.save',collection,input},()=>this.commitRecord(collection,input,{accounts}));
  }
  importTransactions(input,{accounts=[]}={}){
    fields(input,['idempotencyKey','transactions']);const key=operationKey(input.idempotencyKey);
    if(!Array.isArray(input.transactions)||!input.transactions.length||input.transactions.length>2000)fail('每次导入须包含 1 至 2000 条交易。','finance_import_limit');
    return this.mutate(key,{operation:'transactions.import',input},()=>{
      let createdCount=0,deduplicatedCount=0;const recordIds=[];
      for(const row of input.transactions){
        if(row?.id||row?.expectedRevision!==0||row?.source?.kind!=='import')fail('批量导入只接受带原文件来源的新交易记录。','finance_import_invalid_row');
        const result=this.commitRecord('transactions',row,{accounts});
        if(result.deduplicated)deduplicatedCount++;else createdCount++;
        recordIds.push(result.record.id);
      }
      return {createdCount,deduplicatedCount,recordIds};
    });
  }
  /** Trusted adapter snapshots only. The savepoint participates in the caller's
   * account/position transaction and also makes direct imports atomic. */
  importProviderTransactions(snapshot,{accountIds={},relinkedAccounts={}}={}){
    if(!snapshot||snapshot.readOnly!==true||snapshot.complete!==true||typeof snapshot.provider!=='string'||!/^[a-z][a-z0-9_]{1,40}$/.test(snapshot.provider))fail('连接返回的交易数据不完整。','finance_invalid_provider_response',502);
    const environment=choose(snapshot.environment,['production','development'],'连接环境');
    const mode=choose(snapshot.transactionMode,['snapshot','none'],'交易同步范围');
    if(mode==='none')return {created:0,updated:0,archived:0};
    if(!Array.isArray(snapshot.transactions)||snapshot.transactions.length>50000)fail('连接返回的交易列表无效。','finance_invalid_provider_response',502);
    if(!accountIds||typeof accountIds!=='object'||Array.isArray(accountIds))fail('交易账户对应关系无效。','finance_account_mapping_conflict',409);
    const entries=Object.entries(accountIds),mapped=new Map(entries.map(([ref,id])=>[text(ref,'来源账户标识',200),text(id,'本地账户标识',200)]));
    if(mapped.size!==entries.length||new Set(mapped.values()).size!==entries.length||entries.some(([ref,id])=>mapped.get(ref)!==id))fail('交易账户对应关系不能重复。','finance_account_mapping_conflict',409);
    const provider=snapshot.provider,fetchedAt=new Date(date(snapshot.fetchedAt,this.now())).toISOString(),today=journalToday(this.now());
    if(!relinkedAccounts||typeof relinkedAccounts!=='object'||Array.isArray(relinkedAccounts))fail('重新连接的账户对应关系无效。','finance_account_mapping_conflict',409);
    const relinks=Object.entries(relinkedAccounts);
    if(new Set(relinks.map(([,oldRef])=>oldRef)).size!==relinks.length||relinks.some(([ref,oldRef])=>!mapped.has(ref)||typeof oldRef!=='string'||text(oldRef,'原来源账户标识',200)!==oldRef||oldRef===ref||mapped.has(oldRef)))fail('重新连接的账户须对应本次选择的不同来源账户。','finance_account_mapping_conflict',409);
    let range=null;
    if(snapshot.transactionRange!=null){
      fields(snapshot.transactionRange,['from','to']);
      range={from:journalDay(snapshot.transactionRange.from),to:journalDay(snapshot.transactionRange.to)};
      if(range.from>range.to)fail('交易同步日期范围无效。','finance_invalid_date');
    }
    const storedTransactions=this.store.list(storageCollection('transactions'));
    const watermarkId=ref=>digest({provider,environment,accountRef:ref});
    const withdrawalAccounts=new Map(mapped),previousRefs=new Map(),retiredWatermarks=new Map();
    for(const [ref,accountId] of entries){
      const current=this.store.get('financeJournalProviderSync',watermarkId(ref));
      if(current?.relinkedTo)fail('此来源账户已接续到新连接，请重新读取当前连接。','finance_account_mapping_conflict',409);
      const oldRef=relinkedAccounts[ref],oldMark=oldRef?this.store.get('financeJournalProviderSync',watermarkId(oldRef)):null;
      if(oldMark?.relinkedTo&&oldMark.relinkedTo!==ref)fail('原来源账户已接续到其他连接。','finance_account_mapping_conflict',409);
      const aliases=new Set([...(current?.previousAccountRefs??[]),...(oldRef?[oldRef,...(oldMark?.previousAccountRefs??[])]:[])]);
      for(const alias of aliases){
        if(alias===ref||mapped.has(alias))fail('重新连接的来源账户不能相互重叠。','finance_account_mapping_conflict',409);
        const prior=this.store.get('financeJournalProviderSync',watermarkId(alias));
        const records=storedTransactions.filter(row=>row.source?.kind==='connector'&&row.source.provider===provider&&row.source.environment===environment&&row.source.accountRef===alias);
        if((prior&&(prior.provider!==provider||prior.environment!==environment||prior.accountRef!==alias||prior.accountId!==accountId))||(!prior&&!records.length)||records.some(row=>row.accountId!==accountId))fail('原交易来源与当前账户、服务商或环境不匹配。','finance_account_mapping_conflict',409);
        if((prior&&Date.parse(prior.fetchedAt)>Date.parse(fetchedAt))||records.some(row=>Date.parse(row.source.fetchedAt)>Date.parse(fetchedAt)))fail('交易报告早于原连接的上次同步，请重新读取。','finance_older_observation',409);
        if(withdrawalAccounts.has(alias)&&withdrawalAccounts.get(alias)!==accountId)fail('重新连接的来源账户不能重复使用。','finance_account_mapping_conflict',409);
        withdrawalAccounts.set(alias,accountId);
        retiredWatermarks.set(alias,{...prior,id:watermarkId(alias),provider,environment,accountRef:alias,accountId,fetchedAt,relinkedTo:ref});
      }
      previousRefs.set(ref,[...aliases].sort());
    }
    const incoming=new Map(),byAccount=new Map(entries.map(([ref])=>[ref,[]]));
    for(const row of snapshot.transactions){
      if(!row||typeof row!=='object')fail('连接返回的交易记录无效。','finance_invalid_provider_response',502);
      const sourceAccountRef=text(row.accountRef,'来源账户标识',200),accountId=mapped.get(sourceAccountRef);
      if(!accountId)continue;
      const source={kind:'connector',provider,environment,transactionRef:text(row.transactionRef,'来源交易标识',200),accountRef:sourceAccountRef,fetchedAt};
      const kind=choose(row.kind,['expense','income','transfer'],'交易类型'),amount=money(row.amount,{signed:true});
      if(kind!=='expense'&&minor(amount)<=0n)fail('收入或转账金额须大于零。');
      const occurredOn=journalDay(row.occurredOn,{future:false,today});
      if(range&&(occurredOn<range.from||occurredOn>range.to))fail('交易日期超出服务商声明的完整范围。','finance_invalid_provider_response',502);
      const record={kind,occurredOn,amount,currency:currency(row.currency),merchant:optional(row.merchant,'商户名称',300),category:optional(row.category,'分类',100),subcategory:'',accountId,toAccountId:null,recurringId:null,recurringOccurrenceOn:null,note:optional(row.note,'交易说明'),source};
      const identity=providerIdentity(source);
      if(incoming.has(identity))fail('连接返回了重复的交易标识。','finance_provider_transaction_duplicate',502);
      incoming.set(identity,record);byAccount.get(sourceAccountRef).push(record);
    }
    // Account-scoped watermarks include successful empty snapshots and unchanged
    // rereads, so delayed responses cannot restore already withdrawn transactions.
    const watermarks=entries.map(([ref,accountId])=>{
      const id=digest({provider,environment,accountRef:ref}),previous=this.store.get('financeJournalProviderSync',id);
      const fingerprint=digest({accountId,range,transactions:byAccount.get(ref).map(row=>({...row,source:{...row.source,fetchedAt:null}})).sort((a,b)=>a.source.transactionRef.localeCompare(b.source.transactionRef))});
      if(previous&&Date.parse(previous.fetchedAt)>Date.parse(fetchedAt))fail('交易报告早于上次成功同步，请重新读取。','finance_older_observation',409);
      if(previous?.fetchedAt===fetchedAt&&previous.fingerprint!==fingerprint)fail('同一时刻的交易报告内容不一致，请重新读取。','finance_provider_snapshot_conflict',409);
      return {id,provider,environment,accountRef:ref,accountId,fetchedAt,fingerprint,...(previousRefs.get(ref).length?{previousAccountRefs:previousRefs.get(ref)}:{})};
    });
    const writes=[],stamp=this.stamp(),result={created:0,updated:0,archived:0};
    for(const [identity,normalized] of incoming){
      const id='finance-provider-transaction-'+identity,previous=this.store.get(storageCollection('transactions'),id);
      if(previous&&(previous.source?.kind!=='connector'||providerIdentity(previous.source)!==identity||previous.accountId!==normalized.accountId))fail('交易来源与当前账户对应关系不匹配。','finance_account_mapping_conflict',409);
      if(previous&&Date.parse(previous.source.fetchedAt)>Date.parse(fetchedAt))fail('交易报告早于现有记录。','finance_older_observation',409);
      const unchanged=previous&&!previous.archived&&recordFields.transactions.every(field=>previous[field]===normalized[field]);
      if(unchanged)continue;
      const record={...normalized,id,revision:(previous?.revision??0)+1,archived:false,createdAt:previous?.createdAt??stamp,updatedAt:stamp};
      writes.push({previous,record,operation:previous?(previous.archived?'provider_restore':'provider_update'):'provider_import'});
      result[previous?'updated':'created']++;
    }
    if(range){
      for(const previous of storedTransactions){
        const source=previous.source;
        if(previous.archived||source?.kind!=='connector'||source.provider!==provider||source.environment!==environment||withdrawalAccounts.get(source.accountRef)!==previous.accountId||previous.occurredOn<range.from||previous.occurredOn>range.to||incoming.has(providerIdentity(source)))continue;
        if(Date.parse(source.fetchedAt)>Date.parse(fetchedAt))fail('交易报告早于现有记录。','finance_older_observation',409);
        writes.push({previous,record:{...previous,source:{...source,fetchedAt},revision:previous.revision+1,archived:true,updatedAt:stamp},operation:'provider_withdraw'});result.archived++;
      }
    }
    const savepoint='finance_provider_'+randomUUID().replaceAll('-','');
    this.store.db.exec(`SAVEPOINT ${savepoint}`);
    try{
      for(const {previous,record,operation} of writes)this.retain('transactions',previous,record,operation);
      for(const watermark of retiredWatermarks.values())this.store.put('financeJournalProviderSync',watermark);
      for(const watermark of watermarks)this.store.put('financeJournalProviderSync',watermark);
      this.store.db.exec(`RELEASE SAVEPOINT ${savepoint}`);return result;
    }catch(error){this.store.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);this.store.db.exec(`RELEASE SAVEPOINT ${savepoint}`);throw error;}
  }
  archiveRecord(collection,input){
    validCollection(collection);fields(input,['id','expectedRevision','idempotencyKey','archived']);
    const key=operationKey(input.idempotencyKey),id=text(input.id,'记录标识');integer(input.expectedRevision,'记录版本',1);
    if(typeof input.archived!=='boolean')fail('归档状态无效。');
    return this.mutate(key,{operation:'record.archive',collection,input},()=>{
      const previous=this.store.get(storageCollection(collection),id);if(!previous)fail('财务记录不在当前空间。','finance_journal_not_found',404);
      providerReadOnly(previous);
      if(previous.revision!==input.expectedRevision)fail('财务记录已变化，请刷新后再操作。','finance_journal_revision_conflict',409);
      const record={...previous,revision:previous.revision+1,archived:input.archived,updatedAt:this.stamp()};
      this.retain(collection,previous,record,input.archived?'archive':'restore');return {record};
    });
  }
  capture(state,input){
    fields(input,['idempotencyKey']);const key=operationKey(input.idempotencyKey);
    return this.mutate(key,{operation:'snapshot.capture',input},()=>{
      if(!Array.isArray(state?.accounts)||!Array.isArray(state?.liabilities)||!state.revision)fail('账户状态尚未完整返回，无法保存快照。','finance_snapshot_state_invalid',409);
      if(!state.accounts.length&&!state.liabilities.length)fail('当前没有账户记录可保存为净资产快照。','finance_snapshot_empty',409);
      const code=currency(state.metadata?.onboarding?.displayCurrency??state.valuation?.currency??state.valuation?.baseCurrency);
      const rows=(records,kind)=>records.map(row=>({id:text(row.id,'账户标识'),name:text(row.name,'账户名称'),kind,currency:currency(row.currency),amount:money(row.amount,{signed:true}),asOf:typeof row.asOf==='string'?row.asOf:''}));
      const assets=rows(state.accounts,'asset'),liabilities=rows(state.liabilities,'liability');
      const converted=valuation(assets,liabilities,code,state.valuation?.rates??state.market?.rates??[]),stamp=this.stamp();
      const snapshot={id:'finance-snapshot-'+randomUUID(),revision:1,archived:false,createdAt:stamp,updatedAt:stamp,capturedAt:stamp,date:journalToday(this.now()),timeZone:'Asia/Shanghai',currency:code,sourceRevision:String(state.revision),basis:'recorded_balances_at_capture_fx',accounts:[...assets,...liabilities],scope:{accountIds:assets.map(row=>row.id),liabilityIds:liabilities.map(row=>row.id),archivedAccountIds:(state.archivedAccounts??[]).map(row=>row.id)},valuation:{assets:converted.assets,liabilities:converted.liabilities,net:converted.net,complete:converted.complete,unconvertedCurrencies:converted.unconvertedCurrencies,rates:converted.rates}};
      this.store.put(storageCollection('snapshots'),snapshot);return {snapshot};
    });
  }
  saveDashboard(input){
    fields(input,['enabled','order','expectedRevision','idempotencyKey']);const key=operationKey(input.idempotencyKey);integer(input.expectedRevision,'布局版本');
    for(const name of ['enabled','order'])if(!Array.isArray(input[name])||input[name].some(id=>!FINANCE_WIDGET_IDS.includes(id))||new Set(input[name]).size!==input[name].length)fail('总览组件设置无效。');
    if(input.order.length!==FINANCE_WIDGET_IDS.length)fail('总览排序须包含全部可选组件。');
    return this.mutate(key,{operation:'dashboard.save',input},()=>{
      const previous=this.store.get('meta','financeDashboard')?.value??defaultDashboard();
      if(previous.revision!==input.expectedRevision)fail('总览布局已变化，请刷新后再保存。','finance_journal_revision_conflict',409);
      const dashboard={revision:previous.revision+1,enabled:[...input.enabled],order:[...input.order],updatedAt:this.stamp()};
      this.store.setMeta('financeDashboard',dashboard);return {dashboard};
    });
  }
}
