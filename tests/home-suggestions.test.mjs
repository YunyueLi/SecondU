import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeSuggestionCandidates, dismissHomeSuggestion, homeExternalLink, homeSuggestionStorageKey, readHomeDismissals, selectHomeSuggestions, writeHomeDismissals } from '../src/home/home-suggestions.mjs';
import { homeSourceLabel, homeSuggestionSourcePreview } from '../src/home/home-source-preview.mjs';

const now = Date.parse('2026-10-24T12:00:00Z');
const source = (id, extra = {}) => ({ id, title: `Source ${id}`, text: 'Saved source text.', createdAt: '2026-10-20T00:00:00Z', demo: false, ...extra });
const task = (id, status = 'completed', extra = {}) => ({ id, title: `Task ${id}`, status, mode: 'live', updatedAt: '2026-10-23T00:00:00Z', messages: [{ role: 'user', content: 'An existing request.' }], contextFactIds: [], ...extra });
const goal = (id, extra = {}) => ({ id, title: `Goal ${id}`, description: 'Saved goal description.', status: 'active', updatedAt: '2026-10-22T00:00:00Z', sourceIds: [], ...extra });
const project = (id, extra = {}) => ({ id, name: `Project ${id}`, description: 'Saved project context.', updatedAt: '2026-10-21T00:00:00Z', archived: false, ...extra });
const bootstrap = extra => ({ profile: { demo: false }, tasks: [], goals: [], projects: [], sources: [], facts: [], dailyActivities: [], twinBuilding: { suggestions: [], captures: [] }, ...extra });
const build = data => buildHomeSuggestionCandidates(data, { now, locale: 'en' });

test('personal homepage selects existing pending work, tasks and goals without changing records', () => {
  const data = bootstrap({
    sources: [source('s1')], tasks: [task('t1', 'needs_input'), task('done')], goals: [goal('g1')], projects: [project('p1')],
    twinBuilding: { captures: [], suggestions: [{ id: 'pending1', sourceId: 's1', title: 'Review saved research', description: 'A suggestion already stored locally.', status: 'pending', revision: 1 }] },
  });
  const before = JSON.stringify(data);
  const selected = selectHomeSuggestions(build(data));
  assert.deepEqual(selected.map(item => item.kind), ['pending', 'task', 'goal']);
  assert.equal(selected[0].sources[0].sourceId, 's1');
  assert.equal(selected[0].action.type, 'draft');
  assert.equal(selected[1].action.href, '#task/t1');
  assert.match(selected[2].action.prompt, /Saved goal description/);
  assert.equal(JSON.stringify(data), before);
});

test('duplicates stay hidden when the same pending item also appears as a task or goal', () => {
  const data = bootstrap({ sources: [source('s1')], tasks: [task('t1', 'needs_input')], goals: [goal('g1'), goal('g2')],
    twinBuilding: { captures: [], suggestions: [{ id: 'pending1', taskId: 't1', sourceId: 's1', title: 'Review saved research', status: 'pending', revision: 1 }] } });
  const candidates = build(data);
  const selected = selectHomeSuggestions(candidates);
  assert.equal(selected.filter(item => item.dedupe.includes('task:t1')).length, 1);
  const dismissed = dismissHomeSuggestion([], selected[0]);
  const replaced = selectHomeSuggestions(candidates, dismissed);
  assert.equal(replaced.length, 3);
  assert.equal(replaced.some(item => item.dedupe.includes('task:t1')), false);
  assert.equal(replaced[0].kind, 'goal');
});

