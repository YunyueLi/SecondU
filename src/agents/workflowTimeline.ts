import type {TeamWorkflowStage} from '../../shared/contracts';
import {foldPhaseBands,trackOf,assignArcLanes} from './zcode-phase-layout.ts';

// ZCode's station proportions; SecondU supplies explicit prerequisite edges.
export const STATION_WIDTH=168,STATION_PITCH=192,MARK_X=17;
export function workflowTimeline(stages:TeamWorkflowStage[]){
  const index=new Map(stages.map((stage,i)=>[stage.id,i]));
  const ancestors=stages.map(()=>new Set<number>());
  const edges=stages.flatMap((stage,to)=>stage.after.flatMap(id=>{const from=index.get(id);return from===undefined||from>=to?[]:[{from,to}];}));
  for(let to=0;to<stages.length;to++)for(const edge of edges.filter(edge=>edge.to===to)){
    ancestors[to].add(edge.from);for(const ancestor of ancestors[edge.from])ancestors[to].add(ancestor);
  }
  // Unordered phases can overlap. Never infer an ordering from their array positions.
  const alongside=stages.map((_,i)=>stages.flatMap((__,j)=>i!==j&&!ancestors[i].has(j)&&!ancestors[j].has(i)?[j]:[]));
  const bands=foldPhaseBands(stages.length,alongside),tracks=stages.map((_,i)=>trackOf(bands,i));
  const trackCount=Math.max(1,...tracks.map(track=>track+1));
  const rails=edges.filter(edge=>tracks[edge.from]===tracks[edge.to]&&!tracks.some((track,i)=>i>edge.from&&i<edge.to&&track===tracks[edge.from]));
  const arcs=assignArcLanes(edges.filter(edge=>!rails.includes(edge)).sort((a,b)=>(a.to-a.from)-(b.to-b.from)));
  const arcHeight=arcs.length?26+14*Math.max(...arcs.map(edge=>edge.lane)):6;
  const rowY=(track:number)=>arcHeight+12+(trackCount-1-track)*24;
  const captionTop=arcHeight+trackCount*24+4;
  const width=stages.length?(stages.length-1)*STATION_PITCH+STATION_WIDTH:0;
  return {width,captionTop,tracks,alongside,bands,stations:stages.map((stage,i)=>({stage,x:i*STATION_PITCH,y:rowY(tracks[i]),track:tracks[i]})),
    edges:[...rails.map(edge=>({...edge,path:`M${edge.from*STATION_PITCH+MARK_X+6} ${rowY(tracks[edge.from])}H${edge.to*STATION_PITCH+MARK_X-7}`})),...arcs.map(edge=>{
      const x1=edge.from*STATION_PITCH+MARK_X+8,x2=edge.to*STATION_PITCH+MARK_X,y1=rowY(tracks[edge.from]),y2=rowY(tracks[edge.to]),air=arcHeight-20-edge.lane*14;
      return {...edge,path:`M${x1} ${y1}H${x1+6}Q${x1+12} ${y1} ${x1+12} ${y1-6}V${air+6}Q${x1+12} ${air} ${x1+18} ${air}H${x2-6}Q${x2} ${air} ${x2} ${air+6}V${y2-7}`};
    })]};
}

export type WorkflowPoint={x:number;y:number};
/** Vertical routing shares the horizontal graph's explicit dependency edges. */
export function workflowVerticalPaths(points:readonly (WorkflowPoint|undefined)[],edges:readonly {from:number;to:number}[]){
  return edges.flatMap(edge=>{
    const from=points[edge.from],to=points[edge.to];
    if(!from||!to||to.y-from.y<16)return [];
    const start=from.y+6,end=to.y-7,dx=to.x-from.x;
    let path:string;
    if(Math.abs(dx)<.5){
      const blocked=points.slice(edge.from+1,edge.to).some(point=>point&&Math.abs(point.x-from.x)<5);
      if(!blocked)path=`M${from.x} ${start}V${end}`;
      else{
        const lane=Math.max(4,from.x-12),r=Math.min(4,(from.x-lane)/2),first=start+6,last=end-6;
        path=`M${from.x} ${start}V${first-r}Q${from.x} ${first} ${from.x-r} ${first}H${lane+r}Q${lane} ${first} ${lane} ${first+r}V${last-r}Q${lane} ${last} ${lane+r} ${last}H${to.x-r}Q${to.x} ${last} ${to.x} ${last+r}V${end}`;
      }
    }else{
      const mid=(start+end)/2,r=Math.min(5,Math.abs(dx)/2,(end-start)/4),direction=Math.sign(dx);
      path=`M${from.x} ${start}V${mid-r}Q${from.x} ${mid} ${from.x+direction*r} ${mid}H${to.x-direction*r}Q${to.x} ${mid} ${to.x} ${mid+r}V${end}`;
    }
    return [{...edge,path}];
  });
}
