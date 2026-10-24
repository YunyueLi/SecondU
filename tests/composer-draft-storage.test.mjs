import test from 'node:test';
import assert from 'node:assert/strict';
import { readComposerDrafts, saveComposerDrafts } from '../src/composer/draft-storage.mjs';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('home and task drafts survive reloads and clearing one leaves the others intact', () => {
  const storage = memoryStorage();
  saveComposerDrafts(storage, 'space:one', { new: '未发送的首页草稿\n第二行', 'task-1': '补充要求' });
  const drafts = readComposerDrafts(storage, 'space:one');
  assert.equal(drafts.new, '未发送的首页草稿\n第二行');
  drafts['task-1'] = '';
  saveComposerDrafts(storage, 'space:one', drafts);
  assert.deepEqual(readComposerDrafts(storage, 'space:one'), { new: '未发送的首页草稿\n第二行' });
  assert.deepEqual(readComposerDrafts(storage, 'space:two'), {});
});

test('invalid stored content is ignored without breaking the composer', () => {
  const storage = memoryStorage();
  for (const value of ['null', '[]', '7', 'broken']) {
    storage.setItem('drafts', value);
    assert.deepEqual(readComposerDrafts(storage, 'drafts'), {});
  }
  storage.setItem('drafts', JSON.stringify({ good: 'text', invalid: {}, number: 4 }));
  assert.deepEqual(readComposerDrafts(storage, 'drafts'), { good: 'text' });
});

test('empty drafts remove the session record and denied storage fails gracefully', () => {
  const storage = memoryStorage();
  saveComposerDrafts(storage, 'drafts', { new: 'text' });
  saveComposerDrafts(storage, 'drafts', { new: '' });
  assert.equal(storage.getItem('drafts'), null);
  assert.deepEqual(readComposerDrafts({ getItem() { throw Error('denied'); } }, 'drafts'), {});
  assert.equal(saveComposerDrafts({ setItem() { throw Error('denied'); } }, 'drafts', { new: 'text' }), false);
});
