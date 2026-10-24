import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button';
import { Menu } from '@openai/apps-sdk-ui/components/Menu';
import { NavigationGroup } from './NavigationGroup';
import { getAppNavigation } from './navigation';
import { financeHref, financeSection } from './finance-navigation-model.mjs';
import { useNavigationPreferences } from './NavigationPreferences';

export function FinanceNavigation({ active, section, presentation = 'desktop' }: { active: boolean; section?: string; presentation?: 'desktop' | 'rail' | 'mobile' }) {
  const navigation = getAppNavigation();
  const preference = useNavigationPreferences();
  const open = preference.value.financeExpanded;
  const changeOpen = (value: boolean) => {
    if (preference.ready && !preference.busy) void preference.client.setFinanceExpanded(value);
  };
  const mobile = presentation === 'mobile';
  const rowClass = mobile ? 'mobile-drawer-action' : 'nav-item';
  if (presentation === 'rail') return <Menu><Menu.Trigger><Button color="secondary" variant="ghost" size="lg" className="nav-item" selected={active} aria-label={navigation.finance.label} title={navigation.finance.label}><navigation.finance.Icon /></Button></Menu.Trigger><Menu.Content side="right" align="start" minWidth={180}>{navigation.financeSections.map(({ id, label, Icon }) => <Menu.Item key={id} onSelect={() => { window.location.hash = financeHref(id); }}><Icon />{label}</Menu.Item>)}</Menu.Content></Menu>;
  return <><NavigationGroup label={navigation.finance.label} Icon={navigation.finance.Icon} active={active} expanded={open} onToggle={() => changeOpen(!open)} mobile={mobile}>
      {navigation.financeSections.map(({ id, label, Icon }) => <ButtonLink as="a" key={id} href={financeHref(id)} color="secondary" variant="ghost" size="md" pill={false} className={rowClass} aria-current={active && financeSection(section) === id ? 'page' : undefined} data-selected={active && financeSection(section) === id ? '' : undefined}><Icon /><span>{label}</span></ButtonLink>)}
  </NavigationGroup></>;
}
