#!/usr/bin/env node
// load: admit or retire a verb between sessions. Runs from the repository root.
//
//   load admit <draft.json>
//   load retire <verb>
//
// A draft that compiles and passes predicates/hazards is written under
// predicates/intents and named by the index. Retire moves it to index.retired.
// Play does not call this.

import { readFileSync, writeFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { considerDraft, retireVerb } from '../admit.js';
import { loadHazards } from '../suite.js';

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
} else {
  process.stderr.write('usage: load admit <draft.json> | load retire <verb>\n');
  process.exit(2);
}
