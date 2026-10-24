export interface CatalogService {
  id: string; name: string; category: string; description: string; descriptionEn: string;
  endpoint: string; endpointTemplate?: string; authMethods: Array<'none' | 'bearer' | 'oauth'>;
  docsUrl: string; setupUrl?: string; icon?: string; oauthRegistration?: 'dynamic' | 'manual';
  preview?: boolean; providerReview?: boolean; localServer?: boolean; scopes?: string[];
  requirement?: string; requirementEn?: string;
  checkedAt?: string; queryAuthKey?: 'apikey'; tokenLabel?: string; tokenLabelEn?: string;
}
export interface FinanceCatalogService {
  id: 'moomoo' | 'plaid' | 'teller' | 'truelayer' | 'ibkr_flex' | 'snaptrade'; name: string; category: 'finance'; method: 'moomoo' | 'provider';
  description: string; descriptionEn: string;
}
export const FINANCE_CONNECTOR_CATALOG: FinanceCatalogService[];
export const CONNECTOR_CATALOG_CHECKED_AT: string;
export const FINANCE_RESEARCH_CATALOG_CHECKED_AT: string;
export const CONNECTOR_CATEGORIES: Array<{ id: string; zh: string; en: string }>;
export const CONNECTOR_CATALOG: CatalogService[];
export function findCatalogService(connector: {kind: string; url?: string; catalogId?: string}): CatalogService | undefined;
export function resolveCatalogEndpoint(service: CatalogService, tenantId?: string): string;
