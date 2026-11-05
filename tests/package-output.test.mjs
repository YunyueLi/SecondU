import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { replacePackagedApp, withPackageStaging } from '../desktop/package-output.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'secondu-package-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const staging = path.join(root, 'staging');
  const output = path.join(root, 'out');
  await mkdir(staging); await mkdir(output);
  return { root, staging, staged: path.join(staging, 'SecondU.app'), output, destination: path.join(output, 'SecondU.app') };
}

test('a successful package replacement retains only the new app and removes staging', async t => {
  const f = await fixture(t);
  await mkdir(f.staged); await mkdir(f.destination);
  await writeFile(path.join(f.staged, 'version'), 'new');
  await writeFile(path.join(f.destination, 'version'), 'old');
  await replacePackagedApp(f.staged, f.destination);
  assert.equal(await readFile(path.join(f.destination, 'version'), 'utf8'), 'new');
  assert.deepEqual(await readdir(f.output), ['SecondU.app']);
  assert.deepEqual(await readdir(f.root), ['out']);
});

test('a failed package switch restores the previous app without deleting its contents', async t => {
  const f = await fixture(t);
  await mkdir(f.destination);
  await writeFile(path.join(f.destination, 'version'), 'old');
  await assert.rejects(replacePackagedApp(f.staged, f.destination), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(f.destination, 'version'), 'utf8'), 'old');
  assert.deepEqual(await readdir(f.output), ['SecondU.app']);
  assert.deepEqual(await readdir(f.staging), []);
});

test('the first package installs without creating a previous-build directory', async t => {
  const f = await fixture(t);
  await mkdir(f.staged);
  await writeFile(path.join(f.staged, 'version'), 'first');
  await replacePackagedApp(f.staged, f.destination);
  assert.equal(await readFile(path.join(f.destination, 'version'), 'utf8'), 'first');
  assert.deepEqual(await readdir(f.root), ['out']);
});

test('a build failure removes only its own partial app and native build', async t => {
  const f = await fixture(t);
  await assert.rejects(withPackageStaging(f.root, async stage => {
    await mkdir(path.join(stage, 'SecondU.app'));
    await mkdir(path.join(stage, 'updater'));
    throw new Error('signing failed');
  }), /signing failed/);
  assert.deepEqual((await readdir(f.root)).sort(), ['out', 'staging']);
});

test('cleanup keeps a previous application if rollback did not finish', async t => {
  const f = await fixture(t);
  let recovery;
  await assert.rejects(withPackageStaging(f.root, async stage => {
    recovery = path.join(stage, '.previous.app');
    await mkdir(recovery);
    await writeFile(path.join(recovery, 'version'), 'old');
    throw new Error('rollback failed');
  }), /rollback failed/);
  assert.equal(await readFile(path.join(recovery, 'version'), 'utf8'), 'old');
});
