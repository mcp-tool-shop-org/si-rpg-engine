import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict, combine, whyNotCounted } from './verdicts.js';

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

test('parseVerdict finds a verdict whose keys come in another order, with prose after it', () => {
  const text = 'Summary first.\n{"verdict":"BLOCK","block_reason":"item 1","items":[{"n":1,"result":"FAILS","evidence":"a } and a { in a string"}],"defects":[]}\nThat is all.';
  const v = parseVerdict(text);
  assert.equal(v?.verdict, 'BLOCK');
  assert.equal(v?.items[0].evidence, 'a } and a { in a string');
});

test('parseVerdict is not thrown by braces or an odd quotation mark in the prose before the verdict', () => {
  const text = 'The corpus returns { tick, block } for a stop, and the gap is 5" wide.\n```json\n{"items":[],"verdict":"MERGE","defects":[],"block_reason":""}\n```';
  assert.equal(parseVerdict(text)?.verdict, 'MERGE');
});

test('parseVerdict takes the later of a draft and a final verdict whatever their key order', () => {
  const text = '{"items":[],"verdict":"BLOCK"} was my draft. On reflection: {"verdict":"MERGE","items":[{"n":1,"result":"HOLDS","evidence":""}]}';
  assert.equal(parseVerdict(text)?.verdict, 'MERGE');
});

test('parseVerdict drops entries that are not objects, so combine and the summary cannot crash on them', () => {
  const v = parseVerdict('{"items":[null,{"n":1,"result":"FAILS","evidence":""},7],"defects":[null,"x",{"file":"a.js","severity":"high","what":"w"}],"verdict":"BLOCK"}');
  assert.equal(v?.items.length, 1);
  assert.deepEqual(v?.defects, [{ file: 'a.js', severity: 'high', what: 'w' }]);
  if (!v) {
    throw new Error('no verdict');
  }
  assert.equal(combine([{ family: 'xAI', parsed: v }]).decision, 'CHECK');
  assert.deepEqual(parseVerdict('{"items":[],"defects":"none","verdict":"MERGE"}')?.defects, []);
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

test('whyNotCounted names an answer cut off by its output budget, with the reasoning share', () => {
  const usage = { completion_tokens: 31996, max_tokens: 32000, finish_reason: 'length', completion_tokens_details: { reasoning_tokens: 30717 } };
  assert.equal(whyNotCounted('1. HOLDS ... ```json\n{"items": [', usage), 'output budget spent: 31996 of 32000 tokens, 30717 of them reasoning; the answer stopped before its verdict');
});

test('whyNotCounted names a streamed answer that spent its budget thinking', () => {
  const usage = { completion_tokens: 131072, max_tokens: 131072, done_reason: 'length', thinking_chars: 250000 };
  assert.equal(whyNotCounted('', usage), 'output budget spent: 131072 of 131072 tokens, with 250000 characters of thinking; no answer');
});

test('whyNotCounted keeps the plain reasons when the budget was not reached', () => {
  assert.equal(whyNotCounted('', { finish_reason: 'stop' }), 'no answer');
  assert.equal(whyNotCounted('I approve.', { done_reason: 'stop' }), 'answer did not contain the verdict JSON');
  assert.equal(whyNotCounted('I approve.', undefined), 'answer did not contain the verdict JSON');
});

test('parseVerdict reads a verdict whose JSON has a comma before a closing bracket, and says so', () => {
  // Z.ai's MERGE on PR #95 ended its items array with "},\n  ],".
  const text = 'Items hold.\n```json\n{\n  "items": [\n    {"n": 1, "result": "HOLDS", "evidence": "a, ] stays"},\n  ],\n  "defects": [],\n  "verdict": "MERGE",\n  "block_reason": "",\n}\n```';
  const v = parseVerdict(text);
  assert.ok(v, 'the verdict is read');
  assert.equal(v.verdict, 'MERGE');
  assert.equal(v.trailingCommas, true);
  assert.equal(v.items.length, 1);
  assert.equal(v.items[0].evidence, 'a, ] stays', 'a comma inside a string is kept');
});

test('parseVerdict marks nothing when the JSON is strict', () => {
  const v = parseVerdict('```json\n{"items": [{"n": 1, "result": "HOLDS"}], "verdict": "MERGE"}\n```');
  assert.ok(v);
  assert.equal(v.trailingCommas, undefined);
});
