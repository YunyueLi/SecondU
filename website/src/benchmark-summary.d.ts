declare module 'virtual:benchmark-summary' {
  const summary: {
    version: 'v2';
    directory: string;
    caseCount: number;
    planned: number;
    completed: number;
    repetitions: number;
    decision: {numerator: number; denominator: number};
    capabilities: {id: string; title: {zh: string; en: string}; decision: {numerator: number; denominator: number}}[];
    evidence: Record<string, string>;
  };
  export default summary;
}
