// Pure, in-memory protocol demonstrator. This module performs no IO or hardware access.
export type SimDevice='glasses'|'desktop'|'phone';
export type SimStatus='idle'|'clarifying'|'ready'|'review'|'complete'|'cancelled';
export type SimCapability='audio'|'camera'|'display';
export type SimApproval={eventId:string;taskId:string;revision:number;expires:number;content:string};
export type SimEvent={id:number;device:SimDevice;code:string;revision:number;detail?:string};
export type SimInput={id:string;kind:'voice'|'image';content:string;device:SimDevice;capturedAt:number;revision:number;confirmed:boolean};
export type SimState={session:number;taskId:string;revision:number;clock:number;status:SimStatus;online:Record<SimDevice,boolean>;capabilities:Record<SimCapability,boolean>;brief:string;answer:string;source?:'voice'|'camera';candidate:boolean;noisy:boolean;observing:boolean;speaking:boolean;draft:string;review?:SimApproval;queued?:SimApproval;lastSent?:SimApproval;processed:string[];writes:{eventId:string;revision:number;content:string}[];events:SimEvent[];inputs:SimInput[];notice?:string;sequence:number};
export type SimAction=
 |{type:'reset'}|{type:'capability';capability:SimCapability;enabled:boolean}|{type:'network';device:SimDevice;online:boolean}
 |{type:'dictate';text:string;noisy:boolean}|{type:'observe'}|{type:'capture';text:string}|{type:'dismissObservation'}
 |{type:'clarify';answer:string}|{type:'prepare';content:string}|{type:'revise';content:string}|{type:'review'}
 |{type:'approve'}|{type:'replay'}|{type:'advance'}|{type:'stopSpeaking'}|{type:'speak'}|{type:'interrupt'}|{type:'cancel'};

