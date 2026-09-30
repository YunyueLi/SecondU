import type { ReactNode } from 'react';
import { ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { ArrowRight } from '@openai/apps-sdk-ui/components/Icon';
import './section-link.css';

export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return <ButtonLink as="a" className="section-link" href={href} color="secondary" variant="outline" size="sm">{children}<ArrowRight aria-hidden="true" /></ButtonLink>;
}

export function SectionHeading({children,action}:{children:ReactNode;action?:ReactNode}){
  return <header className="section-heading"><h2>{children}</h2>{action}</header>;
}
