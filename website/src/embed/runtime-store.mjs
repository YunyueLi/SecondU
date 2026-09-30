// Only the pure server modules explicitly allowed by build-embed import this.
// The desktop SQLite store is never included in the browser bundle.
export { HttpError } from '../../../server/http-error.mjs';
export const now = () => new Date().toISOString();
export const id = prefix => `${prefix}-${crypto.randomUUID()}`;
