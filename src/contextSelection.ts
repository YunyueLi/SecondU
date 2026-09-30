import type {Fact} from '../shared/contracts';
import {selectPersonalContext} from '../shared/personal-context.mjs';
/** A bounded local lookup; inferred and unreviewed entries never become facts. */
export function selectTaskContext(facts:Fact[],prompt:string):string[]{return selectPersonalContext(facts,prompt);}
export function selectDigitalTwinContext(facts:Fact[],prompt:string):string[]{return selectPersonalContext(facts,prompt,{baseline:true});}
