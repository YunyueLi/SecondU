// Hither-owned capability/trace boundary. No OpenJarvis dependency or second agent loop.
export function runtimeCapabilities(store,computer){
  const settings=store.settings();
  return {
    executionNode:'current-computer',
    adapters:[
      {id:'local-demo',available:true,modelExecution:false,description:'确定性本地流程，实际生成文件并要求审批；不调用语言模型。'},
      {id:'codex-app-server',available:!!computer.codexAvailable,version:computer.codexVersion,modelExecution:true,description:'已接入 Codex app-server 协议。实际模型可用性、工具和流式兼容须逐配置验收。'},
    ],
    provider:{provider:settings.provider,model:settings.model,api:settings.api,configured:settings.hasKey,textConnectionTest:settings.lastTest??null,toolCompatibility:'not_verified',multimodalCompatibility:'not_verified'},
    features:{selectedCognition:true,boundedSourceEvidence:true,perAgentTrace:true,perActionApproval:true,artifactVersions:true,explicitResume:true,localSchedule:true,agentRooms:true,modelConnections:true,perAgentModels:true,taskModelOverride:true,chatCompletionsBridge:true,anthropicMessagesBridge:true},
    limitations:['电脑休眠、离线或应用停止时不继续执行。','云模型会接收本次任务选择的必要上下文。','恢复需用户明确发起；不承诺任意外部动作恰好执行一次。','未接入远程电脑调度、平台账号会话、手机或眼镜。','Chat Completions 转接目前仅支持文本及函数/自由文本工具，完整上游响应后交付事件；不支持图片、音频或服务端会话状态。','Anthropic Messages 转接支持文本及客户端工具，完整上游响应后交付事件；继续执行会从任务对话新建运行时会话。不支持多模态和服务端工具。','未对工具兼容、成本、质量和能耗作未经测量的保证。'],
    openJarvis:{integration:'design-reference',commit:'52659ca7c221703265fe46ff28c5b0a6e2b64c4a',codeReused:false,installed:false},
  };
}
export function taskTrace(task,at=Date.now()){
  const attempts=[];let current;
  for(const event of task.events){
    if(event.type==='started'){
      if(current&&!current.endedAt){current.endedAt=event.createdAt;current.outcome='superseded';}
      let runtime;try{runtime=event.detail?JSON.parse(event.detail):undefined;}catch{}
      current={startedAt:event.createdAt,endedAt:null,outcome:'running',runtime:runtime??null};attempts.push(current);
    }
    if(current&&['completed','failed','interrupted','cancelled','needs_input','write_rejected'].includes(event.type)&&!current.endedAt){current.endedAt=event.createdAt;current.outcome=event.type;}
  }
  for(const attempt of attempts)attempt.wallClockMs=Math.max(0,(attempt.endedAt?Date.parse(attempt.endedAt):at)-Date.parse(attempt.startedAt));
  return {taskId:task.id,roomId:task.roomId,mode:task.mode,status:task.status,events:task.events,attempts,measurements:{wallClockMs:attempts.reduce((sum,a)=>sum+a.wallClockMs,0),includesApprovalWait:true,agentRunCount:task.events.filter(e=>e.type==='agent_started').length,approvalRequestCount:task.events.filter(e=>e.type==='approval_requested').length,artifactCount:task.artifactIds.length,inputTokens:null,outputTokens:null,costUsd:null,energyJoules:null,quality:'not_assessed'},notes:['耗时来自本地事件时钟，包含等待审批和用户介入，不是模型推理延迟。','本接口报告执行轨迹，不把已完成状态自动算作质量通过；用量、费用、能耗无可靠数据时返回 null。']};
}
