import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chatTitle} from '../server/chat-title.mjs';
import {Store} from '../server/store.mjs';
import {createTask} from '../server/domain.mjs';

test('navigation titles use a concise first thought and preserve short questions',()=>{
  assert.equal(chatTitle('请帮我整理下周产品评审材料，包含背景、问题、方案和待确认事项。之后再生成文件。'),'整理下周产品评审材料');
  assert.equal(chatTitle('啥意思'),'啥意思');
  assert.equal(chatTitle('帮我'),'帮我');
  assert.equal(chatTitle('# 阅读 [项目文档](https://example.com/docs)\n再回答问题'),'阅读 项目文档');
  assert.equal(chatTitle('','图片.png'),'图片.png');
  assert.ok(Array.from(chatTitle('详细需求'.repeat(30))).length<=25);
  assert.ok(chatTitle('Discuss the implementation and validation of the proposed architecture for this desktop application').length<=49);
});

test('task creation keeps the original prompt and explicit titles',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'hither-title-')),store=new Store(directory,{seed:false});
  try{
    const prompt='请帮我整理下周产品评审材料，包含背景、问题、方案和待确认事项。';
    const task=createTask(store,{prompt,mode:'demo'});
    assert.equal(task.title,'整理下周产品评审材料');assert.equal(task.prompt,prompt);assert.equal(task.messages[0].content,prompt);
    const title='用户自己写的完整名称，保持原样';
    assert.equal(createTask(store,{prompt,title,mode:'demo'}).title,title);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
