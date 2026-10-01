import type {IncomingMessage,ServerResponse} from 'node:http';

export function embeddedBuildBase(html:string,fallback?:string):string;
export function createPublicPreviewMiddleware(root:string):(request:IncomingMessage,response:ServerResponse,next:(error?:unknown)=>void)=>Promise<void>;
