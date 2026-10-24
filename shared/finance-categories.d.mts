export type JournalCategory={value:string;label:string};
export const EXPENSE_CATEGORIES:readonly JournalCategory[];
export const INCOME_CATEGORIES:readonly JournalCategory[];
export const CATEGORY_LABELS:Readonly<Record<string,string>>;
export function categoryLabel(value?:string|null,language?:string):string;
export function categoryOptions(kind?:'expense'|'income'|'transfer',custom?:readonly string[]):JournalCategory[];
