export const productRoutes = ['example-chat','assistant','self','life','conversations','timeline','relationships','sources','projects','artifacts','automations','settings/model','settings/connectors','settings/computer','settings/appearance','devices','agents','agents/market','agents/network','agents/dating'] as const;
export type ProductRoute = typeof productRoutes[number];
export const productNavigationEvent = 'secondu-website-navigate';
export function isProductRoute(value: unknown): value is ProductRoute { return typeof value==='string' && (productRoutes as readonly string[]).includes(value); }
export function openProductRoute(route: ProductRoute) {
 window.dispatchEvent(new CustomEvent(productNavigationEvent,{detail:{route}}));
}
