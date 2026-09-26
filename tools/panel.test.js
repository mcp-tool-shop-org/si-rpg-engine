import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL, BUDGET_LIMIT, OLLAMA_CONCURRENCY, panelProblems, choose } from './panel.js';

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
  const defaults = choose(PANEL, undefined).seats;
  assert.deepEqual(defaults.map((s) => s.family), ['Moonshot', 'Z.ai', 'DeepSeek', 'NVIDIA', 'MiniMax', 'Mistral']);
  assert.ok(defaults.every((s) => s.via === 'ollama'), 'a default seat is an Ollama seat');
  assert.deepEqual(choose(PANEL, 'openai, google').seats.map((s) => s.model), ['gpt-oss:120b-cloud', 'gemma4:31b-cloud']);
  const withStandby = [...PANEL, { via: /** @type {const} */ ('ollama'), model: 'x:cloud', family: 'Spare', maxTokens: 1000, standby: true }];
  assert.equal(choose(withStandby, undefined).seats.some((s) => s.family === 'Spare'), false, 'a standby seat is left out by default');
  assert.deepEqual(choose(withStandby, 'spare').seats.map((s) => s.family), ['Spare']);
  const named = choose(PANEL, 'google, deepseek');
  assert.deepEqual(named.seats.map((s) => s.family), ['DeepSeek', 'Google']);
  assert.deepEqual(named.unknown, []);
});

test('choose reports a family that matches no seat, so a misspelt name stops the run', () => {
  const r = choose(PANEL, 'Google,Gemni');
  assert.deepEqual(r.seats.map((s) => s.family), ['Google']);
  assert.deepEqual(r.unknown, ['Gemni']);
});

test('a think setting is one Ollama understands, and only on an Ollama seat', () => {
  assert.deepEqual(panelProblems([{ via: 'ollama', model: 'm', family: 'M', maxTokens: 1000, think: 'extreme' }]), ['m: think must be true, false, high, medium, or low']);
  assert.deepEqual(panelProblems([{ via: 'openrouter', model: 'o', family: 'O', maxTokens: 1000, think: 'high' }]), ['o: think is an Ollama setting']);
  assert.deepEqual(panelProblems([{ via: 'ollama', model: 'n', family: 'N', maxTokens: 1000, think: 'high' }]), []);
});

test('the Ollama seats run at once, up to the plan\'s concurrency, which covers the whole panel', () => {
  assert.ok(Number.isInteger(OLLAMA_CONCURRENCY) && OLLAMA_CONCURRENCY >= 1);
  assert.ok(PANEL.filter((s) => s.via === 'ollama').length <= OLLAMA_CONCURRENCY);
});
