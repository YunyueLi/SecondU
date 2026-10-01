import * as T from 'three';

// Continuous photographic-particle flow, adapted to the scale of the P1 art.
// These are individual 3D points; there are no ribbon meshes or fog volumes.
const pigmentFlow=`
 vec3 pigmentStream(float x,float cross,float ribbon,float time){
  float angle=x*6.6+ribbon*.72+time*.035;
  float width=mix(.42,.34,ribbon)*(.72+.28*sin(x*3.14159265));
  float twist=sin(x*5.2+ribbon*.8)*.66;
  return vec3((x-.5)*5.0,
   sin(angle)*.52-1.0-ribbon*.36+cross*width*cos(twist),
   cos(angle+ribbon*.25)*.45+mix(-.63,.44,ribbon)+cross*width*sin(twist));
 }
`;

export function addSpatialPigment(scene:T.Scene,mobile:boolean,_camera:T.PerspectiveCamera){
 const count=mobile?8200:21000,seeds=new Float32Array(count*3);let state=73191;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let i=0;i<seeds.length;i++)seeds[i]=random();
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(seeds,3));
 const uniforms={uTime:{value:0},uFormation:{value:0},uDark:{value:0},uDpr:{value:1},uPointer:{value:new T.Vector2(-20,-20)},uPresence:{value:0}};
 const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:false,
  vertexShader:`uniform float uTime,uFormation,uDpr,uDark,uPresence;uniform vec2 uPointer;varying float vAlpha,vGold,vRibbon,vGlint;
   ${pigmentFlow}
   void main(){
    float gold=step(.992,position.z),ribbon=step(.5,position.y);
    float phase=fract(position.x+uTime*mix(.010,.017,gold));
    float cross=(fract(position.y*2.)-.5)*2.;
    vec3 p=pigmentStream(phase,cross,ribbon,uTime);
    float loose=pow(abs(cross),6.);p.y+=sin(position.z*31.+uTime*.3)*loose*.055;p.z+=(position.z-.5)*.055;
    p.z+=gold*(.17+.08*sin(uTime*.6+position.x*19.));
    vec2 away=p.xy-uPointer;float touch=exp(-dot(away,away)*2.8)*uPresence;
    p.xy+=normalize(away+vec2(.0001))*touch*.12;p.z+=touch*.25;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    vGold=gold;vRibbon=ribbon;vGlint=.75+.25*sin(uTime*.75+position.x*29.);
    gl_PointSize=clamp((mix(.69,1.04,position.z)+gold*.66)*uDpr*(8.7/-mv.z),.65,3.4);
    float edge=smoothstep(0.,.09,phase)*(1.-smoothstep(.90,1.,phase));
    float across=1.-smoothstep(.65,1.,abs(cross));
    vAlpha=edge*uFormation*mix((.37+.32*position.z)*mix(.24,1.,across),.91,gold)*mix(.84,1.,uDark);
   }`,
  fragmentShader:`uniform float uDark;varying float vAlpha,vGold,vRibbon,vGlint;void main(){
   float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
   vec3 purple=mix(vec3(.51,.40,.63),vec3(.64,.53,.78),uDark);
   vec3 cream=mix(vec3(.77,.65,.44),vec3(.90,.79,.57),uDark);
   vec3 color=mix(purple,cream,vRibbon);color=mix(color,vec3(.88,.55,.14)*vGlint,vGold);
   gl_FragColor=vec4(color,(1.-smoothstep(.56,1.,d))*vAlpha);
   #include <colorspace_fragment>
  }`});
 const points=new T.Points(geometry,material);points.frustumCulled=false;points.renderOrder=4;scene.add(points);
 return{
  update(time:number,pointer:T.Vector2,presence:number,dark:number,formation:number){
   uniforms.uTime.value=time;uniforms.uPointer.value.copy(pointer);uniforms.uPresence.value=presence;uniforms.uDark.value=dark;uniforms.uFormation.value=formation;
  },
  render(renderer:T.WebGLRenderer,scene:T.Scene,camera:T.Camera){uniforms.uDpr.value=renderer.getPixelRatio();renderer.render(scene,camera);},
  dispose(){geometry.dispose();material.dispose();}
 };
}
