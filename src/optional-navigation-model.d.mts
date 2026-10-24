export type OptionalWorkspace = 'agents' | 'artifacts' | 'finance';
export type NavigationPreferences = { pinned: readonly OptionalWorkspace[]; financeExpanded: boolean; agentsExpanded: boolean };
export type NavigationPreferenceMutation = { pin: { id: OptionalWorkspace; pinned: boolean } } | { financeExpanded: boolean } | { agentsExpanded: boolean } | { migrate: Partial<NavigationPreferences> };
export type NavigationPreferencesSnapshot = { value: NavigationPreferences; ready: boolean; busy: boolean; error: unknown; errorOperation: 'load' | 'save' | null };
export type NavigationPreferencesClient = {
  getSnapshot(): NavigationPreferencesSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<boolean>;
  setPinned(id: OptionalWorkspace, pinned: boolean): Promise<boolean>;
  setFinanceExpanded(expanded: boolean): Promise<boolean>;
  setAgentsExpanded(expanded: boolean): Promise<boolean>;
};
export const OPTIONAL_WORKSPACE_IDS: readonly OptionalWorkspace[];
export function normalizePinnedModules(value: unknown): OptionalWorkspace[];
export function readLegacyNavigationPreferences(storage: Pick<Storage, 'getItem'>, pinnedKey: string): Partial<NavigationPreferences> | null;
export function createNavigationPreferencesClient(options: {
  read(): Promise<NavigationPreferences | null>;
  write(mutation: NavigationPreferenceMutation): Promise<NavigationPreferences>;
  readLegacy(): Partial<NavigationPreferences> | null;
}): NavigationPreferencesClient;
