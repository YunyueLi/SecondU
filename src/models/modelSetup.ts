import type { ProviderSettings } from '../../shared/contracts';

export type ModelSetupDraft = {
  provider: ProviderSettings['provider'] | '';
  name: string;
  baseUrl: string;
  api: ProviderSettings['api'];
  reasoningEffort: ProviderSettings['reasoningEffort'];
  model: string;
  apiKey: string;
  appTitle: string;
};
type SetupProvider = { id: ProviderSettings['provider']; name: string; baseUrl: string; api: ProviderSettings['api']; reasoningEffort?: ProviderSettings['reasoningEffort'] };

export function draftForProvider(current: ModelSetupDraft, provider: SetupProvider): ModelSetupDraft {
  if (current.provider === provider.id) return current;
  return { provider: provider.id, name: provider.name, baseUrl: provider.baseUrl, api: provider.api, reasoningEffort: provider.reasoningEffort || 'medium', model: '', apiKey: '', appTitle: '' };
}

export type AccountModel = { id: string; name: string };

export function accountModels(value: unknown): AccountModel[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { models?: unknown }).models)) throw new Error('The model list could not be read.');
  const seen = new Set<string>();
  return (value as { models: unknown[] }).models.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const { id, name } = item as { id?: unknown; name?: unknown };
    if (typeof id !== 'string' || !id.trim() || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: typeof name === 'string' && name.trim() ? name : id }];
  });
}

/** A failed test must never change the default connection. */
export async function completeConnectionSetup<C extends { id: string }, T extends { ok: boolean }>(steps: {
  persist: () => Promise<C>;
  onPersisted: (connection: C) => void | Promise<void>;
  test?: (connection: C) => Promise<T>;
  setDefault?: (connection: C) => Promise<unknown>;
}) {
  const connection = await steps.persist();
  await steps.onPersisted(connection);
  const result = steps.test ? await steps.test(connection) : undefined;
  if (result?.ok && steps.setDefault) await steps.setDefault(connection);
  return { connection, result, defaultSet: !!result?.ok && !!steps.setDefault };
}
