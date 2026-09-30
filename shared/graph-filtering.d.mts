import type {Person,Relationship,Source} from './contracts';
export interface GraphFilterFacet {id:string;label:string;labelEn:string;count:number;color?:string}
export interface GraphFilterIndex {
  people:Person[];relationships:Relationship[];peopleById:Map<string,Person>;selfPersonId?:string;
  personCategories:Map<string,string[]>;personSources:Map<string,string[]>;personCircles:Map<string,string[]>;searchText:Map<string,string>;
  categories:GraphFilterFacet[];sources:GraphFilterFacet[];circles:GraphFilterFacet[];
}
export interface GraphFilterOptions {query?:string;category?:string;source?:string;relationship?:string;circle?:string;showOrphans?:boolean;focused?:string}
export function buildGraphFilterIndex(input:{people:Person[];relationships:Relationship[];sources:Source[];selfPersonId?:string}):GraphFilterIndex;
export function filterGraph(index:GraphFilterIndex,options?:GraphFilterOptions):{visibleIds:Set<string>;visibleRelations:Relationship[];matches:Person[]};
