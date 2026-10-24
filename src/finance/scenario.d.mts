export type FinanceScenarioInput={startingAmount:string;monthlyIncome:string;monthlyExpense:string;plannedIncome:string;plannedExpense:string;oneTimeExpense:string;annualReturn:string;months:number};
export type FinanceScenarioResult={assumptions:FinanceScenarioInput;points:Array<{month:number;baseline:string;planned:string}>;baselineEnd:string;plannedEnd:string;difference:string;firstNegativeMonth:number|null};
export function calculateFinanceScenario(input:FinanceScenarioInput):FinanceScenarioResult;
