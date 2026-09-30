import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import before from './fixtures/demo-zh-before-v1.json' with { type: 'json' };
import older from './fixtures/demo-baseline-v3.json' with { type: 'json' };
import v4 from './fixtures/demo-baseline-v4.json' with { type: 'json' };
import v5 from './fixtures/demo-baseline-v5.json' with { type: 'json' };
import showcase from './fixtures/demo-showcase.json' with { type: 'json' };
import projectNames from './fixtures/demo-showcase-project-names-v1.json' with { type: 'json' };
import legacyTranslations from '../shared/demo-showcase-translations.json' with { type: 'json' };
import { chineseDemoPart } from './demo-zh-data.mjs';
import { renameDemoText } from './demo-names.mjs';

export const DEMO_ZH_CONTENT_MARKER = 'demo-zh-content-v1';
const collections = ['sources', 'facts', 'people', 'relationships', 'events', 'conversations', 'goals', 'agents', 'projects', 'tasks', 'artifacts', 'automations'];
const key = (collection, id) => `${collection}/${id}`;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const timestamps = new Set(['createdAt', 'updatedAt', 'recordedAt']);
function canonical(value, field = '') {
  if (typeof value === 'string' && timestamps.has(field) && Number.isFinite(Date.parse(value))) return '<authored-time>';
  if (Array.isArray(value)) return value.map(item => canonical(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(name => [name, canonical(value[name], name)]));
  return value;
}
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function rename(value) {
  if (typeof value === 'string') return renameDemoText(value);
  if (Array.isArray(value)) return value.map(rename);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, /(?:Id|Ids)$/.test(field) || field === 'id' ? item : rename(item)]));
  return value;
}
const oldParts = [before.seed, before.expansion, before.life, before.showcase, ...(before.installed ?? []),
  older.seed, older.gitHeadSeed, older.preFactRevisionSchema, older.expansion, older.life,
  v4.seed, v4.expansion, v4.life, ...(v4.installed ?? []), v5.seed, v5.expansion, v5.life, ...(v5.installed ?? [])];
const baselines = new Map();
for (const part of oldParts) for (const collection of collections) for (const record of part?.[collection] ?? []) {
  const id = key(collection, record.id);
  baselines.set(id, [...(baselines.get(id) ?? []), record, rename(record)]);
}
function factCore(record) {
  const { updatedAt, version, history, ...rest } = record;
  return rest;
}
function knownFact(record, templates) {
  if (!templates.some(template => equal(factCore(record), factCore(template)))) return false;
  if (!Array.isArray(record.history) || record.version !== record.history.length) return false;
  const histories = templates.flatMap(template => template.history ?? []);
  const reasons = new Set([...histories.map(item => item.reason), '演示资料更新为万叶（Caspian）的工作与生活，旧版默认内容保存在基线存档。']);
  return record.history.every((entry, index) => {
    if (entry.version !== index + 1 || !reasons.has(entry.reason) || !Number.isFinite(Date.parse(entry.recordedAt))) return false;
    const { version, reason, recordedAt, ...content } = entry;
    return histories.some(previous => {
      const { version, reason, recordedAt, ...expected } = previous;
      return equal(content, expected);
    });
  });
}
function known(collection, record, installation) {
  if (!record) return false;
  const templates = baselines.get(key(collection, record.id)) ?? [];
  if (collection === 'facts') return knownFact(record, templates);
  return templates.some(template => {
    let expected = template;
    if (collection === 'projects') {
      if (!installation?.root || !template.showcaseFolder) return false;
      const { showcaseFolder, ...fields } = template;
      expected = { ...fields, path: path.join(installation.root, showcaseFolder) };
      const previousName = projectNames.find(item => item.id === record.id)?.from;
      if (record.name === previousName) expected.name = previousName;
    }
    return equal(record, expected);
  });
}
function refs(record) {
  return [
    ...(record.sourceIds ?? []).map(id => ['sources', id]),
    ...(record.contextFactIds ?? []).map(id => ['facts', id]),
    ...(record.personIds ?? []).map(id => ['people', id]),
    ...(record.agentIds ?? []).map(id => ['agents', id]),
    ...(record.projectId ? [['projects', record.projectId]] : []),
    ...(record.taskId ? [['tasks', record.taskId]] : []),
    ...(record.artifactIds ?? []).map(id => ['artifacts', id]),
    ...(record.from ? [['people', record.from], ['people', record.to]] : []),
    ...(record.portrait?.entries ?? []).flatMap(entry => (entry.sourceIds ?? []).map(id => ['sources', id])),
    ...(record.messages ?? []).flatMap(message => message.sourceId ? [['sources', message.sourceId]] : []),
  ];
}
function portrait(entries, stamp, previous) {
  const version = (previous?.version ?? 0) + 1;
  const rows = entries.map(entry => ({ ...entry, recordedAt: stamp }));
  return { schema: 'hither.person.v1', version, updatedAt: stamp, entries: rows,
    history: [...(previous?.history ?? []), { version, recordedAt: stamp, entries: structuredClone(rows) }] };
}
export function chineseDemoRecords(stamp = new Date().toISOString()) {
  const parts = ['seed', 'expansion', 'stories', 'life'].map(part => chineseDemoPart(part, stamp));
  const result = { profile: parts[0].profile, ...Object.fromEntries(collections.map(collection => [collection, parts.flatMap(part => part[collection] ?? [])])) };
  const portraits = chineseDemoPart('portraits', stamp);
  result.people = result.people.map(person => ({ ...person,
    sourceIds: [...new Set([...person.sourceIds, ...portraits[person.id].flatMap(entry => entry.sourceIds)])],
    portrait: portrait(portraits[person.id], stamp),
  }));
  return result;
}
function safeFolder(folder, root) {
  return path.isAbsolute(root ?? '') && path.dirname(folder) === root && existsSync(folder)
    && !lstatSync(folder).isSymbolicLink() && lstatSync(folder).isDirectory()
    && realpathSync(root) === root && realpathSync(folder) === folder;
}
function readableFile(file) {
  try {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) return { unsafe: true };
    return { content: readFileSync(file, 'utf8') };
  } catch (error) { if (error.code === 'ENOENT') return { missing: true }; throw error; }
}
function writeAuthoredFile(file, content, allowed) {
  const current = readableFile(file);
  if (current.unsafe || !current.missing && !allowed.includes(current.content)) throw new Error('An example file changed during the update; the file was preserved.');
  if (current.content === content) return;
  if (current.missing) { writeFileSync(file, content, { flag: 'wx', mode: 0o600 }); return; }
  // Existing files have already matched their exact authored content. A temp file
  // makes each replacement atomic; retry accepts either authored revision.
  const temporary = `${file}.demo-zh-${process.pid}.tmp`;
  writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
  renameSync(temporary, file);
}

