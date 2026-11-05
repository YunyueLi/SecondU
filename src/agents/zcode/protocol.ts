export * from "./protocol/create-workflow-display.js";
export * from "./protocol/workflow-runs.js";
export * from "./protocol/workflow-artifacts.js";

import type {WorkflowRunState} from './protocol/workflow-runs.js';
// Pure upstream predicates extracted from workflow-runs-holes / workflow-runs-caps.
export const WORKFLOW_HOLE_SITE_ID_PATTERN = /^hole#[0-9a-f]{8}$/u;
export function workflowRunStepCounts(run:WorkflowRunState){let settledInList=0;for(const node of run.nodes)if(node.phase==='settled')settledInList+=1;return {total:run.nodes.length+(run.usage.nodesUnlisted??0),settled:settledInList+(run.usage.nodesUnlistedSettled??0)};}
