import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server/index.mjs';
import { createTask } from '../server/domain.mjs';
import { workspaceFiles } from '../server/workspace-files.mjs';
import { artifactBytes, encodeBinaryArtifact, decodeBinaryArtifact, BINARY_ARTIFACT_LIMIT } from '../server/artifact-content.mjs';

// Synthetic format fixtures only; no screenshots, user photos, or private documents.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
// A complete 8x8 constant-grey baseline JPEG: one DC-zero/EOB block.
const jpegSegment = (marker, body) => Buffer.concat([Buffer.from([255, marker, (body.length + 2) >> 8, (body.length + 2) & 255]), body]);
const huffman = table => Buffer.from([table, 1, ...Array(15).fill(0), 0]);
const jpeg = Buffer.concat([Buffer.from([255,216]), jpegSegment(0xdb,Buffer.from([0,...Array(64).fill(1)])), jpegSegment(0xc0,Buffer.from([8,0,8,0,8,1,1,0x11,0])), jpegSegment(0xc4,Buffer.concat([huffman(0),huffman(0x10)])), jpegSegment(0xda,Buffer.from([1,1,0,0,63,0])), Buffer.from([0x3f,255,217])]);
function pdf(label = 'Synthetic file', padding = 0) {
  let content = '%PDF-1.4\n' + (padding ? '%' + ' '.repeat(padding) + '\n' : '');
  const stream = `BT /F1 12 Tf 20 40 Td (${label}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(content)); content += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}
async function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'secondu-binary-artifacts-'));
  const app = createApp({ dataDir: path.join(directory, 'data'), seed: false, scheduler: false, computerInfo: { codexAvailable: false } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}/api/`;
  const api = async (route, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(base + route, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, value: await response.json() };
  };
  const task = createTask(app.store, { prompt: 'Create synthetic test files.', mode: 'live' });
  return { app, directory, base, api, task };
}

test('binary formats require exact extension, magic, container bounds, canonical encoding and bounded dimensions', () => {
  for (const [name, data, mime] of [['pixel.png', png, 'image/png'], ['pixel.jpg', jpeg, 'image/jpeg'], ['pixel.gif', gif, 'image/gif'], ['pixel.webp', webp, 'image/webp'], ['test.pdf', pdf(), 'application/pdf']]) {
    const artifact = { name, ...encodeBinaryArtifact(name, data) };
    assert.equal(artifact.mime, mime); assert.equal(artifact.size, data.length);
    assert.deepEqual(decodeBinaryArtifact(artifact).data, data);
    assert.throws(() => decodeBinaryArtifact({ ...artifact, mime: 'text/plain' }));
    assert.throws(() => decodeBinaryArtifact({ ...artifact, size: data.length + 1 }));
    assert.throws(() => decodeBinaryArtifact({ ...artifact, content: artifact.content + ' ' }));
    assert.throws(() => encodeBinaryArtifact(name, data.subarray(0, data.length - 5)));
  }
  for (const name of ['wrong.jpg', 'wrong.gif', 'wrong.webp', 'wrong.pdf', 'wrong.exe']) assert.throws(() => encodeBinaryArtifact(name, png));
  for (const content of ['', 'synthetic.png', 'https://example.test/file.png', 'data:image/png;base64,!!!!', 'data:image/jpeg;base64,' + png.toString('base64')]) assert.throws(() => decodeBinaryArtifact({ name: 'pixel.png', content }));
  const largeDimensions = Buffer.from(png); largeDimensions.writeUInt32BE(16385, 16);
  assert.throws(() => encodeBinaryArtifact('large.png', largeDimensions), error => error.code === 'artifact_dimensions_limit');
  assert.throws(() => encodeBinaryArtifact('large.pdf', Buffer.alloc(BINARY_ARTIFACT_LIMIT + 1)), error => error.status === 413);
});

