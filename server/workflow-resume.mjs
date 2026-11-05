import {readFileSync} from 'node:fs';
import path from 'node:path';
import {artifactBytes} from './artifact-content.mjs';
import {HttpError} from './http-error.mjs';
import {programHash} from './workflow-program.mjs';
export function prepareResume(store,task,runId){
  const run=task.teamRuns?.find(r=>r.id===runId);
  if(run!==task.teamRuns?.at(-1)||!['interrupted','cancelled'].includes(run?.status)||!run.configuration)throw new HttpError(409,'只能继续最近一轮已停止且保存了执行快照的工作流。脚本错误需要先重新规划。','workflow_not_resumable');
  if(programHash(run.configuration)!==run.configurationHash)throw new HttpError(409,'原运行的配置已变化，不能原样继续。','workflow_snapshot_changed');
  if(task.messages.filter(m=>m.role==='user').at(-1)?.id!==run.inputMessageId)throw new HttpError(409,'任务已有新的输入，请按新要求规划工作流。','workflow_input_changed');
  for(const [id,expected] of Object.entries(run.modelBindings??{})){const current=store.connection(id);if(!store.getKey(current)||Object.entries(expected).some(([key,value])=>current[key]!==value))throw new HttpError(409,'本轮模型连接已改变，请恢复原连接或重新规划。','workflow_model_changed');}
  for(const [agentId,model] of Object.entries(run.memberModels??{})){
    const current=store.connection(model.connectionId);
    if(current.model!==model.model||current.provider!==model.provider||current.revision!==model.revision||current.baseUrl!==model.baseUrl||!store.getKey(current))throw new HttpError(409,`${model.name} 的连接已变化或不可用，请恢复原连接或重新规划。`,'workflow_model_changed');
    store.require('agents',agentId);
  }
  for(const file of run.inputSnapshots??[]){const current=store.get('artifacts',file.id);if(!current||current.version!==file.version||programHash(current.content)!==file.hash)throw new HttpError(409,'本轮输入文件已变化，请重新规划。','workflow_input_changed');}
  for(const node of run.nodes.filter(n=>n.status==='completed'))for(const file of node.artifacts??[]){const actual=store.get('artifacts',file.id);if(!actual||actual.version!==file.version||programHash(actual.content)!==file.contentHash)throw new HttpError(409,'已完成步骤的成果已修改或不可用，不能沿用旧结果。','workflow_artifact_changed');let disk;try{disk=readFileSync(path.join(store.taskWorkspace(task.id),file.name));}catch{}if(!disk||!disk.equals(artifactBytes(actual).data))throw new HttpError(409,'已完成步骤的本地文件已变化或丢失，请先核对成果。','workflow_artifact_changed');}
  return run;
}
