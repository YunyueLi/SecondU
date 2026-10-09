import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { defaultAccount, generateAppcast, parseArguments, renderAppcast } from '../scripts/generate-appcast.mjs';

const signature = Buffer.alloc(64, 7).toString('base64');
const publishedAt = '2026-10-09T00:00:00.000Z';
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'secondu-appcast-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const zip = path.join(directory, 'SecondU-v0.1.5-macos-arm64.zip'), output = path.join(directory, 'appcast.xml'), releaseNotes = path.join(directory, 'notes.md');
  const archive = Buffer.from('PK\x03\x04synthetic sealed archive');
  await writeFile(zip, archive); await writeFile(releaseNotes, '## Synthetic changes\n\nA & B <C> ]]>');
  return { zip, output, releaseNotes, archive, version: '0.1.5', publishedAt };
}
test('sealed archive metadata and fixed GitHub asset URL are emitted without touching Keychain', async t => {
  const options = await fixture(t), calls = [];
  const result = await generateAppcast(options, { sign: async request => { calls.push(request); return signature; } });
  assert.equal(calls.length, 1); assert.equal(calls[0].account, defaultAccount);
  assert.equal(calls[0].publicEDKey.length, 44);
  assert.deepEqual(await readFile(options.zip), options.archive);
  assert.equal(result.bytes, options.archive.length);
  assert.equal(result.sha256, createHash('sha256').update(options.archive).digest('hex'));
  const feed = await readFile(options.output, 'utf8');
  assert.match(feed, /https:\/\/github\.com\/YunyueLi\/SecondU\/releases\/download\/v0\.1\.5\/SecondU-v0\.1\.5-macos-arm64\.zip/);
  assert.match(feed, /<sparkle:hardwareRequirements>arm64<\/sparkle:hardwareRequirements>/);
  assert.match(feed, /<description sparkle:format="markdown">/);
  assert.match(feed, /A &amp; B &lt;C&gt; \]\]&gt;/);
  assert.doesNotMatch(feed, /private|account|Keychain|synthetic sealed archive/);
  await assert.rejects(generateAppcast(options, { sign: () => signature }), error => error.code === 'EEXIST');
});
test('a changed ZIP or invalid signature cannot produce an appcast', async t => {
  const options = await fixture(t);
  await assert.rejects(generateAppcast(options, { sign: () => 'not-a-signature' }), /canonical Ed25519/);
  await assert.rejects(readFile(options.output), error => error.code === 'ENOENT');
  await assert.rejects(generateAppcast(options, { sign: async () => { await writeFile(options.zip, Buffer.from('PK\x03\x04different')); return signature; } }), /changed during signing/);
  await assert.rejects(readFile(options.output), error => error.code === 'ENOENT');
});
test('release filenames, targets, notes and private-key arguments are rejected before signing', async t => {
  const options = await fixture(t), sign = () => assert.fail('invalid request touched the signer');
  for (const change of [{ version: '../0.1.5' }, { version: '0.1.5-beta' }, { zip: 'Other.zip' }, { output: 'feed.html' }, { account: '--ed-key-file' }]) await assert.rejects(generateAppcast({ ...options, ...change }, { sign }));
  await writeFile(options.releaseNotes, 'invalid\x00text');
  await assert.rejects(generateAppcast(options, { sign }), /valid XML text/);
  for (const args of [['--ed-key-file', 'secret'], ['--url', 'https://other.invalid'], ['--account', 'one', '--account', 'two']]) assert.throws(() => parseArguments(args));
  const link = path.join(path.dirname(options.output), 'linked.md'); await symlink(options.releaseNotes, link);
  await assert.rejects(generateAppcast({ ...options, releaseNotes: link }, { sign }), /regular files/);
});
test('rendering rejects invalid dates and lengths and CLI only accepts public release inputs', () => {
  const item = { version: '0.1.5', bytes: 10, signature, releaseNotes: 'Synthetic release notes', publishedAt };
  for (const change of [{ bytes: 0 }, { bytes: 1.5 }, { publishedAt: 'bad-date' }, { releaseNotes: '' }]) assert.throws(() => renderAppcast({ ...item, ...change }));
  assert.deepEqual(parseArguments(['--zip', 'a.zip', '--output', 'appcast.xml', '--version', '0.1.5', '--release-notes', 'notes.md']), { zip: 'a.zip', output: 'appcast.xml', version: '0.1.5', releaseNotes: 'notes.md' });
});
