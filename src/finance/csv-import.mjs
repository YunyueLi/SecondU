export const MAX_CSV_TRANSACTIONS = 2000;
export const MAX_CSV_BYTES = 20 * 1024 * 1024;
export const CSV_CURRENCIES = ['CNY', 'CNH', 'USD', 'HKD', 'SGD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'KRW', 'MYR', 'TWD', 'INR', 'THB'];
export const CSV_FIELDS = ['occurredOn', 'amount', 'kind', 'currency', 'merchant', 'category', 'subcategory', 'accountId', 'toAccountId', 'note'];
const FIELD_NAMES = { occurredOn: '日期', amount: '金额', kind: '交易类型', currency: '币种', merchant: '商户', category: '分类', subcategory: '子分类', accountId: '账户', toAccountId: '转入账户', note: '备注' };
const STANDARD_HEADERS = {
  occurredOn: ['occurredOn', '日期', '交易日期'], amount: ['amount', '金额'], kind: ['kind', '交易类型', '类型'], currency: ['currency', '币种'],
  merchant: ['merchant', '商户'], category: ['category', '分类', '类别'], subcategory: ['subcategory', '子分类'],
  accountId: ['accountId', '账户ID', '账户 ID'], toAccountId: ['toAccountId', '转入账户ID', '转入账户 ID'], note: ['note', '备注'],
};
const controlCharacters = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

export class CsvImportError extends Error {
  constructor(message, row) { super(message); this.name = 'CsvImportError'; this.row = row; }
}

export function decodeCsvBytes(bytes) {
  if (bytes.byteLength > MAX_CSV_BYTES) throw new CsvImportError('CSV 文件不能超过 20 MB。');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new CsvImportError('文件不是有效的 UTF-8 编码，请另存为 UTF-8 CSV 后重试。'); }
}

/** Strict comma-separated CSV. Record row numbers refer to starting physical lines. */
export function parseCsv(text) {
  if (typeof text !== 'string') throw new CsvImportError('无法读取 CSV 内容。');
  const source = text.replace(/^\uFEFF/, '');
  if (!source.length) throw new CsvImportError('CSV 文件为空。');
  const records = [];
  let cells = [], value = '', quoted = false, closed = false, line = 1, recordLine = 1;
  const endField = () => { cells.push(value); value = ''; closed = false; };
  const endRecord = () => {
    endField(); records.push({ row: recordLine, cells }); cells = [];
    if (records.length > MAX_CSV_TRANSACTIONS + 1) throw new CsvImportError(`每次最多导入 ${MAX_CSV_TRANSACTIONS} 条交易，请拆分文件。`, recordLine);
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index], newline = char === '\r' || char === '\n';
    const lineEnding = char === '\r' && source[index + 1] === '\n' ? '\r\n' : char;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { value += '"'; index++; }
        else { quoted = false; closed = true; }
      } else {
        value += newline ? lineEnding : char;
        if (newline) { line++; if (lineEnding.length === 2) index++; }
      }
      continue;
    }
    if (closed && char !== ',' && !newline) throw new CsvImportError(`第 ${line} 行的结束引号后必须是逗号或换行。`, line);
    if (char === '"') {
      if (value.length) throw new CsvImportError(`第 ${line} 行的引号必须从字段开头开始。`, line);
      quoted = true;
    } else if (char === ',') endField();
    else if (newline) {
      endRecord(); line++; recordLine = line;
      if (lineEnding.length === 2) index++;
    } else value += char;
  }
  if (quoted) throw new CsvImportError(`第 ${recordLine} 行开始的字段缺少结束引号。`, recordLine);
  if (cells.length || value.length || closed) endRecord();
  const header = records.shift();
  if (!header || header.cells.every(cell => !cell.trim())) throw new CsvImportError('第一行必须是列名。', 1);
  if (!records.length) throw new CsvImportError('CSV 只有表头，没有可导入的交易。');
  return { headers: header.cells.map(cell => cell.trim()), rows: records };
}

/** These suggestions never confirm a mapping; the user must explicitly review it. */
export function suggestCsvMapping(headers) {
  const mapping = {};
  for (const field of CSV_FIELDS) {
    const matches = headers.flatMap((header, index) => STANDARD_HEADERS[field].includes(header.trim()) ? [index] : []);
    if (matches.length === 1) mapping[field] = matches[0];
  }
  return mapping;
}

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const hashText = value => sha256Hex(new TextEncoder().encode(value));
const shanghaiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function transactionDate(raw, format, today) {
  const value = raw.trim();
  const pattern = format === 'iso' ? /^(\d{4})-(\d{2})-(\d{2})$/ : format === 'ymd-slash' ? /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/ : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = pattern.exec(value);
  if (!match) throw new Error('日期与所选格式不一致。');
  const parts = format === 'iso' || format === 'ymd-slash' ? [match[1], match[2], match[3]] : format === 'dmy-slash' ? [match[3], match[2], match[1]] : [match[3], match[1], match[2]];
  const date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) throw new Error('日期不存在。');
  if (date > today) throw new Error('交易日期不能晚于今天。');
  return date;
}
function transactionAmount(raw, kind) {
  const value = raw.trim();
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) throw new Error('金额须为数字，最多两位小数；千位分隔仅支持英文逗号。');
  const clean = value.replaceAll(',', '').replace(/^\+/, ''), negative = clean.startsWith('-');
  const [whole, fraction = ''] = clean.replace(/^-/, '').split('.');
  const integer = whole.replace(/^0+(?=\d)/, '');
  if (integer.length > 15) throw new Error('金额的整数部分不能超过 15 位。');
  const cents = BigInt(integer) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (kind !== 'expense' && (negative || cents === 0n)) throw new Error(`${kind === 'income' ? '收入' : '转账'}金额须大于零。`);
  return `${negative && cents !== 0n ? '-' : ''}${integer}.${fraction.padEnd(2, '0')}`;
}

