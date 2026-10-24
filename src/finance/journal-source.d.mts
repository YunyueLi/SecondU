type JournalSource = {kind?: unknown; provider?: unknown; environment?: unknown; fileName?: unknown; row?: unknown; fetchedAt?: unknown};
export function journalSourceLabel(source: JournalSource | null | undefined, language?: 'zh-CN' | 'en'): string;
export function journalSourceSnapshot(source: JournalSource | null | undefined): JournalSource;