test('collection stores original binary bytes, metadata and both versions; HTTP downloads exact bytes and rejects editing', async t => {
  const f = await fixture(t), workspace = f.app.store.taskWorkspace(f.task.id), firstPdf = pdf('First version');
  writeFileSync(path.join(workspace, 'pixel.png'), png); writeFileSync(path.join(workspace, 'report.pdf'), firstPdf);
  const collected = f.app.runner.collectWorkspace(f.task.id, new Map());
  assert.deepEqual(collected, { count: 2, bytes: png.length + firstPdf.length, skipped: 0 });
  const records = f.app.store.list('artifacts');
  for (const artifact of records) {
    assert.equal(artifact.encoding, 'data-url'); assert.equal(artifact.versions[0].encoding, 'data-url');
    const expected = artifact.name.endsWith('.png') ? png : firstPdf;
    assert.deepEqual(readFileSync(f.app.store.artifactPath(artifact)), expected);
    const response = await fetch(f.base + `artifacts/${artifact.id}/download`);
    assert.equal(response.headers.get('content-type'), artifact.mime);
    assert.equal(Number(response.headers.get('content-length')), expected.length);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    assert.equal((await f.api(`artifacts/${artifact.id}`, { baseVersion: artifact.version, content: 'replacement' }, 'PUT')).status, 409);
  }
  const prior = records.find(artifact => artifact.name === 'report.pdf'), nextPdf = pdf('Second version');
  writeFileSync(path.join(workspace, 'report.pdf'), nextPdf);
  f.app.runner.collectWorkspace(f.task.id, new Map(records.map(artifact => [artifact.name, artifact.version])));
  const current = f.app.store.require('artifacts', prior.id);
  assert.equal(current.version, 2); assert.equal(current.versions.length, 2);
  assert.deepEqual(artifactBytes({ name: current.name, ...current.versions[0] }).data, firstPdf);
  assert.deepEqual(artifactBytes(current).data, nextPdf);
  const response = await fetch(f.base + `artifacts/${current.id}/download`);
  assert.equal(response.headers.get('x-artifact-version'), '2');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), nextPdf);
  for (const [version, bytes] of [[1, firstPdf], [2, nextPdf]]) {
    const historical = await fetch(f.base + `artifacts/${current.id}/download?version=${version}`);
    assert.equal(historical.status, 200);
    assert.equal(historical.headers.get('content-type'), 'application/pdf');
    assert.equal(historical.headers.get('x-artifact-version'), String(version));
    assert.equal(Number(historical.headers.get('content-length')), bytes.length);
    assert.deepEqual(Buffer.from(await historical.arrayBuffer()), bytes);
  }
  for (const query of ['version=', 'version=0', 'version=-1', 'version=01', 'version=1.0', 'version=1e0', 'version=%201', 'version=Infinity', 'version=9007199254740992', 'version=1&version=2']) {
    const invalid = await fetch(f.base + `artifacts/${current.id}/download?${query}`);
    assert.equal(invalid.status, 400, query);
    assert.equal((await invalid.json()).code, 'invalid_artifact_version');
  }
  assert.equal((await fetch(f.base + `artifacts/${current.id}/download?version=3`)).status, 404);
  assert.deepEqual(artifactBytes(f.app.store.require('artifacts', current.id)).data, nextPdf);
  assert.equal((await f.api('spaces/personal', {}, 'POST')).status, 200);
  assert.equal((await fetch(f.base + `spaces/personal/artifacts/${current.id}/download`)).status, 404);
});

test('user-created binary files write decoded bytes, reject invalid data and retain traversal/symlink protections', async t => {
  const f = await fixture(t), payload = { taskId: f.task.id, name: 'created.png', content: encodeBinaryArtifact('created.png', png).content };
  const created = await f.api('artifacts', payload); assert.equal(created.status, 201);
  assert.deepEqual(readFileSync(f.app.store.artifactPath(created.value)), png);
  assert.equal(statSync(f.app.store.artifactPath(created.value)).mode & 0o777, 0o600);
  for (const body of [{ ...payload, name: '../outside.png' }, { ...payload, name: 'invalid.png', content: 'not original bytes' }, { ...payload, name: 'wrong.pdf' }]) assert.equal((await f.api('artifacts', body)).status, 400);
  const external = path.join(f.directory, 'external.png'); writeFileSync(external, png);
  symlinkSync(external, path.join(f.app.store.taskWorkspace(f.task.id), 'linked.png'));
  assert.equal((await f.api('artifacts', { ...payload, name: 'linked.png' })).status, 400);
  assert.deepEqual(readFileSync(external), png);
  const bad = { ...created.value, id: 'malformed-stored-fixture', content: 'not original bytes' };
  f.app.store.put('artifacts', bad);
  assert.equal((await fetch(f.base + `artifacts/${bad.id}/download`)).status, 400);
});

