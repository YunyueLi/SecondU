import type { SVGProps } from 'react';
import { BarChart, Bills, Book, BuildingWorkspace, Chart, CreditCard, Credits, Document, DollarCircle, Globe, Health, Home, Invoice, LocalServices, Minus, Notebook, Plane, Plus, ProDiamond, ShieldCheck, ShoppingBag, Tag, Trending } from '@openai/apps-sdk-ui/components/Icon';

/** Apps SDK UI icons, plus local vehicle/food shapes. Credits is an approximation for gold. */
const financeIcons: Record<string, typeof Home> = {
  cash: Bills,
  cash_management: DollarCircle,
  investment: Chart,
  stock: Trending,
  etf: BarChart,
  fund: Chart,
  bond: Document,
  security: Chart,
  gold: Credits,
  crypto: Globe,
  wealth: Chart,
  real_estate: Home,
  housing: Home,
  vehicle: TransportIcon,
  transport: TransportIcon,
  valuable: ProDiamond,
  insurance: ShieldCheck,
  receivable: Invoice,
  business: BuildingWorkspace,
  credit_card: CreditCard,
  mortgage: Home,
  vehicle_loan: TransportIcon,
  personal_loan: Notebook,
  other: Plus,
  other_liability: Minus,
  shopping: ShoppingBag,
  health: Health,
  education: Book,
  travel: Plane,
  services: LocalServices,
  fees: CreditCard,
  interest: DollarCircle,
  food: FoodIcon,
  entertainment: Tag,
};

export function FinanceIcon({ kind, ...props }: { kind: string } & SVGProps<SVGSVGElement>) {
  const Icon = financeIcons[kind] || Tag;
  return <Icon {...props} aria-hidden="true" />;
}

/** Local supplements: the public Apps SDK UI package does not export these shapes. */
function TransportIcon(props: SVGProps<SVGSVGElement>) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 9 1.8-4h10.4L19 9M5 9h14a2 2 0 0 1 2 2v6H3v-6a2 2 0 0 1 2-2Z" /><path d="M6 12h2m8 0h2M5 17v3m14-3v3" /></svg>; }
function FoodIcon(props: SVGProps<SVGSVGElement>) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M17 21v-8h3V3c-3 0-4 4-4 7v3h1" /></svg>; }

/** Shared by the SDK Select's option and selected-value views. */
export function FinanceTypeOption({ value, label, iconKind }: { value: string; label: string; iconKind?: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
    <FinanceIcon kind={iconKind || value} width={18} height={18} style={{ flexShrink: 0 }} />
    <span>{label}</span>
  </span>;
}
