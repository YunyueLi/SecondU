import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const moduleUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const react=import.meta.resolve('react'),jsx=import.meta.resolve('react/jsx-runtime');
const three=new URL('../website/node_modules/three/build/three.module.js',import.meta.url).href;
let sequence=0;

async function loadSource(name,links={}) {
 let source=await readFile(new URL(`../website/src/${name}`,import.meta.url),'utf8');
 source=source.replace(/^import ['"].*\.css['"];?$/gm,'');
 for(const [specifier,url] of Object.entries({react,...links})) source=source.replaceAll(`'${specifier}'`,JSON.stringify(url));
 const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
 return moduleUrl(outputText.replaceAll('"react/jsx-runtime"',JSON.stringify(jsx)));
}

/** Actual scene code runs against controllable time and drawing devices. The
 * fake renderer records scene uniforms; no shader or animation math is copied. */
async function harness(t) {
 const state={now:100,raf:new Map(),nextFrame:0,observers:[],rendered:[],media:[],clears:0};
 const originals=new Map();
 const install=(name,value)=>{originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});};
 const pointer=(target,x=400,y=300)=>target.dispatchEvent(Object.assign(new Event('pointermove'),{pointerType:'mouse',clientX:x,clientY:y}));
 class Element extends EventTarget {
  dataset={};children=[];style={};parentElement=null;
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:900,right:1000,bottom:900};}
  append(child){this.children.push(child);child.parentElement=this;}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(item=>item!==this);}
  setAttribute(){}
  querySelectorAll(){return [];}
  querySelector(){return null;}
 }
 class Canvas extends Element {
  width=300;height=150;
  painted=[];
  context={globalAlpha:1,setTransform(){},drawImage(){},clearRect:()=>{this.painted=[];state.clears++;},fillText:(glyph,x,y)=>{this.painted.push({glyph,x,y,alpha:this.context.globalAlpha});},
   getImageData:(_x,_y,width,height)=>{
    const data=new Uint8ClampedArray(width*height*4);
    for(const [x,y] of [[1,1],[1,2],[2,1],[2,2]])data.set([220,200,240,255],(y*width+x)*4);
    return {data};
   }};
  getContext(){return this.context;}
 }
 class Renderer {
  domElement=new Canvas();debug={};ratio=1;
  setPixelRatio(value){this.ratio=value;}
  getPixelRatio(){return this.ratio;}
  setClearColor(){}
  setSize(){}
  render(scene){
   let portrait;
   scene.traverse(item=>{if(item.material?.uniforms?.uRelease)portrait=item.material.uniforms;});
   state.rendered.push({time:portrait.uTime.value,release:portrait.uRelease.value,theme:portrait.uThemeDark.value});
  }
  dispose(){}
 }
 const observerType=kind=>class {
  targets=[];disconnected=false;
  constructor(callback){this.callback=callback;this.kind=kind;state.observers.push(this);}
  observe(target){this.targets.push(target);}
  disconnect(){this.disconnected=true;}
 };
 const document=new EventTarget();document.hidden=false;document.documentElement=new Element();document.documentElement.dataset.theme='light';
 document.fonts=new EventTarget();document.fonts.ready=Promise.resolve();document.createElement=()=>new Canvas();
 install('document',document);install('devicePixelRatio',2);install('scrollX',0);install('scrollY',0);
 install('performance',{now:()=>state.now});
 install('requestAnimationFrame',callback=>{const id=++state.nextFrame;state.raf.set(id,callback);return id;});
 install('cancelAnimationFrame',id=>state.raf.delete(id));
 install('getComputedStyle',()=>({getPropertyValue:()=>document.documentElement.dataset.theme==='dark'?'#fff':'#222'}));
 install('MutationObserver',observerType('mutation'));install('ResizeObserver',observerType('resize'));install('IntersectionObserver',observerType('intersection'));
 install('matchMedia',query=>{const media=new EventTarget();media.media=query;media.matches=false;state.media.push(media);return media;});
 install('Image',class {naturalWidth=3;naturalHeight=3;decode(){return Promise.resolve();}});
 const key=`__heroMotionTest${++sequence}`;install(key,{Renderer});
 t.after(()=>{for(const [name,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 const rendererModule=moduleUrl(`export * from ${JSON.stringify(three)};export const WebGLRenderer=globalThis[${JSON.stringify(key)}].Renderer;`);
 const alpha=await loadSource('hero-alpha-distance.ts');
 const clearance=await loadSource('hero-clearance.ts',{'./hero-alpha-distance':alpha});
 const textClearance=await loadSource('hero-text-clearance.ts',{'./hero-alpha-distance':alpha});
 const pigment=await loadSource('hero-pigment.ts',{three:rendererModule});
 const motion=await loadSource('site-motion.tsx');
 const particles=await import(await loadSource('hero-particles.ts',{three:rendererModule,'./hero-pigment':pigment,'./hero-clearance':clearance}));
 const backdrop=await import(await loadSource('HeroBackdrop.tsx',{'./hero-clearance':clearance,'./hero-text-clearance':textClearance,'./site-motion':motion}));
 return {...state,state,document,Element,Canvas,pointer,particles,backdrop,
  advance(time){state.now=time;const callbacks=[...state.raf.values()];state.raf.clear();for(const callback of callbacks)callback(time);},
  notify(kind){for(const observer of state.observers)if(observer.kind===kind&&!observer.disconnected)observer.callback([]);},
  intersect(visible){for(const observer of state.observers)if(observer.kind==='intersection'&&!observer.disconnected)observer.callback([{isIntersecting:visible}]);},
 };
}

test('hero pause freezes the entrance, blocks pointer animation, and permits one theme/resize render',async t=>{
 const h=await harness(t),host=new h.Element(),controller=new AbortController();let ready=0;
 const scene=await h.particles.createHeroParticles(host,'synthetic-artwork',{signal:controller.signal,onReady:()=>ready++,onError:()=>assert.fail('unexpected renderer failure')});
 h.advance(100);h.advance(140);h.advance(180);
 assert.equal(ready,1);assert.equal(host.dataset.formation,'assembling');assert.ok(h.state.raf.size);
 const before=h.state.rendered.at(-1);scene.setPaused(true);
 assert.equal(host.dataset.renderState,'paused');assert.equal(h.state.raf.size,0);
 h.advance(6000);h.pointer(host);host.dispatchEvent(new Event('pointerleave'));
 assert.equal(h.state.raf.size,0);assert.deepEqual(h.state.rendered.at(-1),before);
 h.document.documentElement.dataset.theme='dark';h.notify('mutation');h.advance(6040);
 assert.deepEqual(h.state.rendered.at(-1),{...before,theme:1});assert.equal(h.state.raf.size,0);
 h.notify('resize');h.advance(6080);assert.equal(h.state.raf.size,0);assert.equal(h.state.rendered.at(-1).time,before.time);
 scene.setPaused(false);h.advance(10000);
 assert.equal(h.state.rendered.at(-1).time,before.time);assert.equal(h.state.rendered.at(-1).release,before.release);
 h.advance(10040);assert.ok(h.state.rendered.at(-1).time>before.time);assert.equal(host.dataset.formation,'assembling');
 for(let now=10080;now<12800;now+=40)h.advance(now);
 assert.equal(host.dataset.formation,'settled');const settled=h.state.rendered.at(-1);
 scene.setPaused(true);h.advance(30000);scene.setPaused(false);h.advance(30040);
 assert.equal(h.state.rendered.at(-1).release,settled.release);assert.equal(host.dataset.formation,'settled');
 controller.abort();assert.equal(host.dataset.renderState,'disposed');assert.equal(h.state.raf.size,0);assert.equal(host.children.length,0);
 assert.ok(h.state.observers.every(observer=>observer.disconnected));
});

test('hidden and offscreen hero time is suspended',async t=>{
 const h=await harness(t),host=new h.Element();
 const scene=await h.particles.createHeroParticles(host,'synthetic-artwork',{signal:new AbortController().signal,onReady(){},onError:()=>assert.fail('unexpected renderer failure')});
 h.advance(100);h.advance(140);const before=h.state.rendered.at(-1);
 h.intersect(false);assert.equal(host.dataset.renderState,'suspended');assert.equal(h.state.raf.size,0);
 h.advance(8000);h.intersect(true);h.advance(8040);assert.deepEqual(h.state.rendered.at(-1),before);
 h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.state.raf.size,0);
 h.advance(16000);h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));h.advance(16040);assert.deepEqual(h.state.rendered.at(-1),before);
 scene.dispose();
});

