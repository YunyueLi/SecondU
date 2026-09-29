// Deterministic, explicitly labelled local examples. This is not an LLM fallback.
export function demoDocument({task,facts,agent,previous=[]}) {
  const latest=task.messages.filter(m=>m.role==='user').at(-1)?.content??task.prompt;
  const sourceLines=facts.length?facts.map(f=>`- [${f.status} · v${f.version}] ${f.statement}`).join('\n'):'没有选择个人认知；下面的安排均是可修改的演示假设。';
  const exhibition=/声音展|音频展|社区声音/.test(task.prompt+' '+latest);
  const reviewer=/复核|review|审查|核对/.test(agent.name+' '+agent.role);
  const budget=facts.find(f=>/预算|经费/.test(f.statement));
  const amount=budget?.statement.match(/(\d[\d,]*(?:\.\d+)?)\s*元/)?.[1];
  const time=facts.find(f=>/分钟|小时|筹备时间/.test(f.statement));
  const consent=facts.find(f=>/许可|同意|联系.*确认/.test(f.statement));
  let plan;
  if(exhibition && reviewer) {
    plan=[
      '## 复核清单',
      `- [ ] 预算核对：${budget?.statement??'没有选择预算认知，先请用户确认上限。'}`,
      `- [ ] 时间核对：${time?.statement??'今日 30 分钟仅是演示安排，需用户确认。'}`,
      '- [ ] 音频协作：提前三天交接是虚构示例中的协作条件，实际日期与协作者须再次确认。',
      `- [ ] 参与许可：${consent?.statement??'没有取得参与者的明确同意前，不发布、公开播放或联系他人。'}`,
      '- [ ] 场地与日期：未确认；保留占位，不写成已预订。',
      '- [ ] 邀请草稿：检查用途、撤回方式和是否公开；本任务不会发送。',
      '- [ ] 区分 inferred / candidate 与 confirmed；推断只作待核对提示。',
      '## 仍需用户决定\n参与人数、正式时间、空间可用性、声音保存期限，以及谁能访问原始音频。',
    ].join('\n\n');
  } else if(exhibition) {
    plan=[
      '## 今天的 30 分钟草案',
      '> 这是确定性演示安排。若选中的个人时间限制更紧，应先缩减内容，不自动覆盖限制。',
      '1. 前 10 分钟：在下面补齐声音展的一句话主题、拟参与人数和想收集的声音类型。',
      '2. 中间 10 分钟：修改邀请草稿，标出参与自愿、音频用途和退出方式；先不发送。',
      '3. 最后 10 分钟：列出需要确认的场地、日期和音频交接时间，选出下一次要解决的一项。',
      `## 本轮限制\n- 预算上限：${amount?`${amount} 元（从所选认知提取）`:'待确认；没有从选中认知读到金额。'}\n- 预算原句：${budget?.statement??'未选择。'}\n- 时间原句：${time?.statement??'未选择；30 分钟为演示建议。'}\n- 许可原句：${consent?.statement??'未选择；发布前仍需确认。'}`,
      '## 可编辑的工作安排\n- 主题：[请填写]\n- 参与人数：[请确认]\n- 场地：[待确认]\n- 展示日期：[待确认]\n- 音频交接：为剪辑预留三天（虚构示例条件；实际协作者和日期待确认）。\n- 支出草案：场地、播放设备、印刷分别估价，合计不得超过已确认预算；没有报价时不填虚构费用。',
      '## 邀请草稿（仅保存，绝不自动发送）\n你好，我们正在筹备一个小型社区声音展，想邀请你自愿分享一段日常生活中的声音。\n\n主题：[待补充]；时间与地点：[待确认]。我们会先说明音频的展示范围、保存期限和撤回方式，在你明确同意后再使用。你也可以只来听听，不提供录音。\n\n如果你愿意了解，我可以先把具体说明给你看。',
      '## 待确认\n- [ ] 参与者是否同意录制、保存和展示。\n- [ ] 场地与日期是否可用。\n- [ ] 音频提前量是否适合协作者。\n- [ ] 当前安排是否符合本轮认知中的预算和时间。',
    ].join('\n\n');
  } else {
    plan=[
      `## ${reviewer?'任务复核工作稿':'任务工作稿'}`,
      `- 当前目标：${latest}\n- 本角色负责：${agent.role}\n- 待交付：[请填写具体产物与完成条件]\n- 下一步：[请填写一个可验证的小动作]`,
      '## 约束核对\n'+(facts.length?facts.map(f=>`- [ ] ${f.statement}`).join('\n'):'- [ ] 补充必要的时间、范围与许可；没有选择任何个人认知。'),
      '## 待确认与结果\n- [ ] 任务目标是否准确。\n- [ ] 输入是否齐全。\n- [ ] 产物由谁审阅。\n\n实际结果：[此处留空，完成后填写；本地模板不能替代推理或执行。]',
    ].join('\n\n');
  }
  return [`# ${task.title}`,'> 本地流程演示：以下内容由确定性模板生成，没有调用语言模型。所有初始人物资料均为虚构示例。',`## 当前分工\n${agent.name}：${agent.role}\n\n分工要求：${agent.instructions}`,`## 用户任务\n${task.prompt}`,latest!==task.prompt?`## 本轮补充与纠正\n${latest}`:'',`## 本轮使用的个人认知\n${sourceLines}`,plan,previous.length?`## 已有分工\n${previous.map(o=>`- ${o.agent}：已完成本轮内容，请结合其文稿复核。`).join('\n')}`:''].filter(Boolean).join('\n\n');
}
