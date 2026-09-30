// Updating an iframe's fragment through location.hash lets the browser scroll
// its ancestors. The host already owns navigation and scrolling explicitly.
export function replaceExampleRoute(target, route) {
  const url = new URL(target.location.href);
  url.hash = route;
  if (url.href === target.location.href) return false;
  const oldURL = target.location.href;
  target.history.replaceState(target.history.state, '', url);
  target.dispatchEvent(new target.HashChangeEvent('hashchange', { oldURL, newURL: url.href }));
  return true;
}
