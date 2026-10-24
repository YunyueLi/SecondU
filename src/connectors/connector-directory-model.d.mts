import type {CatalogService,FinanceCatalogService} from '../../shared/connector-catalog.mjs';
export type DirectoryService=CatalogService|FinanceCatalogService;
export interface ConnectorDirectorySection {id:string;zh:string;en:string;services:DirectoryService[]}
export function connectorDirectorySections(options?:{category?:string;query?:string}):ConnectorDirectorySection[];
