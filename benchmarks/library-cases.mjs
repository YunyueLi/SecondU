// Entirely fictional. The questions/gold references are never given to indexing.
export const documents = [
  ['项目/蓝帆-计划.md', '虚构材料。2026-10-01 蓝帆项目：原计划周五发布，林宁负责验收。'],
  ['项目/蓝帆-预算.md', '虚构材料。2026-10-02 蓝帆项目预算尚未批准，财务要求等待书面回复。'],
  ['项目/蓝帆-取消.md', '虚构材料。2026-10-03 蓝帆项目：取消周五发布，待预算批准后重新排期。'],
  ['项目/采购.txt', '虚构材料。采购单号 雨桥-017，总价 12560 元，签收日期 2026-09-12。'],
  ['人物/星帆公司-林宁.md', '虚构材料。星帆公司的林宁是设计师，擅长插画。此人不是蓝帆项目负责人林宁。'],
  ['人物/蓝帆项目-林宁.md', '虚构材料。蓝帆项目的林宁负责验收。联系电话尚未提供。不要使用星帆公司同名设计师的资料。'],
  ['生活/日记.md', '虚构材料。2026-10-06：周末我宁愿一个人在家看书，也不去热闹的聚餐。'],
  ['生活/偏好修订.md', '虚构材料。2026-09-01：以前我说喜欢清晨开会。2026-10-08：我现在改为下午开会；这项修改今后适用。'],
  ['生活/单次例外.md', '虚构材料。2026-10-09：为了赶当天飞机，10月10日那一次会议放在早上；不改变以后下午开会的偏好。'],
  ['资料/旅行报销.md', '虚构材料。旅行费用：住宿 680 元，交通 240 元。报销要附发票。'],
  ['资料/English.txt', 'Fictional record. Project Cedar delivery was postponed until the supplier confirms the shipment.'],
  ['资料/长记录.md', '虚构材料。蓝松项目原计划六月交付。\n' + '虚构无关观察：今天看到云朵和树叶。\n'.repeat(450) + '蓝松项目后续修订：六月交付已取消，新的日期尚未确定。'],
];
export const cases = [
  { id: 'identifier', question: '雨桥-017 的总价和签收日期是什么？', query: '雨桥-017', gold: ['项目/采购.txt'], quotes: ['12560', '2026-09-12'] },
  { id: 'chinese', question: '旅行费用如何报销？', query: '旅行费用', gold: ['资料/旅行报销.md'], quotes: ['发票'] },
  { id: 'cross-source', question: '蓝帆为什么没有按周五发布？', query: '蓝帆', gold: ['项目/蓝帆-计划.md', '项目/蓝帆-预算.md', '项目/蓝帆-取消.md'], quotes: ['取消周五发布', '尚未批准'] },
  { id: 'identity', question: '蓝帆项目的林宁负责什么？', query: '蓝帆 林宁', gold: ['人物/蓝帆项目-林宁.md'], quotes: ['负责验收'] },
  { id: 'correction', question: '我现在一般喜欢什么时候开会？', query: '开会', gold: ['生活/偏好修订.md'], quotes: ['现在改为下午'] },
  { id: 'exception', question: '10月10日早上开会是否意味着以后都改早上？', query: '会议 偏好', gold: ['生活/偏好修订.md', '生活/单次例外.md'], quotes: ['不改变以后下午', '今后适用'] },
  { id: 'long-update', question: '蓝松六月交付的安排后来改变了吗？', query: '蓝松 交付', gold: ['资料/长记录.md'], quotes: ['六月交付已取消'] },
  { id: 'english', question: 'What happened to the Cedar shipment?', query: 'Cedar shipment', gold: ['资料/English.txt'], quotes: ['postponed'] },
  { id: 'semantic-gap', question: '我更喜欢独处还是社交？', query: '独处 社交', gold: ['生活/日记.md'], quotes: ['一个人在家看书'] },
  { id: 'absent', question: '雪岭公司的融资金额是多少？', query: '雪岭 融资', gold: [], quotes: [] },
];
