import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CSV_CURRENCIES, MAX_CSV_TRANSACTIONS, decodeCsvBytes, parseCsv, prepareCsvImport, sha256Hex, suggestCsvMapping } from '../src/finance/csv-import.mjs';
import { CURRENCIES } from '../server/finance/arithmetic.mjs';

const defaults = { kind: 'expense', currency: 'CNY', dateFormat: 'iso', accountId: null, toAccountId: null };
async function prepare(source, options = {}) {
  const bytes = new TextEncoder().encode(source), document = parseCsv(source);
  return prepareCsvImport({ document, mapping: suggestCsvMapping(document.headers), defaults, fileName: 'fictional-transactions.csv', fileHash: await sha256Hex(bytes), accounts: [{ id: 'cash' }, { id: 'bank' }], today: '2026-10-24', ...options });
}

test('UTF-8 BOM, quoted commas, escaped quotes and newlines retain starting physical rows', async () => {
  const source = '\uFEFFoccurredOn,amount,merchant,note\r\n2026-10-20,"1,234.50","示例,咖啡","第一行\r\n第二行 ""提醒"""\r\n2026-10-21,-12.30,示例退款,\r\n';
  const document = parseCsv(decodeCsvBytes(new TextEncoder().encode(source)));
  assert.deepEqual(document.headers, ['occurredOn', 'amount', 'merchant', 'note']);
  assert.deepEqual(document.rows.map(row => row.row), [2, 4]);
  assert.equal(document.rows[0].cells[2], '示例,咖啡');
  assert.equal(document.rows[0].cells[3], '第一行\r\n第二行 "提醒"');
  const result = await prepare(source);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.transactions.map(row => row.amount), ['1234.50', '-12.30']);
  assert.deepEqual(result.transactions.map(row => row.source.row), [2, 4]);
});

test('file hash covers original UTF-8 bytes, including BOM, and is repeatable', async () => {
  const bytes = new TextEncoder().encode('\uFEFF日期,金额\n2026-10-20,1');
  const hash = await sha256Hex(bytes);
  assert.equal(hash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(hash, await sha256Hex(bytes));
  assert.notEqual(hash, await sha256Hex(bytes.slice(3)));
  assert.throws(() => decodeCsvBytes(new Uint8Array([0xff, 0xfe, 0x61])), /UTF-8/);
});

test('malformed quoting is rejected with the affected physical line', () => {
  for (const input of ['a,b\nx,"missing', 'a,b\nx,mid"quote', 'a,b\nx,"quoted"suffix']) {
    assert.throws(() => parseCsv(input), error => error.name === 'CsvImportError' && error.row === 2);
  }
  assert.throws(() => parseCsv(''), /为空/);
  assert.throws(() => parseCsv('amount,occurredOn\n'), /没有可导入/);
});

test('2000 data records are accepted but the next record is rejected before preview', () => {
  const source = `occurredOn,amount\n${Array.from({ length: MAX_CSV_TRANSACTIONS }, () => '2026-10-20,1').join('\n')}`;
  assert.equal(parseCsv(source).rows.length, MAX_CSV_TRANSACTIONS);
  assert.throws(() => parseCsv(`${source}\n2026-10-20,2`), /2000/);
});

test('mapping suggests only unambiguous exact standard headers and requires date and amount', async () => {
  assert.deepEqual(suggestCsvMapping(['日期', '金额', '商户']), { occurredOn: 0, amount: 1, merchant: 2 });
  assert.deepEqual(suggestCsvMapping(['日期', '金额', '类型', '类别']), { occurredOn: 0, amount: 1, kind: 2, category: 3 });
  assert.deepEqual(suggestCsvMapping(['交易类型', '类型', '分类', '类别']), {}, 'multiple exact aliases remain ambiguous and require an explicit choice');
  assert.deepEqual(suggestCsvMapping(['日期', '交易日期', '交易金额（元）', '对方名称']), {});
  await assert.rejects(prepare('date,value\n2026-10-20,1'), /日期/);
  const result = await prepare('date,value\n2026-10-20,1', { mapping: { occurredOn: 0, amount: 1 } });
  assert.equal(result.transactions[0].merchant, '');
  assert.equal(result.transactions[0].amount, '1.00');
});

test('signs retain their meaning: expense refunds and zero, positive income and transfer', async () => {
  const result = await prepare('occurredOn,amount,kind\n2026-10-20,-5,expense\n2026-10-20,0,支出\n2026-10-20,+12.30,收入\n2026-10-20,2,transfer');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.transactions.map(row => [row.kind, row.amount]), [['expense', '-5.00'], ['expense', '0.00'], ['income', '12.30'], ['transfer', '2.00']]);
  for (const kind of ['income', 'transfer']) for (const amount of ['0', '-1']) {
    const invalid = await prepare(`occurredOn,amount,kind\n2026-10-20,${amount},${kind}`);
    assert.equal(invalid.transactions.length, 0);
    assert.match(invalid.errors[0].message, /大于零/);
  }
});

