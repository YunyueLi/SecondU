import type { ReactNode } from 'react';
import { TextLink } from '@openai/apps-sdk-ui/components/TextLink';
import './setup-hint.css';

export function SetupHint({ children, href, action }: { children: ReactNode; href: string; action: string }) {
  return <p className="setup-hint" role="status"><span>{children}</span><TextLink as="a" href={href} underline={false}>{action}</TextLink></p>;
}
