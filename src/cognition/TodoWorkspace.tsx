import { useState } from 'react';
import type { ReactNode, FormEvent } from 'react';
import type { Bootstrap, Goal, GoalList } from '../../shared/contracts';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox';
import { Input } from '@openai/apps-sdk-ui/components/Input';
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea';
import { Select } from '@openai/apps-sdk-ui/components/Select';
import { Calendar, CalendarToday, CheckCircle, Document, Flag, Plus, Settings, X, ArrowRight } from '@openai/apps-sdk-ui/components/Icon';
import { ErrorNotice, Field } from '../components';
import { messageOf, write } from '../api';
import { getLocale, t } from '../i18n';
import { RecordDateInput } from './RecordDateInput';
import { ThemeDecoration } from '../themes/ThemeDecoration';

const inbox = 'goal-list-inbox';
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const listOf = (goal: Goal) => goal.listId || inbox;
const colors = () => [{value:'blue',label:t('蓝色','Blue')},{value:'orange',label:t('橙色','Orange')},{value:'purple',label:t('紫色','Purple')},{value:'green',label:t('绿色','Green')},{value:'red',label:t('红色','Red')},{value:'gray',label:t('灰色','Gray')}];
function dateLabel(value: string, today: string) { if(value === today)return t('今天','Today');const d = new Date(`${value}T12:00:00`);return Number.isFinite(d.getTime()) ? d.toLocaleDateString(getLocale(),{month:'short',day:'numeric'}) : value; }
type Props = {data:Bootstrap; refs:(ids:string[],compact?:boolean)=>ReactNode;onRefresh:()=>Promise<void>;onCreateTask:(prompt:string)=>void|Promise<void>};

