import path from 'node:path';
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { HttpError } from './store.mjs';
export const ENGINEER_SPACE='demo-engineer-v4';
export const PERSONAL_SPACE='personal';
// Fixed app-owned names only. A request never supplies a filesystem path.
export function localSpaceDirectory(root,space,{create=false}={}) {
  if(![ENGINEER_SPACE,PERSONAL_SPACE].includes(space))throw new HttpError(404,'空间不存在','space_not_found');
  const base=realpathSync(root),parent=path.join(base,'spaces'),directory=path.join(parent,space);
  for(const candidate of [parent,directory]){
    if(!existsSync(candidate)){if(!create)return undefined;mkdirSync(candidate,{mode:0o700});}
    if(lstatSync(candidate).isSymbolicLink()||!lstatSync(candidate).isDirectory()||realpathSync(candidate)!==candidate)throw new HttpError(409,'示例空间目录不可用，请检查本机存储。','invalid_demo_space');
  }
  return directory;
}
export function demoSpaceDirectory(root,options){return localSpaceDirectory(root,ENGINEER_SPACE,options);}
