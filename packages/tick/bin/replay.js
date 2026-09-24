#!/usr/bin/env node
// replay: a seed and an admitted-input log in, the same hashes out.
//
//   replay <log.json>
//
// The log is what play wrote with --log. The model is not called.

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
const catalog = loadIntentRules();
const result = replay({ seed: saved.seed, world: fixtureWorld(), rules: catalog.rules, retired: catalog.retired, log: saved.log });
if (!result.ok) {
  process.stderr.write('replay failed at entry ' + result.at + ': ' + result.reason + '\n');
  process.exit(1);
}
process.stdout.write('replay ok: ' + result.hashes.length + ' hashes\n');