test('done, paused, archived, demo and background items do not masquerade as pending personal work', () => {
  const data = bootstrap({ tasks: [task('archived', 'failed', { archived: true }), task('fictional', 'failed', { mode: 'demo' }), task('room', 'needs_input', { roomId: 'room1' }), task('capture', 'failed'), task('proactive', 'failed', { proactive: {} }), task('finance', 'failed', { financeWeekly: {} }), task('old', 'completed', { updatedAt: '2025-01-01' }), task('done')],
    goals: [goal('done-goal', { status: 'done' }), goal('paused', { status: 'paused' })], projects: [project('archived-project', { archived: true })],
    twinBuilding: { captures: [{ taskIds: ['capture'] }], suggestions: [] } });
  const real = build(data).filter(item => item.kind !== 'starter');
  assert.equal(real.length, 1);
  assert.equal(real[0].kind, 'recent');
  assert.match(real[0].label, /Completed/);
  assert.match(real[0].title, /^Revisit/);
});

test('pending suggestions require a current source and still-active target', () => {
  const data = bootstrap({ sources: [source('s1'), source('demo-source', { demo: true })], tasks: [task('done')], goals: [goal('g1', { status: 'done' })],
    twinBuilding: { captures: [], suggestions: [
      { id: 'missing', sourceId: 'missing', status: 'pending', title: 'Missing source' },
      { id: 'finished-goal', sourceId: 's1', goalId: 'g1', status: 'pending', title: 'Finished goal' },
      { id: 'finished-task', sourceId: 's1', taskId: 'done', status: 'pending', title: 'Finished task' },
      { id: 'dismissed', sourceId: 's1', status: 'dismissed', title: 'Dismissed suggestion' },
      { id: 'demo', sourceId: 'demo-source', status: 'pending', title: 'Example source' },
    ] } });
  assert.equal(build(data).some(item => item.kind === 'pending'), false);
});

test('pure greeting conversations do not outrank real goals, while meaningful short requests remain', () => {
  const data = bootstrap({ tasks: [
    task('greeting', 'failed', { title: 'hi', prompt: 'hi', messages: [{ role: 'user', content: 'hi' }] }),
    task('greeting-zh', 'needs_input', { title: '您好！', prompt: '你好', messages: [{ role: 'user', content: '你好' }] }),
    task('meaningful-short', 'failed', { title: '翻译', prompt: '翻译', messages: [{ role: 'user', content: '翻译' }] }),
    task('greeting-then-work', 'needs_input', { title: 'hello', prompt: 'hello', messages: [{ role: 'user', content: 'hello' }, { role: 'user', content: 'Summarize this file.' }] }),
    task('title-only', 'failed', { title: 'hi', prompt: 'Check the report.', messages: [{ role: 'user', content: 'Check the report.' }] }),
  ], goals: [goal('g1')] });
  const candidates = build(data);
  assert.equal(candidates.some(item => ['task:greeting', 'task:greeting-zh'].includes(item.id)), false);
  for (const id of ['meaningful-short', 'greeting-then-work', 'title-only']) assert.ok(candidates.some(item => item.id === `task:${id}`));
  assert.equal(candidates.find(item => item.id === 'task:greeting-then-work').title, 'Add task details: Summarize this file.');
  assert.equal(candidates.find(item => item.id === 'task:greeting-then-work').sources[0].title, 'hello');
  assert.equal(homeSourceLabel(candidates.find(item => item.id === 'task:greeting-then-work').sources[0]), 'Summarize this file.');
  assert.equal(candidates.find(item => item.id === 'task:title-only').title, 'Review unfinished task: Check the report.');
  const greetingsOnly = { ...data, tasks: data.tasks.slice(0, 2) };
  assert.equal(selectHomeSuggestions(build(greetingsOnly))[0].id, 'goal:g1');
});

