/** Local preview diagnostics. main.tsx imports this module only in Vite DEV. */
export function installPerformanceProbe(){
 if(document.getElementById('secondu-performance-probe'))return()=>{};
 const box=document.createElement('aside');box.id='secondu-performance-probe';box.setAttribute('aria-label','本地性能测量');
 Object.assign(box.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:'2147483000',maxWidth:'min(520px,calc(100vw - 24px))',maxHeight:'70vh',overflow:'auto',padding:'10px',border:'1px solid #888',borderRadius:'8px',background:'#fff',color:'#171717',font:'12px/1.5 ui-monospace,monospace',boxShadow:'0 2px 8px #0002',contain:'layout paint'});
 const start=document.createElement('button');start.type='button';start.textContent='测量当前画面 8 秒';start.style.cssText='padding:5px 10px;font:inherit;color:inherit;background:#eee;border:1px solid #999;border-radius:4px';
 const close=document.createElement('button');close.type='button';close.textContent='隐藏';close.style.cssText='margin-left:8px;padding:5px;font:inherit;color:inherit;background:transparent;border:0';
 const output=document.createElement('pre');output.setAttribute('aria-label','性能测量结果');output.style.cssText='margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit';output.textContent='仅开发预览。分别在首屏、滚动后测量；结果保留实际页面与绘制尺寸。';
 box.append(start,close,output);document.body.append(box);
 const originalRAF=window.requestAnimationFrame.bind(window),originalCancel=window.cancelAnimationFrame.bind(window);
 let recording=false,started=0,frameId=0,timer=0,rafTime=0,hiddenDuringSample=false;
 let frames:number[]=[],callbackDurations:number[]=[],tasks:{start:number;duration:number}[]=[],draws:Map<HTMLCanvasElement,{times:Set<number>;calls:number;vertices:number;submissionMs:number}>;
 let observer:PerformanceObserver|undefined;
 const restore:(()=>void)[]=[];
 const precision=(value:number)=>Math.round(value*100)/100;
 const distribution=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b),at=(fraction:number)=>precision(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*fraction))]??0);return {count:values.length,p50Ms:at(.5),p95Ms:at(.95),maxMs:at(1),over33ms:values.filter(value=>value>33.5).length,over50ms:values.filter(value=>value>50).length};};
 const snapshot=()=>{
  const visibility=(element:Element)=>{const r=element.getBoundingClientRect();return r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;};
  const size=(element:HTMLElement)=>{const r=element.getBoundingClientRect();return {width:precision(r.width),height:precision(r.height)};};
  const resources=performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const safeName=(name:string)=>{const url=new URL(name,location.href);return url.pathname.includes('/@fs/')?url.pathname.slice(url.pathname.lastIndexOf('/')):url.pathname;};
  return {url:location.origin+location.pathname,hash:location.hash,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},browser:navigator.userAgent,hidden:document.hidden,theme:document.documentElement.dataset.theme,scrollY:precision(scrollY),network:'No synthetic throttling; current browser cache state.',
   canvases:[...document.querySelectorAll('canvas')].map(canvas=>({class:canvas.className,css:size(canvas),buffer:{width:canvas.width,height:canvas.height},inViewport:visibility(canvas),scene:canvas.parentElement?.dataset.scene,particles:canvas.parentElement?.dataset.particleCount})),
   iframes:[...document.querySelectorAll('iframe')].map(frame=>({title:frame.title,src:safeName(frame.src),css:size(frame),inViewport:visibility(frame)})),
   videos:[...document.querySelectorAll('video')].map(video=>({src:safeName(video.currentSrc||video.src),paused:video.paused,readyState:video.readyState,preload:video.preload,inViewport:visibility(video)})),
   resources:{count:resources.length,transferBytes:resources.reduce((sum,entry)=>sum+entry.transferSize,0),encodedBytes:resources.reduce((sum,entry)=>sum+entry.encodedBodySize,0),top:resources.filter(entry=>entry.encodedBodySize>0).sort((a,b)=>b.encodedBodySize-a.encodedBodySize).slice(0,12).map(entry=>({name:safeName(entry.name),type:entry.initiatorType,encodedBytes:entry.encodedBodySize,transferBytes:entry.transferSize,durationMs:precision(entry.duration)}))}};
 };
 // Measure issued rendering work, not GPU execution time. No getContext() calls
 // are made, so the probe cannot create or change a canvas's context type.
 for(const Context of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
  if(!Context)continue;const proto=Context.prototype as unknown as Record<string,unknown>;
  for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
   const descriptor=Object.getOwnPropertyDescriptor(proto,name),original=descriptor?.value;
   if(typeof original!=='function')continue;
   const wrapped=function(this:WebGLRenderingContext,...args:unknown[]){
    if(!recording)return Reflect.apply(original,this,args);
    const before=performance.now(),result=Reflect.apply(original,this,args),canvas=this.canvas as HTMLCanvasElement;
    const value=draws.get(canvas)??{times:new Set<number>(),calls:0,vertices:0,submissionMs:0};
    value.times.add(rafTime||before);value.calls++;value.vertices+=Number(args[name.startsWith('drawArrays')?2:1])*(name.endsWith('Instanced')?Number(args[name.startsWith('drawArrays')?3:4]):1);value.submissionMs+=performance.now()-before;draws.set(canvas,value);return result;
   };
   Object.defineProperty(proto,name,{...descriptor,value:wrapped});restore.push(()=>{if(proto[name]===wrapped)Object.defineProperty(proto,name,descriptor!);});
  }
 }
 const request:typeof window.requestAnimationFrame=callback=>originalRAF(time=>{if(!recording){callback(time);return;}const before=performance.now(),previous=rafTime;rafTime=time;try{callback(time);}finally{callbackDurations.push(performance.now()-before);rafTime=previous;}});
 window.requestAnimationFrame=request;restore.push(()=>{if(window.requestAnimationFrame===request)window.requestAnimationFrame=originalRAF;});
 const tick=(time:number)=>{frames.push(time);if(document.hidden)hiddenDuringSample=true;if(recording)frameId=originalRAF(tick);};
 const finish=()=>{
  if(!recording)return;const elapsed=performance.now()-started;recording=false;originalCancel(frameId);observer?.disconnect();
  const intervals=frames.slice(1).map((value,index)=>value-frames[index]);
  const result={measuredAt:new Date().toISOString(),sampleMs:precision(elapsed),validVisibleSample:!hiddenDuringSample&&!document.hidden,raf:{fps:precision(Math.max(0,frames.length-1)/(elapsed/1000)),...distribution(intervals)},rafCallbackCpu:distribution(callbackDurations),longTasks:{count:tasks.length,totalMs:precision(tasks.reduce((sum,task)=>sum+task.duration,0)),maxMs:precision(Math.max(0,...tasks.map(task=>task.duration)))},webgl:[...draws].map(([canvas,value])=>{const times=[...value.times].sort((a,b)=>a-b);return {class:canvas.className,submittedFrames:times.length,fps:precision(times.length/(elapsed/1000)),drawCalls:value.calls,averageDrawCalls:precision(value.calls/Math.max(1,times.length)),averageVertices:precision(value.vertices/Math.max(1,times.length)),submissionCpuMs:precision(value.submissionMs),intervals:distribution(times.slice(1).map((time,index)=>time-times[index]))};}),...snapshot(),limits:'rAF measures main-thread scheduling, and WebGL measures submitted frames/calls. This is not GPU timer or field INP data.'};
  output.textContent=JSON.stringify(result,null,2);box.dataset.measured='true';start.disabled=false;start.textContent='重新测量 8 秒';
 };
 start.addEventListener('click',()=>{
  if(recording)return;recording=true;started=performance.now();frames=[];callbackDurations=[];tasks=[];draws=new Map();hiddenDuringSample=document.hidden;box.dataset.measured='false';start.disabled=true;start.textContent='测量中，请保持当前画面…';output.textContent='正在收集 8 秒真实帧间隔、WebGL提交与主线程长任务。';
  if(PerformanceObserver.supportedEntryTypes.includes('longtask')){observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.startTime>=started)tasks.push({start:entry.startTime,duration:entry.duration});});observer.observe({type:'longtask',buffered:false});}
  frameId=originalRAF(tick);timer=window.setTimeout(finish,8000);
 });
 close.addEventListener('click',()=>{box.hidden=true;});
 return()=>{recording=false;originalCancel(frameId);clearTimeout(timer);observer?.disconnect();for(const undo of restore.reverse())undo();box.remove();};
}
