import type { TaskStatus, ProviderSettings } from './contracts';
export interface WorkflowParameter {name:string;label:string;type:'string'|'number'|'boolean';required?:boolean;default?:string|number|boolean;description?:string}
export interface WorkflowProgram {source:string;parameters:WorkflowParameter[];args:Record<string,string|number|boolean>}
export interface TeamConfiguration { program?:WorkflowProgram; leadAgentId: string; maxNodes?:number; concurrency?:number;workflow?:TeamWorkflowStage[];defaultConnectionId?:string;reviewBeforeRun?:boolean }
export interface TeamRunNode {
  id: string;stepKey?:string;attempts?:Array<{status:TaskStatus;startedAt?:string;finishedAt?:string;error?:string}>; model?:{connectionId:string;name:string;model:string;provider?:ProviderSettings['provider']}; inputArtifactIds?:string[];inputArtifacts?:Array<{artifactId:string;name:string;version:number;path:string}>;artifacts?:Array<{id:string;name:string;path:string;version:number;size:number;reviewStatus:'pending'}>;handoffSkipped?:number;stageId?:string; parentId?: string; kind: 'lead'|'worker'; agentId: string;
  name: string; role: string; objective: string; status: TaskStatus;
  createdAt: string; startedAt?: string; finishedAt?: string; result?: string; resultTruncated?: boolean; resultOriginalChars?: number; error?: string;
}
export interface TeamRun { outputArtifactIds?:string[]; configuration?:TeamConfiguration;configurationHash?:string;inputMessageId?:string;resumptions?:string[];programResult?:unknown;steps?:Array<{key:string;stageId:string;hash:string;status:string;order?:number;value?:unknown}>; execution?:'scheduled'|'conversation';blockedStageIds?:string[]; memberModels?:Record<string,{connectionId:string;name:string;model:string;provider?:ProviderSettings['provider'];source:'agent'|'conversation'|'default'}>; id: string; title?:string; workflow?:TeamWorkflowStage[]; defaultConnectionId?:string; workflowPlanId?:string; leadAgentId: string; status: TaskStatus; limits?:{nodes:number;concurrency:number}; startedAt: string; finishedAt?: string; nodes: TeamRunNode[] }

export interface TeamWorkflowStage {id:string;title:string;description:string;agentIds:string[];after:string[];required:boolean;expectedOutput?:string;inputArtifactIds?:string[];connectionIds?:Record<string,string>}

export interface WorkflowPlan {id:string;revision:number;runId:string;title:string;team:TeamConfiguration;status:'pending'|'confirmed'|'revision_requested'|'rejected'|'interrupted';createdAt:string;feedback?:string}
