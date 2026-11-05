import vm from 'node:vm';
import readline from 'node:readline';
let context;
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
  try{
    const msg=JSON.parse(line);
    if(!context){
      context=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false},microtaskMode:'afterEvaluate'});
      // Functions and promises remain native to the cell. The only bridge accepts JSON text.
      context.__send=Object.setPrototypeOf(text=>{send(JSON.parse(String(text)));},null);
      context.__args=JSON.stringify(msg.args);
      new vm.Script(`
        (()=>{const bridge=__send;delete globalThis.__send;
        globalThis.args=Object.freeze(JSON.parse(__args));delete globalThis.__args;
        let counter=0,settled=false;const waiting=new Map();
        globalThis.workflow=Object.freeze({run:(stageId,options={})=>new Promise((resolve,reject)=>{const id=++counter;waiting.set(id,{resolve,reject});bridge(JSON.stringify({type:'step',id,request:{stageId,...options}}));})});
        globalThis.__deliver=text=>{const msg=JSON.parse(text),item=waiting.get(msg.id);if(item){waiting.delete(msg.id);msg.error?item.reject(new Error(msg.error)):item.resolve(msg.value);}};
        Math.random=()=>{throw new Error('流程脚本不能使用随机数。');};
        globalThis.Date=undefined;globalThis.fetch=undefined;globalThis.process=undefined;
        globalThis.__finish=value=>{settled=true;bridge(JSON.stringify({type:'done',value:value??null}));};
        globalThis.__failure=e=>{settled=true;bridge(JSON.stringify({type:'error',error:String(e?.message??e)}));};
        globalThis.__checkStalled=()=>{if(!settled&&waiting.size===0)__failure(new Error('流程停滞：没有可完成的待执行步骤。'));};
        })();
      `).runInContext(context,{timeout:1000});
      new vm.Script(`(async()=>{${msg.source}\n})().then(__finish,__failure)`).runInContext(context,{timeout:1000});
    }else new vm.Script(`__deliver(${JSON.stringify(JSON.stringify(msg))})`).runInContext(context,{timeout:1000});
    new vm.Script('__checkStalled()').runInContext(context,{timeout:1000});
  }catch(e){send({type:'error',error:e.message});}
});
