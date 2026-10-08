import * as T from 'three';
import {addSpatialPigment} from './hero-pigment';
import {PORTRAIT_ALPHA_FRAME,PORTRAIT_ALPHA_REQUEST} from './hero-clearance';

export type HeroParticleScene={dispose:()=>void;setPaused:(paused:boolean)=>void};
type Options={onReady:()=>void;onError:()=>void;signal:AbortSignal;paused?:boolean};
let entryPresented=false;
const smooth=(from:number,to:number,value:number)=>{const x=Math.max(0,Math.min(1,(value-from)/(to-from)));return x*x*(3-2*x);};

/** Photographic identities stay attached to the source artwork through every flow.
 * Reference: ungetsu.net photographic-particles/lunar-scene's stable UV formation.
 * This scene uses the approved transparent painting, never a generated 3D emblem. */
export async function createHeroParticles(host:HTMLElement,url:string,{onReady,onError,signal,paused=false}:Options):Promise<HeroParticleScene|null>{
 const image=new Image();image.decoding='async';image.src=url;await image.decode();if(signal.aborted)return null;
 const mobile=matchMedia('(max-width:700px)').matches;
 const sample=document.createElement('canvas');sample.width=mobile?180:300;sample.height=Math.round(sample.width*image.naturalHeight/image.naturalWidth);
 const context=sample.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Artwork sampling unavailable');context.drawImage(image,0,0,sample.width,sample.height);
 const pixels=context.getImageData(0,0,sample.width,sample.height).data;
 let left=sample.width,top=sample.height,right=0,bottom=0;
 for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x++)if(pixels[(y*sample.width+x)*4+3]>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<=left||bottom<=top)throw new Error('Artwork has no visible portrait');
 const sourceWidth=right-left+1,sourceHeight=bottom-top+1,portraitHeight=4.85,portraitWidth=portraitHeight*sourceWidth/sourceHeight;
 const positions:number[]=[],uvs:number[]=[],seeds:number[]=[],opacities:number[]=[];
 let state=21717;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const offset=(y*sample.width+x)*4,alpha=pixels[offset+3]/255;if(alpha<.09)continue;
  const brightness=(pixels[offset]*.2126+pixels[offset+1]*.7152+pixels[offset+2]*.0722)/255;
  positions.push(((x-left+.5)/sourceWidth-.5)*portraitWidth,(.5-(y-top+.5)/sourceHeight)*portraitHeight,(brightness-.55)*.16);
  uvs.push((x+.5)/sample.width,1-(y+.5)/sample.height);seeds.push(random(),random(),random());opacities.push(alpha);
 }
 sample.width=sample.height=1;
 const renderer=new T.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power',premultipliedAlpha:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.35:1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;renderer.setClearColor(0,0);
 let shaderFailed=false;renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{shaderFailed=true;console.warn('SecondU portrait shader unavailable; using the original artwork.',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));};
 renderer.domElement.setAttribute('aria-hidden','true');renderer.domElement.className='hero-particle-canvas';host.append(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.1,40);camera.position.z=8.7;
 const group=new T.Group();scene.add(group);
 const texture=new T.Texture(image);texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setAttribute('aSeed',new T.Float32BufferAttribute(seeds,3));geometry.setAttribute('aOpacity',new T.Float32BufferAttribute(opacities,1));
 const uniforms={uPhoto:{value:texture},uTime:{value:0},uRelease:{value:.018},uMode:{value:0},uPoint:{value:2},uPointer:{value:new T.Vector2(-20,-20)},uPresence:{value:0},uThemeDark:{value:document.documentElement.dataset.theme==='dark'?1:0},uEcho:{value:0}};
 const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:false,
  vertexShader:`attribute vec3 aSeed;attribute float aOpacity;uniform float uTime,uRelease,uMode,uPoint,uPresence,uThemeDark,uEcho;uniform vec2 uPointer;varying vec2 vUv;varying float vAlpha,vSoft,vLight;
   void main(){
    vUv=uv;
    float pi=3.14159265;
    float peripheral=smoothstep(.60,.97,aSeed.z);
    float release=clamp(uRelease,0.,1.);
    float strand=floor(aSeed.y*13.);
    float sweep=(aSeed.x-.5)*2.;
    // A source-based ribbon extends the painted profiles. No spherical target.
    float direction=mix(-1.,1.,step(.43,aSeed.x));
    float reach=(.8+pow(aSeed.x,.62)*2.0)*direction;
    float turn=position.y*.7+strand*.28+uTime*.18;
    vec3 flow=position;
    flow.x+=reach+sin(turn+uMode*.45)*.6;
    flow.y+=sin(sweep*2.3+strand*.14+uTime*.14)*.58+(aSeed.y-.5)*.42;
    flow.z+=cos(sweep*2.1+strand*.19)*1.35+(aSeed.z-.5)*.65;
    // The four explorations keep the same portrait and change only the flow.
    flow.y+=sin(uMode*1.55)*sin(sweep*pi)*.48;
    flow.x+=sin(uMode*1.2+position.y*.85)*.25;
    float grain=peripheral*(.045+.025*sin(uTime*.55+strand));
    // A slow wave travels along the silhouette while its painted core stays legible.
    float wave=pow(.5+.5*sin(position.y*1.4-uTime*.5),8.);
    grain+=peripheral*wave*.08;
    grain*=mix(1.,.38,uThemeDark);
    float blend=clamp(release*(.75+aSeed.z*.25)+grain,0.,1.);
    vec3 p=mix(position,flow,blend);
    vec2 away=p.xy-uPointer;
    float touch=exp(-dot(away,away)*2.8)*uPresence;
    p.xy+=normalize(away+vec2(.0001))*touch*.30;
    p.z+=touch*.65;
    p.z+=sin(uTime*.42+aSeed.x*6.28)*.065*(release+peripheral*.25);
    p.x+=uEcho*(-.65-.08*sin(uTime*.24)+wave*.08);
    p.y+=uEcho*(.12+.06*cos(uTime*.3));
    p.z-=uEcho*.55;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    float nearDust=step(.985,aSeed.y)*release;
    gl_PointSize=clamp(uPoint*(9.3/-mv.z)*(1.+nearDust*2.7),.65,7.);
    vSoft=max(nearDust,uEcho*.45);
    vLight=wave*peripheral*.12;
    // Keep the sampled painting's colours in both themes. Only the fine,
    // released dust gets a little more opacity against the dark page.
    float contrast=mix(1.,mix(.50,.78,release),uThemeDark);
    vAlpha=min(.98,aOpacity*mix(.75,.57,release)*mix(1.,.28,nearDust)*contrast);
    vAlpha*=mix(1.,(.13+.07*wave)*step(.48,aSeed.x)*mix(1.,.14,uThemeDark),uEcho);
    vAlpha*=mix(1.,pow(aOpacity,.40),uThemeDark);
   }`,
  fragmentShader:`uniform sampler2D uPhoto;uniform float uThemeDark;varying vec2 vUv;varying float vAlpha,vSoft,vLight;
   void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;vec4 pixel=texture2D(uPhoto,vUv);float edge=mix(1.-smoothstep(.72,1.,d),exp(-d*d*4.),vSoft);float purple=smoothstep(-.015,.055,pixel.b-pixel.r);float luminance=dot(pixel.rgb,vec3(.2126,.7152,.0722));vec3 pigment=mix(vec3(luminance),pixel.rgb,1.16)*mix(vec3(.80,.75,.67),vec3(.76,.68,.86),purple);gl_FragColor=vec4(mix(pixel.rgb,pigment,uThemeDark),edge*vAlpha);#include <colorspace_fragment>
   }`.replace(';#include',';\n#include'),
 });
 const points=new T.Points(geometry,material);points.frustumCulled=false;points.renderOrder=2;group.add(points);
 // A translucent second impression uses the very same painted UVs. It follows
 // the portrait at a different depth rather than introducing a new emblem.
 const echoMaterial=new T.ShaderMaterial({uniforms:{...uniforms,uEcho:{value:1}},vertexShader:material.vertexShader,fragmentShader:material.fragmentShader,transparent:true,depthWrite:false,depthTest:false});
 // The shader makes seeds below .48 fully transparent. Omit those vertices
 // from the echo draw while preserving every visible pigment identity.
 const echoGeometry=geometry.clone(),echoIndices:number[]=[];
 for(let i=0;i<opacities.length;i++)if(seeds[i*3]>=.48)echoIndices.push(i);
 echoGeometry.setIndex(echoIndices);
 const echo=new T.Points(echoGeometry,echoMaterial);echo.frustumCulled=false;echo.renderOrder=0;group.add(echo);
 // Fine streams connect the two impressions. Each strand advances continuously
 // through depth, with a quiet palette sampled from the approved artwork.
 const streamSeeds:number[]=[];for(let i=0;i<(mobile?800:1800);i++)streamSeeds.push(random(),random(),random());
 const streamGeometry=new T.BufferGeometry();streamGeometry.setAttribute('position',new T.Float32BufferAttribute(streamSeeds,3));
 const streamMaterial=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:false,
  vertexShader:`uniform float uTime,uRelease,uPoint,uThemeDark;varying float vAlpha,vWarm;
   void main(){
    float phase=fract(position.x+uTime*.014);float angle=phase*6.2831853;
    float strand=floor(position.y*9.);float spread=position.z-.5;
    vec3 p=vec3(sin(angle)*(1.65+strand*.043)+spread*.12,cos(angle)*2.20+sin(angle*2.+strand*.2)*.21,sin(angle+.7)*.65-.5);
    p.x+=sin(angle*2.+uTime*.16)*.21-.14;p.y+=spread*.15;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp(uPoint*(9.3/-mv.z)*mix(.55,1.3,position.z),.7,4.);
    float envelope=pow(sin(phase*3.14159265),.55);
    vAlpha=envelope*(.10+.20*position.z)*mix(.7,.27,uThemeDark)*(1.-uRelease*.3);
    vWarm=position.y;
   }`,
  fragmentShader:`uniform float uThemeDark;varying float vAlpha,vWarm;
   void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;vec3 light=mix(vec3(.40,.31,.46),vec3(.67,.54,.38),vWarm);vec3 dark=mix(vec3(.72,.64,.85),vec3(.90,.80,.63),vWarm);gl_FragColor=vec4(mix(light,dark,uThemeDark),vAlpha*(1.-smoothstep(.2,1.,d)));\n#include <colorspace_fragment>\n}`});
 const streams=new T.Points(streamGeometry,streamMaterial);streams.frustumCulled=false;streams.renderOrder=3;group.add(streams);
 // A small image contribution at rest preserves the original raised oil paint.
 // Its alpha recedes with the same release value as the sampled particle field.
 const plateGeometry=new T.PlaneGeometry(portraitWidth,portraitHeight);
 const plateUniforms={uPhoto:{value:texture},uThemeDark:uniforms.uThemeDark,uOpacity:{value:0},uCrop:{value:new T.Vector4(left/sampleWidth(),1-(bottom+1)/sampleHeight(),sourceWidth/sampleWidth(),sourceHeight/sampleHeight())}};
 function sampleWidth(){return mobile?180:300;}function sampleHeight(){return Math.round(sampleWidth()*image.naturalHeight/image.naturalWidth);}
 const plateMaterial=new T.ShaderMaterial({uniforms:plateUniforms,transparent:true,depthWrite:false,depthTest:false,
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D uPhoto;uniform float uOpacity,uThemeDark;uniform vec4 uCrop;varying vec2 vUv;void main(){vec4 color=texture2D(uPhoto,uCrop.xy+vUv*uCrop.zw);float purple=smoothstep(-.015,.055,color.b-color.r);float luminance=dot(color.rgb,vec3(.2126,.7152,.0722));vec3 pigment=mix(vec3(luminance),color.rgb,1.16)*mix(vec3(.80,.75,.67),vec3(.76,.68,.86),purple);gl_FragColor=vec4(mix(color.rgb,pigment,uThemeDark),color.a*uOpacity);\n#include <colorspace_fragment>\n}`});
 const plate=new T.Mesh(plateGeometry,plateMaterial);plate.position.z=-.03;plate.renderOrder=1;group.add(plate);
 let raf=0,disposed=false,visible=true,clock=0,last=0,active=0,mode=0,ready=false,pointerInside=false,alphaRequested=true;
 const assembleOnEnter=!entryPresented&&host.dataset.entryPresented!=='true';entryPresented=true;host.dataset.entryPresented='true';
 // A pause before the first frame presents the complete painting. Once an
 // entrance has started, its elapsed time advances only with visible motion.
 let entryElapsed=paused?2.3:0;
 host.dataset.formation=assembleOnEnter&&entryElapsed<2.3?'assembling':'settled';
 const pointer=new T.Vector2(-20,-20),pointerAim=pointer.clone();let tiltX=0,tiltY=0;
 const layers=addSpatialPigment(scene,mobile,camera);
 // Leave a display frame between artwork submissions on a 60 Hz display.
 const fps=mobile?30:45;
 function syncMotion(){host.dataset.renderState=disposed?'disposed':paused?'paused':visible&&!document.hidden?'playing':'suspended';host.dataset.motionTime=clock.toFixed(3);}
 function request(){if(!disposed&&!raf&&visible&&!document.hidden)raf=requestAnimationFrame(frame);}
 function resize(){const box=host.getBoundingClientRect();if(!box.width||!box.height)return;renderer.setSize(box.width,box.height,false);camera.aspect=box.width/box.height;camera.updateProjectionMatrix();uniforms.uPoint.value=Math.max(1.45,box.height*renderer.getPixelRatio()/sourceHeight*1.15);alphaRequested=true;request();}
 function frame(now:number){raf=0;if(disposed||!visible||document.hidden)return;
  if(!paused&&last&&now-last<1000/fps){request();return;}
  const dt=last?Math.min((now-last)/1000,.05):0;last=paused?0:now;
  if(!paused){clock+=dt;entryElapsed+=dt;mode+=(active-mode)*(1-Math.exp(-dt*3));pointer.lerp(pointerAim,1-Math.exp(-dt*8));
   // The first view assembles once. Theme switches, clicks and idle time
   // never replay this entrance or dissolve the settled portrait.
   uniforms.uTime.value=clock;uniforms.uMode.value=mode;uniforms.uPointer.value.copy(pointer);uniforms.uPresence.value+=(Number(pointerInside)-uniforms.uPresence.value)*(1-Math.exp(-dt*6));
   group.rotation.y+=(tiltY*.055-group.rotation.y)*(1-Math.exp(-dt*4));group.rotation.x+=(tiltX*.035-group.rotation.x)*(1-Math.exp(-dt*4));group.position.y=Math.sin(clock*.4)*.035;
  }
  uniforms.uRelease.value=assembleOnEnter?Math.max(.018,.34*(1-smooth(0,2.3,entryElapsed))):.018;
  if(entryElapsed>=2.3&&host.dataset.formation!=='settled'){host.dataset.formation='settled';alphaRequested=true;}
  layers.update(clock,pointer,uniforms.uPresence.value,uniforms.uThemeDark.value,assembleOnEnter?smooth(.1,1.4,entryElapsed):1);
  plateUniforms.uOpacity.value=.64+(1-smooth(.04,.30,uniforms.uRelease.value))*.32;
  try{layers.render(renderer,scene,camera);}catch{onError();dispose();return;}
  if(shaderFailed){onError();dispose();return;}
  if(alphaRequested){alphaRequested=false;host.dispatchEvent(new CustomEvent(PORTRAIT_ALPHA_FRAME,{detail:renderer.domElement}));}
  if(!ready){ready=true;onReady();host.dataset.particleCount=String(opacities.length);host.dataset.scene='approved-p1-particles';}
  if(!paused)request();
 }
 function setPaused(next:boolean){
  if(disposed||next===paused)return;
  paused=next;cancelAnimationFrame(raf);raf=0;last=0;
  // Discard a stale pointer target without changing the frozen rendered pose.
  pointerInside=false;pointerAim.set(-20,-20);tiltX=tiltY=0;
  if(paused&&!ready){entryElapsed=2.3;request();}
  else if(!paused)request();
  syncMotion();
 }
 function onPointer(event:PointerEvent){if(paused||event.pointerType==='touch')return;const box=host.getBoundingClientRect();const x=(event.clientX-box.left)/box.width-.5,y=.5-(event.clientY-box.top)/box.height;const height=2*camera.position.z*Math.tan(T.MathUtils.degToRad(camera.fov/2));pointerAim.set(x*height*camera.aspect,y*height);tiltX=-y;tiltY=x;pointerInside=true;request();}
 function leave(){pointerInside=false;tiltX=tiltY=0;pointerAim.set(-20,-20);if(!paused)request();}
 function visibilityChange(){if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{last=0;request();}syncMotion();}
 function themeChange(){const next=document.documentElement.dataset.theme==='dark'?1:0;if(uniforms.uThemeDark.value===next)return;uniforms.uThemeDark.value=next;alphaRequested=true;request();}
 function requestAlpha(){alphaRequested=true;request();}
 function lost(event:Event){event.preventDefault();onError();dispose();}
 // A theme change needs one render even when paused; it must not recreate the
 // scene or resume the animation. Reduced-motion mode uses the CSS fallback.
 const themeObserver=new MutationObserver(themeChange);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(host);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=0;request();}else{cancelAnimationFrame(raf);raf=0;}syncMotion();},{rootMargin:'60px'});intersection.observe(host);
 host.addEventListener('pointermove',onPointer);host.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibilityChange);renderer.domElement.addEventListener('webglcontextlost',lost);
 host.addEventListener(PORTRAIT_ALPHA_REQUEST,requestAlpha);
 function dispose(){if(disposed)return;disposed=true;signal.removeEventListener('abort',dispose);cancelAnimationFrame(raf);raf=0;syncMotion();themeObserver.disconnect();sizeObserver.disconnect();intersection.disconnect();host.removeEventListener('pointermove',onPointer);host.removeEventListener('pointerleave',leave);host.removeEventListener(PORTRAIT_ALPHA_REQUEST,requestAlpha);document.removeEventListener('visibilitychange',visibilityChange);renderer.domElement.removeEventListener('webglcontextlost',lost);layers.dispose();geometry.dispose();material.dispose();echoGeometry.dispose();echoMaterial.dispose();streamGeometry.dispose();streamMaterial.dispose();plateGeometry.dispose();plateMaterial.dispose();texture.dispose();renderer.dispose();renderer.domElement.remove();}
 signal.addEventListener('abort',dispose,{once:true});syncMotion();resize();request();
 return {dispose,setPaused};
}
