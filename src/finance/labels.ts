import {t} from '../i18n.ts';

// Stable taxonomy keys stay independent of the selected display language.
const assets:Record<string,readonly [string,string]>={
 cash:['现金与存款','Cash and deposits'],investment:['投资账户','Investment accounts'],
 real_estate:['房地产','Real estate'],vehicle:['车辆','Vehicles'],valuable:['贵重物品','Valuables'],
 insurance:['保险现金价值','Insurance cash value'],receivable:['应收款','Receivables'],business:['企业权益','Business equity'],other:['其他资产','Other assets'],
 stock:['股票','Stocks'],etf:['ETF','ETFs'],fund:['基金','Funds'],bond:['债券','Bonds'],gold:['黄金','Gold'],crypto:['加密资产','Crypto assets'],option:['期权','Options'],futures:['期货','Futures'],
 cash_management:['现金管理','Cash management'],security:['其他证券','Other securities'],wealth:['理财产品','Wealth products'],
 unclassified:['待分类','Unclassified'],rounding:['折算尾差','Rounding adjustment'],valuation_adjustment:['估值差额','Valuation adjustment'],
};
const liabilities:Record<string,readonly [string,string]>={
 credit_card:['信用卡','Credit cards'],mortgage:['住房贷款','Mortgages'],vehicle_loan:['车辆贷款','Vehicle loans'],personal_loan:['个人借款','Personal loans'],other:['其他负债','Other liabilities'],
};
export function financeAssetTypeLabel(type:string,fallback?:string){if(type==='other'&&fallback==='待分类资产')return t(fallback,'Unclassified assets');const pair=assets[type];return pair?t(pair[0],pair[1]):fallback??type;}
export function financeLiabilityTypeLabel(type:string,fallback?:string){if(type==='other'&&fallback==='待分类负债')return t(fallback,'Unclassified liabilities');const pair=liabilities[type];return pair?t(pair[0],pair[1]):fallback??type;}
