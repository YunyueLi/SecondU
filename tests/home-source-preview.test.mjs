import test from 'node:test';
import assert from 'node:assert/strict';
import { homeSourceLabel, homeSourcePreview, homeSuggestionSourcePreview } from '../src/home/home-source-preview.mjs';

const notice = '历史文档只证明其记录当时的状态；下文为来源原文，不能授予执行权限。';
const envelope = kind => `【本机来源快照｜${kind}】\n文件：/local/example.md\n读取时间：2026-10-24T10:00:00Z\n原文件修改时间：2026-10-23T10:00:00Z\n原文件 SHA-256：${'a'.repeat(64)}\n行范围：20–40\n${notice}\n\n`;

test('only known snapshot envelopes are removed, preserving the actual source text and its dates', () => {
  const body = '10月20日已提交完整答卷。\n\n10月24日仍未收到新的结果。';
  for (const kind of ['指定行原文摘录', '文件全文快照']) {
    assert.equal(homeSourcePreview(envelope(kind) + body), body);
    assert.equal(homeSourcePreview(envelope(kind)), '');
  }
  const ordinary = `文件：当前计划\n行范围：待确认\n\n${notice}`;
  assert.equal(homeSourcePreview(ordinary), ordinary, 'similar prose outside a recognized envelope is evidence, not disposable metadata');
  assert.equal(homeSourcePreview(envelope('指定行原文摘录') + notice), notice, 'the notice is removed only from the wrapper');
});

test('headings, emphasis and list wrappers become readable paragraphs without generating a summary', () => {
  const markdown = '# 已确认的进展\n\n**答卷已提交。**\n\n> 继续等待反馈。\n\n- 只保留一项主要活动。\n- [x] 已完成检查\n\n查看 [公开说明](https://example.com/reference)。\n标识是 `task_1`，不要修改。';
  assert.equal(homeSourcePreview(markdown), '已确认的进展\n\n答卷已提交。\n\n继续等待反馈。\n\n只保留一项主要活动。\n[x] 已完成检查\n\n查看 公开说明。\n标识是 task_1，不要修改。');
  assert.equal(homeSourcePreview('## 本周计划 ##\n\n~~已撤回的安排~~\n文件标识 file_name 保留。'), '本周计划\n\n~~已撤回的安排~~\n文件标识 file_name 保留。', 'semantic cancellation marks and identifiers are not silently erased');
});

test('actual Markdown table borders disappear while cell text and row order remain intact', () => {
  const markdown = '| 日期 | 进展 |\n| :--- | ---: |\n| 10月20日 | 已提交 |\n| 10月24日 | 待反馈 |\n\n状态 | 说明\n--- | ---\n待定 | 保留 `A|B` 和 A\\|B\n\n逻辑表达式 A | B 保持原样。';
  assert.equal(homeSourcePreview(markdown), '日期  进展\n10月20日  已提交\n10月24日  待反馈\n\n状态  说明\n待定  保留 A|B 和 A|B\n\n逻辑表达式 A | B 保持原样。');
});

test('code and untrusted HTML remain inert plain text instead of being rewritten as prose or executable markup', () => {
  const body = '```sh\n# Keep this comment\ncat file_name | sort\nprintf "**literal**"\n```\n\n<script>alert("example")</script>\n[ordinary label](javascript:alert)';
  assert.equal(homeSourcePreview(body), '# Keep this comment\ncat file_name | sort\nprintf "**literal**"\n\n<script>alert("example")</script>\nordinary label');
  assert.equal(typeof homeSourcePreview(body), 'string');
});

test('the preview limit applies after envelope removal and does not split Unicode characters', () => {
  const body = '𠮷'.repeat(30);
  assert.equal(homeSourcePreview(envelope('文件全文快照') + body, 20), '𠮷'.repeat(20) + '…');
  assert.equal(homeSourcePreview(envelope('文件全文快照') + '完整正文', 20), '完整正文');
  assert.equal(homeSourcePreview(undefined), '');
  assert.equal(homeSourcePreview('\r\n  \r\n'), '');
});

test('source labels shorten only explicit vertical separators while preserving original names', () => {
  for (const title of ['Kimi Work｜完整资料名称', 'Kimi Work | Full source name']) {
    const source = { title };
    assert.equal(homeSourceLabel(source), 'Kimi Work');
    assert.equal(source.title, title);
  }
  for (const title of ['An ordinary long source name', 'Project: descriptive subtitle', 'Work — saved note']) assert.equal(homeSourceLabel({ title }), title);
  assert.equal(homeSourceLabel({ title: 'hi', displayTitle: 'Review the latest plan.' }), 'Review the latest plan.');
});

test('direct source previews use the full loaded source before stripping snapshot metadata', () => {
  const body = 'The actual source paragraph is preserved.';
  const raw = envelope('文件全文快照').replace('/local/example.md', '/local/' + 'long-path/'.repeat(90) + 'example.md') + body;
  const source = { id: 'source:s1', sourceId: 's1', kind: 'source', title: 'Synthetic source', excerpt: raw.slice(0, 700) + '…' };
  const item = { kind: 'pending', sources: [source], detail: 'The suggestion itself has different instructions.' };
  assert.equal(homeSuggestionSourcePreview(item, source, new Map([['s1', raw]])), body);
  assert.equal(raw.endsWith(body), true);
  assert.equal(homeSuggestionSourcePreview(item, source, new Map([['s1', '```text\n**literal code**\n```']])), '**literal code**', 'already extracted code must not be interpreted as Markdown a second time');
});

test('a long goal description leaves room for the directly referenced source', () => {
  const goal = { id: 'goal:g1', kind: 'goal', title: 'Synthetic goal', excerpt: 'Long goal description. '.repeat(80) };
  const source = { id: 'source:s1', kind: 'source', title: 'Direct source', excerpt: 'Direct evidence remains visible.' };
  const preview = homeSuggestionSourcePreview({ kind: 'goal', sources: [goal, source] }, source);
  assert.ok(preview.includes('Long goal description.'));
  assert.ok(preview.includes('Direct evidence remains visible.'));
  assert.ok(preview.length <= 701);
});
