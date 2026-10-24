import { useId, type ReactNode } from 'react';
import { Button } from '@openai/apps-sdk-ui/components/Button';
import { ChevronDown } from '@openai/apps-sdk-ui/components/Icon';
import './navigation-groups.css';
import type { NavigationItem } from './navigation';

export function NavigationGroup({ label, Icon, active, expanded, onToggle, mobile = false, children }: {
  label: string; Icon: NavigationItem['Icon']; active: boolean; expanded: boolean;
  onToggle: () => void; mobile?: boolean; children: ReactNode;
}) {
  const listId = useId();
  return <>
    <Button color="secondary" variant="ghost" size={mobile ? 'md' : 'lg'} pill={false}
      className={`${mobile ? 'mobile-drawer-action' : 'nav-item'} navigation-parent`} selected={active && !expanded}
      aria-expanded={expanded} aria-controls={listId} onClick={onToggle}>
      <Icon /><span>{label}</span><ChevronDown className={expanded ? '' : 'rotated'} />
    </Button>
    {expanded && <div id={listId} className={mobile ? 'mobile-drawer-subnav' : 'sub-navigation'}>{children}</div>}
  </>;
}
