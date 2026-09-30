import type {MouseEventHandler, ReactNode} from 'react';
import {ArrowRight} from '@openai/apps-sdk-ui/components/Icon';
import type { RecommendationKind } from '../../shared/recommendation-icons';
import { RecommendationIcon } from './RecommendationIcon';
import './suggestion-row.css';

export type SuggestionKind=RecommendationKind;

export function SuggestionRow({kind,app,iconText,href,children,onClick}:{kind?:SuggestionKind|string;app?:string;iconText?:string;href:string;children:ReactNode;onClick?:MouseEventHandler<HTMLAnchorElement>}){
 return <a className="suggestion-row" href={href} onClick={onClick}>
  <span className="suggestion-row-icon" aria-hidden="true"><RecommendationIcon kind={kind} app={app} text={iconText??(typeof children==='string'?children:'')}/></span>
  <span className="suggestion-row-label">{children}</span>
  <ArrowRight className="suggestion-row-arrow" aria-hidden="true"/>
 </a>;
}
