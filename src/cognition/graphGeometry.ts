export type GraphViewport = {x:number;y:number;k:number};
export type GraphPoint = {x?:number;y?:number};
export const MIN_GRAPH_ZOOM=.08;
export const MAX_GRAPH_ZOOM=4;
export const clampGraph=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** Fit settled world coordinates into the measured, visible canvas. */
export function fitGraphViewport(points:GraphPoint[],width:number,height:number,padding=64):GraphViewport {
  const finite=points.filter((point):point is {x:number;y:number}=>Number.isFinite(point.x)&&Number.isFinite(point.y));
  if(!finite.length||width<=0||height<=0)return {x:Math.max(0,width)/2,y:Math.max(0,height)/2,k:1};
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const point of finite){left=Math.min(left,point.x);right=Math.max(right,point.x);top=Math.min(top,point.y);bottom=Math.max(bottom,point.y);}
  const availableWidth=Math.max(1,width-padding*2),availableHeight=Math.max(1,height-padding*2);
  const k=clampGraph(Math.min(availableWidth/Math.max(160,right-left),availableHeight/Math.max(160,bottom-top)),MIN_GRAPH_ZOOM,1.5);
  return {x:width/2-(left+right)/2*k,y:height/2-(top+bottom)/2*k,k};
}
export function zoomGraphAt(view:GraphViewport,factor:number,x:number,y:number):GraphViewport {
  const k=clampGraph(view.k*factor,MIN_GRAPH_ZOOM,MAX_GRAPH_ZOOM);
  return {x:x-(x-view.x)*k/view.k,y:y-(y-view.y)*k/view.k,k};
}
export function screenToGraph(view:GraphViewport,x:number,y:number):{x:number;y:number} {
  return {x:(x-view.x)/view.k,y:(y-view.y)/view.k};
}
export function graphLabelOpacity(zoom:number,threshold:number,highlighted=false):number {
  return highlighted?1:clampGraph((zoom-threshold+.15)/.35,0,1);
}

export type GraphLabelCandidate={id:string;x:number;y:number;radius:number;text:string;fontSize:number;priority:number;forced?:boolean};
/** Screen-space collision checks shared by SVG and Canvas, independent of graph zoom. */
export function visibleGraphLabels(candidates:GraphLabelCandidate[]):Set<string> {
  type Box={left:number;right:number;top:number;bottom:number;id?:string};
  const cells=(box:Box)=>{const keys:string[]=[];for(let x=Math.floor(box.left/64);x<=Math.floor(box.right/64);x++)for(let y=Math.floor(box.top/64);y<=Math.floor(box.bottom/64);y++)keys.push(`${x},${y}`);return keys;};
  const nodeGrid=new Map<string,Box[]>(),labelGrid=new Map<string,Box[]>();
  const insert=(grid:Map<string,Box[]>,box:Box)=>{for(const key of cells(box)){const list=grid.get(key)||[];list.push(box);grid.set(key,list);}};
  const overlaps=(grid:Map<string,Box[]>,box:Box,id?:string)=>cells(box).some(key=>(grid.get(key)||[]).some(other=>other.id!==id&&box.left<other.right&&box.right>other.left&&box.top<other.bottom&&box.bottom>other.top));
  for(const item of candidates)insert(nodeGrid,{id:item.id,left:item.x-item.radius-2,right:item.x+item.radius+2,top:item.y-item.radius-2,bottom:item.y+item.radius+2});
  const visible=new Set<string>();
  for(const item of [...candidates].sort((a,b)=>Number(!!b.forced)-Number(!!a.forced)||b.priority-a.priority||a.id.localeCompare(b.id))){
    const textWidth=[...item.text].reduce((sum,char)=>sum+(char.charCodeAt(0)>255?1:.62),0)*item.fontSize;
    const box={id:item.id,left:item.x-textWidth/2-3,right:item.x+textWidth/2+3,top:item.y+item.radius+3,bottom:item.y+item.radius+item.fontSize+7};
    if(!item.forced&&(overlaps(labelGrid,box,item.id)||overlaps(nodeGrid,box,item.id)))continue;
    visible.add(item.id);insert(labelGrid,box);
  }
  return visible;
}
