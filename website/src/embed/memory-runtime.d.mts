import type { Bootstrap } from '../../../shared/contracts';
import type { CanonicalExample } from './fixture';
export class ExampleError extends Error { status: number; code: string; constructor(message: string, status?: number, code?: string); }
export class ExampleRuntime {
  data: Bootstrap;
  constructor(example: CanonicalExample);
  chooseChat(): string | undefined;
  response(path: string, method?: string, body?: Record<string, unknown>): unknown;
  download(artifactId: string, version: number): { name: string; mime: string; bytes: Uint8Array<ArrayBuffer>; version: number };
}
