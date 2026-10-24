import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueMatches, catalogueGroupFromHash, catalogueGroupAtScroll, normalizeCatalogueQuery} from '../src/catalogue/catalogue-model.mjs';

test('catalogue search accepts whitespace, mixed case and words in any order', () => {
  const input = ['input', 'controls', '单行输入', 'Input', '保留可见标签'];
  assert.equal(normalizeCatalogueQuery('  ＩＮＰＵＴ\n  输入　 '), 'input 输入');
  assert.equal(catalogueMatches(input, ' \t\n '), true);
  assert.equal(catalogueMatches(input, ' FIELD  输入 '), true);
  assert.equal(catalogueMatches(input, '输入 field'), true);
  assert.equal(catalogueMatches(input, 'input no-such-fixture'), false);
});

test('common Chinese and English names remain searchable in either interface language', () => {
  const english = ['dialog', 'navigation', 'Focused dialogs', 'App dialog pattern', 'Focused input'];
  const chinese = ['radio', 'controls', '互斥选择', 'RadioGroup', '只允许选中一项'];
  assert.equal(catalogueMatches(english, '对话框 导航'), true);
  assert.equal(catalogueMatches(english, 'modal focused'), true);
  assert.equal(catalogueMatches(chinese, 'radio selection'), true);
  assert.equal(catalogueMatches(chinese, '单选'), true);
  assert.equal(catalogueMatches(english, 'unknown-fixture'), false);
});

test('section links accept only real component routes and known groups', () => {
  const groups = ['foundations', 'controls', 'navigation', 'feedback', 'patterns', 'motion'];
  assert.equal(catalogueGroupFromHash('#components/controls', groups), 'controls');
  assert.equal(catalogueGroupFromHash('#components/%6dotion', groups), 'motion');
  for (const hash of ['#catalogue/controls', '#components', '#components/unknown', '#components/controls/extra', '#components/%E0%A4%A']) {
    assert.equal(catalogueGroupFromHash(hash, groups), undefined);
  }
});

test('scroll tracking follows the visible heading boundaries, including filtered groups', () => {
  const headings = [{id:'foundations',top:-300}, {id:'controls',top:40}, {id:'feedback',top:900}];
  assert.equal(catalogueGroupAtScroll(headings, 32), 'foundations');
  assert.equal(catalogueGroupAtScroll(headings, 40), 'controls');
  assert.equal(catalogueGroupAtScroll(headings, 950), 'feedback');
  assert.equal(catalogueGroupAtScroll([{id:'patterns',top:400}], 32), 'patterns');
  assert.equal(catalogueGroupAtScroll([], 32), undefined);
});