test('project baseline excludes untouched images and PDFs; changed files stay in place without metadata or permission rewrites', async t => {
  const f = await fixture(t), projectDir = path.join(f.directory, 'project'); mkdirSync(projectDir);
  writeFileSync(path.join(projectDir, 'existing.png'), png, { mode: 0o644 });
  writeFileSync(path.join(projectDir, 'existing.pdf'), pdf('Original project file'));
  const project = (await f.api('projects', { name: 'Synthetic project', kind: 'local', path: projectDir })).value;
  const task = createTask(f.app.store, { prompt: 'Create a PDF.', projectId: project.id, mode: 'live' });
  const baseline = workspaceFiles(projectDir, { recursive: true });
  writeFileSync(path.join(projectDir, 'generated.pdf'), pdf('Generated PDF'));
  writeFileSync(path.join(projectDir, 'invalid.png'), Buffer.from('fake PNG'));
  writeFileSync(path.join(projectDir, 'private.pdf'), pdf('password="fixture-secret-value"'));
  const result = f.app.runner.collectWorkspace(task.id, new Map(), { baseline });
  assert.equal(result.count, 1); assert.equal(result.skipped, 2);
  assert.deepEqual(f.app.store.list('artifacts').map(item => item.name), ['generated.pdf']);
  assert.deepEqual(readFileSync(path.join(projectDir, 'existing.png')), png);
  assert.equal(statSync(path.join(projectDir, 'existing.png')).mode & 0o777, 0o644);
  const artifact = f.app.store.list('artifacts')[0];
  assert.equal((await f.api(`artifacts/${artifact.id}`, {}, 'DELETE')).status, 405);
  assert.equal((await f.api('artifacts', { taskId: task.id, name: 'existing.png', content: encodeBinaryArtifact('existing.png', png).content })).status, 409);
});

test('binary collection enforces individual and total byte limits, retaining skipped originals', async t => {
  const f = await fixture(t), workspace = f.app.store.taskWorkspace(f.task.id), large = pdf('Bounded fixture', 7 * 1024 * 1024);
  for (let index = 0; index < 4; index++) writeFileSync(path.join(workspace, `bounded-${index}.pdf`), large);
  writeFileSync(path.join(workspace, 'oversize.pdf'), Buffer.alloc(BINARY_ARTIFACT_LIMIT + 1));
  const result = f.app.runner.collectWorkspace(f.task.id, new Map());
  assert.equal(result.count, 3); assert.equal(result.skipped, 2); assert.equal(result.bytes, large.length * 3);
  assert.equal(statSync(path.join(workspace, 'bounded-3.pdf')).size, large.length);
  assert.equal(statSync(path.join(workspace, 'oversize.pdf')).size, BINARY_ARTIFACT_LIMIT + 1);
});

test('text downloads select persisted UTF-8 versions and never substitute a missing revision', async t => {
  const f = await fixture(t), first = '# 初稿\n预算：300 元\n', second = '# 修订\n预算：500 元\n';
  const created = await f.api('artifacts', { taskId:f.task.id, name:'review.md', content:first });
  assert.equal(created.status, 201);
  const id = created.value.id;
  assert.equal((await f.api(`artifacts/${id}`, { content:second, baseVersion:1 }, 'PUT')).status, 200);
  for (const [query, expected, version] of [['?version=1', first, '1'], ['?version=2', second, '2'], ['', second, '2']]) {
    const response = await fetch(f.base + `artifacts/${id}/download${query}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-artifact-version'), version);
    assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(expected));
    assert.equal(await response.text(), expected);
  }
  assert.equal((await fetch(f.base + `artifacts/${id}/download?version=9`)).status, 404);
  assert.equal(f.app.store.require('artifacts', id).version, 2);
});
