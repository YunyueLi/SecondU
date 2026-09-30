import {useRef,useState,type PointerEvent,type ReactNode} from 'react';
import {Button} from '@openai/apps-sdk-ui/components/Button';
import {Input} from '@openai/apps-sdk-ui/components/Input';
import {Textarea} from '@openai/apps-sdk-ui/components/Textarea';
import {Select} from '@openai/apps-sdk-ui/components/Select';
import {SegmentedControl} from '@openai/apps-sdk-ui/components/SegmentedControl';
import {ArrowLeft,ArrowRight,Chat,Check,ChevronRight,CloseBold,Filter,Heart,Reload,User} from '@openai/apps-sdk-ui/components/Icon';
import {Dialog,Field,RichText} from '../components';
import {ComposerSurface} from '../composer/ComposerSurface';
import {HitherMark} from '../HitherMark';
import {t,useLocale} from '../i18n';
import {DatingArtwork} from './DatingArtwork';
import {DATING_INTERESTS,DATING_PEOPLE,type DatingCopy,type DatingInterest,type DatingPerson} from './datingExamples';
import './dating-network.css';

const copy=(value:DatingCopy)=>t(value[0],value[1]);
type Preferences={gender:'all'|'women'|'men';minAge:string;maxAge:string;interests:DatingInterest[]};
type Decision={personId:string;choice:'pass'|'like'};
export type DatingNetworkProps={navigation?:ReactNode};
const initialPreferences:Preferences={gender:'all',minAge:'26',maxAge:'36',interests:['walks','books']};

function AgentConversation({person}:{person:DatingPerson}){
 return <div className="messages dating-agent-conversation" aria-label={t('Agent 交流示例','Example agent conversation')}>
  {person.conversation.map((message,index)=><article key={index} className={'message message-'+(index===1?'assistant':'user')}>
   <div className="message-author">{index===1?copy(person.name)+t('的 SecondU',"'s SecondU"):t('你的 SecondU','Your SecondU')}</div>
   <RichText className="message-content">{copy(message)}</RichText>
  </article>)}
 </div>;
}

