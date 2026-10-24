export const EXPENSE_CATEGORIES = [
  { value: 'food', label: '餐饮' }, { value: 'transport', label: '交通' },
  { value: 'shopping', label: '购物' }, { value: 'housing', label: '居住' },
  { value: 'health', label: '健康' }, { value: 'education', label: '教育' },
  { value: 'entertainment', label: '娱乐' }, { value: 'travel', label: '旅行' },
  { value: 'services', label: '服务' }, { value: 'fees', label: '手续费' },
  { value: 'interest', label: '利息' }, { value: 'other', label: '其他' },
  { value: 'uncategorized', label: '未分类' },
];
export const INCOME_CATEGORIES = [
  { value: 'salary', label: '工资' }, { value: 'investment', label: '投资收入' },
  { value: 'refund', label: '退款收入' }, { value: 'interest', label: '利息' },
  { value: 'other', label: '其他' }, { value: 'uncategorized', label: '未分类' },
];
export const CATEGORY_LABELS = Object.fromEntries([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map(item => [item.value, item.label]));
const ENGLISH_CATEGORY_LABELS={food:'Food and dining',transport:'Transport',shopping:'Shopping',housing:'Housing',health:'Health',education:'Education',entertainment:'Entertainment',travel:'Travel',services:'Services',fees:'Fees',interest:'Interest',other:'Other',uncategorized:'Uncategorized',salary:'Salary',investment:'Investment income',refund:'Refunds'};
export const categoryLabel = (value, language='zh-CN') => value ? (language==='en'?ENGLISH_CATEGORY_LABELS[value]:CATEGORY_LABELS[value]) || value : language==='en'?'Uncategorized':'未分类';
export function categoryOptions(kind = 'expense', custom = []) {
  const entries = [...(kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)];
  const known = new Set(entries.map(item => item.value));
  for (const value of custom) if (value && !known.has(value)) { entries.push({ value, label: categoryLabel(value) }); known.add(value); }
  return entries;
}
