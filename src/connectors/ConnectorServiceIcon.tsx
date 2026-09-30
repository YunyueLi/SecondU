import {useState} from 'react';
import {Code,Document,Folder} from '@openai/apps-sdk-ui/components/Icon';
import type {Connector} from '../../shared/contracts';
import {findCatalogService,type CatalogService} from '../../shared/connector-catalog.mjs';

const iconFiles:Record<string,string>={gmail:'gmail.svg','google-drive':'googledrive.svg','google-calendar':'googlecalendar.svg','google-docs':'googledocs.svg','google-sheets':'googlesheets.svg','google-slides':'googleslides.svg','google-chat':'googlechat.svg','google-contacts':'googlecontacts.png',notion:'notion.svg',slack:'slack.png',github:'github.svg',linear:'linear.svg',atlassian:'atlassian.svg',asana:'asana.svg',figma:'figma.svg',canva:'canva.webp',miro:'miro.png',hubspot:'hubspot.png',stripe:'stripe.svg','hugging-face':'huggingface.svg',context7:'context7.ico','microsoft-learn':'microsoft.svg','outlook-mail':'outlook.svg','outlook-calendar':'outlook.svg',teams:'teams.svg',onedrive:'onedrive.svg',sharepoint:'sharepoint.svg'};
const monochrome=new Set(['notion','github']);
export function ServiceIcon({service}:{service:Pick<CatalogService,'id'|'name'>}){
 const [failed,setFailed]=useState(false);
 const file=iconFiles[service.id],path=file?`/icons/connectors/${file}`:service.id==='feishu'?new URL('../cognition/platform-icons/feishu.svg',import.meta.url).href:undefined;
 return <span className={`connector-service-icon service-${service.id}${monochrome.has(service.id)?' is-monochrome':''}`} aria-hidden="true">{path&&!failed?<img src={path} alt="" onError={()=>setFailed(true)}/>:<Code/>}</span>;
}
export function ConnectorServiceGlyph({connector}:{connector:Connector}){
 const service=findCatalogService(connector);
 if(service)return <ServiceIcon service={service}/>;
 const Icon=connector.kind==='library'?Document:connector.kind==='project'?Folder:Code;
 return <span className="connector-service-icon is-local" aria-hidden="true"><Icon/></span>;
}
