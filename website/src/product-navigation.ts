export const productRoutes = ['example-chat','example-decision','assistant','self','life','conversations','timeline','relationships','sources','projects','artifacts','automations','settings/model','settings/connectors','settings/computer','settings/appearance','devices','agents','agents/market','agents/network','agents/dating'] as const;
export type ProductRoute = typeof productRoutes[number];
export const productNavigationEvent = 'secondu-website-navigate';
export function isProductRoute(value: unknown): value is ProductRoute { return typeof value==='string' && (productRoutes as readonly string[]).includes(value); }
export function openProductRoute(route: ProductRoute, trigger?: HTMLElement) {
 // Touch and Safari clicks need not focus a button. Carry the actual opener so
 // the expanded workspace can restore focus to the control that launched it.
 window.dispatchEvent(new CustomEvent(productNavigationEvent,{detail:{route,trigger}}));
}

export function productExampleUrl(language: 'zh' | 'en', theme?: 'light' | 'dark') {
 const query = new URLSearchParams({space: language === 'zh' ? 'demo-cn-v1' : 'demo-us-v1', lang: language});
 if (theme) query.set('theme', theme);
 return `${import.meta.env.BASE_URL}product/embed.html?${query}#example-chat`;
}
