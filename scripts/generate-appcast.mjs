import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minimumMacOSVersion } from '../desktop/build-updater.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultAccount = 'im.hither.desktop.local.sparkle';
const releases = 'https://github.com/YunyueLi/SecondU/releases';
const signer = path.join(root, '.local/updater/vendor/Sparkle-2.9.6/bin/sign_update');
const minimumSystemVersion = minimumMacOSVersion.split('.').length === 2 ? minimumMacOSVersion + '.0' : minimumMacOSVersion;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

function signatureValue(value) {
  const signature = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signature) || Buffer.from(signature, 'base64').toString('base64') !== signature) throw new Error('Sparkle did not return a canonical Ed25519 signature.');
  return signature;
}
function versionValue(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('Use a stable three-part release version, without a v prefix.');
  return value;
}
export function renderAppcast({ version, bytes, signature, releaseNotes, publishedAt }) {
  versionValue(version); signatureValue(signature);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('The sealed ZIP must have a positive byte length.');
  if (typeof releaseNotes !== 'string' || !releaseNotes.trim() || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(releaseNotes)) throw new Error('Release notes must contain valid XML text.');
  const date = new Date(publishedAt);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid publication date.');
  const filename = `SecondU-v${version}-macos-arm64.zip`;
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>SecondU updates</title>
    <link>${releases}</link>
    <description>SecondU for macOS</description>
    <language>en</language>
    <item>
      <title>SecondU ${xml(version)}</title>
      <link>${releases}/tag/v${version}</link>
      <sparkle:version>${version}</sparkle:version>
      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>${minimumSystemVersion}</sparkle:minimumSystemVersion>
      <sparkle:hardwareRequirements>arm64</sparkle:hardwareRequirements>
      <pubDate>${date.toUTCString()}</pubDate>
      <description sparkle:format="markdown">${xml(releaseNotes.trim())}</description>
      <enclosure url="${releases}/download/v${version}/${filename}"
                 sparkle:edSignature="${signature}"
                 length="${bytes}"
                 type="application/octet-stream" />
    </item>
  </channel>
</rss>
`;
}

/** The private key never enters Node: Sparkle reads its dedicated Keychain
 * account. Verify the result against the public key embedded in the app. */
async function signAndVerify({ zip, account, archive, publicEDKey }) {
  const lock = JSON.parse(await readFile(path.join(root, 'desktop/native/vendor-lock.json'), 'utf8')).sparkle;
  if (lock.version !== '2.9.6') throw new Error('The appcast signer requires the reviewed Sparkle 2.9.6 tool.');
  const distribution = path.join(root, '.local/updater/vendor', path.basename(new URL(lock.url).pathname));
  const distributionBytes = await readFile(distribution);
  if (sha256(distributionBytes) !== lock.sha256 || distributionBytes.length !== lock.bytes) throw new Error('The pinned Sparkle distribution failed its integrity check.');
  const originalTool = execFileSync('/usr/bin/tar', ['-xJOf', distribution, './bin/sign_update'], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 20 * 1024 * 1024 });
  // A clean desktop build caches the archive, not an expanded vendor tree.
  // Restore this one reviewed binary from that archive when needed.
  try { if (!(await lstat(signer)).isFile()) throw new Error('The signing tool must be a regular file.'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(path.dirname(signer), { recursive: true });
    await writeFile(signer, originalTool, { flag: 'wx', mode: 0o755 });
  }
  if (sha256(await readFile(signer)) !== sha256(originalTool)) throw new Error('The signing tool differs from the pinned official distribution.');
  let signature;
  try {
    signature = signatureValue(execFileSync(signer, ['--account', account, '-p', zip], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 1024 * 1024 }));
  } catch {
    // Native stderr may contain local paths or account details; don't forward
    // it to a public build log and never retry with a raw private-key option.
    throw new Error('Sparkle signing failed. Check the pinned tool and the dedicated Keychain account locally.');
  }
  if (typeof publicEDKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(publicEDKey) || Buffer.from(publicEDKey, 'base64').toString('base64') !== publicEDKey) throw new Error('The packaged updater public key is invalid.');
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicEDKey, 'base64')]), format: 'der', type: 'spki' });
  if (!verify(null, archive, publicKey, Buffer.from(signature, 'base64'))) throw new Error('The archive signature does not match the updater public key. No appcast was written.');
  return signature;
}

export async function generateAppcast({ zip, output, version, releaseNotes, account = defaultAccount, publishedAt = new Date().toISOString() }, { sign = signAndVerify } = {}) {
  versionValue(version);
  if (typeof account !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(account)) throw new Error('Invalid Keychain account name.');
  if (typeof zip !== 'string' || path.basename(zip) !== `SecondU-v${version}-macos-arm64.zip`) throw new Error('ZIP filename must match the release version and macOS arm64 target.');
  if (typeof output !== 'string' || path.basename(output) !== 'appcast.xml') throw new Error('The feed output must be named appcast.xml.');
  if (typeof releaseNotes !== 'string') throw new Error('Pass a local release-notes file.');
  zip = path.resolve(zip); output = path.resolve(output); releaseNotes = path.resolve(releaseNotes);
  try { await lstat(output); throw Object.assign(new Error('The appcast already exists. Choose a fresh output directory.'), { code: 'EEXIST' }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const file of [zip, releaseNotes]) if (!(await lstat(file)).isFile()) throw new Error('ZIP and release notes must be regular files, not symlinks.');
  const archive = await readFile(zip), notes = await readFile(releaseNotes, 'utf8');
  if (archive.length < 4 || !archive.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('The input is not a non-empty ZIP archive.');
  const digest = sha256(archive);
  const config = JSON.parse(await readFile(path.join(root, 'desktop/native/updater-config.json'), 'utf8'));
  // Validate everything that can be checked before touching the Keychain.
  renderAppcast({ version, bytes: archive.length, signature: Buffer.alloc(64).toString('base64'), releaseNotes: notes, publishedAt });
  const signature = signatureValue(await sign({ zip, account, archive, publicEDKey: config.publicEDKey }));
  const after = await readFile(zip);
  if (after.length !== archive.length || sha256(after) !== digest) throw new Error('The sealed ZIP changed during signing. No appcast was written.');
  const feed = renderAppcast({ version, bytes: archive.length, signature, releaseNotes: notes, publishedAt });
  // Refuse to replace a previously sealed feed silently. Use a fresh output
  // directory for every candidate; the ZIP itself is never modified.
  await writeFile(output, feed, { flag: 'wx' });
  return { version, asset: path.basename(zip), bytes: archive.length, sha256: digest, appcast: output, appcastSha256: sha256(feed) };
}

export function parseArguments(args) {
  const names = new Map([['--zip', 'zip'], ['--output', 'output'], ['--version', 'version'], ['--release-notes', 'releaseNotes'], ['--account', 'account'], ['--published-at', 'publishedAt']]);
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = names.get(args[index]), value = args[index + 1];
    if (!key || typeof value !== 'string' || value.startsWith('--') || Object.hasOwn(result, key)) throw new Error('Unknown, missing or duplicate option. Use --help for usage.');
    result[key] = value;
  }
  for (const key of ['zip', 'output', 'version', 'releaseNotes']) if (!result[key]) throw new Error('Missing --zip, --output, --version or --release-notes.');
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') console.log('Usage: node scripts/generate-appcast.mjs --zip SecondU-vVERSION-macos-arm64.zip --output appcast.xml --version VERSION --release-notes notes.md [--account im.hither.desktop.local.sparkle] [--published-at ISO_DATE]\nUses official Sparkle 2.9.6 and the macOS Keychain. Writes a new feed; does not publish or modify the archive.');
  else {
    try { console.log(JSON.stringify(await generateAppcast(parseArguments(args)), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
