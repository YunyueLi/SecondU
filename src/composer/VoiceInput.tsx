import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { Popover } from '@openai/apps-sdk-ui/components/Popover';
import { Mic, MicFilled, Stop } from '@openai/apps-sdk-ui/components/Icon';
import { SpeechSession, recognitionConstructor, type SpeechPhase } from './speech';
import './composer.css';

export interface VoiceInputProps { onTranscript:(text:string)=>void; disabled?:boolean; contextKey?:string }

export function VoiceInput({onTranscript,disabled=false,contextKey='composer'}:VoiceInputProps) {
  const [open,setOpen]=useState(false);const [phase,setPhase]=useState<SpeechPhase>('idle');const [preview,setPreview]=useState('');const [error,setError]=useState('');
  const active=phase!=='idle';const session=useRef<SpeechSession|undefined>(undefined);const consented=useRef(false);const mounted=useRef(true);
  const context=useRef(contextKey);context.current=contextKey;const disabledRef=useRef(disabled);disabledRef.current=disabled;const transcript=useRef(onTranscript);transcript.current=onTranscript;
  const desktop=/Electron\//.test(navigator.userAgent);
  const supported=!desktop&&!!recognitionConstructor();
  function cancel(){const current=session.current;session.current=undefined;current?.cancel();setPhase('idle');setPreview('');}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const current=session.current;session.current=undefined;current?.cancel();};},[]);
  useEffect(()=>{cancel();setOpen(false);setError('');},[contextKey]);
  useEffect(()=>{if(disabled){cancel();setOpen(false);}},[disabled]);
  function start(){
    const Constructor=recognitionConstructor();if(disabled||desktop||!Constructor||session.current)return;
    consented.current=true;setError('');setPreview('');const origin=context.current;
    const current=()=>mounted.current&&context.current===origin&&!disabledRef.current&&session.current===next;
    let next:SpeechSession;
    try{next=new SpeechSession(Constructor,{
      onPhase:value=>{if(current())setPhase(value);},
      onPreview:value=>{if(current())setPreview(value);},
      onTranscript:value=>{if(!current())return;session.current=undefined;setPreview('');setOpen(false);transcript.current(value);},
      onError:value=>{if(!current())return;session.current=undefined;setPreview('');setError(value);},
    },document.documentElement.lang||navigator.language||'zh-CN');session.current=next;next.start();}
    catch{session.current=undefined;setPhase('idle');setError(t("当前环境无法启动语音识别，请使用系统听写。", "Speech recognition could not start. Please use system dictation."));}
  }
  function changeOpen(value:boolean){if(disabled)return;if(!value){cancel();setError('');}setOpen(value);if(value&&supported&&consented.current)start();}
  return <Popover open={open} onOpenChange={changeOpen}><Popover.Trigger><Button color="secondary" variant="ghost" uniform size="sm" className={`composer-voice-trigger ${active?'is-listening':''}`} disabled={disabled} aria-label={active?t("语音输入进行中", "Voice input in progress"):t("语音输入", "Voice input")}>{active?<MicFilled/>:<Mic/>}</Button></Popover.Trigger><Popover.Content side="top" align="end" width={260} minWidth={240} maxWidth={280} className="composer-voice-popover">
    <div className="composer-voice-content"><h3>{active?phase==='starting'?t("正在连接语音服务", "Connecting to speech service"):phase==='stopping'?t("正在整理语音", "Finishing transcription"):t("正在听你说", "Listening"):supported?t("语音输入", "Voice input"):t("当前环境无法语音转写", "Voice transcription unavailable")}</h3>
      {!supported?<><p>{desktop?t("当前桌面版尚未接入语音识别服务。", "This desktop app does not yet have a speech recognition service. "):t("这个浏览器没有提供可用的语音识别接口。", "This browser does not provide speech recognition. ")}{t("可以先聚焦输入框，再使用系统听写。", "Focus the text field, then use system dictation.")}</p><p className="composer-voice-note">{t("macOS 的听写和快捷键可在“系统设置 → 键盘 → 听写”中配置。", "On macOS, set up Dictation and its shortcut in System Settings → Keyboard → Dictation.")}</p><Button color="secondary" variant="outline" size="sm" onClick={()=>setOpen(false)}>{t("知道了", "Got it")}</Button></>:<>
        {!active&&<p>{t("语音可能交由浏览器的语音服务处理。转写只会加入草稿，不会自动发送。", "Your browser may send audio to its speech service. Transcripts are added to the draft and never sent automatically.")}</p>}
        {active&&<p className="composer-voice-preview" aria-live="polite">{preview||t("现在开始说话", "Start speaking")}</p>}
        {error&&<p className="composer-voice-error" role="alert">{error}</p>}
        <div className="composer-voice-actions">{active?<><Button color="secondary" variant="ghost" size="sm" onClick={()=>{cancel();setOpen(false);}}>{t("取消", "Cancel")}</Button><Button color="primary" size="sm" disabled={phase==='stopping'} onClick={()=>session.current?.stop()}><Stop/>{t("结束听写", "Finish dictation")}</Button></>:<><Button color="secondary" variant="ghost" size="sm" onClick={()=>setOpen(false)}>{t("取消", "Cancel")}</Button><Button color="primary" size="sm" onClick={start}><Mic/>{error?t("重新开始", "Try again"):t("开始语音输入", "Start voice input")}</Button></>}</div>
        {active&&<p className="composer-voice-note">{t("结束后加入草稿，发送前可修改。关闭则取消。", "Finish to add an editable draft. Closing cancels.")}</p>}
      </>}
    </div>
  </Popover.Content></Popover>;
}
