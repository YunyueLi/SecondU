export function readComposerDrafts(storage: Pick<Storage, 'getItem'>, key: string): Record<string, string>;
export function saveComposerDrafts(storage: Pick<Storage, 'setItem' | 'removeItem'>, key: string, drafts: Record<string, string>): boolean;