for(const alreadyPaused of [true,false])test(`pause ${alreadyPaused?'before scene creation':'during initial loading'} presents a complete still without a later entrance replay`,async t=>{
 const h=await harness(t),host=new h.Element();let ready=0;
 const scene=await h.particles.createHeroParticles(host,'synthetic-artwork',{signal:new AbortController().signal,paused:alreadyPaused,onReady(){ready++;},onError:()=>assert.fail('unexpected renderer failure')});
 if(!alreadyPaused)scene.setPaused(true);
 h.advance(100);assert.equal(ready,1);assert.equal(h.state.raf.size,0);assert.equal(host.dataset.formation,'settled');assert.equal(h.state.rendered.at(-1).release,.018);
 scene.setPaused(false);h.advance(5000);assert.equal(h.state.rendered.at(-1).release,.018);scene.dispose();
});

test('pausing clears transient character trails once and they cannot return without a new pointer',async t=>{
 const h=await harness(t),host=new h.Element(),canvas=new h.Canvas();host.append(canvas);
 const scene=h.backdrop.createHeroBackdrop(canvas);await Promise.resolve();
 h.pointer(host);h.advance(140);assert.ok(canvas.painted.length);const clears=h.state.clears;
 scene.setPaused(true);assert.equal(canvas.dataset.motion,'paused');assert.equal(h.state.raf.size,0);
 assert.equal(canvas.painted.length,0);assert.equal(h.state.clears,clears+1);
 scene.setPaused(true);assert.equal(h.state.clears,clears+1);
 h.advance(9000);h.pointer(host,700,400);assert.equal(canvas.painted.length,0);assert.equal(h.state.raf.size,0);
 h.document.documentElement.dataset.theme='dark';h.notify('mutation');assert.equal(h.state.raf.size,0);
 assert.equal(canvas.painted.length,0);
 h.notify('resize');assert.equal(canvas.painted.length,0);assert.equal(h.state.raf.size,0);
 scene.setPaused(false);h.advance(9040);assert.equal(canvas.dataset.motion,'playing');assert.equal(h.state.raf.size,0);assert.equal(canvas.painted.length,0);
 h.pointer(host,800,500);h.advance(9080);assert.ok(canvas.painted.length);assert.equal(canvas.context.fillStyle,'#fff');
 assert.ok(canvas.painted.every(item=>item.x>700),'cleared deposits must not reappear after resuming');
 assert.ok(canvas.painted.every(item=>'2ndU'.includes(item.glyph)));
 for(let now=9120;now<10500;now+=40)h.advance(now);
 assert.equal(canvas.painted.length,0);assert.equal(h.state.raf.size,0);
 h.pointer(host);assert.ok(h.state.raf.size);h.state.media[0].matches=true;h.state.media[0].dispatchEvent(new Event('change'));
 assert.equal(canvas.dataset.motion,'disabled');assert.equal(h.state.raf.size,0);h.pointer(host);assert.equal(h.state.raf.size,0);
 scene.dispose();assert.ok(h.state.observers.every(observer=>observer.disconnected));h.pointer(host);assert.equal(h.state.raf.size,0);
});
