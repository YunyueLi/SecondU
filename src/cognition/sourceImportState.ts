import type {Source} from '../../shared/contracts';

/** A confirmed local write survives refresh failures and cannot be submitted twice. */
export function createSourceImportTransaction(){
  let committed:Source|undefined;
  let saving:Promise<Source>|undefined;
  return {
    get committed(){return committed;},
    async commit(create:()=>Promise<Source>){
      if(committed)return committed;
      if(saving)return saving;
      saving=Promise.resolve().then(create).then(source=>{committed=source;return source;});
      try{return await saving;}finally{saving=undefined;}
    },
    async refresh(refresh:()=>Promise<void>){
      if(!committed)throw new Error('Save a source before refreshing its library.');
      await refresh();
      return committed;
    },
    reset(){committed=undefined;},
  };
}
