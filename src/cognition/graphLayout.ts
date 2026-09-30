import {forceCenter,forceCollide,forceLink,forceManyBody,forceSimulation,forceX,forceY} from 'd3-force';
import type {Simulation,SimulationNodeDatum,SimulationLinkDatum} from 'd3-force';
export interface GraphNode extends SimulationNodeDatum {id:string;degree:number}
export interface GraphLink extends SimulationLinkDatum<GraphNode> {id:string}
export type GraphForces={center:number;repel:number;link:number;distance:number};
export const DEFAULT_GRAPH_FORCES:GraphForces={center:5,repel:320,link:65,distance:110};
/** World-space radius: linked hubs are larger and the whole graph scales together. */
export function graphNodeRadius(degree:number,size=1,self=false):number{return (self?10:3+Math.min(10,Math.sqrt(Math.max(0,degree))*1.5))*size;}
export function graphScreenRadius(degree:number,zoom:number,size=1,self=false):number{return Math.max(1.25,graphNodeRadius(degree,size,self)*zoom);}

export function applyGraphForces(simulation:Simulation<GraphNode,GraphLink>,settings:GraphForces,nodeSize=1):void {
  simulation.force('center',forceCenter<GraphNode>(0,0))
    .force('charge',forceManyBody<GraphNode>().strength(-settings.repel))
    .force('collision',forceCollide<GraphNode>().radius(node=>graphNodeRadius(node.degree,nodeSize)+4))
    // Orphans have no spring pulling them back. A stronger radial pull keeps
    // them near the same field instead of stretching the initial fit.
    .force('x',forceX<GraphNode>(0).strength(node=>node.degree?settings.center/1000:Math.max(.18,settings.center/200)))
    .force('y',forceY<GraphNode>(0).strength(node=>node.degree?settings.center/1000:Math.max(.18,settings.center/200)));
  const link=simulation.force('link') as ReturnType<typeof forceLink<GraphNode,GraphLink>>;
  link.distance(settings.distance).strength(settings.link/100);
}
export function createGraphSimulation(nodes:GraphNode[],links:GraphLink[],settings=DEFAULT_GRAPH_FORCES,nodeSize=1):Simulation<GraphNode,GraphLink> {
  nodes.forEach((node,index)=>{if(!Number.isFinite(node.x)||!Number.isFinite(node.y)){const angle=index*2.399963229728653,radius=12*Math.sqrt(index+.5);node.x=Math.cos(angle)*radius;node.y=Math.sin(angle)*radius;}});
  const simulation=forceSimulation<GraphNode>(nodes).stop().alphaDecay(.035).velocityDecay(.38)
    .force('link',forceLink<GraphNode,GraphLink>(links).id(node=>node.id));
  applyGraphForces(simulation,settings,nodeSize);
  return simulation;
}
