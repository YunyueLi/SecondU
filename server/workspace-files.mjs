import { readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
const skipDirectories=new Set(['node_modules','vendor','dist','build','coverage','__pycache__','target']);
const secretName=/(?:^|[._-])(?:credentials?|secrets?|passwords?|tokens?|api[-_]?keys?|private[-_]?keys?)(?:[._-]|$)|^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i;
const allowed=/\.(md|txt|html|json|csv|tsv|svg|js|jsx|mjs|ts|tsx|py|css|yaml|yml|toml|sql|rs|go|java|c|cpp|h|png|jpe?g|gif|webp|pdf|docx|xlsx|pptx)$/i;
export function visibleWorkspaceEntry(name) {return !name.startsWith('.')&&!skipDirectories.has(name)&&!secretName.test(name)&&!/[\\\x00-\x1f]/.test(name)&&! /\.(?:pem|key|p12|pfx|keystore)$/i.test(name);}
export function eligibleWorkspaceName(name) {return name.split('/').every(visibleWorkspaceEntry)&&allowed.test(name);}
export function sensitiveWorkspaceContent(content,secrets=[]) {
  return secrets.some(secret=>secret&&content.includes(secret))||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:or-v1-|ant-)?[a-z0-9_-]{18,}/i.test(content)||/(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)["']?\s*[:=]\s*["'][^\s"']{8,}["']/i.test(content);
}
export function workspaceFiles(workspace,{recursive=false,maxEntries=4000}={}) {
  const files=new Map();let entries=0,complete=true;
  function walk(relative='',depth=0){
    if(depth>12){complete=false;return;}
    let list;try{const stat=lstatSync(path.join(workspace,relative));if(stat.isSymbolicLink()||!stat.isDirectory()){complete=false;return;}list=readdirSync(path.join(workspace,relative),{withFileTypes:true});}catch{complete=false;return;}
    for(const entry of list){
      if(++entries>maxEntries){complete=false;return;}
      if(!visibleWorkspaceEntry(entry.name)||entry.isSymbolicLink())continue;
      const name=relative?`${relative}/${entry.name}`:entry.name;
      if(entry.isDirectory()){if(recursive)walk(name,depth+1);if(entries>maxEntries)return;continue;}
      if(!entry.isFile()||!eligibleWorkspaceName(name))continue;
      try{const stat=lstatSync(path.join(workspace,name),{bigint:true});if(stat.isFile()&&!stat.isSymbolicLink())files.set(name,{size:Number(stat.size),fingerprint:`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`});}catch{complete=false;}
    }
  }
  walk();return {files,complete};
}
