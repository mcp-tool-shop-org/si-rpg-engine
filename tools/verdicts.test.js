import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict, combine } from './verdicts.js';

/** @typedef {import('./verdicts.js').Item} Item */

/**
 * @param {string} family
 * @param {'MERGE' | 'BLOCK'} verdict
 * @param {Item[]} [items]
 */
const seat = (family, verdict, items = []) => ({ family, parsed: { verdict, items } });
/** @param {number | string} n @param {string} [result] @returns {Item} */
const failing = (n, result = 'FAILS') => ({ n, result, evidence: '' });
/** @param {number | string} n @returns {Item} */
const holding = (n) => ({ n, result: 'HOLDS', evidence: '' });

test('parseVerdict takes the last fenced json block that carries items and a verdict', () => {
  const text = 'a draft\n```json\n{"items":[],"verdict":"BLOCK"}\n```\nthe answer\n```json\n{"items":[{"n":1,"result":"HOLDS"}],"verdict":"MERGE"}\n```\n';
  assert.equal(parseVerdict(text)?.verdict, 'MERGE');
});

test('parseVerdict reads a bare object that ends the answer', () => {
  const text = 'reasoning first.\n{"items":[{"n":2,"result":"FAILS"}],"verdict":"BLOCK","block_reason":"item 2"}';
  const v = parseVerdict(text);
  assert.equal(v?.verdict, 'BLOCK');
  assert.equal(v?.block_reason, 'item 2');
});

test('parseVerdict falls back to the block before a malformed last one', () => {
  const text = '```json\n{"items":[],"verdict":"MERGE"}\n```\n```json\n{"items":[, "verdict":"BLOCK"}\n```';
  assert.equal(parseVerdict(text)?.verdict, 'MERGE');
});

test('parseVerdict returns null without a verdict of MERGE or BLOCK', () => {
  assert.equal(parseVerdict(''), null);
  assert.equal(parseVerdict('no json here'), null);
  assert.equal(parseVerdict('```json\n{"items":[],"verdict":"APPROVE"}\n```'), null);
  assert.equal(parseVerdict('```json\n{"verdict":"MERGE"}\n```'), null);
});

test('combine reports no valid verdicts when nothing was counted', () => {
  assert.equal(combine([]).decision, 'NO VALID VERDICTS');
});

test('combine merges when no counted reviewer blocks', () => {
  const r = combine([seat('xAI', 'MERGE', [holding(1)]), seat('Google', 'MERGE')]);
  assert.equal(r.decision, 'MERGE');
  assert.equal(r.text, 'MERGE (unanimous among valid verdicts)');
});

test('combine sends a lone BLOCK to the coordinator as a CHECK', () => {
  const r = combine([seat('xAI', 'BLOCK', [failing(3)]), seat('Google', 'MERGE', [holding(3)])]);
  assert.equal(r.decision, 'CHECK');
  assert.match(r.text, /^CHECK: 1 BLOCK;/);
});

test('combine treats two BLOCKs on different items as a CHECK', () => {
  const r = combine([seat('xAI', 'BLOCK', [failing(3)]), seat('Google', 'BLOCK', [failing(5)])]);
  assert.equal(r.decision, 'CHECK');
  assert.match(r.text, /^CHECK: 2 BLOCKs on different items;/);
});

test('combine corroborates a BLOCK when two families fail the same item', () => {
  const r = combine([seat('xAI', 'BLOCK', [failing(3)]), seat('Google', 'BLOCK', [failing(3), failing(4)])]);
  assert.equal(r.decision, 'BLOCK');
  assert.deepEqual(r.shared, [['3', ['xAI', 'Google']]]);
  assert.equal(r.text, 'BLOCK: item 3 failed by xAI and Google');
});

test('combine counts a family once however often it lists a failed item', () => {
  const r = combine([seat('xAI', 'BLOCK', [failing(3), failing(3), failing('3')]), seat('Google', 'MERGE')]);
  assert.equal(r.decision, 'CHECK');
  assert.deepEqual(r.shared, []);
});

test('combine compares item numbers as text and results without regard to case', () => {
  const r = combine([seat('xAI', 'BLOCK', [failing(7)]), seat('Moonshot', 'BLOCK', [failing(' 7', 'fails ')])]);
  assert.equal(r.decision, 'BLOCK');
  assert.deepEqual(r.shared, [['7', ['xAI', 'Moonshot']]]);
});

test('combine does not let a MERGE reviewer corroborate a BLOCK', () => {
  const r = combine([seat('xAI', 'BLOCK', [failing(2)]), seat('Google', 'MERGE', [failing(2)])]);
  assert.equal(r.decision, 'CHECK');
});

test('combine treats a BLOCK that fails no item as a CHECK', () => {
  const r = combine([seat('xAI', 'BLOCK', [holding(1)]), seat('Google', 'BLOCK', [holding(1)])]);
  assert.equal(r.decision, 'CHECK');
});
