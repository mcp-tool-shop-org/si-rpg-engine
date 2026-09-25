import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL, BUDGET_LIMIT, panelProblems, choose } from './panel.js';

test('the shipped panel is sound: every seat has a transport, a model, a family of its own, and a budget within its limit', () => {
  assert.deepEqual(panelProblems(PANEL), []);
  for (const seat of PANEL) {
    assert.ok(seat.maxTokens <= BUDGET_LIMIT[seat.via], seat.model);
  }
});

test('a seat without an output budget is a problem, named, before any call is made', () => {
  const problems = panelProblems([{ via: 'openrouter', model: 'google/gemini-3.1-pro-preview', family: 'Google' }]);
  assert.deepEqual(problems, ['google/gemini-3.1-pro-preview: the output budget must be a whole number of tokens']);
});

test('a budget over the transport limit, an unknown transport, and a repeated family are problems', () => {
  const problems = panelProblems([
    { via: 'openrouter', model: 'a', family: 'A', maxTokens: 500000 },
    { via: 'carrier-pigeon', model: 'b', family: 'B', maxTokens: 1000 },
    { via: 'ollama', model: 'c', family: 'a', maxTokens: 1000 },
    { via: 'ollama', model: 'd', family: 'D', maxTokens: 1.5 },
  ]);
  assert.deepEqual(problems, [
    'a: the output budget 500000 is over the limit of 128000',
    'b: the transport must be openrouter or ollama',
    'c: the family a already has a seat',
    'd: the output budget must be a whole number of tokens',
  ]);
});

test('choose takes the seats not on standby by default, and named families without regard to case', () => {
  assert.deepEqual(choose(PANEL, undefined).seats.map((s) => s.family), ['xAI', 'Google', 'Moonshot', 'Z.ai']);
  const named = choose(PANEL, 'google, deepseek');
  assert.deepEqual(named.seats.map((s) => s.family), ['Google', 'DeepSeek']);
  assert.deepEqual(named.unknown, []);
});

test('choose reports a family that matches no seat, so a misspelt name stops the run', () => {
  const r = choose(PANEL, 'Google,Gemni');
  assert.deepEqual(r.seats.map((s) => s.family), ['Google']);
  assert.deepEqual(r.unknown, ['Gemni']);
});
