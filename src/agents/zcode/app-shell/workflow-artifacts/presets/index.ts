// SecondU host adapter; not upstream presentation.
export type ArtifactPresetKind='chart'|'table'|'metrics'|'board';
export interface PresetLabels{otherColumn:string;empty:string;itemsCount:(count:number)=>string}
