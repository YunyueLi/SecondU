import type {ComponentProps,ReactNode} from 'react';

type MobileComposerSlots={attachments?:ReactNode;input:ReactNode;leading:ReactNode;trailing:ReactNode};
/** Shared composer content; phone rows are explicit so attachments cannot change tool placement. */
export function ComposerSurface({compact,context,mobileSlots,children,className='',...formProps}:Omit<ComponentProps<'form'>,'children'> & {compact:boolean;context?:ReactNode;mobileSlots?:MobileComposerSlots;children?:ReactNode}) {
  return <form {...formProps} className={`composer ${compact?'is-compact':'is-expanded'} ${mobileSlots?'composer-phone':''} ${className}`}><div className={`composer-main-layer ${mobileSlots?'composer-main-layer-phone':''}`}>{mobileSlots?<><div className="composer-phone-attachments">{mobileSlots.attachments}</div><div className="composer-phone-input">{mobileSlots.input}</div><div className="composer-phone-tools">{mobileSlots.leading}{mobileSlots.trailing}</div></>:children}</div>{context}</form>;
}
