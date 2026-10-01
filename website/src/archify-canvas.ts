/** Host presentation only. The checked Archify HTML and authored SVG stay unchanged. */
type ArchifyViewer = {
 theme:{toggle:()=>void};
 motionGovernor:{setMode:(mode:'live'|'still',options:{persist:boolean})=>string;suspend:(reason:string)=>()=>boolean;mode:()=>string};
 view:{reset:()=>void;zoomIn:()=>void;zoomOut:()=>void};
 focus:{clear:(options:{updateUrl:boolean;preserveView:boolean})=>void};
 routeProbe:{begin:(options:{source:string;focusNode:boolean})=>boolean;choose:(id:string,options:{updateUrl:boolean})=>boolean;playJourney:()=>boolean;clear:()=>void;isJourneyPlaying:()=>boolean};
};
type ViewerWindow = Window & {Archify?:ArchifyViewer};

// Archify's gallery `embed=1` intentionally suppresses exploration and motion.
// Use its Presentation Stage instead, and remove only surrounding viewer chrome.
const presentationCss = `
html[data-site-canvas]{background:var(--site-canvas-bg,var(--bg))!important}
html[data-site-canvas][data-theme="light"]{color-scheme:light}
html[data-site-canvas][data-theme="dark"]{color-scheme:dark}
html[data-site-canvas] body{padding:0!important;margin:0!important;min-height:0!important;height:100vh;overflow:hidden;background:var(--site-canvas-bg,var(--bg))!important;background-image:none!important}
html[data-site-canvas] .container{display:block!important;padding:0!important;margin:0!important;width:100%!important;max-width:none!important;height:100vh!important;min-height:0!important}
html[data-site-canvas] .toolbar,html[data-site-canvas] .header,html[data-site-canvas] .cards,html[data-site-canvas] .node-outline{display:none!important}
html[data-site-canvas] .diagram-container{box-sizing:border-box;width:100%!important;height:100%!important;min-height:0!important;margin:0!important;padding:0 12px!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important}
html[data-site-canvas] .diagram-container>svg{width:100%!important;height:100%!important;min-width:0!important;max-height:none!important}
html[data-site-canvas] .diagram-container::before,html[data-site-canvas] .diagram-container::after{display:none!important}
html[data-site-canvas] .diagram-nav{display:none!important}
html[data-site-canvas] .diagram-nav #btn-guide,html[data-site-canvas] .diagram-nav #btn-present{display:none!important}
`;

export function connectArchifyCanvas(frame:HTMLIFrameElement,onState:()=>void){
 const win=frame.contentWindow as ViewerWindow|null,doc=frame.contentDocument;
 if(!win?.Archify||!doc)throw new Error('Archify viewer is not available.');
 const api=win.Archify,html=doc.documentElement;
 const previousBackground=html.style.getPropertyValue('--site-canvas-bg');
 const style=doc.createElement('style');style.dataset.sitePresentation='true';style.textContent=presentationCss;
 html.dataset.siteCanvas='true';doc.head.append(style);
 let releaseSuspension:(()=>boolean)|undefined;
 const observer=new MutationObserver(onState);
 observer.observe(html,{attributes:true,attributeFilter:['data-motion','data-motion-owner']});
 observer.observe(doc.getElementById('route-journey-play')!,{attributes:true,attributeFilter:['aria-pressed','disabled']});
 const connection={
  setTheme(theme:'light'|'dark'){
   if(html.dataset.theme!==theme)api.theme.toggle();
   // A transparent iframe with a different color-scheme gets an opaque browser
   // canvas. Match both the website's scheme and its actual surface color.
   const background=frame.ownerDocument.defaultView?.getComputedStyle(frame).getPropertyValue('--site-bg').trim();
   if(background)html.style.setProperty('--site-canvas-bg',background);
   else html.style.removeProperty('--site-canvas-bg');
  },
  setVisible(visible:boolean){if(!visible&&!releaseSuspension)releaseSuspension=api.motionGovernor.suspend('website-offscreen');else if(visible&&releaseSuspension){releaseSuspension();releaseSuspension=undefined;}},
  setMotion(live:boolean){api.motionGovernor.setMode(live?'live':'still',{persist:false});onState();},
  isLive:()=>api.motionGovernor.mode()==='live',
  trace(){api.motionGovernor.setMode('live',{persist:false});api.routeProbe.begin({source:'context',focusNode:false});if(api.routeProbe.choose('understanding',{updateUrl:false}))api.routeProbe.playJourney();onState();},
  zoomIn(){api.view.zoomIn();},
  zoomOut(){api.view.zoomOut();},
  reset(){api.routeProbe.clear();api.focus.clear({updateUrl:false,preserveView:true});api.view.reset();onState();},
  dispose(){observer.disconnect();releaseSuspension?.();api.motionGovernor.setMode('still',{persist:false});style.remove();delete html.dataset.siteCanvas;if(previousBackground)html.style.setProperty('--site-canvas-bg',previousBackground);else html.style.removeProperty('--site-canvas-bg');},
 };
 return connection;
}
export type ArchifyCanvasConnection=ReturnType<typeof connectArchifyCanvas>;