/** No rows are saved here. Any returned error blocks the whole batch in the UI. */
export async function prepareCsvImport({ document, mapping, defaults, fileName, fileHash, accounts = [], today = shanghaiToday() }) {
  if (!document?.rows?.length || document.rows.length > MAX_CSV_TRANSACTIONS) throw new CsvImportError(`请选择包含 1—${MAX_CSV_TRANSACTIONS} 条交易的 CSV。`);
  if (!/^[a-f0-9]{64}$/.test(fileHash)) throw new CsvImportError('文件校验值无效，请重新选择 CSV。');
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255 || /[/\\]/.test(fileName) || controlCharacters.test(fileName)) throw new CsvImportError('文件名无效或过长，请重命名后重试。');
  for (const field of ['occurredOn', 'amount']) {
    if (!Number.isInteger(mapping[field])) throw new CsvImportError(`请选择“${FIELD_NAMES[field]}”对应的 CSV 列。`);
  }
  for (const [field, column] of Object.entries(mapping)) {
    if (!CSV_FIELDS.includes(field) || !Number.isInteger(column) || column < 0 || column >= document.headers.length) throw new CsvImportError('列映射已失效，请重新选择对应列。');
  }
  if (!['iso', 'ymd-slash', 'dmy-slash', 'mdy-slash'].includes(defaults.dateFormat)) throw new CsvImportError('请选择日期格式。');
  if (!['expense', 'income', 'transfer'].includes(defaults.kind) || !CSV_CURRENCIES.includes(defaults.currency)) throw new CsvImportError('请选择有效的默认类型和币种。');
  const errors = [], records = [], accountIds = new Set(accounts.map(account => account.id));
  for (const record of document.rows) {
    const rowErrors = [], addError = (field, message) => rowErrors.push({ row: record.row, field, message });
    if (record.cells.length !== document.headers.length) {
      errors.push({ row: record.row, field: 'row', message: `本行有 ${record.cells.length} 列，表头有 ${document.headers.length} 列。请检查逗号和引号。` });
      continue;
    }
    if (record.cells.every(cell => !cell.trim())) { errors.push({ row: record.row, field: 'row', message: '本行为空，请移除空白记录。' }); continue; }
    const read = field => mapping[field] === undefined ? '' : record.cells[mapping[field]].trim();
    const capture = (field, action) => { try { return action(); } catch (error) { addError(field, error.message); return ''; } };
    const rawKind = read('kind') || defaults.kind;
    const kind = ({ expense: 'expense', income: 'income', transfer: 'transfer', 支出: 'expense', 收入: 'income', 转账: 'transfer' })[rawKind];
    if (!kind) addError('kind', '交易类型须为 expense／支出、income／收入或 transfer／转账。');
    const occurredOn = capture('occurredOn', () => transactionDate(read('occurredOn'), defaults.dateFormat, today));
    const amount = capture('amount', () => transactionAmount(read('amount'), kind || defaults.kind));
    const currency = (read('currency') || defaults.currency).toUpperCase();
    if (!CSV_CURRENCIES.includes(currency)) addError('currency', '币种不在支持列表中。');
    const accountId = read('accountId') || defaults.accountId || null;
    const toAccountId = read('toAccountId') || (kind === 'transfer' ? defaults.toAccountId : null) || null;
    for (const [field, id] of [['accountId', accountId], ['toAccountId', toAccountId]]) {
      if (id && (!accountIds.has(id) || id.length > 200)) addError(field, '账户 ID 不存在于当前空间，请修改列映射或选择默认账户。');
    }
    if (kind !== 'transfer' && toAccountId) addError('toAccountId', '只有转账可以填写转入账户。');
    if (kind === 'transfer' && accountId && accountId === toAccountId) addError('toAccountId', '转出与转入账户不能相同。');
    const fields = {};
    for (const [field, max] of [['merchant', 300], ['category', 100], ['subcategory', 100], ['note', 2000]]) {
      fields[field] = read(field);
      if (fields[field].length > max || controlCharacters.test(fields[field])) addError(field, `${FIELD_NAMES[field]}不能包含控制字符，且最多 ${max} 字符。`);
    }
    if (rowErrors.length) { errors.push(...rowErrors); continue; }
    records.push({ row: record.row, kind, occurredOn, amount, currency, ...fields, accountId, toAccountId });
  }
  // Include the confirmed mapping's result in operation keys. Retries are stable;
  // a changed mapping never reuses an operation key with a different payload.
  const batchId = `csv-${await hashText(JSON.stringify({ fileHash, fileName, records }))}`;
  const transactions = await Promise.all(records.map(async ({ row, ...record }) => ({
    ...record, expectedRevision: 0,
    idempotencyKey: `csv-row-${await hashText(JSON.stringify({ batchId, row, record }))}`,
    source: { kind: 'import', fileName, fileHash, row, batchId },
  })));
  return { transactions, errors, idempotencyKey: batchId, batchId, totalRows: document.rows.length };
}
