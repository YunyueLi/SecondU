import type {ComponentProps,ReactNode} from 'react';
import {ActivityEdge} from '../design-system/ActivityEdge';
import './composer-surface.css';

type MobileComposerSlots={attachments?:ReactNode;input:ReactNode;leading:ReactNode;trailing:ReactNode};
/** Shared composer content; phone rows are explicit so attachments cannot change tool placement. */
export function ComposerSurface({compact,home=false,activity=false,context,mobileSlots,children,className='',...formProps}:Omit<ComponentProps<'form'>,'children'> & {compact:boolean;home?:boolean;activity?:boolean;context?:ReactNode;mobileSlots?:MobileComposerSlots;children?:ReactNode}) {
  const edge=<ActivityEdge active={activity} radius="var(--composer-activity-radius)"/>;
  return <form {...formProps} data-active={activity||undefined} className={`composer ${compact?'is-compact':'is-expanded'} ${mobileSlots?'composer-phone':''} ${home?'composer-home':''} ${className}`}>
    {!home&&edge}
    <div className={`composer-main-layer ${mobileSlots?'composer-main-layer-phone':''}`}>
      {home&&edge}
      {mobileSlots?<><div className="composer-phone-attachments">{mobileSlots.attachments}</div><div className="composer-phone-input">{mobileSlots.input}</div><div className="composer-phone-tools">{mobileSlots.leading}{mobileSlots.trailing}</div></>:children}
    </div>{context}
  </form>;
}
