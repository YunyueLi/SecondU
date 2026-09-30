import type {ComponentProps,ReactNode} from 'react';

/** The shared input and tool layers used by the live composer and catalogue. */
export function ComposerSurface({compact,context,children,className='',...formProps}:Omit<ComponentProps<'form'>,'children'> & {compact:boolean;context?:ReactNode;children:ReactNode}) {
  return <form {...formProps} className={`composer ${compact?'is-compact':'is-expanded'} ${className}`}><div className="composer-main-layer">{children}</div>{context}</form>;
}
