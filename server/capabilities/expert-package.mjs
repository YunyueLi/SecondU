/** Interpret portable expert definitions. Package text never grants host tools. */
export function inspectExperts(files,manifest,{packageId,version,digest,skills,frontmatter,safePath,invalid,warnings}){
  const text=(value,max=2000)=>typeof value==='string'?value.trim().slice(0,max):'';
  const copy=(value,fallback='')=>typeof value==='string'?{zh:text(value),en:text(value)}:{zh:text(value?.zh)||text(value?.en)||fallback,en:text(value?.en)||text(value?.zh)||fallback};
  const array=(value,label,max=40)=>{if(value===undefined)return [];if(!Array.isArray(value)||value.length>max||value.some(item=>typeof item!=='string'||!item.trim()))invalid(`${label}无效。`);return [...new Set(value)];};
  const resolve=(value)=>safePath(value.replace(/^\.\//,''));
  const declared=typeof manifest.agents==='string'?[manifest.agents]:array(manifest.agents,'专家定义');
  const paths=declared.length?declared.flatMap(value=>{const file=resolve(value);const found=files[file]?[file]:Object.keys(files).filter(name=>name.startsWith(file.replace(/\/$/,'')+'/')&&name.endsWith('.md'));if(!found.length)invalid(`专家定义 ${file} 不存在。`);return found;}):Object.keys(files).filter(name=>/^agents\/[^/]+\.md$/.test(name));
  if(declared.length&&!paths.length)invalid('清单中的专家定义不存在。');
  if(paths.length>40)invalid('一个能力包最多包含 40 位专家。');
  const connectorNames=array(manifest.dependencies?.connectors,'连接器依赖',30);
  const names=new Set();
  const experts=paths.map(file=>{
    const metadata=frontmatter(files[file],file),name=text(metadata.name,64);
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)||names.has(name))invalid(`${file} 的专家名称无效或重复。`);
    names.add(name);
    const isPrimary=manifest.agentName===name;
    const member=(Array.isArray(manifest.members)?manifest.members:[]).find(item=>item?.id===name);
    const requested=array(metadata.skills,'专家技能',12),skillIds=[],unresolvedSkills=[];
    for(const requestedName of requested){const skill=skills.find(item=>item.name===requestedName||item.id===requestedName);if(skill)skillIds.push(skill.id);else unresolvedSkills.push(requestedName);}
    if(metadata.tools)warnings.push(`专家 ${name} 的工具列表仅保留为说明，实际权限由 SecondU 决定。`);
    const instructions=files[file].toString('utf8').replace(/^\uFEFF/,'').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'').trim();
    if(instructions.length>30000)invalid(`${file} 的角色说明超过 30,000 字符。`);
    const output=manifest.secondu?.experts?.[name]?.outputContract;
    if(output&&(!Array.isArray(output.deliverables)||!Array.isArray(output.checks)))invalid('专家交付约定无效。');
    return {id:`${packageId}/${name}`,packageId,name,path:file,title:copy(metadata.displayName??member?.name??(isPrimary?manifest.displayName:undefined),name),role:copy(metadata.profession??member?.profession??(isPrimary?manifest.profession:undefined),text(metadata.description,300)),description:copy(isPrimary?manifest.displayDescription:metadata.description,text(metadata.description)),instructions,skillIds,unresolvedSkills,connectorNames,quickPrompts:(isPrimary&&Array.isArray(manifest.quickPrompts)?manifest.quickPrompts:[]).slice(0,8).map(item=>copy(item)),category:text(manifest.categoryId,100),version,digest,...(output?{outputContract:{deliverables:array(output.deliverables,'交付要求',12),checks:array(output.checks,'复核要求',12)}}:{})};
  });
  const teams=[];
  if(manifest.expertType==='team'){
    const leadName=manifest.teamInfo?.leadAgent??manifest.agentName;
    const memberNames=array(manifest.teamInfo?.memberAgents,'团队成员',23);
    const lead=experts.find(item=>item.name===leadName);
    if(!lead||!memberNames.length||memberNames.includes(leadName)||memberNames.some(name=>!experts.some(item=>item.name===name)))invalid('专家团的负责人或成员定义不完整。');
    teams.push({id:`${packageId}/team`,packageId,name:packageId,title:copy(manifest.displayName,packageId),description:copy(manifest.displayDescription??manifest.description),leadExpertId:lead.id,memberExpertIds:memberNames.map(name=>experts.find(item=>item.name===name).id),quickPrompts:(Array.isArray(manifest.quickPrompts)?manifest.quickPrompts:[]).slice(0,8).map(item=>copy(item)),version,digest});
    if(manifest.secondu?.workflow!==undefined){if(!Array.isArray(manifest.secondu.workflow)||manifest.secondu.workflow.length>20)invalid('团队流程无效。');const stages=new Set();teams[0].workflow=manifest.secondu.workflow.map(stage=>{if(!stage||typeof stage.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(stage.id)||stages.has(stage.id))invalid('团队流程标识无效。');const members=array(stage.members,'阶段成员',23),after=array(stage.after,'前置阶段',20);if(!members.length||members.some(name=>!memberNames.includes(name))||after.some(id=>!stages.has(id)))invalid('流程阶段成员或前置关系无效。');stages.add(stage.id);return {id:stage.id,title:copy(stage.title,stage.id),description:copy(stage.description),memberExpertIds:members.map(name=>experts.find(item=>item.name===name).id),after,required:stage.required!==false};});}
    if(files['settings.json'])warnings.push('包内宿主设置作为来源保留；团队负责人由已核对的成员定义确定。');
  }
  if(manifest.expertType==='agent'&&!experts.some(item=>item.name===manifest.agentName))invalid('专家包没有对应的主专家定义。');
  return {experts,teams};
}
