import { t } from '../i18n';
export type SpeechPhase='starting'|'listening'|'stopping'|'idle';
export interface RecognitionResult { readonly isFinal:boolean; readonly length:number; readonly [index:number]:{readonly transcript:string} }
export interface RecognitionEvent { readonly resultIndex:number; readonly results:{readonly length:number;readonly [index:number]:RecognitionResult} }
export interface Recognition {
  lang:string; continuous:boolean; interimResults:boolean; maxAlternatives:number;
  onstart:(()=>void)|null; onresult:((event:RecognitionEvent)=>void)|null;
  onerror:((event:{error:string;message?:string})=>void)|null; onend:(()=>void)|null;
  start:()=>void; stop:()=>void; abort:()=>void;
}
export type RecognitionConstructor=new()=>Recognition;
type SpeechCallbacks={onPhase:(phase:SpeechPhase)=>void;onPreview:(text:string)=>void;onTranscript:(text:string)=>void;onError:(message:string)=>void};

export function recognitionConstructor():RecognitionConstructor|undefined {
  const speechWindow=window as Window&{SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor};
  return speechWindow.SpeechRecognition||speechWindow.webkitSpeechRecognition;
}
export function speechError(code:string):string {
  const messages:Record<string,string>={
    'not-allowed':t("未获得麦克风权限。可在浏览器或系统设置中允许，再重新开始。", "Microphone permission was not granted. Allow it in browser or system settings, then try again."),
    'service-not-allowed':t("当前浏览器的语音服务不可用。请使用系统听写，或换用支持语音识别的浏览器。", "This browser’s speech service is unavailable. Use system dictation or a browser that supports speech recognition."),
    'audio-capture':t("没有找到可用的麦克风，或麦克风正被其他程序占用。", "No microphone is available, or another app is using it."),
    'network':t("无法连接浏览器的语音服务。请检查网络，或使用系统听写。", "Could not connect to the browser’s speech service. Check your network or use system dictation."),
    'no-speech':t("没有识别到语音。可以再试一次，或直接输入。", "No speech was detected. Try again or type your message."),
    'aborted':t("语音输入已停止，没有加入草稿。", "Voice input stopped. Nothing was added to the draft."),
    'language-not-supported':t("当前语音服务不支持这个语言，请使用系统听写。", "This speech service does not support the selected language. Use system dictation."),
  };
  return messages[code]||t("语音识别未完成。请重新开始，或使用系统听写。", "Speech recognition did not finish. Try again or use system dictation.");
}

// The browser owns audio capture and its recognition service. Only text is retained here.
// stop() asks for final results; cancel() discards them and disconnects every callback.
export class SpeechSession {
  private recognition:Recognition;
  private settled=false;
  private finals=new Map<number,string>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  constructor(Constructor:RecognitionConstructor,private callbacks:SpeechCallbacks,language='zh-CN') {
    this.recognition=new Constructor();
    this.recognition.lang=language;this.recognition.continuous=true;this.recognition.interimResults=true;this.recognition.maxAlternatives=1;
    this.recognition.onstart=()=>{if(this.settled)return;this.clearTimer();this.callbacks.onPhase('listening');};
    this.recognition.onresult=event=>{
      if(this.settled)return;const interim:string[]=[];
      for(let i=event.resultIndex;i<event.results.length;i++){const result=event.results[i];const text=result[0]?.transcript||'';if(result.isFinal)this.finals.set(i,text);else interim.push(text);}
      this.callbacks.onPreview([...this.finals.values(),...interim].join(' ').trim());
    };
    this.recognition.onerror=event=>this.fail(speechError(event.error));
    this.recognition.onend=()=>{
      if(this.settled)return;const text=[...this.finals.values()].join(' ').trim();this.settled=true;this.detach();this.callbacks.onPhase('idle');
      if(text)this.callbacks.onTranscript(text);else this.callbacks.onError(speechError('no-speech'));
    };
  }
  start(){if(this.settled)return;this.callbacks.onPhase('starting');try{this.timer=setTimeout(()=>this.fail(t("语音服务没有开始。请检查权限，或使用系统听写。", "The speech service did not start. Check permissions or use system dictation.")),15000);this.recognition.start();}catch{this.fail(t("无法开始语音输入。请检查麦克风权限或使用系统听写。", "Voice input could not start. Check microphone permissions or use system dictation."));}}
  stop(){if(this.settled)return;this.callbacks.onPhase('stopping');try{this.recognition.stop();this.clearTimer();if(!this.settled)this.timer=setTimeout(()=>this.fail(t("语音服务没有返回结果。此次内容未加入草稿，请重试。", "The speech service did not return a result. Nothing was added to the draft. Please try again.")),8000);}catch{this.fail(t("语音服务未能结束，此次内容未加入草稿。", "The speech service could not finish. Nothing was added to the draft."));}}
  cancel(){if(this.settled)return;this.settled=true;this.detach();try{this.recognition.abort();}catch{}this.callbacks.onPhase('idle');}
  private fail(message:string){if(this.settled)return;this.settled=true;this.detach();try{this.recognition.abort();}catch{}this.callbacks.onPhase('idle');this.callbacks.onError(message);}
  private clearTimer(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;}
  private detach(){this.clearTimer();this.recognition.onstart=null;this.recognition.onresult=null;this.recognition.onerror=null;this.recognition.onend=null;}
}
