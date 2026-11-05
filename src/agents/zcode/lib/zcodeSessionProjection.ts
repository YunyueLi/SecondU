// SecondU host adapter; not upstream presentation.
export function parseModelPickerValue(value:string){const split=value.indexOf('/');if(split<1)throw new Error('Invalid model');const [modelId,reasoningLevel]=value.slice(split+1).split('$');return {providerId:value.slice(0,split),modelId,options:reasoningLevel?{reasoningLevel}:undefined};}
