/** Keep the production date validators; exclude journal persistence and providers. */
export function portableFinanceDates(source, arithmeticPath) {
  const start=source.indexOf('export const journalToday='),end=source.indexOf('\nfunction sourceOf(',start);
  if(start<0||end<0)throw new Error('Finance date validator boundary changed.');
  return `import {fail} from ${JSON.stringify(arithmeticPath)};\n${source.slice(start,end)}\n`;
}
