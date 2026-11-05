import {useId,useEffect,useState,type RefObject} from 'react';
import {workflowVerticalPaths,type WorkflowPoint} from './workflowTimeline';

type Dependency={from:number;to:number};
/** Draw only recorded dependencies, anchored to the actual expanded row positions. */
export function WorkflowPhaseConnections({root,phaseIds,edges}:{root:RefObject<HTMLDivElement|null>;phaseIds:string[];edges:readonly Dependency[]}){
  const marker=useId();
  const [points,setPoints]=useState<Array<WorkflowPoint|undefined>>([]);
  const phaseKey=phaseIds.join('\0');
  useEffect(()=>{
    const element=root.current;if(!element)return;
    const sections=[...element.querySelectorAll<HTMLElement>('[data-phase-id]')];
    const measure=()=>{
      const next=phaseIds.map(id=>{
        const dot=sections.find(section=>section.dataset.phaseId===id)?.querySelector<HTMLElement>('[data-testid="workflow-run-phase-lamp"]');
        if(!dot)return undefined;
        // Landing highlights transform the row temporarily. Layout coordinates
        // keep the connector anchored after that animation has finished, even
        // when no resize occurs at its end.
        let x=dot.offsetWidth/2,y=dot.offsetHeight/2;
        let parent:HTMLElement|null=dot;
        while(parent&&parent!==element){x+=parent.offsetLeft;y+=parent.offsetTop;parent=parent.offsetParent as HTMLElement|null;}
        return parent===element?{x,y}:undefined;
      });
      setPoints(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
    };
    measure();
    const observer=new ResizeObserver(measure);observer.observe(element);sections.forEach(section=>observer.observe(section));
    return()=>observer.disconnect();
  },[root,phaseKey]);
  const paths=workflowVerticalPaths(points,edges);
  return <svg className="workflow-phase-connections" aria-hidden="true" data-testid="workflow-phase-connections">
    <defs><marker id={marker} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L5 4L1 7"/></marker></defs>
    {paths.map(edge=><path key={`${edge.from}-${edge.to}`} data-from={phaseIds[edge.from]} data-to={phaseIds[edge.to]} d={edge.path} markerEnd={`url(#${marker})`}/>)}
  </svg>;
}
