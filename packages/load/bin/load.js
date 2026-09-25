#!/usr/bin/env node
// load: admit or retire a verb between sessions. Runs from the repository root.
//
//   load admit <draft.json>
//   load retire <verb>
//   load world <world.json>
//
// A draft that compiles and passes predicates/hazards is written under
// predicates/intents and named by the index. Retire moves it to index.retired.
// Play does not call this.
//
// A world is validated, must settle, must hash the same twice, and is swept
// for reachability (T6, packages/load/world.js): an authored zone no explored
// state reaches, a body that leaves the world, or a throw refuses it, and the
// refusal names the zone or the bundle that replays the finding. The sweep's
// report goes to stderr; stdout stays the load hash alone, as before.

import { readFileSync, writeFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { considerDraft, retireVerb } from '../admit.js';
import { loadHazards } from '../suite.js';
import { considerWorld } from '../world.js';
import { bundleDir } from '../../tick/bundle.js';
import { loadScene } from '../../tick/scene.js';
import { guard } from '../../tool/guard.js';

guard('load admit <draft.json> | load retire <verb> | load world <world.json>');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
chdir(root);

const INDEX = 'predicates/intents/index.json';
const args = process.argv.slice(2);
const command = args[0];
const subject = args[1];

function readIndex() {
  const index = JSON.parse(readFileSync(INDEX, 'utf8'));
  return { rules: index.rules, retired: Array.isArray(index.retired) ? index.retired : [] };
}

if (command === 'admit' && subject) {
  const draft = JSON.parse(readFileSync(subject, 'utf8'));
  const result = considerDraft(draft, loadHazards(), readIndex());
  if (!result.ok) {
    process.stderr.write('refused: ' + result.reason + '\n');
    process.exit(1);
  }
  writeFileSync('predicates/intents/' + result.rule.verb + '.json', JSON.stringify(result.rule, null, 2) + '\n');
  writeFileSync(INDEX, JSON.stringify(result.index, null, 2) + '\n');
  process.stdout.write('admitted ' + result.rule.verb + '\n');
} else if (command === 'retire' && subject) {
  const result = retireVerb(readIndex(), subject);
  if (!result.ok) {
    process.stderr.write('refused: ' + result.reason + '\n');
    process.exit(1);
  }
  writeFileSync(INDEX, JSON.stringify(result.index, null, 2) + '\n');
  process.stdout.write('retired ' + subject + '\n');
} else if (command === 'world' && subject) {
  const loaded = loadScene(subject);
  if (!loaded.ok) {
    process.stderr.write(loaded.reason + '\n');
    process.exit(1);
  }
  const considered = considerWorld(loaded.scene, { bundles: bundleDir() });
  for (const line of considered.lines) {
    process.stderr.write(line + '\n');
  }
  if (!considered.ok) {
    process.stderr.write(considered.reason + '\n');
    process.exit(1);
  }
  const hash = considered.hash;
  const indexPath = 'worlds/index.json';
  /** @type {{ worlds: Record<string, string> }} */
  let index = { worlds: {} };
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch {
    index = { worlds: {} };
  }
  if (!index.worlds) {
    index.worlds = {};
  }
  index.worlds[loaded.scene.name] = hash;
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  process.stdout.write(hash + '\n');
} else {
  process.stderr.write('usage: load admit <draft.json> | load retire <verb> | load world <world.json>\n');
  process.exit(2);
}
