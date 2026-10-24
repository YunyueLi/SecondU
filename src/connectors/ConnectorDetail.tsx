import type {ReactNode} from 'react';
import {Dialog} from '../components';

export function ConnectorDetail({name,description,icon,children,onClose}:{name:string;description:string;icon:ReactNode;children:ReactNode;onClose:()=>void}){
 return <Dialog title={name} className="connector-detail-dialog" onClose={onClose}><div className="connector-detail-body"><div className="connector-detail-hero">{icon}<div><h3>{name}</h3><p>{description}</p></div></div>{children}</div></Dialog>;
}
