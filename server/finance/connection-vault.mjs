import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import {constants,promises as fs} from 'node:fs';
import path from 'node:path';
import {fail as error} from './arithmetic.mjs';
const AAD=Buffer.from('secondu-finance-provider-v1');
const fail=()=>error('本地连接凭据无法安全读取或保存。','finance_connection_storage_failed',503);
export function createFinanceVault(directory) {
  const keyPath = path.join(directory, 'key'), filePath = path.join(directory, 'credentials.enc');
  async function secureDirectory(create) {
    if (create) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid())) fail('STORAGE_FAILED', 503);
    await fs.chmod(directory, 0o700);
  }
  async function readPrivate(file) {
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 100000 || (process.getuid && stat.uid !== process.getuid())) fail('STORAGE_FAILED', 503);
      await handle.chmod(0o600); return await handle.readFile();
    } finally { await handle.close(); }
  }
  async function key(create) {
    if (create) {
      let handle;
      try { handle = await fs.open(keyPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); await handle.writeFile(randomBytes(32)); await handle.sync(); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      finally { if (handle) await handle.close(); }
    }
    const bytes = await readPrivate(keyPath);
    if (bytes.length !== 32) fail('STORAGE_FAILED', 503);
    return bytes;
  }
  return {
    async read() {
      try { await fs.lstat(directory); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      await secureDirectory(false);
      let bytes;
      try { bytes = await readPrivate(filePath); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      const envelope = JSON.parse(bytes.toString('utf8'));
      if (envelope.version !== 1 || !['iv', 'tag', 'data'].every(field => typeof envelope[field] === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(envelope[field]))) fail('STORAGE_FAILED', 503);
      const iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64');
      if (iv.length !== 12 || tag.length !== 16) fail('STORAGE_FAILED', 503);
      const decipher = createDecipheriv('aes-256-gcm', await key(false), iv);
      decipher.setAAD(AAD); decipher.setAuthTag(tag);
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
    },
    async write(record) {
      await secureDirectory(true);
      const iv = randomBytes(12), active = createCipheriv('aes-256-gcm', await key(true), iv);
      active.setAAD(AAD);
      const data = Buffer.concat([active.update(JSON.stringify(record), 'utf8'), active.final()]);
      const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: active.getAuthTag().toString('base64'), data: data.toString('base64') });
      const temporary = path.join(directory, `.credentials-${randomBytes(12).toString('hex')}.tmp`);
      let handle;
      try {
        handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        await handle.writeFile(envelope); await handle.sync(); await handle.close(); handle = null;
        await fs.rename(temporary, filePath);
      } finally { if (handle) await handle.close(); await fs.rm(temporary, { force: true }); }
    },
    async reference(id) { return createHmac('sha256', await key(false)).update(`account:${id}`).digest('base64url').slice(0, 24); },
  };
}