export function initialDeviceSimulation(session=1):SimState{return {session,taskId:`dev-task-${String(session).padStart(3,'0')}`,revision:0,clock:0,status:'idle',online:{glasses:true,desktop:true,phone:true},capabilities:{audio:true,camera:false,display:true},brief:'',answer:'',candidate:false,noisy:false,observing:false,speaking:false,draft:'',processed:[],writes:[],events:[],inputs:[],sequence:0};}
function event(state:SimState,device:SimDevice,code:string,detail?:string):SimState{const id=state.sequence+1;return {...state,notice:code,sequence:id,events:[...state.events,{id,device,code,detail,revision:state.revision}]};}
function approvePacket(state:SimState,packet:SimApproval):SimState{
 if(state.processed.includes(packet.eventId))return event({...state,queued:undefined},'phone','duplicate');
 const next={...state,queued:undefined,processed:[...state.processed,packet.eventId],lastSent:packet};
 if(state.status==='cancelled')return event(next,'phone','cancelledApproval');
 if(packet.taskId!==state.taskId||packet.revision!==state.revision||packet.content!==state.draft)return event(next,'phone','stale');
 if(packet.expires<=state.clock)return event(next,'phone','expired');
 if(state.status!=='review')return event(next,'phone','alreadyComplete');
 if(!state.online.desktop)return event({...state,queued:packet,lastSent:packet},'phone','waitingDesktop');
 return event({...next,status:'complete',writes:[...state.writes,{eventId:packet.eventId,revision:packet.revision,content:packet.content}]},'desktop','saved');
}
function receive(state:SimState,text:string,source:'voice'|'camera',noisy=false):SimState{
 if(state.status==='cancelled'||state.status==='complete')return event(state,'glasses','resetRequired');
 if(!state.online.glasses)return event(state,'glasses','offlineInput');
 if(source==='voice'&&!state.capabilities.audio)return event(state,'glasses','noAudio');
 if(source==='camera'&&!state.capabilities.camera)return event(state,'glasses','noCamera');
 if(!text.trim())return event(state,'glasses','emptyInput');
 const input:SimInput={id:`${state.taskId}-source-${state.sequence+1}`,kind:source==='voice'?'voice':'image',content:text.trim(),device:'glasses',capturedAt:state.clock,revision:state.revision+1,confirmed:false};
 return event({...state,brief:text.trim(),answer:'',source,candidate:true,noisy,observing:false,status:'clarifying',speaking:state.capabilities.audio,revision:state.revision+1,inputs:[...state.inputs,input]},'glasses',noisy?'noise':'captured');
}
export function deviceSimulationReducer(state:SimState,action:SimAction):SimState{
 switch(action.type){
  case 'reset':return initialDeviceSimulation(state.session+1);
  case 'capability':return event({...state,capabilities:{...state.capabilities,[action.capability]:action.enabled},...(action.capability==='audio'&&!action.enabled?{speaking:false}:{}),...(action.capability==='camera'&&!action.enabled?{observing:false}:{})},'glasses','capabilityChanged');
  case 'network':{
   const next=event({...state,online:{...state.online,[action.device]:action.online}},action.device,action.online?'online':'offline');
   return action.online&&next.queued&&next.online.phone&&next.online.desktop?approvePacket(next,next.queued):next;
  }
  case 'dictate':return receive(state,action.text,'voice',action.noisy);
  case 'observe':return !state.capabilities.camera?event(state,'glasses','noCamera'):!state.online.glasses?event(state,'glasses','offlineInput'):event({...state,observing:true},'glasses','observationOffer');
  case 'dismissObservation':return event({...state,observing:false},'glasses','observationDismissed');
  case 'capture':return state.observing?receive(state,action.text,'camera'):event(state,'glasses','captureNeedsReview');
  case 'clarify':
   if(state.status!=='clarifying')return state;
   if(!state.online.glasses)return event(state,'glasses','offlineInput');
   if(!action.answer.trim())return event(state,'glasses','emptyAnswer');
   return event({...state,answer:action.answer.trim(),noisy:false,status:'ready',speaking:state.capabilities.audio,revision:state.revision+1,inputs:state.inputs.map(input=>({...input,confirmed:true}))},'glasses','clarified');
  case 'prepare':
   if(state.status!=='ready')return event(state,'desktop','needsClarification');
   if(!state.online.desktop)return event(state,'desktop','desktopOffline');
   if(!action.content.trim())return event(state,'desktop','emptyDraft');
   return event({...state,draft:action.content,status:'review',revision:state.revision+1},'desktop','prepared');
  case 'revise':
   if(!state.online.desktop)return event(state,'desktop','desktopOffline');
   if(!['review','complete'].includes(state.status)||!action.content.trim())return state;
   if(action.content===state.draft)return state;
   return event({...state,draft:action.content,status:'review',revision:state.revision+1},'desktop','revised');
  case 'review':{
   if(!state.online.phone)return event(state,'phone','phoneOffline');
   if(!['review','complete'].includes(state.status))return event(state,'phone','nothingToReview');
   const review={eventId:`${state.taskId}-confirm-${state.sequence+1}`,taskId:state.taskId,revision:state.revision,expires:state.clock+5,content:state.draft};
   return event({...state,review},'phone','reviewLoaded');
  }
  case 'approve':{
   if(!state.review)return event(state,'phone','nothingToReview');
   if(!state.online.phone)return event({...state,queued:state.review,lastSent:state.review},'phone','queued');
   return approvePacket(state,state.review);
  }
  case 'replay':return state.lastSent?(state.online.phone?approvePacket(state,state.lastSent):event(state,'phone','phoneOffline')):state;
  case 'advance':return event({...state,clock:state.clock+10},'phone','timeAdvanced');
  case 'stopSpeaking':return event({...state,speaking:false},'glasses','speechStopped');
  case 'speak':return state.capabilities.audio&&state.online.glasses&&!['idle','cancelled'].includes(state.status)?event({...state,speaking:true},'glasses','speechStarted'):event(state,'glasses','noAudio');
  case 'interrupt':return state.status==='cancelled'||state.status==='complete'||state.status==='idle'?state:event({...state,speaking:false,status:'clarifying',answer:'',revision:state.revision+1},'glasses','interrupted');
  case 'cancel':return state.status==='complete'?event(state,'desktop','cannotUndo'):event({...state,status:'cancelled',speaking:false,observing:false,queued:undefined},'desktop','cancelled');
 }
}
