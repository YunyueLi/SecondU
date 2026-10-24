import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENTS_SECTIONS, agentHref, agentSection, isAgentRoomRoute } from '../src/agents-navigation-model.mjs';

test('all four agent destinations retain their existing routes and development labels', () => {
  assert.deepEqual(AGENTS_SECTIONS.map(section => agentHref(section.id)), ['#agents', '#agents/discover', '#agents/market', '#agents/dating']);
  assert.deepEqual(AGENTS_SECTIONS.filter(section => section.development).map(section => section.id), ['market', 'dating']);
  assert.equal(agentSection('network'), 'market');
  assert.equal(agentHref('network'), '#agents/market');
});

test('directory navigation does not absorb existing agent room routes', () => {
  for (const id of [undefined, '', 'network', 'market', 'dating', 'discover']) assert.equal(isAgentRoomRoute(id), false);
  for (const id of ['room-42', 'mine', 'custom-room']) assert.equal(isAgentRoomRoute(id), true);
  assert.equal(agentSection(undefined), 'mine');
});
