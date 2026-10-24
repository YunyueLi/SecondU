export function normalizeCatalogueQuery(query: string): string;
export function catalogueMatches(spec: readonly string[], query: string): boolean;
export function catalogueGroupFromHash<Group extends string>(hash: string, groups: readonly Group[]): Group | undefined;
export function catalogueGroupAtScroll<Group extends string>(headings: readonly { id: Group; top: number }[], readingLine: number): Group | undefined;
