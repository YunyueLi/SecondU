import test from 'node:test';
import assert from 'node:assert/strict';
import {canSendComposer,richAnchorMarkdown,insertComposerText} from '../src/composer/composerInput.ts';
import {findLinks,linkFromHref} from '../src/composer/linkify.ts';
import {remarkHitherLinks} from '../src/composer/remarkLinks.ts';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

test('attachment-only input can send and rich HTML links preserve their complete destination',()=>{
  assert.equal(canSendComposer('',0),false);assert.equal(canSendComposer(' ',1),true);
  const href='https://app.mokahr.com/apply/company/148506#/job/unique-job';
  assert.equal(richAnchorMarkdown('职位详情',href),`[职位详情](${href})`);
  assert.equal(richAnchorMarkdown('看这里','javascript:alert(1)'),null);
  assert.equal(richAnchorMarkdown('看这里','file:///private/example'),null);
  assert.equal(richAnchorMarkdown('A [B]',href),href);
  const inserted=insertComposerText('前需要替换后','链接',1,5);assert.deepEqual(inserted,{text:'前链接后',caret:3});
});

test('links keep real targets, Chinese punctuation boundaries, and human Markdown labels',()=>{
  const links=findLinks('参考 https://example.com/a。再看 [文档](https://docs.example.com/guide?q=1#part)，或者 app.mokahr.com/apply/company#/job/a。');
  assert.deepEqual(links.map(link=>link.href),['https://example.com/a','https://docs.example.com/guide?q=1#part','https://app.mokahr.com/apply/company#/job/a']);
  assert.equal(links[1].label,'文档');
  assert.deepEqual(findLinks('React、Vue.js、index.html 都是文字。'),[]);
  assert.equal(linkFromHref('https://github.com@outside.test/path').label,'outside.test');
  assert.equal(linkFromHref('https://github.com@outside.test/path').suspicious,true);
  for(const href of ['javascript:alert(1)','data:text/html,test','ftp://example.com/file','file:///tmp/data'])assert.equal(linkFromHref(href),null,href);
  assert.equal(linkFromHref('mailto:person@example.com').kind,'mail');
});

test('long bare URLs are compact without changing the href or hiding the host',()=>{
  const href='https://docs.example.com/'+('section-'.repeat(20))+'?tracking=unchanged';
  const link=linkFromHref(href);assert.equal(link.href,href);assert.ok(link.label.startsWith('docs.example.com/'));assert.ok(link.label.endsWith('…'));assert.equal(link.label.includes('tracking'),false);
});

test('actual Markdown parsing uses the shared URL boundaries without changing existing links or code',async()=>{
  const source='看 https://example.com/a。后面是说明，再看 app.mokahr.com/apply/company#/job/a。\n\n[自定义名称](https://example.com/long/path?q=1) 与 `https://code.example/test`。';
  const processor=unified().use(remarkParse).use(remarkGfm).use(remarkHitherLinks);
  const tree=await processor.run(processor.parse(source),{value:source});
  const nodes=[];function collect(node){nodes.push(node);for(const child of node.children||[])collect(child);}collect(tree);
  assert.deepEqual(nodes.filter(node=>node.type==='link').map(node=>node.url),['https://example.com/a','https://app.mokahr.com/apply/company#/job/a','https://example.com/long/path?q=1']);
  assert.ok(nodes.some(node=>node.type==='text'&&node.value.includes('。后面是说明')));
  assert.ok(nodes.some(node=>node.type==='text'&&node.value==='自定义名称'));
  assert.ok(nodes.some(node=>node.type==='inlineCode'&&node.value==='https://code.example/test'));
});
