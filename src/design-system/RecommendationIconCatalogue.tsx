import { useState } from 'react';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl';
import { Search } from '@openai/apps-sdk-ui/components/Icon';
import { recommendationPlatforms, recommendationSemantics, resolveRecommendationIcon, type RecommendationGroup } from '../../shared/recommendation-icons';
import { t, getLocale } from '../i18n';
import { compactSelectProps } from '../compactSelect';
import { RecommendationIcon } from './RecommendationIcon';
import { SuggestionRow } from './SuggestionRow';
import './recommendation-icons.css';

const label=(value:readonly [string,string])=>value[getLocale()==='en'?1:0];
const groupNames=():Record<RecommendationGroup,string>=>({work:t('工作','Work'),life:t('生活','Life'),create:t('创作','Creative'),organize:t('整理与跟进','Organization')});
/** An inspectable view of the same registry and resolver used by recommendation rows. */
export function RecommendationIconCatalogue(){
 const [query,setQuery]=useState(''),[view,setView]=useState('all'),[group,setGroup]=useState('all');
 const [text,setText]=useState(t('整理 Slack 上的用户反馈','Review user feedback in Slack')),[kind,setKind]=useState('auto'),[app,setApp]=useState('auto');
 const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const matches=(values:readonly string[])=>terms.every(term=>values.join(' ').toLowerCase().includes(term));
 const semanticItems=view==='apps'?[]:recommendationSemantics.filter(item=>(group==='all'||item.group===group)&&matches([item.id,...item.label,item.icon,...item.keywords]));
 const platformItems=view==='semantics'||group!=='all'?[]:recommendationPlatforms.filter(item=>matches([item.id,...item.label,...item.aliases]));
 const resolved=resolveRecommendationIcon({text,kind:kind==='auto'?undefined:kind,app:app==='auto'?undefined:app});
 const resolvedLabel=resolved.type==='platform'?label(recommendationPlatforms.find(item=>item.id===resolved.id)!.label):label(recommendationSemantics.find(item=>item.id===resolved.id)!.label);
 const reasons={'explicit-app':t('采用指定应用','Uses the specified app'),'explicit-kind':t('采用指定任务类型','Uses the specified task type'),keyword:t('根据文字匹配','Matched from the text'),fallback:t('未匹配到类型，使用通用图标','No specific match; using a general icon')};
 return <div className="recommendation-catalogue">
  <div className="recommendation-catalogue-toolbar"><Input value={query} onChange={event=>setQuery(event.target.value)} startAdornment={<Search/>} placeholder={t('搜索图标、任务或应用','Search icons, tasks or apps')} aria-label={t('搜索推荐图标','Search recommendation icons')}/><Select {...compactSelectProps} size="sm" aria-label={t('图标使用场景','Icon category')} value={group} onChange={option=>setGroup(option.value)} options={[{value:'all',label:t('所有场景','All categories')},...Object.entries(groupNames()).map(([value,label])=>({value,label}))]}/></div>
  <div className="recommendation-catalogue-navigation"><SegmentedControl size="sm" value={view} onChange={value=>{setView(value);if(value==='apps')setGroup('all');}} aria-label={t('图标目录类型','Icon directory type')}><SegmentedControl.Option value="all">{t('全部','All')}</SegmentedControl.Option><SegmentedControl.Option value="semantics">{t('任务图标','Task icons')}</SegmentedControl.Option><SegmentedControl.Option value="apps">{t('应用品牌','App brands')}</SegmentedControl.Option></SegmentedControl><span role="status">{t(`${semanticItems.length+platformItems.length} 个图标`,`${semanticItems.length+platformItems.length} icons`)}</span></div>
  <div className="recommendation-icon-grid">{semanticItems.map(item=><button type="button" key={item.id} aria-label={t(`预览${label(item.label)}图标`,`Preview ${label(item.label)} icon`)} onClick={()=>{setKind(item.id);setApp('auto');}}><RecommendationIcon kind={item.id}/><span>{label(item.label)}</span><small>{item.id}</small></button>)}{platformItems.map(item=><button type="button" key={item.id} aria-label={t(`预览${label(item.label)}品牌图标`,`Preview ${label(item.label)} brand icon`)} onClick={()=>setApp(item.id)}><RecommendationIcon app={item.id}/><span>{label(item.label)}</span><small>{item.id}</small></button>)}</div>
  {!semanticItems.length&&!platformItems.length&&<p className="recommendation-catalogue-empty">{t('没有匹配的图标，试试其他关键词。','No matching icons. Try another keyword.')}</p>}
  <section className="recommendation-resolver"><h4>{t('试试自动匹配','Try automatic matching')}</h4><label><span>{t('推荐内容','Recommendation text')}</span><Input value={text} maxLength={2000} onChange={event=>setText(event.target.value)} aria-label={t('推荐内容','Recommendation text')}/></label><div className="recommendation-resolver-fields"><label><span>{t('指定任务类型','Task type')}</span><Select {...compactSelectProps} value={kind} aria-label={t('指定任务类型','Task type')} options={[{value:'auto',label:t('自动识别','Automatic')},...recommendationSemantics.map(item=>({value:item.id,label:label(item.label)}))]} onChange={option=>setKind(option.value)}/></label><label><span>{t('指定应用','App')}</span><Select {...compactSelectProps} value={app} aria-label={t('指定应用','App')} options={[{value:'auto',label:t('自动识别','Automatic')},...recommendationPlatforms.map(item=>({value:item.id,label:label(item.label)}))]} onChange={option=>setApp(option.value)}/></label></div><div className="recommendation-resolver-preview"><SuggestionRow kind={kind==='auto'?undefined:kind} app={app==='auto'?undefined:app} href="#ui-recommendation-icons" onClick={event=>event.preventDefault()}>{text||t('从一个问题开始','Start with a question')}</SuggestionRow></div><p className="recommendation-resolver-result" role="status"><strong>{resolvedLabel}</strong><span>{reasons[resolved.reason]}{resolved.matched?t(`，匹配内容：${resolved.matched}`, `, matched: ${resolved.matched}`):''}</span></p><p className="recommendation-resolver-note">{t('指定应用优先，其次是指定任务类型，最后根据中英文内容匹配。所有匹配都在本机完成。','An explicit app takes priority, then an explicit task type, then Chinese or English text matching. Matching runs locally.')}</p></section>
 </div>;
}
