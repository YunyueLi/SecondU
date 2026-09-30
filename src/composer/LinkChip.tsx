import type { ReactNode } from 'react';
import { Globe, Mail } from '@openai/apps-sdk-ui/components/Icon';
import { findLinks,linkFromHref } from './linkify';
import './links.css';

/** Link labels come from the destination. Rendering never fetches a remote icon. */
export function LinkChip({href,children}:{href?:string;children?:ReactNode}){
  const link=href?linkFromHref(href):null;
  if(!link){
    if(href&&(/^(?:\/(?!\/)|#)/.test(href)))return <a href={href} className="hither-inline-link">{children||href}</a>;
    return <span>{children||href}</span>;
  }
  const rawLabel=typeof children==='string'?children:Array.isArray(children)&&children.every(child=>typeof child==='string')?children.join(''):undefined;
  const isAddress=!children||rawLabel===href||rawLabel===href?.replace(/^https?:\/\//,'')||rawLabel===link.label||!!rawLabel&&findLinks(rawLabel).some(found=>found.start===0&&found.end===rawLabel.length);
  // A human-written Markdown label remains intact. A suspicious destination
  // always exposes its actual hostname instead of a trusted-looking label.
  const label=link.suspicious||isAddress?link.label:children;
  return <a className={`hither-link-chip${link.suspicious?' is-suspicious':''}`} href={link.href} target={link.kind==='mail'?undefined:'_blank'} rel="noopener noreferrer" title={link.href}>
    {link.kind==='mail'?<Mail aria-hidden/>:<Globe aria-hidden/>}<span>{label}</span>
  </a>;
}
