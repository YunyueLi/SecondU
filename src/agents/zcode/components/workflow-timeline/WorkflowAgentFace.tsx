// SecondU identity adapter for the upstream LaneGlyph and collapsed avatar cluster.
// Keep the expert's existing identity; ZCode's animated mascot is not product branding.
import {WorkflowIdentity} from '../../identity';
import type {StepRunStatus} from '../workflow-graph/types';
export function avatarColor(_name:string){return 'var(--color-text-secondary)';}
export function agentColor(_index:number|undefined,_name:string){return 'var(--color-text-secondary)';}
export function WorkflowAgentFace({avatarIndex,name,className}:{avatarIndex?:number;name:string;className?:string;status?:StepRunStatus}){return <WorkflowIdentity index={avatarIndex} name={name} className={className}/>;}
