import { text } from './domain.mjs';

export function saveProfile(store,body){
  const current=store.meta('profile');
  const englishName=Object.hasOwn(body,'englishName')?(body.englishName===null?'':text(body.englishName,'englishName',200,false)):current.englishName;
  let selfPersonId=current.selfPersonId;
  if(Object.hasOwn(body,'selfPersonId')){
    selfPersonId=body.selfPersonId===null?undefined:text(body.selfPersonId,'selfPersonId',200);
    if(selfPersonId)store.require('people',selfPersonId);
  }
  return store.setMeta('profile',{
    name:text(body.name??current.name,'name',200),
    ...(englishName?{englishName}:{}),
    description:text(body.description??current.description,'description',3000,false),
    demo:body.demo===false?false:current.demo,
    ...(selfPersonId?{selfPersonId}:{}),
  });
}
