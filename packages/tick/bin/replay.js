#!/usr/bin/env node
// replay: a seed and an admitted-input log in, the same hashes out.
//
//   replay <log.json>
//
// The log is what play wrote with --log. A log that carries its world is
// replayed in that world; one that does not is replayed in the fixture room.
// The model is not called.

import { readFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replay } from '../replay.js';
import { loadIntentRules } from '../predicates.js';
import { fixtureWorld } from '../fixture.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
chdir(root);

const file = process.argv[2];
if (!file) {
  process.stderr.write('usage: replay <log.json>\n');
  process.exit(2);
}
const saved = JSON.parse(readFileSync(file, 'utf8'));
if (!Array.isArray(saved.log)) {
  process.stderr.write('not a play log: no log array in ' + file + '\n');
  process.exit(2);
}
const catalog = loadIntentRules();
/** @param {unknown} value */
function isWorld(value) {
  const v = /** @type {{ bodies?: unknown, colliders?: unknown } | null} */ (value);
  return !!v && typeof v === 'object' && Array.isArray(v.bodies) && Array.isArray(v.colliders);
}
// A play log carries `world`; a host log carries the `scene` it served.
const world = isWorld(saved.world) ? saved.world : isWorld(saved.scene) ? { bodies: saved.scene.bodies, colliders: saved.scene.colliders } : fixtureWorld();
const result = replay({ seed: saved.seed, world, rules: catalog.rules, retired: catalog.retired, log: saved.log });
if (!result.ok) {
  process.stderr.write('replay failed at entry ' + result.at + ': ' + result.reason + '\n');
  process.exit(1);
}
process.stdout.write('replay ok: ' + result.hashes.length + ' hashes\n');
