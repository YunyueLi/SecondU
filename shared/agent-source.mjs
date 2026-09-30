export class AgentSourceError extends Error {
  constructor(code) { super(code); this.name='AgentSourceError'; this.code=code; }
}

// Parse only. A source never authorizes fetching, executing, or inheriting access.
export function normalizeAgentSourceUrl(value) {
  if(typeof value!=='string'||!value.trim()||value.length>2000)throw new AgentSourceError('invalid_source_url');
  const text=value.trim();
  if(/[\u0000-\u0020\u007f\\]/.test(text)||!/^https?:\/\//i.test(text))throw new AgentSourceError('invalid_source_url');
  let url;try{url=new URL(text);}catch{throw new AgentSourceError('invalid_source_url');}
  if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.href.length>2000)throw new AgentSourceError('invalid_source_url');
  if(url.username||url.password)throw new AgentSourceError('source_url_credentials');
  return url.href;
}
