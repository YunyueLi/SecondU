// SecondU host adapter; not upstream presentation.
import {FileTextIcon} from 'lucide-react';
export const resolveFileDisplayDescriptor=(_name:string)=>({fileIconSrc:'markdown'});
export function FileDisplayIcon({className}:{src?:string;className?:string}){return <FileTextIcon className={className} aria-hidden/>;}