test('bad rows and column counts are reported rather than silently discarded', async () => {
  const result = await prepare('occurredOn,amount,currency\n2026-10-20,1,CNY\n2026-02-30,2,CNY\n2026-10-25,3,CNY\n2026-10-20,1.001,CNY\n2026-10-20,1,XYZ\n2026-10-20,2\n,,');
  assert.equal(result.totalRows, 7);
  assert.equal(result.transactions.length, 1);
  assert.deepEqual([...new Set(result.errors.map(error => error.row))], [3, 4, 5, 6, 7, 8]);
  assert.match(result.errors.find(error => error.row === 7).message, /列/);
  assert.match(result.errors.find(error => error.row === 8).message, /为空/);
});

test('date formats are explicit and do not infer ambiguous day/month ordering', async () => {
  const source = 'occurredOn,amount\n03/04/2026,1';
  const strict = await prepare(source);
  assert.match(strict.errors[0].message, /所选格式/);
  const dayFirst = await prepare(source, { defaults: { ...defaults, dateFormat: 'dmy-slash' } });
  const monthFirst = await prepare(source, { defaults: { ...defaults, dateFormat: 'mdy-slash' } });
  assert.equal(dayFirst.transactions[0].occurredOn, '2026-04-03');
  assert.equal(monthFirst.transactions[0].occurredOn, '2026-03-04');
});

test('accounts are exact current-space IDs and transfer targets cannot be reused incorrectly', async () => {
  const result = await prepare('occurredOn,amount,kind,accountId,toAccountId\n2026-10-20,2,transfer,cash,bank\n2026-10-20,2,transfer,cash,cash\n2026-10-20,2,expense,cash,bank\n2026-10-20,2,income,unknown,');
  assert.equal(result.transactions.length, 1);
  assert.deepEqual([...new Set(result.errors.map(error => error.row))], [3, 4, 5]);
  const mixed = await prepare('occurredOn,amount,kind\n2026-10-20,2,expense\n2026-10-20,2,transfer', { defaults: { ...defaults, accountId: 'cash', toAccountId: 'bank' } });
  assert.deepEqual(mixed.errors, []);
  assert.deepEqual(mixed.transactions.map(row => row.toAccountId), [null, 'bank']);
});

test('retry keys are stable without deduplicating legitimate same-date same-amount rows', async () => {
  const source = 'occurredOn,amount,merchant,note\n2026-10-20,2,示例商户,一次\n2026-10-20,2,示例商户,一次';
  const first = await prepare(source), retry = await prepare(source);
  assert.deepEqual(first, retry);
  assert.equal(first.transactions.length, 2);
  assert.notEqual(first.transactions[0].idempotencyKey, first.transactions[1].idempotencyKey);
  assert.equal(first.transactions[0].source.fileHash, first.transactions[1].source.fileHash);
  assert.deepEqual(first.transactions.map(row => row.source.row), [2, 3]);
  assert.ok(first.transactions.every(row => row.expectedRevision === 0 && row.source.kind === 'import' && /^[a-zA-Z0-9][a-zA-Z0-9:._-]{7,127}$/.test(row.idempotencyKey)));
  const revised = await prepare(source, { mapping: { occurredOn: 0, amount: 1, merchant: 3 } });
  assert.notEqual(first.idempotencyKey, revised.idempotencyKey);
});

test('text limits, control characters and oversized numeric values block affected records', async () => {
  const tooLong = await prepare(`occurredOn,amount,merchant\n2026-10-20,1,${'名'.repeat(301)}`);
  assert.equal(tooLong.transactions.length, 0);
  assert.match(tooLong.errors[0].message, /300/);
  const control = await prepare('occurredOn,amount,note\n2026-10-20,1,a\u0000b');
  assert.equal(control.transactions.length, 0);
  for (const value of ['1234567890123456', '1e3', '1,00', '=1+1']) {
    const result = await prepare(`occurredOn,amount\n2026-10-20,"${value}"`);
    assert.equal(result.transactions.length, 0);
    assert.ok(result.errors.some(error => error.field === 'amount'));
  }
  await assert.rejects(prepare('occurredOn,amount\n2026-10-20,1', { fileName: '/private/file.csv' }), /文件名/);
});

test('supported currencies match the local finance service contract', () => {
  assert.deepEqual([...CSV_CURRENCIES].sort(), [...CURRENCIES].sort());
});
