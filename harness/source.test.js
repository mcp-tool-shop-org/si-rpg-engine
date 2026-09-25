// Authored values are literals. A world file is JSON, which holds only
// literals; a scene built in code could compute a starting value with a
// transcendental function, whose last bit ECMAScript leaves to the host. The
// product scene and the fixture builders are read as source and refused if
// they call Math.sin, Math.cos, Math.tan, Math.atan2, or Math.hypot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const BUILDERS = [
  'harness/product-scene.mjs',
  'harness/product-run.mjs',
  'harness/sim.mjs',
  'harness/arith.mjs',
  'harness/solver-scene.mjs',
  'harness/verbs-scene.mjs',
  'harness/minds-scene.mjs',
  'packages/tick/fixture.js',
  'harness/caps.test.js',
];

const HOST_CHOSEN = /\bMath\s*(?:\.\s*|\[\s*['"`])(sin|cos|tan|atan2|hypot)\b/g;

/**
 * Every call the source makes to a function whose result the host chooses.
 * @param {string} source
 * @returns {string[]} `Math.<name>` at `line:column`, in source order
 */
export function hostChosen(source) {
  /** @type {string[]} */
  const found = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i = i + 1) {
    for (const match of lines[i].matchAll(HOST_CHOSEN)) {
      found.push('Math.' + match[1] + ' at ' + (i + 1) + ':' + ((match.index || 0) + 1));
    }
  }
  return found;
}

test('the product scene and the fixture builders compute no starting value with a trigonometric call', () => {
  for (const file of BUILDERS) {
    assert.deepEqual(hostChosen(readFileSync(file, 'utf8')), [], file);
  }
});

test('the source check refuses each of the five, dotted or bracketed, and nothing else', () => {
  const planted = [
    "const q = { qz: Math.sin(Math.PI / 8), qw: Math.cos(Math.PI / 8) };",
    "const t = Math.tan(0.1);",
    "const a = Math . atan2(1, 2);",
    "const h = Math['hypot'](3, 4);",
  ].join('\n');
  assert.deepEqual(hostChosen(planted), [
    'Math.sin at 1:17',
    'Math.cos at 1:44',
    'Math.tan at 2:11',
    'Math.atan2 at 3:11',
    'Math.hypot at 4:11',
  ]);
  assert.deepEqual(hostChosen('const s = Math.sqrt(2) + Math.abs(-1) + Math.sinh(0) + Math.min(1, 2);'), []);
});
