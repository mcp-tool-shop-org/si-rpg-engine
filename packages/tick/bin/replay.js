#!/usr/bin/env node
// replay: a seed and an admitted-input log in, the same hashes out.
//
//   replay <log.json>
//   replay <name.bundle.json>
//
// The log is what play wrote with --log. A log that carries its world is
// replayed in that world; one that does not is replayed in the fixture room.
// The model is not called. A log with a role's entries carries the manifests
// they cite, and replay gates each against its own (T7a pin 4). Such a log
// also carries its end, the tick and hash of the last frame its recording
// reached, and replay reaches that frame and checks its hash.
//
// A bundle (packages/tick/bundle.js, T5) is replayed to its save tick with
// every hash compared, on any binary: the hashes are the law's. With an image,
// one is restored at the save tick and rerun against the replay: the stored
// image when this binary recorded the bundle, else a fresh one taken here,
// after the line `image skipped: recorded on <digest>, running <digest>`. It
// prints `bundle ok`, or the T1 first-difference block and exits 1; a run
// that throws partway is `first difference at tick N: the run threw: <message>`
// and exits 1. A malformed bundle is refused with the field and exits 2.

import { readFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBundle, readBundle, replayBundle } from '../bundle.js';
import { replay } from '../replay.js';
import { loadIntentRules } from '../predicates.js';
import { fixtureWorld } from '../fixture.js';
import { guard } from '../../tool/guard.js';

guard('replay <log.json | name.bundle.json>');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const file = process.argv[2];
if (!file) {
  process.stderr.write('usage: replay <log.json | name.bundle.json>\n');
  process.exit(2);
}
// A bundle names its own path from the caller's directory; a log's path has
// always been read from the repository root.
const path = file.endsWith('.bundle.json') ? resolve(file) : resolve(root, file);
const saved = file.endsWith('.bundle.json') ? { bundle: true } : JSON.parse(readFileSync(path, 'utf8'));
chdir(root);
if (isBundle(saved)) {
  // A malformed bundle is refused with what is wrong, before anything runs.
  /** @type {import('../bundle.js').Bundle} */
  let bundle;
  try {
    bundle = readBundle(path);
  } catch (error) {
    process.stderr.write(/** @type {Error} */ (error).message + '\n');
    process.exit(2);
  }
  const result = replayBundle(bundle);
  if (result.skipped) {
    process.stdout.write(result.skipped + '\n');
  }
  if (result.status === 'refused') {
    process.stderr.write('bundle refused: ' + result.reason + '\n');
    process.exit(1);
  }
  if (result.status === 'different') {
    process.stdout.write(result.block);
    process.exit(1);
  }
  process.stdout.write('bundle ok\n');
  const image = result.image === 'stored'
    ? '; stored image of ' + result.pages + ' pages decoded in ' + result.ms.decode.toFixed(1) + ' ms'
    : result.image === 'fresh'
      ? '; fresh image of ' + result.pages + ' pages taken at tick ' + result.tick + ' in ' + result.ms.image.toFixed(1) + ' ms'
      : '; no image';
  const rerun = result.image === 'none' ? '' : ', restored in ' + result.ms.restore.toFixed(1) + ' ms, rerun to ' + result.end + ' identically in ' + result.ms.rerun.toFixed(0) + ' ms';
  process.stderr.write(bundle.name + ': ' + (result.tick + 1) + ' hashes to tick ' + result.tick + ' in ' + result.ms.replay.toFixed(0) + ' ms' + image + rerun + '\n');
  process.exit(0);
}
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
const result = replay({ seed: saved.seed, world, rules: catalog.rules, retired: catalog.retired, log: saved.log, manifests: saved.manifests, end: saved.end, law: saved.law });
if (!result.ok) {
  process.stderr.write('replay failed at entry ' + result.at + ': ' + result.reason + '\n');
  process.exit(1);
}
process.stdout.write('replay ok: ' + result.hashes.length + ' hashes\n');
