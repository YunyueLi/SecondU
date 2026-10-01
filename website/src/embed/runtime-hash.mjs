import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

// The importer only requires a synchronous SHA-256 over UTF-8 text. Keep this
// adapter narrow: credentials, randomness and other Node APIs stay unavailable.
export function createHash(algorithm) {
  if (algorithm !== 'sha256') throw new Error('Unsupported browser hash');
  const hash = sha256.create();
  return {
    update(value) { hash.update(typeof value === 'string' ? utf8ToBytes(value) : value); return this; },
    digest(encoding) {
      if (encoding !== 'hex') throw new Error('Unsupported browser hash encoding');
      return bytesToHex(hash.digest());
    },
  };
}
