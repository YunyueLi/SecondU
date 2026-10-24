const amount=value=>{if(typeof value!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error('金额须为非负数，最多两位小数。');const [whole,decimal='']=value.split('.');return BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));};
const formatted=value=>`${value<0n?'-':''}${(value<0n?-value:value)/100n}.${String((value<0n?-value:value)%100n).padStart(2,'0')}`;
const rounded=(n,d)=>{const sign=n<0n?-1n:1n,a=n<0n?-n:n;return sign*((a+d/2n)/d);};

/** Explicit assumptions only. This does not infer spending from account balances. */
export function calculateFinanceScenario(input){
  const keys=['startingAmount','monthlyIncome','monthlyExpense','plannedIncome','plannedExpense','oneTimeExpense','annualReturn','months'];
  if(!input||Object.keys(input).some(key=>!keys.includes(key)))throw new Error('情景参数无效。');
  const months=Number(input.months);if(!Number.isInteger(months)||months<1||months>600)throw new Error('期限须为 1—600 个月。');
  const rate=String(input.annualReturn);if(!/^-?\d+(?:\.\d{1,2})?$/.test(rate)||Number(rate)<-100||Number(rate)>100)throw new Error('假设年收益率须在 -100% 到 100% 之间。');
  const sign=rate.startsWith('-')?-1n:1n,rateParts=rate.replace('-','').split('.'),rateBps=sign*(BigInt(rateParts[0])*100n+BigInt((rateParts[1]||'').padEnd(2,'0')));
  let baseline=amount(input.startingAmount),planned=baseline-amount(input.oneTimeExpense);
  const baselineChange=amount(input.monthlyIncome)-amount(input.monthlyExpense),plannedChange=amount(input.plannedIncome)-amount(input.plannedExpense);
  const points=[{month:0,baseline:formatted(baseline),planned:formatted(planned)}];
  for(let month=1;month<=months;month++){
    // Returns apply to positive savings; a negative cash balance is not an assumed loan.
    baseline+=baselineChange+(baseline>0n?rounded(baseline*rateBps,120000n):0n);
    planned+=plannedChange+(planned>0n?rounded(planned*rateBps,120000n):0n);
    points.push({month,baseline:formatted(baseline),planned:formatted(planned)});
  }
  return {assumptions:{...input,months,annualReturn:rate},points,baselineEnd:formatted(baseline),plannedEnd:formatted(planned),difference:formatted(planned-baseline),firstNegativeMonth:points.find(row=>row.planned.startsWith('-'))?.month??null};
}
