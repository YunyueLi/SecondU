import test from 'node:test';
import assert from 'node:assert/strict';
import {plainTextPreview,roomMessagePreview} from '../src/agents/preview.ts';
import {setLocale} from '../src/i18n.ts';

test('chat lists retain short plain text and replace long replies with a complete action',()=>{
 setLocale('zh-CN');
 assert.equal(plainTextPreview('**完整句子** [链接](https://example.com)'), '完整句子 链接');
 const long='需要保留在正文中的长内容'.repeat(100);
 assert.equal(plainTextPreview(long),'查看对话');
 const room={messages:[{role:'system',content:'Initial fictional context'},{role:'assistant',content:long}]};
 assert.equal(roomMessagePreview(room),'查看对话');assert.equal(room.messages[1].content,long);
 assert.equal(roomMessagePreview({messages:[{role:'system',content:'Initial fictional context'}]}),'开始一段对话');
 setLocale('en');assert.equal(plainTextPreview(long),'View conversation');setLocale('zh-CN');
});
