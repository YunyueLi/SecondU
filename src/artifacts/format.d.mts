import type { Artifact } from '../../shared/contracts';
export type ArtifactFormat = {kind:'markdown'|'code'|'text'|'html'|'svg'|'table'|'image'|'pdf'|'office'|'legacy-office'|'binary';label:string;language:string;mime:string;editable:boolean};
export function artifactFormat(artifact:Pick<Artifact,'name'> & Partial<Pick<Artifact,'type'>>):ArtifactFormat;
export function parseDelimited(content:string,delimiter?:string,maxRows?:number,maxColumns?:number):{rows:string[][];truncated:boolean};
export function fileSizeLabel(bytes:number):string;
export function artifactContentSize(artifact:Pick<Artifact,'name'> & Partial<Pick<Artifact,'type'|'content'|'size'|'mime'|'encoding'>>):number|undefined;
export function embeddedFile(content:string,mime:string):Uint8Array<ArrayBuffer>|null;
export function embeddedFileByteLength(content:string,mime:string):number|undefined;
