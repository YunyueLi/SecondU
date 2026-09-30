export interface AttachmentRef { id:string;name:string;mime:string;size:number;url:string;kind:'image'|'text'|'file' }
export interface DraftAttachment {
  id:string;
  file:File;
  previewUrl?:string;
  status:'uploading'|'ready'|'error';
  attachment?:AttachmentRef;
  error?:{code:'too_large'|'empty'|'upload_failed';message?:string};
}
export interface AttachmentSnapshot { items:DraftAttachment[];limitReached:boolean }
export type AttachmentUploader=(file:File,signal:AbortSignal)=>Promise<AttachmentRef>;
export const ATTACHMENT_LIMIT=6;
export const ATTACHMENT_MAX_BYTES=8*1024*1024;
export const previewableImage=(mime:string)=>/^image\/(png|jpeg|webp|gif)$/.test(mime);

/** Own uploads independently of React renders so late results cannot revive
 * removed drafts or overwrite a retry. Removing a draft never deletes a saved
 * message or shared attachment on the server. */
export function createAttachmentDrafts({upload,maxFiles=ATTACHMENT_LIMIT,maxBytes=ATTACHMENT_MAX_BYTES,createUrl=(file:File)=>URL.createObjectURL(file),revokeUrl=(url:string)=>URL.revokeObjectURL(url)}:{upload:AttachmentUploader;maxFiles?:number;maxBytes?:number;createUrl?:(file:File)=>string;revokeUrl?:(url:string)=>void}){
  let sequence=0,snapshot:AttachmentSnapshot={items:[],limitReached:false};
  const listeners=new Set<()=>void>(),controllers=new Map<string,AbortController>();
  const publish=(items:DraftAttachment[],limitReached=snapshot.limitReached)=>{snapshot={items,limitReached};for(const listener of listeners)listener();};
  const update=(id:string,patch:Partial<DraftAttachment>)=>publish(snapshot.items.map(item=>item.id===id?{...item,...patch}:item));
  async function start(id:string){
    const item=snapshot.items.find(item=>item.id===id);if(!item)return;
    if(item.file.size>maxBytes){update(id,{status:'error',error:{code:'too_large'}});return;}
    if(!item.file.size){update(id,{status:'error',error:{code:'empty'}});return;}
    controllers.get(id)?.abort();
    const controller=new AbortController();controllers.set(id,controller);
    update(id,{status:'uploading',error:undefined});
    try{
      const attachment=await upload(item.file,controller.signal);
      if(controller.signal.aborted||controllers.get(id)!==controller||!snapshot.items.some(item=>item.id===id))return;
      if(!attachment?.id||!attachment.url||!['image','text','file'].includes(attachment.kind))throw new Error('Invalid attachment response');
      update(id,{status:'ready',attachment});
    }catch(error){
      if(!controller.signal.aborted&&controllers.get(id)===controller&&snapshot.items.some(item=>item.id===id))update(id,{status:'error',error:{code:'upload_failed',message:error instanceof Error?error.message:undefined}});
    }finally{if(controllers.get(id)===controller)controllers.delete(id);}
  }
  function remove(id:string){
    controllers.get(id)?.abort();controllers.delete(id);
    const item=snapshot.items.find(item=>item.id===id);if(item?.previewUrl)revokeUrl(item.previewUrl);
    publish(snapshot.items.filter(item=>item.id!==id),false);
  }
  function clear(){
    for(const controller of controllers.values())controller.abort();controllers.clear();
    for(const item of snapshot.items)if(item.previewUrl)revokeUrl(item.previewUrl);
    publish([],false);
  }
  return {
    getSnapshot:()=>snapshot,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
    async addFiles(files:Iterable<File>){
      const incoming=Array.from(files),available=Math.max(0,maxFiles-snapshot.items.length),accepted=incoming.slice(0,available);
      const items=accepted.map(file=>({id:`attachment-draft-${++sequence}`,file,status:'uploading' as const,...(previewableImage(file.type)&&file.size<=maxBytes?{previewUrl:createUrl(file)}:{})}));
      publish([...snapshot.items,...items],incoming.length>available);
      await Promise.all(items.map(item=>start(item.id)));
    },
    retry:start,
    remove,
    clear,
    maxFiles,
    maxBytes,
  };
}
