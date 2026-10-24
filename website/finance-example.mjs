import {NativeFinanceStore, projectFinance} from '../server/finance/store.mjs';
import {FinanceJournal, FINANCE_WIDGET_IDS} from '../server/finance/journal.mjs';
import {analyzeFinanceJournal} from '../server/finance/analysis.mjs';
import {financeQuoteDefinition} from '../server/finance/market.mjs';
import {digest, fixed, fraction, minor, multiply} from '../server/finance/arithmetic.mjs';

export const FINANCE_EXAMPLE_DAY = '2026-10-25';
const timeZone = 'America/Los_Angeles';
const instant = `${FINANCE_EXAMPLE_DAY}T19:00:00.000Z`;
const openingDay = '2026-07-31';

/** Authored fiction for a Bay Area AI infrastructure engineer, in both interface languages.
 * This Finance scenario does not rewrite either digital-twin bootstrap. All
 * amounts, account identities and histories are identical, with USD summaries.
 * No existing store, private account or market price is read.
 */
export function createFinanceExample(store, language) {
  const en = language === 'en', label = (zh, english) => en ? english : zh;
  let clock = Date.parse(instant);
  const now = () => clock, native = new NativeFinanceStore(store, {now}), journal = new FinanceJournal(store, {now});
  const base = 'USD';
  native.onboarding({completed: true, displayCurrency: base, method: 'manual'});
  const institutions = {chase: 'Chase', ally: 'Ally', fidelity: 'Fidelity', schwab: 'Charles Schwab', ibkr: 'Interactive Brokers', personal: label('个人资产', 'Personal assets')};
  const accounts = new Map();
  function account(key, names, amount, currency, type, institution = 'personal', options = {}) {
    const kind = options.liability ? 'liability' : 'asset';
    const description = options.description || label('虚构手工记录，未连接金融机构。', 'Fictional manual record. No financial institution is connected.');
    const input = {idempotencyKey: `website-account-${key}`, name: label(...names), amount, currency, kind,
      asOf: FINANCE_EXAMPLE_DAY, description, [kind === 'asset' ? 'assetType' : 'liabilityType']: type};
    if (options.details) input.assetDetails = {...options.details, valuationAsOf: FINANCE_EXAMPLE_DAY};
    const created = native.createAccount(input, {accounts: native.document().accounts});
    const document = native.document(), row = document.accounts.find(item => item.id === created.accountId);
    row.id = `${institution}-website-${key}`;
    row.institution = {id: institution === 'personal' ? 'personal-assets' : institution, name: institutions[institution]};
    row.sourceName = label('虚构手工记录', 'Fictional manual record');
    native.save(document); accounts.set(key, row.id); return row.id;
  }
  const id = key => accounts.get(key);
  const valued = (totalValue, acquiredAmount, acquiredOn, linkedLiabilityIds = []) => ({
    totalValue, ownershipPercent: '100', acquiredAmount, acquiredOn, linkedLiabilityIds,
    valuationSource: label('虚构人工估值，仅用于展示。', 'Fictional manual valuation for demonstration.'),
  });
  account('car-loan', ['Ally 汽车贷款', 'Ally auto loan'], '12600', 'USD', 'vehicle_loan', 'ally', {liability: true,
    description: label('虚构汽车贷款余额；每月本金 350 美元记转账，55 美元利息单列为支出。', 'Fictional auto-loan balance; monthly principal USD 350 is a transfer, and USD 55 interest is a separate expense.')});
  account('credit-everyday', ['Chase 日常信用卡', 'Chase everyday credit card'], '2684.45', 'USD', 'credit_card', 'chase', {liability: true});
  account('credit-travel', ['Chase 旅行信用卡', 'Chase travel credit card'], '1196.30', 'USD', 'credit_card', 'chase', {liability: true});
  account('everyday', ['Chase 日常支票账户', 'Chase everyday checking'], '22840.75', 'USD', 'cash', 'chase', {
    description: label('接收每半月 5,900 美元净工资，用于湾区租房与日常生活；9 月另收已归属股票卖出后的 30,000 美元内部转款。', 'Receives USD 5,900 take-home pay twice a month for Bay Area rent and living costs. September also includes a USD 30,000 internal transfer after a vested-stock sale.')});
  account('emergency', ['Ally 高息应急储蓄', 'Ally emergency savings'], '65000', 'USD', 'cash', 'ally', {
    description: label('虚构高收益储蓄账户，作为约八个月必要开支的应急储备；不与购房首付重复规划，示例利息不是银行实际利率。', 'Fictional high-yield savings covering roughly eight months of essential costs. Kept separate from the home down payment; example interest is not a bank rate.')});
  account('taxable', ['Charles Schwab 普通证券账户', 'Charles Schwab taxable brokerage'], '172550', 'USD', 'investment', 'schwab', {
    description: label('含证券 143,940 美元和现金 28,610 美元。其中 SGOV 70,140 美元与全部现金合计 98,750 美元作为购房准备金；9 月转入的 25,000 美元股票售款已包含其中。', 'Securities USD 143,940 plus cash USD 28,610. SGOV USD 70,140 and the cash total USD 98,750 earmarked for a home down payment, including the September USD 25,000 transfer of stock-sale proceeds.')});
  account('401k', ['Fidelity 401(k) BrokerageLink', 'Fidelity 401(k) BrokerageLink'], '247980', 'USD', 'investment', 'fidelity', {
    description: label('虚构计划允许通过 BrokerageLink 自助投资子账户持有 ETF，证券 238,980 美元、现金 9,000 美元。每个工资期员工代扣 825 美元、公司配比 300 美元直接入账，不再从净工资账户扣除。', 'This fictional plan permits ETFs through its BrokerageLink self-directed account: securities USD 238,980 and cash USD 9,000. Each payroll deposits USD 825 employee deferral plus USD 300 employer match directly, without another deduction from take-home checking.')});
  account('hsa', ['Fidelity HSA 医疗储蓄', 'Fidelity HSA healthcare reserve'], '12790', 'USD', 'investment', 'fidelity', {
    description: label('VTI 11,040 美元与现金 1,750 美元。每个工资期 150 美元由工资系统直接入账，医疗自付费用从 HSA 支付；本例不推导联邦或加州税务待遇。', 'VTI USD 11,040 plus cash USD 1,750. Each payroll deposits USD 150 directly, and medical out-of-pocket costs are paid from the HSA. This example makes no federal or California tax determination.')});
  account('roth-ira', ['Charles Schwab Roth IRA', 'Charles Schwab Roth IRA'], '58500', 'USD', 'investment', 'schwab', {
    description: label('虚构历年积累的 Roth IRA，含 ETF 57,750 美元和现金 750 美元；本期没有新增供款。', 'Fictional Roth IRA accumulated in prior years: ETFs USD 57,750 and cash USD 750, with no new contributions in this period.')});
  account('vested-stock', ['Fidelity 前雇主已归属 RSU', 'Fidelity former-employer vested RSUs'], '98388', 'USD', 'investment', 'fidelity', {
    description: label('前雇主 Microsoft 已归属股票：期初净持有 300 股，归属时的预提税处理已完成；9 月卖出 80 股后剩余 220 股，现值 94,600 美元，现金 3,788 美元。售款转出属于资产转移，不再次计作工资。', 'Vested Microsoft shares from a former employer: 300 net shares at opening after vesting-related withholding. After selling 80 shares in September, 220 shares remain, valued at USD 94,600, plus USD 3,788 cash. Withdrawn sale proceeds are an asset transfer, not new salary.')});
  account('espp', ['Fidelity 前雇主 ESPP', 'Fidelity former-employer ESPP'], '21000', 'USD', 'investment', 'fidelity', {
    description: label('此前已实际购入的 48 股 MSFT，现值 20,640 美元，另有现金 360 美元。购买发生在期初前；不计入尚未购入的员工购股额度。', '48 MSFT shares actually purchased before the opening snapshot, valued at USD 20,640, plus USD 360 cash. Unpurchased employee stock-purchase entitlements are excluded.')});
  account('car', ['家用电动车', 'Personal electric car'], '28500', 'USD', 'vehicle', 'personal', {
    details: valued('28500', '46500', '2023-08-10', [id('car-loan')]),
    description: label('虚构家用电动车估值，用于周末与少量驾车通勤；日常通勤以 Caltrain 和 Clipper 为主，汽车贷款另列。', 'Fictional electric-car valuation for weekends and occasional driving; regular commuting uses Caltrain and Clipper. The auto loan is listed separately.')});
  for (const [key, currency, amount, zh] of [['eur-cash', 'EUR', '900', '欧元'], ['gbp-cash', 'GBP', '450', '英镑']]) {
    account(key, [`IBKR ${zh}结算现金`, `IBKR ${currency} settlement cash`], amount, currency, 'cash', 'ibkr', {
      description: label('虚构海外证券结算备用现金，金额很小，独立折为美元；不是另一个旅行储蓄或美元证券账户。', 'Small fictional cash balance reserved for overseas securities settlement and translated separately to USD; not a separate travel reserve or USD brokerage account.')});
  }

  // Official product identities only. Quantities, prices and returns are authored fiction.
  // https://investor.vanguard.com/investment-products/etfs/profile/vti
  // https://investor.vanguard.com/investment-products/etfs/profile/vxus
  // https://investor.vanguard.com/investment-products/etfs/profile/bnd
  // https://advisors.vanguard.com/investments/products/voo/vanguard-sp-500-etf
  // https://www.schwabassetmanagement.com/products/schb (also /schf and /schz)
  // https://www.ishares.com/us/products/314116/ishares-0-3-month-treasury-bond-etf
  // RSU accounting: https://www.fidelity.com/webxpress/help/topics_nb/learn_rsus.shtml
  const products = {
    MSFT: ['Microsoft', 'stock', '430', '434'], NVDA: ['NVIDIA', 'stock', '132', '129'],
    VTI: ['Vanguard Total Stock Market ETF', 'etf', '276', '274'], VXUS: ['Vanguard Total International Stock ETF', 'etf', '67.80', '68.10'],
    BND: ['Vanguard Total Bond Market ETF', 'etf', '74.10', '73.95'], VOO: ['Vanguard S&P 500 ETF', 'etf', '517', '513'],
    SGOV: ['iShares 0-3 Month Treasury Bond ETF', 'etf', '100.20', '100.19'],
    SCHB: ['Schwab U.S. Broad Market ETF', 'etf', '24.50', '24.35'], SCHF: ['Schwab International Equity ETF', 'etf', '21.80', '21.90'],
    SCHZ: ['Schwab U.S. Aggregate Bond ETF', 'etf', '22.90', '22.85'],
    'CASH-USD': [label('美元现金', 'USD cash'), 'cash', '1', '1'],
  };
  const holdings = [
    ['taxable', 'VTI', '180', '249'], ['taxable', 'VXUS', '200', '61'], ['taxable', 'SGOV', '700', '100.10'], ['taxable', 'NVDA', '80', '105'], ['taxable', 'CASH-USD', '28610', '1'],
    ['401k', 'VOO', '300', '450'], ['401k', 'VXUS', '800', '60'], ['401k', 'BND', '400', '72'], ['401k', 'CASH-USD', '9000', '1'],
    ['hsa', 'VTI', '40', '245'], ['hsa', 'CASH-USD', '1750', '1'],
    ['roth-ira', 'SCHB', '1000', '21.10'], ['roth-ira', 'SCHF', '1000', '20.40'], ['roth-ira', 'SCHZ', '500', '22'], ['roth-ira', 'CASH-USD', '750', '1'],
    ['vested-stock', 'MSFT', '220', '355'], ['vested-stock', 'CASH-USD', '3788', '1'],
    ['espp', 'MSFT', '48', '340'], ['espp', 'CASH-USD', '360', '1'],
  ];
  const quotes = [];
  for (const [key, symbol, quantity, costPrice] of holdings) {
    const [name, kind, price, previousClose] = products[symbol], currency = 'USD';
    const result = native.createPosition({idempotencyKey: `website-holding-${key}-${symbol}`, accountId: id(key), name, symbol, kind,
      quantity, costPrice, recordedMarketValue: multiply(quantity, price), currency, asOf: FINANCE_EXAMPLE_DAY, ...(kind === 'cash' ? {} : {exchange: 'US'}),
      note: label('数量、成本和价格均为虚构。此分项已包含在账户总额内。', 'Quantity, cost and price are fictional. This component is already included in the account total.')});
    const position = native.document().positions.find(row => row.id === result.positionId), definition = financeQuoteDefinition(position);
    const quoteId = definition.provider === 'unmapped' ? `website-${symbol}` : definition.id;
    const existing = quotes.find(row => row.id === quoteId && row.currency === currency);
    if (existing) { existing.positionIds.push(position.id); continue; }
    const p = fraction(price), previous = fraction(previousClose), numerator = p.n * previous.d - previous.n * p.d;
    quotes.push({id: quoteId, symbol: definition.symbol, name, kind, currency,
      price, previousClose, change: fixed(numerator, p.d * previous.d), changePct: fixed(numerator * 100n, p.d * previous.n),
      asOf: instant, receivedAt: instant, status: 'example', marketState: 'FICTIONAL_SNAPSHOT',
      sourceName: label('虚构价格示例', 'Illustrative fictional price'), sourceUrl: null,
      message: label('2026 年 10 月 25 日的固定虚构价格，不是实时或历史市场报价。', 'Fixed fictional price dated October 25, 2026; not a live or historical market quote.'),
      unit: kind === 'cash' ? currency : 'share', positionIds: [position.id]});
  }
  const usdRates = [['EUR', '1.08'], ['GBP', '1.28']];
  // The shared arithmetic normalizes FX to CNY internally. That computational
  // reference creates no CNY account: both displayed valuations and FX quotes use USD.
  const rates = [['USD', '7'], ['EUR', '7.56'], ['GBP', '8.96']].map(([currency, rate]) => ({
    currency, baseCurrency: 'CNY', rate, asOf: instant, status: 'example', sourceName: label('虚构汇率示例', 'Illustrative fictional exchange rate'), sourceUrl: null,
  }));
  for (const [currency, rate] of usdRates) quotes.push({id: `website-fx-${currency}-USD`, symbol: `${currency}/USD`, name: label(`${currency} 兑美元`, `${currency} to USD`),
    kind: 'fx', price: rate, currency: 'USD', asOf: instant, receivedAt: instant, status: 'example', marketState: 'FICTIONAL_SNAPSHOT',
    sourceName: label('虚构汇率示例', 'Illustrative fictional exchange rate'), sourceUrl: null, positionIds: [],
    message: label('固定虚构汇率，所有换算使用同一口径。', 'Fixed fictional rate used consistently across the example.')});
  const market = {revision: 'website-bay-area-ai-fiction-2026-10-25', timeZone, status: 'ready', updatedAt: instant, issues: [], quotes, rates};

  let serial = 0;
  const save = (collection, input) => journal.saveRecord(collection, {...input, expectedRevision: 0, idempotencyKey: `website-${collection}-${++serial}`, source: {kind: 'manual'}}, {accounts: native.document().accounts}).record;
  const plans = {};
  function plan(key, kind, names, amount, anchorDate, frequency, accountKey, category, note = '', subcategory = '') {
    plans[key] = save('recurring', {kind, name: label(...names), amount, currency: 'USD', anchorDate, frequency, accountId: id(accountKey), category, subcategory,
      note: note || label('虚构周期计划，实际付款以关联交易为准。', 'Fictional recurring plan; linked transactions establish payments.')}).id;
  }
  for (const [suffix, anchorDate, zh, english] of [['mid', '2026-08-15', '月中', 'mid-month'], ['end', '2026-08-31', '月末', 'month-end']]) {
    plan(`salary-${suffix}`, 'income', [`Aster Vale AI ${zh}净工资`, `Aster Vale AI ${english} cash salary`], '5900', anchorDate, 'monthly', 'everyday', 'salary',
      label('每期虚构税前工资 10,000 美元，扣税款 3,000、401(k) 员工供款 825、HSA 150、医保 125 后，Chase 实收 5,900。名义发薪日遇休息日提前到账；扣款不再次计作消费。', 'Fictional gross pay USD 10,000 less withholding USD 3,000, employee 401(k) USD 825, HSA USD 150 and health premium USD 125 leaves USD 5,900 in Chase. Weekend paydays are paid early; deductions are not recorded again as spending.'));
    plan(`401k-${suffix}`, 'income', [`401(k) ${zh}递延入账`, `401(k) ${english} deferred payroll deposit`], '1125', anchorDate, 'monthly', '401k', 'salary',
      label('员工工资代扣 825 美元和公司配比 300 美元直接存入退休账户。这笔受限入账与净工资分开，不是从 Chase 再转出，也不是日常消费。', 'Employee deferral USD 825 and employer match USD 300 go directly to retirement. This restricted inflow is separate from take-home pay, not another Chase withdrawal or everyday spending.'));
    plan(`hsa-${suffix}`, 'income', [`HSA ${zh}医疗储备入账`, `HSA ${english} healthcare payroll deposit`], '150', anchorDate, 'monthly', 'hsa', 'salary',
      label('工资系统直接存入医疗储备，净工资中已扣除；不重复计入 Chase 收款或支出，不推导税务减免。', 'Payroll deposits directly into the healthcare reserve after excluding it from take-home pay. It is not another Chase receipt or expense, and no tax deduction is inferred.'));
  }
  plan('rent', 'bill', ['San Mateo 公寓租金', 'San Mateo apartment rent'], '4200', '2026-08-01', 'monthly', 'everyday', 'housing');
  plan('pge', 'bill', ['PG&E 水电燃气', 'PG&E utilities'], '175', '2026-08-06', 'monthly', 'everyday', 'housing');
  plan('comcast', 'bill', ['Comcast Xfinity 家庭网络', 'Comcast Xfinity home internet'], '85', '2026-08-09', 'monthly', 'everyday', 'services');
  plan('commute', 'bill', ['Caltrain / Clipper 通勤', 'Caltrain / Clipper commute'], '114', '2026-08-03', 'monthly', 'everyday', 'transport');
  plan('phone', 'bill', ['手机套餐', 'Mobile plan'], '65', '2026-08-08', 'monthly', 'everyday', 'services');
  plan('auto-insurance', 'bill', ['汽车保险', 'Auto insurance'], '175', '2026-08-12', 'monthly', 'everyday', 'transport');
  plan('car-interest', 'bill', ['汽车贷款利息', 'Auto-loan interest'], '55', '2026-08-12', 'monthly', 'everyday', 'interest');
  plan('renters-insurance', 'bill', ['租客保险', 'Renters insurance'], '18', '2026-08-22', 'monthly', 'everyday', 'housing');
  for (const [key, name, day] of [['chatgpt', 'ChatGPT Plus', '05'], ['claude', 'Claude Pro', '08'], ['cursor', 'Cursor Pro', '19']]) {
    plan(key, 'subscription', [name, name], '20', `2026-08-${day}`, 'monthly', 'everyday', 'services',
      label('虚构个人 AI 工具订阅，不由公司报销；金额是示例，不承诺实际套餐价格。', 'Fictional personal AI subscription, not reimbursed by the employer; the amount is illustrative, not a current plan-price claim.'), 'AI');
  }
  plan('music', 'subscription', ['音乐订阅', 'Music subscription'], '11.99', '2026-08-18', 'monthly', 'everyday', 'entertainment');
  plan('cloud', 'subscription', ['个人云端备份', 'Personal cloud backup'], '9.99', '2026-08-21', 'monthly', 'everyday', 'services');
  plan('fitness', 'subscription', ['健身会员', 'Gym membership'], '89', '2026-08-28', 'monthly', 'everyday', 'health');
  plan('membership', 'subscription', ['技术协会年度会员', 'Annual technical association membership'], '199', '2026-11-01', 'yearly', 'everyday', 'education');
  plan('hosting', 'subscription', ['个人域名与项目托管', 'Personal domain and project hosting'], '99', '2026-11-02', 'yearly', 'everyday', 'services');

  function transaction(day, kind, amount, accountKey, merchant, category, extra = {}) {
    const accountRow = native.document().accounts.find(row => row.id === id(accountKey));
    return save('transactions', {occurredOn: day, kind, amount, currency: accountRow.currency, accountId: accountRow.id, merchant: label(...merchant), category,
      note: label('虚构交易，用于展示收支与账户变化。', 'Fictional transaction illustrating spending and account changes.'), ...extra});
  }
  function paid(day, key, accountKey, occurrenceOn = day) {
    const record = journal.read().recurring.find(row => row.id === plans[key]);
    return transaction(day, record.kind === 'income' ? 'income' : 'expense', record.amount, accountKey, [record.name, record.name], record.category,
      {recurringId: record.id, recurringOccurrenceOn: occurrenceOn, subcategory: record.subcategory});
  }
  function transfer(day, amount, from, to, names) {
    return transaction(day, 'transfer', amount, from, names, '', {toAccountId: id(to),
      note: label('虚构同币种内部转账，不计入收入或支出。', 'Fictional same-currency internal transfer, excluded from income and spending.')});
  }
  const payPeriods = [
    ['2026-08-14', '2026-08-15', 'mid'], ['2026-08-31', '2026-08-31', 'end'],
    ['2026-09-15', '2026-09-15', 'mid'], ['2026-09-30', '2026-09-30', 'end'], ['2026-10-15', '2026-10-15', 'mid'],
  ];
  for (const [paidOn, occurrenceOn, suffix] of payPeriods) {
    paid(paidOn, `salary-${suffix}`, 'everyday', occurrenceOn);
    paid(paidOn, `401k-${suffix}`, '401k', occurrenceOn);
    paid(paidOn, `hsa-${suffix}`, 'hsa', occurrenceOn);
  }
  for (const [index, month] of ['2026-08', '2026-09', '2026-10'].entries()) {
    const day = number => `${month}-${String(number).padStart(2, '0')}`;
    for (const [date, key] of [[1, 'rent'], [3, 'commute'], [5, 'chatgpt'], [6, 'pge'], [8, 'phone'], [8, 'claude'],
      [9, 'comcast'], [12, 'auto-insurance'], [12, 'car-interest'], [18, 'music'], [19, 'cursor'], [21, 'cloud'], [22, 'renters-insurance']]) paid(day(date), key, 'everyday');
    if (month !== '2026-10') paid(day(28), 'fitness', 'everyday');
    transfer(day(12), '350', 'everyday', 'car-loan', ['偿还车贷本金', 'Auto-loan principal repayment']);
    transfer(day(16), '1000', 'everyday', 'emergency', ['补充应急储备', 'Emergency reserve transfer']);
    transfer(day(18), '1000', 'everyday', 'taxable', ['转入购房准备金', 'Home-fund brokerage cash transfer']);
    transfer(day(23), '2500', 'everyday', 'credit-everyday', ['日常信用卡还款', 'Everyday credit-card payment']);
    transfer(day(24), '750', 'everyday', 'credit-travel', ['旅行信用卡还款', 'Travel credit-card payment']);
    const spending = [
      [2, ['148.60', '156.20', '162.40'][index], 'credit-everyday', ["Trader Joe's 食材", "Trader Joe's groceries"], 'food'],
      [7, ['132.80', '119.40', '138.60'][index], 'credit-everyday', ['Whole Foods 食材', 'Whole Foods groceries'], 'food'],
      [11, ['198', '210', '224'][index], 'credit-everyday', ['工作日咖啡与午餐', 'Weekday coffee and lunch'], 'food'],
      [20, ['144', '128', '156'][index], 'credit-everyday', ['和朋友聚餐', 'Dinner with friends'], 'food'],
      [4, ['55', '65', '60'][index], 'everyday', ['通勤停车', 'Commute parking'], 'transport'],
      [13, ['95', '65', '110'][index], 'hsa', ['HSA 支付门诊自付费用', 'Medical copay paid from HSA'], 'health'],
      [14, ['129', '99', '149'][index], 'credit-everyday', ['ML 系统工作坊', 'ML systems workshop'], 'education'],
      [17, ['62', '58', '69'][index], 'credit-travel', ['电动车充电', 'EV charging'], 'transport'],
      [9, ['285', '179', '248'][index], 'credit-everyday', ['家居与桌面用品', 'Home and desk essentials'], 'shopping'],
      [25, ['210', '260', '280'][index], 'credit-travel', ['加州周末短途旅行', 'California weekend trip'], 'travel'],
      [24, ['48', '72', '64'][index], 'credit-everyday', ['电影与现场演出', 'Cinema and live events'], 'entertainment'],
      [18, ['48', '35', '59'][index], 'credit-everyday', ['技术书籍', 'Technical books'], 'education'],
    ];
    for (const [date, amount, accountKey, merchant, category] of spending) transaction(day(date), 'expense', amount, accountKey, merchant, category);
    transaction(day(10), 'income', '150', 'taxable', ['ETF 现金分配', 'ETF cash distribution'], 'investment');
    transaction(day(20), 'income', '205', 'emergency', ['储蓄账户利息', 'Savings interest'], 'interest');
  }
  // Already vested shares become cash inside the same investment account.
  // Only the trading fee and subsequent transfers affect the account total;
  // the gross sale is never booked as salary or another new income item.
  const equitySale = {occurredOn: '2026-09-15', settledOn: '2026-09-16', withdrawnOn: '2026-09-17', accountId: id('vested-stock'), symbol: 'MSFT',
    openingQuantity: '300', openingPrice: '390', quantitySold: '80', remainingQuantity: '220', salePrice: '410', grossProceeds: '32800.00', fees: '12.00', netProceeds: '32788.00',
    transferredToChecking: '30000.00', retainedProceeds: '2788.00', openingCash: '1000.00', closingCash: '3788.00', proceedsAreIncome: false};
  transaction(equitySale.occurredOn, 'expense', '12', 'vested-stock', ['已归属股票卖出手续费', 'Vested-stock sale fee'], 'fees', {
    note: label('9 月卖出 80 股已归属 MSFT，虚构成交价每股 410 美元，毛售款 32,800 美元；扣 12 美元费用后现金增加 32,788 美元。股票与现金在同一账户内转换，售款不再次计收入。', 'Sold 80 vested MSFT shares at a fictional USD 410 each: gross proceeds USD 32,800, fee USD 12 and net cash USD 32,788. Shares convert to cash within the same account; gross proceeds are not new income.')});
  transfer(equitySale.withdrawnOn, '30000', 'vested-stock', 'everyday', ['已归属 RSU 售款转入 Chase', 'Vested RSU sale proceeds to Chase']);
  transfer('2026-09-18', '25000', 'everyday', 'taxable', ['股票售款转入购房准备金', 'Stock-sale proceeds to the home fund']);
  transaction('2026-09-08', 'expense', '920', 'credit-travel', ['个人欧洲旅行机票', 'Personal Europe-trip airfare'], 'travel');
  transaction('2026-10-18', 'expense', '450', 'credit-travel', ['个人欧洲旅行酒店预订', 'Personal Europe-trip hotel reservation'], 'travel');
  transaction('2026-10-16', 'expense', '-60', 'credit-everyday', ['桌面用品退款', 'Desk-supplies refund'], 'shopping', {
    note: label('虚构原购物退款，冲减支出并减少信用卡应付金额。', 'Fictional purchase refund that reduces spending and the card balance.')});

  for (const [names, targetAmount, currentAmount, targetDate, description] of [
    [['湾区首套住房首付', 'Bay Area first-home down payment'], '300000', '98750', '2028-06-01', ['对应 Schwab 中 SGOV 70,140 美元和现金 28,610 美元；包含已转入股票售款，不计未来 RSU，也不重复增加资产。', 'Matches SGOV USD 70,140 plus cash USD 28,610 in Schwab, including transferred stock-sale proceeds. No future RSUs or additional assets are counted.']],
    [['生活应急储备', 'Emergency reserve'], '72000', '65000', '2027-06-01', ['对应 Ally 现有储蓄，不与住房首付重叠。', 'Matches existing Ally savings and does not overlap the home down payment.']],
    [['职业休整准备金', 'Career-break fund'], '18000', '6000', '2027-09-01', ['从 Chase 现有现金中预留，余额仍只在账户中计算一次。', 'Earmarked from existing Chase cash, counted once in the account balance.']],
    [['欧洲旅行', 'Europe trip'], '6500', '2000', '2027-05-15', ['从 Chase 现金另预留 2,000 美元；与 IBKR 海外证券结算现金无关。', 'A separate USD 2,000 earmark in Chase cash, unrelated to IBKR overseas securities-settlement cash.']],
  ]) save('goals', {name: label(...names), targetAmount, currentAmount, currency: 'USD', targetDate, description: label(...description)});
  for (const [names, amount, category, subcategory] of [
    [['本月生活总支出', 'Total monthly living costs'], '9500', '', ''],
    [['餐饮预算', 'Food budget'], '1200', 'food', ''],
    [['个人 AI 工具', 'Personal AI tools'], '150', 'services', 'AI'],
    [['旅行预算', 'Travel budget'], '900', 'travel', ''],
    [['购物预算', 'Shopping budget'], '600', 'shopping', ''],
  ]) save('budgets', {name: label(...names), month: '2026-10', amount, currency: 'USD', category, subcategory, accountIds: []});
  for (const [kind, zh, english] of [
    ['note', 'Alex Morgan 居住在 San Mateo，在虚构公司 Aster Vale AI 担任资深 AI 基础设施工程师。这是独立财务人物，未改写数字分身示例；中英文使用同一账目并统一以美元汇总。', 'Alex Morgan lives in San Mateo and works as a senior AI infrastructure engineer at the fictional company Aster Vale AI. This independent Finance persona does not rewrite the digital-twin examples. Both languages use identical records and USD summaries.'],
    ['preference', '目前在湾区租房，优先保留应急储备并逐步积累首付；购房准备金仅对应 Schwab 的 SGOV 与现金，不假设已经拥有住房。', 'Currently renting in the Bay Area, keeping an emergency reserve and building a down payment. The home fund refers only to SGOV and cash in Schwab, with no home ownership assumed.'],
    ['constraint', '每半月 Chase 净到账 5,900 美元；401(k) 递延入账 1,125 美元与 HSA 入账 150 美元是受限账户资金流入，已从净工资中分离，不再从 Chase 扣款。医保每期 125 美元已由工资代扣，不重复算消费。', 'Each semi-monthly payroll puts USD 5,900 net into Chase, USD 1,125 directly into the 401(k), and USD 150 into the HSA. The latter two are restricted-account inflows, not additional Chase deductions. The USD 125 health premium is withheld from payroll and not counted again as spending.'],
    ['constraint', '前雇主 Microsoft 的已归属 RSU 与已购 ESPP 股票可以计入资产；当前 AI 公司的任何未归属 RSU 和未行权期权均不计入资产、收入或首付。股票卖出后的提取只是资产转移。', 'Vested Microsoft RSUs and previously purchased ESPP shares from a former employer count as assets. Any unvested RSUs or unexercised options at the current AI company are excluded from assets, income and the down payment. Withdrawing stock-sale proceeds is an asset transfer.'],
    ['goal', '只将实际发生的薪资、递延供款、HSA 入账和利息分配记为流入；信用卡还款、车贷本金和账户互转不计消费。HSA 医疗付款只记录一次，不推导加州税务待遇。', 'Record actual take-home pay, deferred payroll deposits, HSA funding and cash distributions as inflows. Card repayments, auto-loan principal and internal transfers are not spending. HSA medical payments are recorded once, without a California tax conclusion.'],
    ['note', '所有余额、工资扣款、股票成交价、订阅费和汇率都完全虚构。所有机构连接未启用，页面不提供真实报价、账户回报、税率或薪酬承诺。', 'All balances, payroll deductions, stock-sale prices, subscriptions and FX rates are entirely fictional. Institution connections are disabled; this page makes no claims about actual quotes, returns, tax rates or compensation.'],
  ]) save('memories', {kind, text: label(zh, english)});
  for (const symbol of ['MSFT', 'NVDA', 'VTI', 'SGOV']) {
    const [name, kind] = products[symbol];
    save('watchlist', {symbol, exchange: 'US', currency: 'USD', kind, name});
  }
  journal.saveDashboard({enabled: [...FINANCE_WIDGET_IDS], order: [...FINANCE_WIDGET_IDS], expectedRevision: 0, idempotencyKey: 'website-dashboard-layout'});
  const projected = projectFinance(native.document(), market), transactions = journal.read().transactions;
  const allAccounts = [...projected.accounts, ...projected.liabilities];
  function transactionDelta(account, rows) {
    let delta = 0n;
    for (const row of rows) {
      const amount = minor(row.amount);
      if (row.accountId === account.id) delta += row.kind === 'income' ? amount : row.kind === 'expense' ? amount * (account.kind === 'liability' ? 1n : -1n) : -amount;
      if (row.kind === 'transfer' && row.toAccountId === account.id) delta += amount * (account.kind === 'liability' ? -1n : 1n);
    }
    return delta;
  }
  // Explicit fictional valuation changes are separate from recorded cash flows.
  // Payroll contributions are recorded inflows. RSU sale appreciation includes
  // both held and sold shares; the gross sale itself is never another inflow.
  const initialAdjustments = new Map([['taxable', '-7000'], ['401k', '-15000'], ['hsa', '-820'], ['roth-ira', '-4200'],
    ['vested-stock', '-10400'], ['espp', '-1920'], ['car', '1500']].map(([key, value]) => [id(key), minor(value)]));
  const history = [['2026-07-31', 100], ['2026-08-31', 75], ['2026-09-30', 40], ['2026-10-04', 30], ['2026-10-11', 20], ['2026-10-18', 10], ['2026-10-25', 0]];
  const reconciliation = allAccounts.map(row => {
    const movement = transactionDelta(row, transactions), adjustment = initialAdjustments.get(row.id) || 0n;
    return {accountId: row.id, currency: row.currency, openingAmount: fixed(minor(row.amount) - movement + adjustment),
      netTransactionChange: fixed(movement), valuationChange: fixed(-adjustment), closingAmount: row.amount};
  });
  for (const [day, percent] of history) {
    clock = Date.parse(`${day}T19:00:00.000Z`);
    const later = transactions.filter(row => row.occurredOn > day);
    const values = allAccounts.map(row => ({...row, amount: fixed(minor(row.amount) - transactionDelta(row, later) + (initialAdjustments.get(row.id) || 0n) * BigInt(percent) / 100n), asOf: day}));
    const snapshotRates = projected.valuation.rates.map(row => ({...row, asOf: `${day}T19:00:00.000Z`}));
    const {snapshot} = journal.capture({...projected, accounts: values.filter(row => row.kind === 'asset'), liabilities: values.filter(row => row.kind === 'liability'),
      valuation: {...projected.valuation, rates: snapshotRates}, revision: digest({day, values, snapshotRates})}, {idempotencyKey: `website-snapshot-${day}`});
    // The shared capture defaults to Shanghai. This authored Pacific-time
    // scenario keeps its explicit calendar date without changing runtime accounting.
    store.put('financeJournal:snapshots', {...snapshot, date: day, timeZone});
  }
  clock = Date.parse(instant);
  for (const [asOf, score] of [['2026-07-31', 738], ['2026-08-31', 745], ['2026-09-30', 752], ['2026-10-24', 761]]) {
    const later = transactions.filter(row => row.occurredOn > asOf);
    const cards = allAccounts.filter(row => row.liabilityType === 'credit_card');
    const balance = cards.reduce((total, row) => total + minor(row.amount) - transactionDelta(row, later), 0n);
    const usage = `${fixed(balance * 100n, minor('35000'))}%`;
    save('creditRecords', {asOf, score, min: 300, max: 850, provider: label('演示信用档案', 'Demo credit file'), model: label('演示量表 300–850', 'Demo scale 300–850'),
      factors: [{name: label('循环额度使用率', 'Revolving utilization'), value: usage}, {name: label('近 12 个月逾期记录', 'Late payments in 12 months'), value: '0'},
        {name: label('信用记录长度', 'Credit history length'), value: label('9 年', '9 years')}],
      note: label('完全虚构的演示评分，不来自征信机构或真实 FICO 报告；使用率以两张卡当日余额和示例总额度 35,000 美元计算。', 'Entirely fictional score, not issued by a credit bureau or a real FICO report. Utilization uses the two card balances on that date and a fictional combined USD 35,000 limit.')});
  }
  const records = journal.read(), analysis = analyzeFinanceJournal(records, {today: FINANCE_EXAMPLE_DAY, month: '2026-10', currency: base, rates: projected.valuation.rates});
  return {...projected, journal: records, analysis, revision: digest({finance: projected.revision, journal: records.revision}),
    example: {fictional: true, asOf: FINANCE_EXAMPLE_DAY, persona: 'Alex Morgan',
      profile: {country: 'US', timeZone, region: 'San Francisco Bay Area', city: 'San Mateo', housing: 'renting', occupation: label('资深 AI 基础设施工程师', 'Senior AI infrastructure engineer'),
        employer: 'Aster Vale AI', employerFictional: true, formerEmployer: 'Microsoft', annualBaseSalary: '240000.00', monthlyTakeHomePay: '11800.00', payFrequency: 'semimonthly', currency: 'USD',
        payrollPerPeriod: {gross: '10000.00', taxWithholding: '3000.00', employee401k: '825.00', employer401kMatch: '300.00', hsa: '150.00', healthInsurance: '125.00', netPay: '5900.00'},
        unvestedEquityIncluded: false, unexercisedOptionsIncluded: false, foreignCashPurpose: 'overseas_securities_settlement', nextScheduledPayday: '2026-10-31', nextActualPayday: '2026-10-30'},
      payroll: payPeriods.map(([paidOn, scheduledOn]) => ({paidOn, scheduledOn, checkingAccountId: id('everyday'), retirementAccountId: id('401k'), hsaAccountId: id('hsa'),
        netPay: '5900.00', employee401k: '825.00', employer401kMatch: '300.00', retirementDeposit: '1125.00', hsaDeposit: '150.00'})),
      equitySales: [equitySale],
      reconciliation: {from: openingDay, through: FINANCE_EXAMPLE_DAY, basis: 'authored_opening_balances_plus_transactions_and_valuation_changes', accounts: reconciliation}}};
}
