import {randomUUID} from 'node:crypto';
import {currency,date,decimal,digest,fail,fixed,fraction,text} from './arithmetic.mjs';
import {ASSET_TYPES,LIABILITY_TYPES,POSITION_TYPES} from '../../shared/asset-taxonomy.mjs';

const invalid=()=>fail('连接返回的数据不完整，现有记录未更改。','finance_invalid_provider_response',502);
const amount=value=>{const f=fraction(decimal(value,{signed:true}));return fixed(f.n,f.d);};
const reference=value=>text(value,'来源标识',200);
const unique=rows=>new Set(rows).size===rows.length;

/** Called only with a server-retained complete snapshot. Browser input never
 * supplies balances, holdings, transaction data, or provider provenance. */
export function importProviderSnapshot(native,snapshot,{accountRefs,mappings={},accountDecisions={},idempotencyKey},journal){
 if(!snapshot||snapshot.readOnly!==true||snapshot.complete!==true||!/^[a-z][a-z0-9_]{1,40}$/.test(snapshot.provider)||!Array.isArray(snapshot.accounts)||snapshot.accounts.length>500||!Array.isArray(snapshot.positions)||snapshot.positions.length>10000)invalid();
 if(!['production','development'].includes(snapshot.environment))fail('测试环境仅提供预览，不计入真实资产。','finance_sandbox_preview_only',409);
 if(!accountDecisions||typeof accountDecisions!=='object'||Array.isArray(accountDecisions)||Object.values(accountDecisions).some(value=>!['retain','archive'].includes(value)))fail('请确认原账户的处理方式。');
 if(!Array.isArray(accountRefs)||(!accountRefs.length&&!Object.keys(accountDecisions).length)||!unique(accountRefs)||accountRefs.some(ref=>typeof ref!=='string'||!snapshot.accounts.some(row=>row.accountRef===ref)))fail('请选择本次预览中的账户。');
 if(!mappings||typeof mappings!=='object'||Array.isArray(mappings)||Object.keys(mappings).some(ref=>!accountRefs.includes(ref))||!unique(Object.values(mappings).filter(Boolean)))fail('账户对应关系无效。');
 const provider=snapshot.provider,fetchedAt=date(snapshot.fetchedAt,native.now()),fingerprint={operation:'provider.sync',provider,snapshot,accountRefs,mappings,accountDecisions};
 return native.mutate(idempotencyKey,fingerprint,doc=>{
  const links=Object.fromEntries(doc.accounts.filter(row=>row.provider===provider&&row.providerAccountRef).map(row=>[row.providerAccountRef,row.id])),accounts=[],positions=[],accountIds={},relinkedAccounts={};
  const archived=new Set(doc.metadata.archivedAccountIds||[]),sourceRefs=new Set(snapshot.accounts.map(row=>row.accountRef));
  const missing=doc.accounts.filter(row=>row.provider===provider&&!archived.has(row.id)&&!sourceRefs.has(row.providerAccountRef));
  const remappedIds=new Set(Object.values(mappings));
  const unresolved=missing.filter(row=>!remappedIds.has(row.id));
  if(Object.keys(accountDecisions).some(id=>!unresolved.some(row=>row.id===id))||unresolved.some(row=>!accountDecisions[row.id]))fail('有旧账户未在本次来源中返回，请对应已有账户，或确认保留金额／停止计入资产。','finance_account_review_required',409);
  for(const source of snapshot.accounts){
   reference(source.accountRef);if(!accountRefs.includes(source.accountRef))continue;
   if(mappings[source.accountRef]&&links[source.accountRef]&&mappings[source.accountRef]!==links[source.accountRef])fail('此来源已对应已有账户，不能重复对应另一个账户。','finance_account_mapping_conflict',409);
   const mapped=mappings[source.accountRef]||links[source.accountRef],prior=doc.accounts.find(row=>row.id===mapped);
   if(mappings[source.accountRef]&&!prior)fail('对应账户不在当前空间。','finance_account_not_found',404);
   if(prior&&(prior.currency!==source.currency||prior.kind!==source.kind||prior.provider!=='manual'&&prior.provider!==provider||prior.provider===provider&&prior.providerAccountRef!==source.accountRef&&sourceRefs.has(prior.providerAccountRef)))fail('对应账户的币种、类型或来源不匹配。','finance_account_mapping_conflict',409);
   if(prior?.provider==='manual'&&doc.positions.some(row=>row.accountId===prior.id))fail('该手工账户已有持仓，请先核对原有持仓。','finance_account_mapping_conflict',409);
   if(!['asset','liability'].includes(source.kind))invalid();
   const id=prior?.id||'finance-'+provider+'-'+digest(source.accountRef).slice(0,32),asOf=date(source.asOf,native.now());
   const current=doc.accounts.find(row=>row.id===id);
   if(current&&Date.parse(current.asOf)>Date.parse(asOf))fail('来源报告早于现有账户记录，请生成更新的报告。','finance_older_observation',409);
   const typeKey=source.kind==='asset'?'assetType':'liabilityType',types=source.kind==='asset'?ASSET_TYPES:LIABILITY_TYPES;
   const account={id,name:text(source.name,'账户名称'),kind:source.kind,[typeKey]:types.some(row=>row.value===source[typeKey])?source[typeKey]:'other',amount:amount(source.amount),currency:currency(source.currency),asOf,createdAt:current?.createdAt||fetchedAt,recordedAt:fetchedAt,updatedAt:fetchedAt,readOnly:true,provider,providerAccountRef:source.accountRef,sourceName:text(source.sourceName||provider,'来源名称'),description:text(source.institution||'','机构',200,true),institution:text(source.institution||'','机构',200,true),accountSuffix:text(source.accountSuffix||'','账户尾号',40,true),observationType:'official',detailCurrent:true,readStatus:'current'};
   accounts.push(account);accountIds[source.accountRef]=id;
   for(const [ref,linkedId] of Object.entries(links))if(linkedId===id&&ref!==source.accountRef)delete links[ref];
   links[source.accountRef]=id;archived.delete(id);
   if(prior?.provider===provider&&prior.providerAccountRef!==source.accountRef)relinkedAccounts[source.accountRef]=prior.providerAccountRef;
   if(current)doc.updates.push({updateId:randomUUID(),accountId:id,kind:'provider_sync',provider,recordedAt:fetchedAt,previousAmount:current.amount,previousAsOf:current.asOf,previousProvider:current.provider,applied:true});
  }
  if(!unique(snapshot.accounts.map(row=>row.accountRef)))invalid();
  for(const row of snapshot.positions){
   if(!snapshot.accounts.some(account=>account.accountRef===row.accountRef))invalid();
   const accountId=accountIds[row.accountRef];if(!accountId)continue;
   const ref=reference(row.positionRef),account=accounts.find(account=>account.id===accountId);if(account.kind!=='asset')invalid();
   positions.push({id:accountId+':'+digest(ref).slice(0,24),accountId,name:text(row.name||row.symbol,'持仓名称'),symbol:text(row.symbol||'','证券代码',100,true),kind:POSITION_TYPES.some(type=>type.value===row.kind)?row.kind:'other',currency:currency(row.currency),quantity:decimal(row.quantity,{signed:true}),costPrice:row.costPrice==null?null:decimal(row.costPrice,{signed:true}),recordedMarketValue:row.marketValue==null?null:amount(row.marketValue),marketPrice:row.marketPrice==null?null:decimal(row.marketPrice,{signed:true}),holdingPnl:null,holdingPnlPct:null,exchange:row.exchange||null,asOf:date(row.asOf,native.now()),recordedAt:fetchedAt,updatedAt:fetchedAt,editable:false,provider,sourceName:account.sourceName,readStatus:'current',observationType:'official',identity:row.symbol?{symbol:row.symbol,currency:row.currency,...(row.exchange?{market:row.exchange}:{})}:null});
  }
  if(!unique(accounts.map(row=>row.id))||!unique(positions.map(row=>row.id)))invalid();
  const selected=new Set(accounts.map(row=>row.id));
  if(Object.keys(accountDecisions).some(id=>selected.has(id)))fail('本次同步账户不能同时保留旧金额或归档。','finance_account_mapping_conflict',409);
  doc.accounts=doc.accounts.filter(row=>!selected.has(row.id)).concat(accounts);
  doc.positions=doc.positions.filter(row=>!selected.has(row.accountId)).concat(positions);
  for(const row of missing){if(remappedIds.has(row.id))continue;if(accountDecisions[row.id]==='archive')archived.add(row.id);row.readStatus='stale';for(const position of doc.positions)if(position.accountId===row.id)position.readStatus='stale';}
  doc.metadata.archivedAccountIds=[...archived];
  doc.metadata.providerAccountLinks={...doc.metadata.providerAccountLinks,[provider]:links};
  const transactions=journal?.importProviderTransactions(snapshot,{accountIds,relinkedAccounts})||{created:0,updated:0,archived:0};
  const retained=missing.filter(row=>accountDecisions[row.id]==='retain');
  doc.providerSync[provider]={lastSyncedAt:fetchedAt,syncStatus:retained.length?'stale':'current',lastSyncError:retained.length?{code:'ACCOUNTS_NOT_RETURNED',message:'部分账户未在本次来源中返回，按你的选择保留历史金额。'}:null,syncedPositionCount:positions.length,accountIds:[...selected],transactionCount:transactions.created+transactions.updated};
  return {synced:true,persisted:true,readOnly:true,fetchedAt,accountIds:[...selected],positionCount:positions.length,transactions};
 });
}

export function markProviderFailure(native,provider,code){
 const doc=native.document(),previous=doc.providerSync[provider];if(!previous)return;
 doc.providerSync[provider]={...previous,syncStatus:'stale',lastSyncError:{code:/^[A-Za-z0-9_]{1,100}$/.test(code||'')?code:'READ_FAILED',message:code==='CONFIGURATION_CHANGED'||code==='AUTHORIZATION_CHANGED'?'连接设置或授权已变更，请重新读取并确认账户。':code==='DISCONNECTED'?'连接已断开，保留上次成功记录。':'本次读取未完成，保留上次成功记录。'}};
 for(const row of [...doc.accounts,...doc.positions])if(row.provider===provider)row.readStatus='stale';native.save(doc);
}
