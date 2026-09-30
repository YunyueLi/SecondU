import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from '../server/runner.mjs';
import { HITHER_IDENTITY, HITHER_BASE_INSTRUCTIONS, HITHER_DEVELOPER_INSTRUCTIONS } from '../server/identity.mjs';
import { toChatRequest, toMessagesRequest } from '../server/chat-bridge.mjs';
import { planTurn } from '../server/turn-policy.mjs';

test('actual task prompt defines digital-twin collaboration and gives current identity question priority over an old denial',()=>{
  const task={prompt:'写旧项目文稿',messages:[{role:'user',content:'写旧项目文稿'},{role:'assistant',content:'旧回复错误地否认产品身份。'},{role:'user',content:'你不是我的数字分身吗'}]};
  const prompt=buildPrompt(task,[],{name:'Hither',instructions:'协助用户'});
  assert.ok(prompt.startsWith(HITHER_IDENTITY));assert.ok(prompt.endsWith('用户当前消息："你不是我的数字分身吗"'));
  assert.match(prompt,/用户当前消息决定本轮任务/);assert.match(prompt,/无需创建文件/);assert.match(prompt,/不能杜撰用户经历/);
  const turn=planTurn({...task,roomId:'room',interaction:'chat'},[{id:'a'},{id:'b'},{id:'c'}]);
  assert.equal(turn.kind,'identity');assert.equal(turn.agents.length,1);assert.equal(turn.conversationOnly,true);assert.equal(turn.useContext,false);
});

test('Chat and native Messages bridges preserve explicit identity and capability instructions',()=>{
  const body={instructions:HITHER_BASE_INSTRUCTIONS,input:[{role:'developer',content:[{type:'input_text',text:HITHER_DEVELOPER_INSTRUCTIONS}]},{role:'user',content:'你不是我的数字分身吗'}]};
  const chat=toChatRequest(body,{provider:'custom',model:'fixture'}).request;
  assert.deepEqual(chat.messages.filter(message=>message.role==='system').map(message=>message.content),[HITHER_BASE_INSTRUCTIONS,HITHER_DEVELOPER_INSTRUCTIONS]);
  const messages=toMessagesRequest(body,{provider:'anthropic',model:'fixture'}).request;
  assert.deepEqual(messages.system.map(block=>block.text),[HITHER_BASE_INSTRUCTIONS,HITHER_DEVELOPER_INSTRUCTIONS]);
  assert.match(messages.system[1].text,/没有全库自动检索或完整终身记忆/);
});

test('short English greetings preserve the configured language instead of implying an English conversation',()=>{
  const task={prompt:'hi',messages:[{role:'user',content:'hi'}]};
  for(const [locale,language] of [['zh-CN','中文'],['en','英语']]){
    const prompt=buildPrompt(task,[],undefined,[],undefined,undefined,locale);
    assert.ok(prompt.includes(`本轮界面语言：${language}`));
    assert.match(prompt,/hi、hello、hey、thanks 等短招呼或致谢不表示要求改用英语/);
    assert.match(prompt,/不主动给出长篇自我介绍/);
  }
  assert.match(HITHER_BASE_INSTRUCTIONS,/只有用户明确要求切换语言/);
  assert.match(HITHER_DEVELOPER_INSTRUCTIONS,/未提供时使用中文/);
});
