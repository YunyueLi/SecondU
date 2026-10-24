import {
  EXPENSE_CATEGORIES as expenseCategories,
  INCOME_CATEGORIES as incomeCategories,
  CATEGORY_LABELS as categoryLabels,
  categoryLabel as sharedCategoryLabel,
  categoryOptions as sharedCategoryOptions,
  type JournalCategory,
} from '../../shared/finance-categories.mjs';
import {getLocale} from '../i18n';

export type {JournalCategory} from '../../shared/finance-categories.mjs';

export function categoryLabel(value?:string|null):string {
  return sharedCategoryLabel(value,getLocale());
}

function localizedCategories(rows:readonly JournalCategory[]):readonly JournalCategory[] {
  return rows.map(({value})=>({value,get label(){return categoryLabel(value);}}));
}

export const EXPENSE_CATEGORIES=localizedCategories(expenseCategories);
export const INCOME_CATEGORIES=localizedCategories(incomeCategories);
export const CATEGORY_LABELS:Readonly<Record<string,string>>=Object.defineProperties({},
  Object.fromEntries(Object.keys(categoryLabels).map(value=>[value,{enumerable:true,get:()=>categoryLabel(value)}])),
);

export function categoryOptions(kind?:'expense'|'income'|'transfer',custom?:readonly string[]):JournalCategory[] {
  return sharedCategoryOptions(kind,custom).map(({value})=>({value,label:categoryLabel(value)}));
}
