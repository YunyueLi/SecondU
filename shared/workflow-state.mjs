/** The latest attempt is the assignment's state, both for dispatch and presentation. */
export function latestWorkflowNode(run,stageId,agentId){return run?.nodes.filter(node=>node.kind!=='lead'&&node.stageId===stageId&&node.agentId===agentId).at(-1);}
export function workflowAssignmentNodes(run,stageId,agentId){
 const nodes=run?.nodes.filter(n=>n.kind!=='lead'&&n.stageId===stageId&&n.agentId===agentId)??[];
 if(!nodes.some(n=>n.stepKey))return nodes.slice(-1);
 return [...new Map(nodes.map(n=>[n.stepKey??n.id,n])).values()];
}
export function workflowStageStatus(run,stage){
 const nodes=stage.agentIds.flatMap(id=>workflowAssignmentNodes(run,stage.id,id));
 for(const status of ['awaiting_approval','needs_input','running','failed'])if(nodes.some(node=>node.status===status))return status;
 if(stage.agentIds.length&&stage.agentIds.every(id=>nodes.some(n=>n.agentId===id))&&nodes.every(node=>node.status==='completed'))return 'completed';
 for(const status of ['interrupted','cancelled'])if(nodes.some(node=>node.status===status))return status;
 return 'queued';
}
