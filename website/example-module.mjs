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

/** Keep first paint independent of public development documents. Task context,
 * traces and feedback are computed by ExampleRuntime before recorded responses.
 * The complete canonical export remains the source for both partitions.
 */
export function partitionCanonicalExampleData(examples) {
  const initial = {}, development = {};
  for (const [language, example] of Object.entries(examples)) {
    const firstResponses = {}, developmentResponses = {};
    for (const [route, value] of Object.entries(example.responses ?? {})) {
      if (route.startsWith('/development/')) developmentResponses[route] = value;
      else if (!/^\/tasks\/[^/]+\/(?:context|trace|feedback)$/.test(route)) firstResponses[route] = value;
    }
    initial[language] = { ...example, responses: firstResponses };
    development[language] = { responses: developmentResponses };
  }
  return { initial, development };
}
