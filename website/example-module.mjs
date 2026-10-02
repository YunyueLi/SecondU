/** Share identical build-time responses while retaining each locale's own map.
 * The fixture adapter clones a selected locale before exposing mutable data.
 */
export function createCanonicalExampleModule(examples) {
  const locales = Object.entries(examples);
  const shared = {};
  if (locales.length > 1) {
    for (const [route, value] of Object.entries(locales[0][1].responses ?? {})) {
      const encoded = JSON.stringify(value);
      if (encoded !== undefined && locales.every(([, example]) =>
        Object.hasOwn(example.responses ?? {}, route) && JSON.stringify(example.responses[route]) === encoded)) {
        shared[route] = value;
      }
    }
  }
  const entries = locales.map(([language, example]) => {
    const { responses, ...fields } = example;
    if (!responses) return `${JSON.stringify(language)}:${JSON.stringify(example)}`;
    const own = Object.fromEntries(Object.entries(responses).filter(([route]) => !Object.hasOwn(shared, route)));
    return `${JSON.stringify(language)}:{...${JSON.stringify(fields)},responses:{...sharedResponses,...${JSON.stringify(own)}}}`;
  });
  return `const sharedResponses=${JSON.stringify(shared)};\nexport default {${entries.join(',')}};\n`;
}
