// SecondU host adapter; not upstream presentation.
import type {ReactNode} from 'react';
export function ControlHintTooltip({children,title,description}:{children:ReactNode;title:string;description?:string;side?:string}){return <span className="inline-flex shrink-0" title={[title,description].filter(Boolean).join('\n')}>{children}</span>;}
