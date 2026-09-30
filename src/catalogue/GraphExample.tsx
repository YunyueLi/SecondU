import { useMemo, useState } from 'react';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { RelationshipGraph } from '../cognition/RelationshipGraph';
import { getGraphFixture } from '../cognition/graphFixture';
import { t, getLocale } from '../i18n';
import type { Bootstrap } from '../../shared/contracts';

function sampleData():Bootstrap {
  const members=[['本人','Self','万叶','Caspian','self'],['父亲','Father','万峥','Wan Zheng','father'],['母亲','Mother','叶岚','Ye Lan','mother'],['大学同学','University classmate','陈屿','Chen Yu','classmate'],['高中同学','High school classmate','林夏','Lin Xia','classmate'],['同事','Colleague','周予','Zhou Yu','colleague'],['同事','Colleague','顾清','Gu Qing','colleague'],['朋友','Friend','许牧','Xu Mu','friend'],['朋友','Friend','江澄','Jiang Cheng','friend']];
  return {...getGraphFixture(getLocale()),profile:{name:t('万叶','Caspian'),englishName:'Caspian',description:t('组件示例','Component example'),demo:true,selfPersonId:'catalogue-person-0'},sources:[{id:'catalogue-people-source',title:t('人物档案（组件库虚构样本）','People profiles (fictional catalogue sample)'),text:t('所有人物与关系均为组件示例。','All people and relationships are fictional component examples.'),kind:'document',demo:true,createdAt:'2026-09-30T00:00:00.000Z'}],people:members.map(([role,roleEn,name,nameEn],i)=>({id:`catalogue-person-${i}`,name:t(name,nameEn),role:t(role,roleEn),description:'',sourceIds:['catalogue-people-source']})),relationships:members.slice(1).map(([label,,,,labelEn],i)=>({id:`catalogue-relation-${i+1}`,from:'catalogue-person-0',to:`catalogue-person-${i+1}`,label:t(label,labelEn),description:'',sourceIds:['catalogue-people-source']}))};
}
export function GraphExample(){
  const [state,setState]=useState('normal');const locale=getLocale();
  const sample=useMemo(sampleData,[locale]);const empty=useMemo(()=>({...sample,people:[],relationships:[],sources:[]}),[sample]);
  return <div className="catalogue-graph-example"><SegmentedControl value={state} onChange={setState} aria-label={t('图谱示例状态','Graph example state')}><SegmentedControl.Option value="normal">{t('常规','Standard')}</SegmentedControl.Option><SegmentedControl.Option value="empty">{t('空白','Empty')}</SegmentedControl.Option><SegmentedControl.Option value="large">{t('800 人','800 people')}</SegmentedControl.Option></SegmentedControl><div className="catalogue-graph-stage"><RelationshipGraph key={state} data={state==='large'?getGraphFixture(locale):state==='empty'?empty:sample} refs={()=> <span>{t('组件库虚构样本','Fictional catalogue sample')}</span>} onRefresh={async()=>{}} readOnly/></div></div>;
}
