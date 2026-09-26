import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from './check-translations.mjs';

const ENGLISH = [
  '# Title',
  '',
  '| a | b |',
  '|---|---|',
  '',
  '```bash',
  'npm ci',
  '```',
  '',
  '378 tests. Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.',
  '',
].join('\n');

test('a faithful translation holds', () => {
  const ja = ENGLISH.replace('378 tests.', '378 のテスト。').replace('Built by', '構築:');
  assert.deepEqual(compare(ENGLISH, ja, ['378']), []);
});

test('a dropped site link is caught even when no token is named', () => {
  const ja = ENGLISH.replace('<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>', 'MCP Tool Shop');
  assert.deepEqual(compare(ENGLISH, ja, []), ['token https://mcp-tool-shop.github.io/: 0 vs 1']);
});

test('a changed code block, a lost table row, a lost heading, and a stale count are each named', () => {
  const bad = ENGLISH.replace('npm ci', 'npm install').replace('|---|---|\n', '').replace('# Title', 'Title').replace('378', '375');
  assert.deepEqual(compare(ENGLISH, bad, ['378']), ['headings 0 vs 1', 'table rows 1 vs 2', 'code block 0 differs', 'token 378: 0 vs 1']);
});

test('line endings do not count as a difference in a code block', () => {
  assert.deepEqual(compare(ENGLISH, ENGLISH.replace(/\n/g, '\r\n'), ['378']), []);
});