export function DatingNetwork({navigation}:DatingNetworkProps={}){
 useLocale();
 const [preferences,setPreferences]=useState<Preferences>(initialPreferences);
 const [draftPreferences,setDraftPreferences]=useState<Preferences>(initialPreferences);
 const [editing,setEditing]=useState(false);
 const [view,setView]=useState<'discover'|'liked'>('discover');
 const [detail,setDetail]=useState<'summary'|'conversation'>('summary');
 const [insightOpen,setInsightOpen]=useState(false);
 const [decisions,setDecisions]=useState<Decision[]>([]);
 const [selectedId,setSelectedId]=useState<string>();
 const [drag,setDrag]=useState(0);
 const [dragging,setDragging]=useState(false);
 const [notice,setNotice]=useState('');
 const [draftPerson,setDraftPerson]=useState<DatingPerson>();
 const [draft,setDraft]=useState('');
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const pointer=useRef<{id:number;x:number;y:number;delta:number}|null>(null);
 const common=(person:DatingPerson)=>DATING_INTERESTS.filter(interest=>preferences.interests.includes(interest.id)&&person.interests.includes(interest.id));
 const pool=DATING_PEOPLE.filter(person=>(preferences.gender==='all'||person.gender===preferences.gender)&&person.age>=Number(preferences.minAge)&&person.age<=Number(preferences.maxAge)).sort((a,b)=>common(b).length-common(a).length);
 const liked=DATING_PEOPLE.filter(person=>decisions.some(decision=>decision.personId===person.id&&decision.choice==='like'));
 const remaining=pool.filter(person=>!decisions.some(decision=>decision.personId===person.id));
 const person=view==='discover'?remaining[0]:liked.find(item=>item.id===selectedId)||liked[0];
 const validAge=Number.isInteger(Number(draftPreferences.minAge))&&Number.isInteger(Number(draftPreferences.maxAge))&&Number(draftPreferences.minAge)>=18&&Number(draftPreferences.maxAge)<=100&&Number(draftPreferences.minAge)<=Number(draftPreferences.maxAge);

 function decide(choice:Decision['choice']){
  if(!person||view!=='discover')return;
  setDecisions(current=>[...current.filter(item=>item.personId!==person.id),{personId:person.id,choice}]);
  setNotice(choice==='like'?t('已记下你想认识'+copy(person.name)+'。','Saved your interest in '+copy(person.name)+'.'):t('已跳过当前推荐。','Recommendation skipped.'));
  pointer.current=null;setDrag(0);setDragging(false);
 }
 const undoId=[...decisions].reverse().find(decision=>pool.some(candidate=>candidate.id===decision.personId))?.personId;
 function undo(){if(!undoId)return;setDecisions(current=>current.filter(decision=>decision.personId!==undoId));setNotice('');setDrag(0);}
 function pointerDown(event:PointerEvent<HTMLElement>){
  if(view!=='discover'||event.button!==0||!event.isPrimary||(event.target as HTMLElement).closest('button'))return;
  pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY,delta:0};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function pointerMove(event:PointerEvent<HTMLElement>){
  const start=pointer.current;if(!start||start.id!==event.pointerId)return;
  const delta=event.clientX-start.x,vertical=event.clientY-start.y;
  if(!dragging&&Math.abs(delta)<Math.abs(vertical)*1.15)return;
  start.delta=delta;if(Math.abs(delta)>8){setDragging(true);setDrag(Math.max(-180,Math.min(180,delta)));}
 }
 function pointerEnd(event:PointerEvent<HTMLElement>){
  const start=pointer.current;if(!start||start.id!==event.pointerId)return;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  pointer.current=null;setDragging(false);setDrag(0);
  if(Math.abs(start.delta)>=80)decide(start.delta>0?'like':'pass');
 }
 function cancelDrag(){pointer.current=null;setDragging(false);setDrag(0);}
 function showPreferences(){setDraftPreferences({...preferences,interests:[...preferences.interests]});setEditing(true);}
 function prepareOpening(target:DatingPerson){setDraftPerson(target);setDraft(drafts[target.id]||copy(target.opening));}
 function removeInterest(target:DatingPerson){setDecisions(current=>current.filter(item=>item.personId!==target.id));setNotice(t('已撤回这次意愿。','Your interest has been withdrawn.'));}

 return <section className="dating-network" aria-label="Agent Dating">
  {navigation}
  <div className="dating-toolbar"><SegmentedControl value={view} onChange={value=>{setView(value as 'discover'|'liked');cancelDrag();setNotice('');}} size="sm" aria-label={t('约会视图','Dating view')}><SegmentedControl.Option value="discover">{t('为你推荐','For you')}</SegmentedControl.Option><SegmentedControl.Option value="liked">{t('想认识的人','Interested')} {liked.length>0&&<span className="dating-count">{liked.length}</span>}</SegmentedControl.Option></SegmentedControl><span className="dating-example-label">{t('虚构人物与交流示例','Fictional profiles and conversations')}</span><Button color="secondary" variant="ghost" size="sm" onClick={showPreferences}><Filter/>{t('偏好','Preferences')}</Button></div>
  {view==='liked'&&liked.length>0&&<div className="dating-saved-picker" aria-label={t('选择想认识的人','Choose a person')} role="group">{liked.map(item=><Button key={item.id} color="secondary" variant={person?.id===item.id?'soft':'ghost'} size="sm" onClick={()=>setSelectedId(item.id)}><User/>{copy(item.name)}</Button>)}</div>}

  <div className="dating-stage">
   {person?<><div className="dating-card-column">
    <article className={'dating-profile-card'+(dragging?' is-dragging':'')} tabIndex={view==='discover'?0:-1} role="group" aria-label={copy(person.name)+(view==='discover'?t('的推荐资料。按左方向键跳过，按右方向键表达兴趣。',"'s profile. Press left to pass or right to express interest."):t('的个人资料',"'s profile"))} onKeyDown={event=>{if(view!=='discover'||event.target!==event.currentTarget)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();decide(event.key==='ArrowRight'?'like':'pass');}}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={cancelDrag} style={{transform:drag?'translate3d('+drag+'px,0,0) rotate('+drag/30+'deg)':undefined}}>
     <div className="dating-card-art"><DatingArtwork/><span className="dating-art-caption">{t('一次可能的相遇','A possible beginning')}</span>{Math.abs(drag)>22&&<span className={'dating-swipe-cue '+(drag>0?'is-like':'is-pass')} aria-hidden="true">{drag>0?<Heart/>:<ArrowLeft/>}{drag>0?t('想认识','Interested'):t('再看看','Keep looking')}</span>}</div>
     <div className="dating-profile-copy"><div className="dating-person-title"><h2>{copy(person.name)} <span>{person.age}</span></h2></div><p className="dating-person-work"><span className="inline-metadata"><span>{copy(person.city)}</span><span>{copy(person.occupation)}</span></span></p><p className="dating-person-intro">{copy(person.introduction)}</p><div className="dating-interests">{DATING_INTERESTS.filter(interest=>person.interests.includes(interest.id)).map(interest=><span key={interest.id}>{copy(interest.label)}</span>)}</div><button type="button" className="dating-insight-entry" onClick={()=>setInsightOpen(true)}><HitherMark/><span><strong>{t('查看 Agent 匹配分析','View the agent match review')}</strong></span><ArrowRight/></button></div>
    </article>
    {view==='discover'?<><div className="dating-swipe-actions"><Button color="secondary" variant="outline" size="lg" className="dating-pass" onClick={()=>decide('pass')}><CloseBold/>{t('再看看','Pass')}</Button><Button color="primary" size="lg" className="dating-like" onClick={()=>decide('like')}><Heart/>{t('想认识','Interested')}</Button></div><div className="dating-card-foot"><Button color="secondary" variant="ghost" size="sm" disabled={!undoId} onClick={undo} aria-label={t('撤销上次选择','Undo last choice')}><Reload/>{t('撤销','Undo')}</Button><span><ArrowLeft/>{t('跳过','Pass')}<span className="dating-hint-divider"/>{t('想认识','Interested')}<ArrowRight/></span></div></>:<div className="dating-saved-actions"><Button color="secondary" variant="ghost" onClick={()=>removeInterest(person)}>{t('撤回意愿','Withdraw interest')}</Button><Button color="primary" onClick={()=>prepareOpening(person)}><Chat/>{drafts[person.id]?t('查看开场白','View opening'):t('准备开场白','Prepare an opening')}</Button></div>}
   </div>
   {insightOpen&&<Dialog title={t('为什么推荐你们认识','Why your agents suggested meeting')} className="dating-insight-dialog" onClose={()=>setInsightOpen(false)}><div className="dating-agent-panel">
    <div className="dating-agent-heading"><HitherMark/><div><h2>{view==='liked'?t('匹配分析','Match review'):t('共同兴趣与匹配依据','Shared interests and match rationale')}</h2><p>{t('Agent 初筛','Agent review')}<ChevronRight/>{t('双方推荐','Mutual suggestions')}<ChevronRight/>{t('本人决定','Your choice')}</p></div></div>
    <SegmentedControl value={detail} onChange={value=>setDetail(value as 'summary'|'conversation')} size="sm" aria-label={t('查看推荐依据或 Agent 交流','Recommendation or agent conversation')}><SegmentedControl.Option value="summary">{t('推荐依据','Why this person')}</SegmentedControl.Option><SegmentedControl.Option value="conversation">{t('Agent 交流','Agent conversation')}</SegmentedControl.Option></SegmentedControl>
    <div className="dating-agent-body">
     {detail==='conversation'?<AgentConversation person={person}/>:<div className="dating-reasons"><section><h3>{t('有话可聊','Something to talk about')}</h3><p>{common(person).length?common(person).map(interest=>copy(interest.label)).join(t('、',', ')):t('可以先从这段自我介绍聊起。','Start with something in their introduction.')}</p></section><section><h3>{t('相处的节奏','A comfortable pace')}</h3><p>{copy(person.pace)}</p></section><section><h3>{t('可以这样开口','A first conversation')}</h3><p>{copy(person.opening)}</p></section><Button color="secondary" variant="ghost" size="sm" onClick={()=>setDetail('conversation')}>{t('看看 Agent 怎么聊','See the agent conversation')}<ArrowRight/></Button></div>}
    </div>
    <div className="dating-decision-note"><Heart/><p>{view==='liked'?t('你已表达兴趣。只有双方本人都愿意，才进一步联系。','You’ve expressed interest. A connection moves forward only when both people choose to.'):t('Agent 提供建议。要不要进一步认识，由你决定。','Your agent offers a suggestion. Getting to know each other is your decision.')}</p></div>
   </div></Dialog>}</>:<div className="dating-empty"><DatingArtwork/><h2>{view==='liked'?t('暂无感兴趣的人','No saved interests'):pool.length?t('已浏览全部推荐','All recommendations reviewed'):t('暂无符合条件的推荐','No matching recommendations')}</h2><p>{view==='liked'?t('选择“想认识”后，可在这里查看个人资料与匹配分析。','Choose Interested to save a profile and review the match here.'):pool.length?t('可以回看上一次选择，或调整偏好。','Revisit your last choice or adjust your preferences.'):t('这组示例中暂时没有符合当前偏好的人。','No profiles in this example set fit your current preferences.')}</p><div>{view==='liked'?<Button color="primary" onClick={()=>setView('discover')}>{t('浏览推荐','Browse recommendations')}<ArrowRight/></Button>:<><Button color="secondary" variant="outline" onClick={showPreferences}>{t('调整偏好','Adjust preferences')}</Button>{undoId&&<Button color="primary" onClick={undo}><Reload/>{t('回看上一位','Revisit the last person')}</Button>}</>}</div></div>}
  </div>
  <p className="dating-notice" role="status" aria-live="polite">{notice}</p>

  {editing&&<Dialog title={t('你期待怎样的相遇？','What kind of connection?')} className="dating-preferences-dialog" onClose={()=>setEditing(false)}><div className="dating-preferences">
   <Field label={t('希望认识','Interested in meeting')}><Select value={draftPreferences.gender} onChange={option=>setDraftPreferences(current=>({...current,gender:option.value as Preferences['gender']}))} options={[{value:'all',label:t('不限性别','All genders')},{value:'women',label:t('女性','Women')},{value:'men',label:t('男性','Men')}]} /></Field>
   <div className="dating-age-fields"><Field label={t('年龄下限','Minimum age')}><Input type="number" min={18} max={100} value={draftPreferences.minAge} onChange={event=>setDraftPreferences(current=>({...current,minAge:event.target.value}))}/></Field><Field label={t('年龄上限','Maximum age')}><Input type="number" min={18} max={100} value={draftPreferences.maxAge} onChange={event=>setDraftPreferences(current=>({...current,maxAge:event.target.value}))}/></Field></div>
   {!validAge&&<p className="dating-field-error">{t('请输入 18–100 岁之间的有效范围。','Enter a valid age range between 18 and 100.')}</p>}
   <fieldset className="dating-interest-picker"><legend>{t('想从哪些话题聊起','Things you would like to talk about')}</legend><div>{DATING_INTERESTS.map(interest=><Button key={interest.id} color="secondary" variant={draftPreferences.interests.includes(interest.id)?'soft':'outline'} size="sm" aria-pressed={draftPreferences.interests.includes(interest.id)} onClick={()=>setDraftPreferences(current=>({...current,interests:current.interests.includes(interest.id)?current.interests.filter(id=>id!==interest.id):[...current.interests,interest.id]}))}>{draftPreferences.interests.includes(interest.id)&&<Check/>}{copy(interest.label)}</Button>)}</div></fieldset>
   <footer><Button color="secondary" variant="ghost" onClick={()=>setEditing(false)}>{t('取消','Cancel')}</Button><Button color="primary" disabled={!validAge||!draftPreferences.interests.length} onClick={()=>{setPreferences(draftPreferences);setEditing(false);setView('discover');setNotice('');cancelDrag();}}>{t('更新推荐','Update suggestions')}<ArrowRight/></Button></footer>
  </div></Dialog>}
  {draftPerson&&<Dialog title={t('先想好怎么开口','A thought for your first conversation')} className="dating-opening-dialog" onClose={()=>setDraftPerson(undefined)}><div className="dating-opening-content"><div className="messages"><article className="message message-assistant"><div className="message-author"><span className="assistant-avatar"><HitherMark/></span>SecondU</div><RichText className="message-content">{t('从共同话题开始就好。先留一份草稿，等双方都愿意认识时再用。','A shared interest is a good place to start. Keep a draft for when both of you decide to connect.')}</RichText></article></div><ComposerSurface compact={false} onSubmit={event=>{event.preventDefault();if(!draft.trim())return;setDrafts(current=>({...current,[draftPerson.id]:draft.trim()}));setDraftPerson(undefined);setNotice(t('开场白已保存在此页。','Your opening is saved on this page.'));}}><div className="composer-input"><Textarea rows={3} value={draft} maxLength={2000} onChange={event=>setDraft(event.target.value)} aria-label={t('开场白草稿','Opening message draft')} placeholder={t('写一句你想说的话…','Write something you’d like to say…')}/></div><div className="composer-trailing"><Button type="submit" color="primary" size="sm" disabled={!draft.trim()}>{t('保存草稿','Save draft')}<Check/></Button></div></ComposerSurface></div></Dialog>}
 </section>;
}