/** Upgrade only known author records, protecting edited records and their evidence. */
export function applyChineseDemoContent(store) {
  const profile = store.get('meta', 'profile')?.value;
  if (profile?.demo !== true || profile.demoLocale === 'en' || store.get('meta', DEMO_ZH_CONTENT_MARKER)) return;
  const stamp = new Date().toISOString();
  return store.transaction(() => {
    if (store.get('meta', DEMO_ZH_CONTENT_MARKER)) return;
    const installation = store.get('meta', 'demo-showcase-v1')?.value;
    const data = chineseDemoRecords(stamp);
    if (installation) for (const collection of collections) for (const value of showcase[collection] ?? []) {
      const record = structuredClone(value);
      if (collection === 'projects') { record.path = path.join(installation.root, record.showcaseFolder); delete record.showcaseFolder; }
      data[collection].push(record);
    }
    const plan = new Map();
    for (const collection of collections) for (const wanted of data[collection]) {
      const current = store.get(collection, wanted.id);
      const state = equal(current, wanted) ? 'unchanged' : known(collection, current, installation) ? 'update' : 'preserve';
      plan.set(key(collection, wanted.id), { collection, wanted, current, state, reason: current ? 'edited_record' : 'removed_record' });
    }
    const preserve = (id, reason) => {
      const item = plan.get(id);
      if (!item || item.state === 'preserve') return false;
      item.state = 'preserve'; item.reason = reason; return true;
    };
    // An authored task and its output form one unit, including the disk file.
    const files = [];
    if (installation) {
      for (const artifact of showcase.artifacts) {
        const a = plan.get(key('artifacts', artifact.id)), t = plan.get(key('tasks', artifact.taskId));
        const currentProject = t.current && store.get('projects', t.current.projectId);
        const nextProject = plan.get(key('projects', t.wanted.projectId))?.wanted;
        if (a.state === 'preserve' || t.state === 'preserve' || !currentProject || !nextProject
          || !safeFolder(currentProject.path, installation.root) || !safeFolder(nextProject.path, installation.root)) {
          preserve(key('tasks', t.wanted.id), 'edited_task_or_output'); preserve(key('artifacts', artifact.id), 'edited_task_or_output'); continue;
        }
        const oldFile = path.join(currentProject.path, a.current.name), newFile = path.join(nextProject.path, artifact.name);
        const old = readableFile(oldFile), destination = oldFile === newFile ? old : readableFile(newFile);
        const allowed = [a.current.content, artifact.content];
        if (old.unsafe || old.missing || !allowed.includes(old.content) || destination.unsafe || !destination.missing && !allowed.includes(destination.content)) {
          preserve(key('tasks', t.wanted.id), 'edited_or_missing_file'); preserve(key('artifacts', artifact.id), 'edited_or_missing_file'); continue;
        }
        files.push({ owner: key('artifacts', artifact.id), path: oldFile, content: artifact.content, allowed });
        if (newFile !== oldFile) files.push({ owner: key('artifacts', artifact.id), path: newFile, content: artifact.content, allowed });
      }
      for (const project of showcase.projects) {
        const item = plan.get(key('projects', project.id));
        if (!item?.current || !safeFolder(item.current.path, installation.root)) continue;
        const file = path.join(item.current.path, 'README.md'), current = readableFile(file);
        if (current.missing || current.unsafe) continue;
        const previous = before.showcase.projects.find(value => value.id === project.id);
        const entries = legacyTranslations.projects[project.id] ?? {};
        const firstLine = before.showcase.sources[0].text.split('\n')[0];
        const allowed = [previous.name, projectNames.find(value => value.id === project.id)?.from].filter(Boolean).flatMap(name => [
          `# ${name}\n\n${previous.description}\n\n${entries[name]}\n\n${entries[previous.description]}\n\n${firstLine}\n`,
          `# ${name}\n\n${previous.description}\n\n${firstLine}\n`,
        ]);
        const content = `# ${project.name}\n\n${project.description}\n\n${showcase.sources[0].text.split('\n')[0]}\n`;
        allowed.push(content);
        if (allowed.includes(current.content)) files.push({ owner: key('projects', project.id), path: file, content, allowed });
      }
    }
    for (const collection of collections) for (const current of store.list(collection)) {
      const item = plan.get(key(collection, current.id));
      if (item?.state !== 'preserve' && item) continue;
      for (const [target, id] of refs(current)) preserve(key(target, id), 'referenced_by_preserved_record');
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of plan.values()) {
        if (item.state === 'preserve' && item.current) {
          for (const [collection, id] of refs(item.current)) if (['sources', 'facts', 'artifacts', 'tasks', 'projects'].includes(collection)) changed = preserve(key(collection, id), 'evidence_of_preserved_record') || changed;
        } else if (item.state === 'update' && refs(item.wanted).some(([collection, id]) =>
          plan.get(key(collection, id))?.state === 'preserve' || !plan.has(key(collection, id)) && !store.get(collection, id))) {
          changed = preserve(key(item.collection, item.wanted.id), 'preserved_or_missing_reference') || changed;
        }
      }
    }
    const report = { appliedAt: stamp, updated: [], unchanged: [], preserved: [], files: [] };
    for (const file of files) {
      if (plan.get(file.owner)?.state !== 'update') continue;
      const before = readableFile(file.path);
      writeAuthoredFile(file.path, file.content, file.allowed);
      report.files.push({ path: file.path, before: before.missing ? null : hash(before.content), after: hash(file.content) });
    }
    for (const item of plan.values()) {
      if (item.state === 'preserve') { report.preserved.push({ collection: item.collection, id: item.wanted.id, reason: item.reason }); continue; }
      if (item.state === 'unchanged') { report.unchanged.push({ collection: item.collection, id: item.wanted.id }); continue; }
      const record = structuredClone(item.wanted);
      if (item.current?.createdAt) record.createdAt = item.current.createdAt;
      if (item.collection === 'facts') {
        record.version = item.current.version + 1;
        record.history = [...item.current.history, { ...record.history.at(-1), version: record.version, recordedAt: stamp, reason: '中文示例资料修订，保留之前的记录。' }];
      }
      if (item.collection === 'people' && item.current.portrait) record.portrait = portrait(chineseDemoPart('portraits')[record.id], stamp, item.current.portrait);
      store.put(item.collection, record);
      const entry = { collection: item.collection, id: record.id, before: hash(item.current), after: hash(record) };
      report.updated.push(entry);
      const registered = installation?.records.findIndex(value => value.collection === item.collection && value.id === record.id);
      if (registered !== undefined && registered !== -1) installation.records[registered].sha256 = hash(record);
    }
    const profileKnown = equal(profile, data.profile) || oldParts.some(part => part?.profile && [part.profile, rename(part.profile)].some(value => equal(profile, value)));
    const profileEvidencePreserved = plan.get(key('people', 'person-self'))?.state === 'preserve';
    if (profileKnown && !profileEvidencePreserved) store.setMeta('profile', data.profile);
    else report.preserved.push({ collection: 'meta', id: 'profile', reason: profileKnown ? 'preserved_profile_evidence' : 'edited_profile' });
    if (installation) store.setMeta('demo-showcase-v1', installation);
    store.setMeta(DEMO_ZH_CONTENT_MARKER, report);
    return report;
  });
}
