import {FINANCE_CONNECTOR_CATALOG} from '../../shared/connector-catalog.mjs';

export function journalSourceLabel(source,language='zh-CN'){
  const en=language==='en';
  if(source?.kind==='connector'){
    const name=FINANCE_CONNECTOR_CATALOG.find(row=>row.id===source.provider)?.name||String(source.provider||(en?'Provider':'服务商'));
    return en?`${name} sync${source.environment==='development'?' (development)':''}`:`${name} 同步${source.environment==='development'?'（开发环境）':''}`;
  }
  if(source?.kind==='import')return en?`${source.fileName}, row ${source.row}`:`${source.fileName} 第 ${source.row} 行`;
  return source?.kind==='manual'?(en?'Manual record':'手动记录'):(en?'Source not provided':'来源未提供');
}

/** Conversation attachments retain provenance, never provider identity keys. */
export function journalSourceSnapshot(source){
  if(source?.kind==='connector')return {kind:'connector',provider:source.provider,environment:source.environment,fetchedAt:source.fetchedAt};
  if(source?.kind==='import')return {kind:'import',fileName:source.fileName,row:source.row};
  return {kind:source?.kind==='manual'?'manual':'unknown'};
}
