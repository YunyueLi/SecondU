import type { FinanceRecordInput, FinanceTransaction } from '../../shared/finance-journal';
export const MAX_CSV_TRANSACTIONS: number;
export const MAX_CSV_BYTES: number;
export const CSV_CURRENCIES: readonly string[];
export type CsvField = 'occurredOn' | 'amount' | 'kind' | 'currency' | 'merchant' | 'category' | 'subcategory' | 'accountId' | 'toAccountId' | 'note';
export const CSV_FIELDS: readonly CsvField[];
export type CsvDocument = { headers: string[]; rows: Array<{ row: number; cells: string[] }> };
export type CsvMapping = Partial<Record<CsvField, number>>;
export type CsvDateFormat = 'iso' | 'ymd-slash' | 'dmy-slash' | 'mdy-slash';
export type CsvDefaults = { kind: FinanceTransaction['kind']; currency: string; dateFormat: CsvDateFormat; accountId?: string | null; toAccountId?: string | null };
export type CsvPreview = { transactions: FinanceRecordInput<'transactions'>[]; errors: Array<{ row: number; field: CsvField | 'row'; message: string }>; idempotencyKey: string; batchId: string; totalRows: number };
export class CsvImportError extends Error { row?: number; constructor(message: string, row?: number); }
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string;
export function parseCsv(text: string): CsvDocument;
export function suggestCsvMapping(headers: string[]): CsvMapping;
export function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string>;
export function prepareCsvImport(input: { document: CsvDocument; mapping: CsvMapping; defaults: CsvDefaults; fileName: string; fileHash: string; accounts?: Array<{ id: string }>; today?: string }): Promise<CsvPreview>;
