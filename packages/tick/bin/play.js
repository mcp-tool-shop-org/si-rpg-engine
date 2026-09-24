#!/usr/bin/env node
// play: an intent log in, committed frames out. Runs from the repository root
// so the intent rules load from their literal path.
//
//   play <proposals.json> [--seed N] [--log out.json]
//
// A proposal whose frameHash is "@drawn" is given the hash of the frame the
// host would have drawn, which is the current committed frame. The tick still
// refuses any other stale hash.

import { readFileSync, writeFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTick } from '../tick.js';
import { createWorld } from '../world.js';
import { createMemory } from '../memory.js';
import { loadIntentRules } from '../predicates.js';
import { FIXTURE_SEED, fixtureWorld } from '../fixture.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
chdir(root);

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  process.stderr.write('usage: play <proposals.json> [--seed N] [--log out.json]\n');
  process.exit(2);
}
const seedIndex = args.indexOf('--seed');
const seed = seedIndex >= 0 ? Number(args[seedIndex + 1]) : FIXTURE_SEED;
const logIndex = args.indexOf('--log');
const logPath = logIndex >= 0 ? args[logIndex + 1] : null;

/** @type {import('../../frame/types.js').Proposal[]} */
const proposals = JSON.parse(readFileSync(file, 'utf8'));

const tick = createTick({
  seed,
  world: createWorld(fixtureWorld()),
  rules: loadIntentRules(),
  memory: createMemory(),
});

tick.attach({
  draw(frame) {
    const b = frame.bodies[0];
    process.stdout.write(frame.tick + ' ' + frame.hash + ' ' + b.id + ' ' + b.x + ' ' + b.y + '\n');
  },
});

let refused = 0;
for (const p of proposals) {
  if (p.kind === 'intent' && p.frameHash === '@drawn') {
    p.frameHash = tick.frame().hash;
  }
  const a = tick.submit(p);
  if (!a.admitted) {
    refused = refused + 1;
    process.stderr.write('refused ' + p.kind + ': ' + a.reason + '\n');
  }
}

if (logPath) {
  writeFileSync(logPath, JSON.stringify({ seed, log: tick.log() }, null, 2) + '\n');
}
process.stderr.write('admitted ' + tick.log().length + ', refused ' + refused + ', final ' + tick.frame().hash + '\n');