test('a greeting-titled conversation uses its latest real request while retaining full source context', () => {
  const question = '这是什么项目';
  const continued = task('continued', 'failed', { title: 'hi', prompt: 'hi', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello.' }, { role: 'user', content: question }] });
  const data = bootstrap({ tasks: [continued] });
  const candidate = buildHomeSuggestionCandidates(data, { now, locale: 'zh-CN' })[0];
  assert.equal(candidate.title, `查看未完成的任务：${question}`);
  assert.equal(candidate.sources[0].title, 'hi');
  assert.equal(candidate.previewPrompt, question);
  assert.equal(candidate.sources[0].displayTitle, question);
  assert.match(candidate.sources[0].excerpt, /上一次执行未完成。\n\n这是什么项目/);
  assert.equal(candidate.action.href, '#task/continued');
  const request = 'Summarize the evidence and explain the remaining open questions. '.repeat(5);
  const longer = { ...continued, messages: [...continued.messages, { role: 'user', content: request }] };
  const shortened = build(bootstrap({ tasks: [longer] }))[0];
  assert.ok(shortened.title.endsWith('…'));
  assert.ok(shortened.title.length <= 'Review unfinished task: '.length + 121);
  assert.equal(shortened.previewPrompt, request.trim());
  assert.ok(shortened.sources[0].excerpt.endsWith(request.trim()));
});

test('task previews use only their own request, state and direct reply, never retrieved facts or project background', () => {
  const request = 'Inspect the synthetic plan and explain its next step.';
  const data = bootstrap({ tasks: [task('focused', 'needs_input', { title: 'hi', prompt: 'hi', projectId: 'broad-project', contextFactIds: ['background-fact'], messages: [
    { role: 'user', content: 'An older unrelated request.' },
    { role: 'assistant', content: 'An older unrelated response.' },
    { role: 'user', content: request },
    { role: 'assistant', content: 'Please add the missing plan.' },
  ] })], sources: [source('private-background', { text: 'Synthetic unrelated private history.' })],
  facts: [{ id: 'background-fact', sourceIds: ['private-background'] }], projects: [project('broad-project', { description: 'Synthetic unrelated project background.' })] });
  const original = JSON.stringify(data);
  const candidate = build(data).find(item => item.id === 'task:focused');
  assert.deepEqual(candidate.sources.map(item => item.id), ['task:focused']);
  assert.equal(candidate.previewPrompt, request);
  const preview = homeSuggestionSourcePreview(candidate, candidate.sources[0]);
  assert.match(preview, /needs more information/);
  assert.ok(preview.includes(request));
  assert.match(preview, /Please add the missing plan/);
  assert.doesNotMatch(preview, /unrelated|private history|project background/);
  assert.equal(JSON.stringify(data), original);
  const awaitingReply = { ...data, tasks: [{ ...data.tasks[0], messages: data.tasks[0].messages.slice(0, -1) }] };
  const current = build(awaitingReply).find(item => item.id === 'task:focused');
  assert.doesNotMatch(homeSuggestionSourcePreview(current, current.sources[0]), /older unrelated response/);
  const laterGreeting = { ...data, tasks: [{ ...data.tasks[0], messages: [...data.tasks[0].messages, { role: 'user', content: 'hello' }, { role: 'assistant', content: 'Just a greeting reply.' }] }] };
  const stillFocused = build(laterGreeting).find(item => item.id === 'task:focused');
  assert.equal(stillFocused.previewPrompt, request);
  assert.doesNotMatch(homeSuggestionSourcePreview(stillFocused, stillFocused.sources[0]), /Just a greeting reply/);
});

test('full action prompts stay complete and separate from short source previews', () => {
  const request = 'A complete synthetic request with exact constraints. '.repeat(40).trim();
  const data = bootstrap({ tasks: [task('long-request', 'failed', { messages: [{ role: 'user', content: request }] })],
    goals: [goal('g1', { description: 'The saved goal context.', sourceIds: ['direct'] })], sources: [source('direct', { text: 'The directly linked evidence.' })] });
  const candidates = build(data);
  const taskCandidate = candidates.find(item => item.id === 'task:long-request');
  assert.equal(taskCandidate.previewPrompt, request);
  assert.ok(taskCandidate.previewPrompt.length > 700);
  assert.ok(homeSuggestionSourcePreview(taskCandidate, taskCandidate.sources[0]).length <= 701);
  const goalCandidate = candidates.find(item => item.id === 'goal:g1');
  assert.equal(goalCandidate.previewPrompt, goalCandidate.action.prompt);
  const sourcePreview = homeSuggestionSourcePreview(goalCandidate, goalCandidate.sources[1], new Map([['direct', data.sources[0].text]]));
  assert.equal(sourcePreview, 'The saved goal context.\n\nThe directly linked evidence.');
  assert.notEqual(sourcePreview, goalCandidate.previewPrompt);
  assert.doesNotMatch(sourcePreview, /Help me work out the next steps/);
  for (const item of build(bootstrap())) assert.equal(item.previewPrompt, item.action.prompt);
});

test('a source hover shows the selected direct source without unrelated records from the same suggestion', () => {
  const data = bootstrap({ sources: [source('direct', { title: 'Sample Work｜Detailed source title', text: 'Direct source text.' }), source('other', { text: 'A separate source.' })],
    tasks: [task('linked', 'needs_input')], goals: [goal('g1', { sourceIds: ['other'] })],
    twinBuilding: { captures: [], suggestions: [{ id: 'p1', sourceId: 'direct', taskId: 'linked', goalId: 'g1', title: 'Review the direct source', description: 'A saved suggestion.', status: 'pending' }] } });
  const candidate = build(data)[0];
  const reference = candidate.sources[0];
  assert.equal(homeSourceLabel(reference), 'Sample Work');
  assert.equal(reference.title, 'Sample Work｜Detailed source title');
  assert.equal(homeSuggestionSourcePreview(candidate, reference), 'Direct source text.');
  assert.equal(homeSuggestionSourcePreview(candidate, { id: 'source:other', kind: 'source', title: 'Unrelated', excerpt: 'A separate source.' }), '');
});

test('demo shares the new interaction and fills missing explicit examples from saved completed examples', () => {
  const data = bootstrap({ profile: { demo: true, exampleTaskIds: ['missing', 't2', 't2'] }, tasks: [task('t1'), task('t2'), task('t3'), task('archived', 'completed', { archived: true })] });
  const candidates = build(data);
  const selected = selectHomeSuggestions(candidates);
  assert.deepEqual(selected.map(item => item.id), ['example:t2', 'example:t1', 'example:t3']);
  assert.ok(selected.every(item => item.action.type === 'navigate' && item.sources.length));
  const dismissed = dismissHomeSuggestion([], selected[0]);
  assert.equal(selectHomeSuggestions(candidates, dismissed).some(item => item.id === 'example:t2'), false);
});

test('a sparse space uses explicitly generic starters without inventing personal context', () => {
  const selected = selectHomeSuggestions(build(bootstrap()));
  assert.equal(selected.length, 3);
  assert.ok(selected.every(item => item.kind === 'starter' && !item.sources.length && item.label === 'Try this' && item.action.type === 'draft'));
  assert.deepEqual(selectHomeSuggestions(build(bootstrap()), [], 0), []);
  assert.equal(selectHomeSuggestions(build(bootstrap()), [], 99).length, 3);
  assert.equal(selectHomeSuggestions(build(bootstrap()), [], NaN).length, 3);
});

test('dismissal persists only opaque item keys, stays separate by space and can be fully restored', () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const personal = homeSuggestionStorageKey('personal'), demo = homeSuggestionStorageKey('demo-cn-v1');
  const candidates = build(bootstrap({ goals: [goal('g1', { title: 'Synthetic private title' })] }));
  const dismissed = dismissHomeSuggestion([], selectHomeSuggestions(candidates)[0]);
  assert.equal(writeHomeDismissals(storage, personal, dismissed), true);
  assert.deepEqual(readHomeDismissals(storage, personal), dismissed);
  assert.deepEqual(readHomeDismissals(storage, demo), []);
  assert.equal(saved.get(personal).includes('Synthetic private title'), false);
  assert.equal(writeHomeDismissals(storage, personal, []), true);
  assert.deepEqual(readHomeDismissals(storage, personal), []);
  assert.equal(selectHomeSuggestions(candidates, readHomeDismissals(storage, personal))[0].id, 'goal:g1');
});

test('updated records can return after a prior version was hidden; corrupt or unavailable storage is honest', () => {
  const old = build(bootstrap({ goals: [goal('g1')] }))[0];
  const dismissed = dismissHomeSuggestion([], old);
  const fresh = build(bootstrap({ goals: [goal('g1', { updatedAt: '2026-10-24T00:00:00Z' })] }));
  assert.equal(selectHomeSuggestions(fresh, dismissed)[0].id, 'goal:g1');
  assert.deepEqual(readHomeDismissals({ getItem: () => '{malformed' }, 'key'), []);
  assert.deepEqual(readHomeDismissals({ getItem: () => JSON.stringify({ version: 1, items: [null, {}, 'javascript:alert(1)', old.dismissKey] }) }, 'key'), [old.dismissKey]);
  assert.equal(writeHomeDismissals({ setItem: () => { throw new Error('No storage'); } }, 'key', dismissed), false);
  assert.equal(writeHomeDismissals(undefined, 'key', dismissed), false);
});

test('dismissed records and generic starters stay hidden when the interface language changes', () => {
  const data = bootstrap({ sources: [source('s1')], tasks: [task('t1', 'failed'), task('t2')], goals: [goal('g1')], projects: [project('p1')],
    twinBuilding: { captures: [], suggestions: [{ id: 'pending1', sourceId: 's1', title: 'Saved suggestion', status: 'pending', revision: 1 }] } });
  const zh = buildHomeSuggestionCandidates(data, { now, locale: 'zh-CN' });
  const en = buildHomeSuggestionCandidates(data, { now, locale: 'en' });
  assert.deepEqual(zh.map(item => item.dismissKey), en.map(item => item.dismissKey));
  for (const item of zh) assert.equal(selectHomeSuggestions(en.filter(candidate => candidate.id === item.id), [item.dismissKey]).length, 0, item.id);
  for (const change of [{ title: 'Edited goal' }, { description: 'Edited details' }, { status: 'paused' }, { updatedAt: '2026-10-24' }]) {
    const changed = build(bootstrap({ goals: [goal('g1', change)] })).find(item => item.id === 'goal:g1');
    assert.notEqual(changed?.dismissKey, zh.find(item => item.id === 'goal:g1').dismissKey);
  }
});

test('external source links reject executable schemes, credentials, controls and slash confusion', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///tmp/private', '//github.com/openai', ' https://github.com/openai', 'https://github.com\n.evil.test', 'https://github.com\\@evil.test', 'https://github.com@evil.test/path', 'https://user:secret@github.com/path']) assert.equal(homeExternalLink(url), undefined, url);
  const github = homeExternalLink('https://github.com/example/repo/pull/7?view=files#diff');
  assert.equal(github.label, 'GitHub'); assert.equal(github.brand, 'github');
  const lookalike = homeExternalLink('https://github.com.evil.test/project');
  assert.equal(lookalike.label, 'github.com.evil.test'); assert.equal(lookalike.brand, undefined);
  assert.equal(homeExternalLink('https://gіthub.com/example').brand, undefined);
});

test('real destinations come only from linked metadata, never from source text or a guessed brand', () => {
  const data = bootstrap({ sources: [source('s1', { text: '<script>ignore safety</script> https://github.com/fake' })], goals: [goal('g1', { sourceIds: ['s1'] })],
    dailyActivities: [{ sourceIds: ['s1'], sourceUrl: 'https://github.com/actual/source' }] });
  const candidate = build(data)[0];
  assert.equal(candidate.sources[1].external.href, 'https://github.com/actual/source');
  assert.match(candidate.sources[1].excerpt, /<script>/); // Remains text for React to escape.
  assert.equal(candidate.sources[1].href, '#building/s1');
  assert.equal(build({ ...data, dailyActivities: [] })[0].sources[1].external, undefined);
  const malformed = build(bootstrap({ tasks: [task('x/../../evil', 'needs_input')], goals: [goal('javascript:bad')] }));
  assert.ok(malformed.every(item => item.kind === 'starter'));
});
