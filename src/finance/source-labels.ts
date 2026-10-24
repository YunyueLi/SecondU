import {t} from '../i18n';

const sourceLabels:Record<string,string>={
  '可用金额与存款':'Available balance and deposits','可用金额（记录）':'Recorded available balance','现金存款':'Cash deposit','存款明细':'Deposit details','现金明细':'Cash details',
  '现金与其他产品':'Cash and other products','余额':'Balance','余额宝':'Yu’e Bao','稳健理财':'Wealth management','现金合计':'Total cash','现金':'Cash','存款':'Deposit',
  '现金总额（账户折算）':'Cash total in account currency','银行折算金额':'Bank currency conversion','存款总额（银行折算）':'Deposits converted by the bank','基金总额（银行折算）':'Funds converted by the bank',
  '证券与基金资产（记录）':'Recorded securities and fund assets','证券资产':'Securities','基金资产':'Funds','朝朝宝':'Chao Chao Bao','持有总额':'Total held',
  '昨日收益（记录）':'Recorded return yesterday','累计收益（记录）':'Recorded cumulative return','综合七日年化（记录）':'Recorded seven-day annualized return',
  '黄金收益（记录）':'Recorded gold return','当日收益':'Daily return','基金收益（记录）':'Recorded fund return','昨日收益':'Yesterday’s return','持有收益':'Holding return','累计收益':'Cumulative return',
  '现金余额':'Cash balance','理财产品':'Wealth products',
  '每日':'Daily','每周':'Weekly','每月':'Monthly','频率待补充':'Frequency not recorded','基金定投':'Recurring fund investment',
};
export const financeSourceLabel=(label:string)=>t(label,sourceLabels[label]||label);