export function TodoWorkspace({data,refs,onRefresh,onCreateTask}:Props) {
  const [view,setView] = useState('all');
  const [selectedId,setSelectedId] = useState<string>();
  const [query,setQuery] = useState('');
  const [newTitle,setNewTitle] = useState('');
  const [listEdit,setListEdit] = useState<Partial<GoalList>>();
  const [listName,setListName] = useState('');
  const [listColor,setListColor] = useState<GoalList['color']>('blue');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const today = todayKey();
  const lists = data.goalLists || [];
  const undone = data.goals.filter(goal=>goal.status!=='done');
  const smart = [
    {id:'today',label:t('今天','Today'),icon:<CalendarToday/>,color:'blue',items:undone.filter(goal=>goal.dueDate&&goal.dueDate<=today&&goal.status==='active')},
    {id:'scheduled',label:t('计划','Scheduled'),icon:<Calendar/>,color:'red',items:undone.filter(goal=>goal.dueDate)},
    {id:'all',label:t('全部','All'),icon:<Document/>,color:'gray',items:undone},
    {id:'flagged',label:t('旗标','Flagged'),icon:<Flag/>,color:'orange',items:undone.filter(goal=>goal.flagged)},
    {id:'completed',label:t('完成','Completed'),icon:<CheckCircle/>,color:'green',items:data.goals.filter(goal=>goal.status==='done')},
  ];
  const currentList = lists.find(list=>list.id===view);
  const currentSmart = smart.find(item=>item.id===view) || smart[2];
  const items = (currentList?undone.filter(goal=>listOf(goal)===view):currentSmart.items).filter(goal=>`${goal.title} ${goal.description}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>view==='completed'?(b.completedAt||'').localeCompare(a.completedAt||''):(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
  const selected = data.goals.find(goal=>goal.id===selectedId);
  const groupKey = (goal:Goal) => view==='scheduled' ? goal.dueDate||'' : view==='today' ? (goal.dueDate&&goal.dueDate<today?'overdue':'today') : view==='all' ? listOf(goal) : '';
  const groups = new Map<string,Goal[]>();for(const goal of items){const key=groupKey(goal);groups.set(key,[...(groups.get(key)||[]),goal]);}
  const heading = currentList?.name || currentSmart.label;
  const groupName = (key:string) => view==='scheduled'?dateLabel(key,today):view==='today'?(key==='overdue'?t('已过期','Overdue'):t('今天','Today')):lists.find(list=>list.id===key)?.name||t('提醒事项','Reminders');
  async function perform(action:()=>Promise<unknown>) { if(busy)return;setBusy(true);setError('');try{await action();await onRefresh();}catch(e){setError(messageOf(e));}finally{setBusy(false);} }
  async function patch(goal:Goal,changes:Record<string,unknown>) { await perform(()=>write(`/goals/${goal.id}`,changes,'PUT')); }
  async function addItem(e:FormEvent) {e.preventDefault();if(!newTitle.trim())return;await perform(async()=>{const goal=await write<Goal>('/goals',{title:newTitle,description:'',status:'active',listId:currentList?.id||inbox,flagged:view==='flagged',dueDate:view==='today'?today:undefined,sourceIds:[]});setNewTitle('');setSelectedId(goal.id);});}
  function editList(list:Partial<GoalList>) {setListEdit(list);setListName(list.name||'');setListColor(list.color||'blue');setError('');}
  function choose(next:string){setView(next);setSelectedId(undefined);setQuery('');}
  return <section className={`todo-workspace ${selected?'has-detail':''}`} aria-label={t('待办事项','Reminders')}>
    <aside className="todo-navigation">
      <div className="todo-smart-lists">{smart.map(item=><Button key={item.id} color="secondary" variant="ghost" className={`todo-smart todo-color-${item.color}`} selected={view===item.id} aria-pressed={view===item.id} onClick={()=>choose(item.id)}><span className="todo-smart-icon">{item.icon}</span><span className="todo-smart-label">{item.label}</span><strong>{item.items.length}</strong></Button>)}</div>
      <div className="todo-lists-heading"><h2>{t('我的清单','My lists')}</h2><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('添加清单','Add list')} onClick={()=>editList({})}><Plus/></Button></div>
      <nav className="todo-custom-lists" aria-label={t('我的清单','My lists')}>{lists.map(list=><Button key={list.id} color="secondary" variant="ghost" className={`todo-list-link todo-color-${list.color}`} selected={view===list.id} aria-pressed={view===list.id} onClick={()=>choose(list.id)}><span className="todo-list-dot"/><span>{list.name}</span><small>{undone.filter(goal=>listOf(goal)===list.id).length}</small></Button>)}</nav>
      {listEdit&&<form className="todo-list-editor" onSubmit={e=>{e.preventDefault();void perform(async()=>{const saved=await write<GoalList>(listEdit.id?`/goal-lists/${listEdit.id}`:'/goal-lists',{name:listName,color:listColor},listEdit.id?'PUT':'POST');setListEdit(undefined);choose(saved.id);});}}><Input aria-label={t('清单名称','List name')} value={listName} required autoFocus placeholder={t('清单名称','List name')} onChange={e=>setListName(e.target.value)}/><Select aria-label={t('清单颜色','List color')} value={listColor} options={colors()} onChange={option=>setListColor(option.value as GoalList['color'])}/><div><Button color="primary" size="sm" type="submit" disabled={busy}>{t('保存','Save')}</Button><Button color="secondary" variant="ghost" size="sm" type="button" onClick={()=>setListEdit(undefined)}>{t('取消','Cancel')}</Button></div></form>}
    </aside>
    <div className="todo-content">
      <header className={`todo-heading todo-color-${currentList?.color||currentSmart.color}`}><ThemeDecoration kind="now"/><h1>{heading}</h1><span>{items.length}</span>{currentList&&<Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('编辑清单','Edit list')} onClick={()=>editList(currentList)}><Settings/></Button>}</header>
      <div className="todo-search"><Input aria-label={t('搜索待办','Search reminders')} placeholder={t('搜索待办','Search reminders')} value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <ErrorNotice error={error}/>
      <div className="todo-items">{[...groups].map(([key,goals])=><section className="todo-group" key={key}>{key&&<h2>{groupName(key)}</h2>}{goals.map(goal=><div key={goal.id} className={`todo-row ${goal.id===selectedId?'is-selected':''} ${goal.status==='done'?'is-complete':''}`}><Checkbox className="todo-check" label={<span className="todo-sr-only">{goal.status==='done'?t(`重新开始：${goal.title}`,`Reopen: ${goal.title}`):t(`完成：${goal.title}`,`Complete: ${goal.title}`)}</span>} checked={goal.status==='done'} disabled={busy} onCheckedChange={checked=>void patch(goal,{status:checked?'done':'active'})}/><button className="todo-row-main" aria-pressed={selectedId===goal.id} onClick={()=>setSelectedId(goal.id)}><span className="todo-row-title">{goal.title}</span><span className="todo-row-meta">{goal.dueDate&&<time className={goal.status!=='done'&&goal.dueDate<today?'is-overdue':''} dateTime={goal.dueDate}>{dateLabel(goal.dueDate,today)}</time>}{view!=='all'&&!currentList&&<span>{lists.find(list=>list.id===listOf(goal))?.name||t('提醒事项','Reminders')}</span>}{goal.status==='paused'&&<span>{t('已暂停','Paused')}</span>}{goal.description&&<span className="todo-note-indicator">{t('有备注','Note')}</span>}</span></button><Button color="secondary" variant="ghost" uniform size="sm" className={`todo-row-flag ${goal.flagged?'is-flagged':''}`} aria-label={goal.flagged?t(`取消旗标：${goal.title}`,`Unflag: ${goal.title}`):t(`添加旗标：${goal.title}`,`Flag: ${goal.title}`)} aria-pressed={!!goal.flagged} disabled={busy} onClick={()=>void patch(goal,{flagged:!goal.flagged})}><Flag/></Button></div>)}</section>)}</div>
      {!items.length&&<p className="todo-empty">{query?t('没有匹配的待办','No matching reminders'):view==='completed'?t('还没有完成的事项','No completed reminders'):t('没有待办事项','No reminders')}</p>}
      {view!=='completed'&&<form className="todo-add" onSubmit={addItem}><Plus/><Input aria-label={t('新待办标题','New reminder title')} placeholder={t('添加提醒事项','Add a reminder')} value={newTitle} disabled={busy} onChange={e=>setNewTitle(e.target.value)}/>{newTitle.trim()&&<Button color="primary" size="sm" type="submit" disabled={busy}>{t('添加','Add')}</Button>}</form>}
    </div>
    {selected&&<TodoDetail key={`${selected.id}:${selected.updatedAt||''}`} goal={selected} lists={lists} refs={refs} busy={busy} onClose={()=>setSelectedId(undefined)} onSave={changes=>patch(selected,changes)} onCreateTask={onCreateTask}/>}
  </section>;
}

function TodoDetail({goal,lists,refs,busy,onClose,onSave,onCreateTask}:{goal:Goal;lists:GoalList[];refs:Props['refs'];busy:boolean;onClose:()=>void;onSave:(changes:Record<string,unknown>)=>Promise<void>;onCreateTask:Props['onCreateTask']}) {
  const [title,setTitle]=useState(goal.title),[description,setDescription]=useState(goal.description),[due,setDue]=useState(goal.dueDate||''),[listId,setListId]=useState(listOf(goal)),[flagged,setFlagged]=useState(!!goal.flagged);
  const dirty=title!==goal.title||description!==goal.description||due!==(goal.dueDate||'')||listId!==listOf(goal)||flagged!==!!goal.flagged;
  return <aside className="todo-detail" aria-label={t('待办详情','Reminder details')}><header><h2>{t('详情','Details')}</h2><Button color="secondary" variant="ghost" uniform size="sm" aria-label={t('关闭详情','Close details')} onClick={onClose}><X/></Button></header><form onSubmit={e=>{e.preventDefault();void onSave({title,description,dueDate:due,listId,flagged});}}><Field label={t('标题','Title')}><Textarea aria-label={t('待办标题','Reminder title')} value={title} required rows={2} onChange={e=>setTitle(e.target.value)}/></Field><Field label={t('备注','Notes')}><Textarea aria-label={t('待办备注','Reminder notes')} value={description} rows={4} placeholder={t('添加备注','Add notes')} onChange={e=>setDescription(e.target.value)}/></Field><Field label={t('日期','Date')}><RecordDateInput value={due} onChange={setDue} disabled={busy}/></Field><Field label={t('清单','List')}><Select aria-label={t('待办清单','Reminder list')} value={listId} options={lists.map(list=>({value:list.id,label:list.name}))} onChange={option=>setListId(option.value)}/></Field><Checkbox label={t('旗标','Flagged')} checked={flagged} onCheckedChange={setFlagged}/><Button color="primary" type="submit" disabled={busy||!dirty}>{t('保存更改','Save changes')}</Button></form>{goal.sourceIds.length>0&&<div className="todo-detail-sources"><h3>{t('资料来源','Sources')}</h3>{refs(goal.sourceIds,true)}</div>}<div className="todo-detail-actions"><Button color="secondary" variant="ghost" size="sm" disabled={busy} onClick={()=>void onSave({status:goal.status==='active'?'paused':'active'})}>{goal.status==='done'?t('重新开始','Reopen'):goal.status==='paused'?t('继续','Resume'):t('暂停','Pause')}</Button><Button color="secondary" variant="ghost" size="sm" onClick={()=>onCreateTask(t(`帮我推进这件事：${goal.title}。${goal.description}`,`Help me work on this: ${goal.title}. ${goal.description}`))}>{t('交给 SecondU','Ask SecondU')}<ArrowRight/></Button></div></aside>;
}
