import test from 'node:test';
import assert from 'node:assert/strict';
import {fitGraphViewport,zoomGraphAt,screenToGraph,graphLabelOpacity,visibleGraphLabels} from '../src/cognition/graphGeometry.ts';
import {createGraphSimulation,applyGraphForces,graphNodeRadius,graphScreenRadius,DEFAULT_GRAPH_FORCES} from '../src/cognition/graphLayout.ts';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≈ ${expected}`);
function settle(nodes,links,settings=DEFAULT_GRAPH_FORCES){const simulation=createGraphSimulation(nodes,links,settings);simulation.tick(180);simulation.stop();return simulation;}
function bounds(nodes){return {left:Math.min(...nodes.map(n=>n.x)),right:Math.max(...nodes.map(n=>n.x)),top:Math.min(...nodes.map(n=>n.y)),bottom:Math.max(...nodes.map(n=>n.y))};}
function star(){const nodes=Array.from({length:24},(_,i)=>({id:String(i),degree:i===0?21:i<22?1:0}));const links=Array.from({length:21},(_,i)=>({id:String(i),source:'0',target:String(i+1)}));return {nodes,links};}

test('initial fit centers measured bounds at desktop and compact canvas sizes',()=>{
 const points=[{x:-240,y:-130},{x:320,y:210},{x:70,y:30}];
 for(const [width,height] of [[1208,800],[968,680],[420,600]]){
  const view=fitGraphViewport(points,width,height),box=bounds(points);
  close(((box.left+box.right)/2)*view.k+view.x,width/2);close(((box.top+box.bottom)/2)*view.k+view.y,height/2);
  for(const point of points){assert(point.x*view.k+view.x>=63);assert(point.x*view.k+view.x<=width-63);assert(point.y*view.k+view.y>=63);assert(point.y*view.k+view.y<=height-63);}
 }
});
test('empty and one-node views stay finite and centered',()=>{
 assert.deepEqual(fitGraphViewport([],800,600),{x:400,y:300,k:1});
 const view=fitGraphViewport([{x:800,y:-200},{x:NaN,y:Infinity}],800,600);close(800*view.k+view.x,400);close(-200*view.k+view.y,300);
});
test('zoom preserves the world point beneath the cursor, including zoom limits',()=>{
 const start={x:170,y:90,k:.8},cursor={x:413,y:286};const before=screenToGraph(start,cursor.x,cursor.y);
 for(const factor of [.01,.7,1.4,100]){const next=zoomGraphAt(start,factor,cursor.x,cursor.y),after=screenToGraph(next,cursor.x,cursor.y);close(after.x,before.x);close(after.y,before.y);assert(next.k>=.08&&next.k<=4);}
});
test('text threshold fades labels while highlighted labels remain available',()=>{
 assert.equal(graphLabelOpacity(.2,.7),0);assert.equal(graphLabelOpacity(1.2,.7),1);assert(graphLabelOpacity(.7,.7)>0&&graphLabelOpacity(.7,.7)<1);assert.equal(graphLabelOpacity(.2,2,true),1);
});
test('graph nodes scale with zoom and hubs remain distinct',()=>{
 assert(graphNodeRadius(1)<graphNodeRadius(24));
 assert(graphScreenRadius(8,.3)<graphScreenRadius(8,1));
 assert(graphScreenRadius(800,.3)>graphScreenRadius(1,.3));
 assert(graphScreenRadius(0,.08)>=1);
 close(graphNodeRadius(8,2),graphNodeRadius(8)*2);
});
test('crowded labels prefer important people and always retain the hovered name',()=>{
 const a={id:'a',x:100,y:100,radius:5,text:'Long neighboring name',fontSize:11,priority:1};
 const b={...a,id:'b',x:120,priority:5};
 assert.deepEqual([...visibleGraphLabels([a,b])],['b']);
 assert.deepEqual([...visibleGraphLabels([{...a,forced:true},b])],['a']);
 const distant={...a,id:'c',x:500};
 assert.equal(visibleGraphLabels([a,b,distant]).size,2);
});
test('a label does not cover another node, while hover can reveal it',()=>{
 const a={id:'a',x:100,y:100,radius:5,text:'Someone',fontSize:11,priority:10};
 const b={...a,id:'b',y:118,priority:1};
 assert(!visibleGraphLabels([a,b]).has('a'));
 assert(visibleGraphLabels([{...a,forced:true},b]).has('a'));
});
test('a connected cluster and two orphans settle into one compact field',()=>{
 const {nodes,links}=star();settle(nodes,links);const connected=nodes.slice(0,22);const center={x:connected.reduce((n,p)=>n+p.x,0)/connected.length,y:connected.reduce((n,p)=>n+p.y,0)/connected.length};
 const radius=Math.max(...connected.map(node=>Math.hypot(node.x-center.x,node.y-center.y)));
 for(const orphan of nodes.slice(22))assert(Math.hypot(orphan.x-center.x,orphan.y-center.y)<radius*1.5);
 const view=fitGraphViewport(nodes,1208,800);assert(Math.abs(center.x*view.k+view.x-604)<120);assert(Math.abs(center.y*view.k+view.y-400)<100);
});
test('changing link distance changes the actual simulated geometry',()=>{
 const {nodes,links}=star();const simulation=settle(nodes,links);const average=()=>links.reduce((sum,link)=>sum+Math.hypot(link.source.x-link.target.x,link.source.y-link.target.y),0)/links.length;
 const before=average();applyGraphForces(simulation,{...DEFAULT_GRAPH_FORCES,distance:230});simulation.alpha(1).tick(180);const after=average();simulation.stop();assert(after>before*1.3,`${after} should exceed ${before}`);
});
test('the Canvas-scale fixture settles with finite coordinates and fits the view',()=>{
 const nodes=Array.from({length:800},(_,i)=>({id:String(i),degree:2}));const links=nodes.map((node,i)=>({id:String(i),source:node.id,target:String((i+1)%nodes.length)}));settle(nodes,links);
 assert(nodes.every(node=>Number.isFinite(node.x)&&Number.isFinite(node.y)));
 const view=fitGraphViewport(nodes,1208,800);for(const node of nodes){const x=node.x*view.k+view.x,y=node.y*view.k+view.y;assert(x>=0&&x<=1208&&y>=0&&y<=800);}
});
