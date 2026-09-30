export const delegationPurposes: Readonly<Record<'consultation'|'collaboration'|'matching'|'transaction',{zh:string;en:string}>>;
export const delegationTerminalStates: string[];
export function parseDelegationLink(value:string): {kind:'delegation';name:string;url:string;id:string;hostname:string}|undefined;
