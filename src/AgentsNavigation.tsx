import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Badge } from '@openai/apps-sdk-ui/components/Badge';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { NavigationGroup } from './NavigationGroup';
import { getAppNavigation } from './navigation';
import { agentHref, agentSection, isAgentRoomRoute } from './agents-navigation-model.mjs';
import { useNavigationPreferences } from './NavigationPreferences';

export function AgentsNavigation({ active, section, presentation = 'desktop' }: { active: boolean; section?: string; presentation?: 'desktop' | 'rail' | 'mobile' }) {
  const navigation = getAppNavigation();
  const preference = useNavigationPreferences();
  const open = preference.value.agentsExpanded;
  const selected = (id: string) => active && !isAgentRoomRoute(section) && agentSection(section) === id;
  const development = <Badge color="secondary" size="sm">Dev</Badge>;
  if (presentation === 'rail') return <Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="lg" className="nav-item" selected={active} aria-label={navigation.agents.label} title={navigation.agents.label}><navigation.agents.Icon /></Button></Menu.Trigger><Menu.Content side="right" align="start" minWidth={200}>{navigation.agentSections.map(({ id, label, Icon, development: dev }) => <Menu.Item key={id} onSelect={() => { window.location.hash = agentHref(id); }}><Icon /><span>{label}</span>{dev && development}</Menu.Item>)}</Menu.Content></Menu>;
  const mobile = presentation === 'mobile';
  return <><NavigationGroup label={navigation.agents.label} Icon={navigation.agents.Icon} active={active} expanded={open} onToggle={() => { if (preference.ready && !preference.busy) void preference.client.setAgentsExpanded(!open); }} mobile={mobile}>
    {navigation.agentSections.map(({ id, label, Icon, development: dev }) => <ButtonLink as="a" key={id} href={agentHref(id)} color="secondary" variant="ghost" size="md" pill={false} className={mobile ? 'mobile-drawer-action' : 'nav-item'} aria-current={selected(id) ? 'page' : undefined} data-selected={selected(id) ? '' : undefined}><Icon /><span className="agents-navigation-label">{label}{dev && development}</span></ButtonLink>)}
  </NavigationGroup></>;
}
