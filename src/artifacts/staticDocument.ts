/** A static, opaque preview. Remove navigation surfaces in addition to CSP. */
export function staticDocument(source: string): string {
  // Template contents stay inert while being inspected, including image loads.
  const template = document.createElement('template');
  template.innerHTML = source;
  template.content.querySelectorAll('script,iframe,frame,frameset,object,embed,base,link,meta').forEach(node => node.remove());
  for (const node of template.content.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || ['href', 'xlink:href', 'action', 'formaction', 'target', 'srcdoc', 'srcset', 'ping', 'background'].includes(name)
        || name === 'src' && !/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  }
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${template.innerHTML}</body></html>`;
}
