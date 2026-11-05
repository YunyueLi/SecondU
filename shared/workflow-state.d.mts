import type {TeamRun,TeamRunNode,TeamWorkflowStage} from './team-run-types';
import type {TaskStatus} from './contracts';
export function latestWorkflowNode(run:TeamRun|undefined,stageId:string,agentId:string):TeamRunNode|undefined;
export function workflowStageStatus(run:TeamRun|undefined,stage:TeamWorkflowStage):TaskStatus;

export function workflowAssignmentNodes(run:TeamRun|undefined,stageId:string,agentId:string):TeamRunNode[];
