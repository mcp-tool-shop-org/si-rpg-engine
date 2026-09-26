// The bundle and the corpus, T5 (docs/dispatch-t5-replay-corpus.md). A bundle
// replays in one command and says `bundle ok` or prints the T1 block; its
// sparse image restores to the digest of the whole image; a bundle recorded
// on another binary still replays and compares every hash, with its stored
// image skipped and a fresh one restored in its place; a planted failure in a
// real test run writes one that `replay` reproduces with the same block; and
// the corpus's own bundles replay green on whatever binary runs them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PAGE, PAGES, bundleProblem, bundleText, denseImage, imageSkipped, readBundle, replayBundle, runThrew, sparseImage, sparsePages, writeBundle } from '../packages/tick/bundle.js';
import { binaryDigest, imageDigest, imageSolver, instantiate } from '../solver/dist/solver.mjs';
import { makeBundle } from './bundle.mjs';
import { CORPUS, imageCounts, runCorpus } from './corpus.mjs';
import { replayTo } from './replay-to.mjs';

const dir = mkdtempSync(join(tmpdir(), 'si-rpg-bundle-test-'));
const pinned = readFileSync('fixtures/solver.sha256', 'utf8').trim();
const stall = /** @type {import('./solver-scene.mjs').PlaySpec} */ (CORPUS[0].spec);
/** A digest that is not this binary's: the pinned Linux one where this host built another. */
const other = pinned === binaryDigest() ? '0'.repeat(64) : pinned;

/**
 * `replay <path>` as a person runs it.
 * @param {string} path
 */
function replayCommand(path) {
  return spawnSync(process.execPath, ['packages/tick/bin/replay.js', path], { encoding: 'utf8' });
}

test('the sparse image: 512 pages of 64 KiB, the non-zero ones kept, restoring to the digest of the whole 32 MiB', (t) => {
  replayTo({ scene: 'product' }, 400);
  const image = imageSolver();
  if (!image) {
    throw new Error('no image');
  }
  assert.equal(image.bytes.length, PAGES * PAGE);
  const s0 = performance.now();
  const sparse = sparseImage(image.bytes, 1);
  const sparseMs = performance.now() - s0;
  const d0 = performance.now();
  const back = denseImage(sparse);
  const denseMs = performance.now() - d0;
  const pages = sparsePages(sparse);
  t.diagnostic('the product scene at 400: ' + pages + ' of ' + PAGES + ' pages are not all zero, ' + pages * PAGE + ' bytes, ' + (sparse.data.length + sparse.pages.length) + ' as base64; sparse in ' + sparseMs.toFixed(1) + ' ms, whole again with its digest in ' + denseMs.toFixed(1) + ' ms');
  assert.ok(pages > 0 && pages < PAGES / 8, pages + ' pages');
  assert.equal(sparse.digest, image.digest, 'the digest is over the whole image');
  assert.equal(imageDigest(back), image.digest);
  assert.deepEqual(back, image.bytes);
  // One byte of a kept page changed: the whole image's digest refuses it.
  const data = Buffer.from(sparse.data, 'base64');
  data[PAGE + 7] = data[PAGE + 7] ^ 1;
  assert.throws(() => denseImage({ ...sparse, data: data.toString('base64') }), /the sparse image restores to digest [0-9a-f]{16}, not its own [0-9a-f]{16}/);
  // A page dropped from the bitmap: the count no longer matches the data.
  const bitmap = Buffer.from(sparse.pages, 'base64');
  const first = bitmap.findIndex((byte) => byte !== 0);
  bitmap[first] = bitmap[first] & (bitmap[first] - 1);
  assert.throws(() => denseImage({ ...sparse, pages: bitmap.toString('base64') }), /the bitmap marks \d+ pages and the data holds \d+/);
  assert.throws(() => sparseImage(image.bytes.subarray(0, PAGE * 3), 1), /an image is 512 pages of 64 KiB/);
});

test('a bundle with an image replays in one command: every hash to the save tick, then its stored image restored and rerun identically', (t) => {
  const bundle = makeBundle(stall, { name: 'stall at 97', tick: 97, image: true });
  assert.equal(bundle.bundle, 1);
  assert.equal(bundle.binary, binaryDigest());
  assert.match(bundle.commit, /^([0-9a-f]{40}|unknown)$/);
  assert.equal(bundle.run, 'play');
  assert.equal(bundle.hashes.length, 98);
  assert.deepEqual(bundle.world, stall.world, 'the world file as it was');
  assert.ok(bundle.image && bundle.image.worldId > 0);
  // The tick's own state is not stored: the fields are the format's, no more.
  assert.deepEqual(Object.keys(bundle).sort(), ['binary', 'bundle', 'commit', 'driven', 'failure', 'hashes', 'image', 'log', 'name', 'note', 'run', 'seed', 'steps', 'tick', 'world']);
  const path = writeBundle(bundle, dir);
  assert.match(path, /stall-at-97\.bundle\.json$/);
  assert.deepEqual(readBundle(path), JSON.parse(bundleText(bundle)));
  const run = replayCommand(path);
  t.diagnostic(run.stderr.trim());
  assert.equal(run.stdout, 'bundle ok\n', run.stderr);
  assert.equal(run.status, 0);
  assert.match(run.stderr, /98 hashes to tick 97 .*; stored image of \d+ pages decoded in [\d.]+ ms, restored in [\d.]+ ms, rerun to 640 identically/);
});

test('a log run and a product run bundle and replay too; a reference-law run has no image', () => {
  const minds = JSON.parse(readFileSync('fixtures/behavior-minds.json', 'utf8'));
  const log = makeBundle({ seed: minds.seed, world: minds.world, log: minds.log }, { name: 'minds', tick: 120, image: true });
  assert.equal(log.run, 'log');
  assert.equal(log.law, 'product');
  assert.deepEqual(log.log, minds.log);
  assert.equal(replayBundle(log).status, 'ok');
  const threeD = JSON.parse(readFileSync('fixtures/behavior-3d.json', 'utf8'));
  const reference = makeBundle({ seed: threeD.seed, world: threeD.world, log: threeD.log, law: 'reference', retired: true }, { name: '3d', image: true });
  assert.equal(reference.image, null);
  assert.equal(reference.tick, threeD.frames.length - 1);
  assert.deepEqual(reference.hashes, threeD.frames.map((/** @type {{ hash: string }} */ f) => f.hash));
  assert.equal(replayBundle(reference).status, 'ok');
});

test('(a) a bundle recorded on another binary still replays and compares every hash: its image is skipped with one line, then bundle ok', (t) => {
  const bundle = makeBundle(stall, { name: 'other binary', tick: 97, image: true });
  const path = writeBundle({ ...bundle, binary: other }, dir);
  const run = replayCommand(path);
  t.diagnostic(run.stdout.trim() + ' / ' + run.stderr.trim());
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, 'image skipped: recorded on ' + other + ', running ' + binaryDigest() + '\nbundle ok\n');
  assert.match(run.stderr, /^other binary: 98 hashes to tick 97 in \d+ ms; fresh image of \d+ pages taken at tick 97 in [\d.]+ ms, restored in [\d.]+ ms, rerun to 640 identically in \d+ ms\n$/);
  // With no image there is nothing to skip: the hashes are compared, no more.
  const bare = makeBundle(stall, { name: 'other binary, no image', tick: 97, image: false });
  const plain = replayCommand(writeBundle({ ...bare, binary: other }, dir));
  assert.equal(plain.stdout, 'bundle ok\n', plain.stderr);
  assert.match(plain.stderr, /; no image\n$/);
});

test('(b) a stored image from another binary is not used: a fresh image taken at the save tick on this binary is restored and must rerun the same', () => {
  const bundle = makeBundle(stall, { name: 'fresh', tick: 97, image: true });
  const from = { ...bundle, binary: other };
  const before = instantiate();
  const got = replayBundle(from);
  assert.equal(got.status, 'ok', JSON.stringify(got));
  if (got.status !== 'ok') {
    return;
  }
  assert.equal(got.image, 'fresh');
  assert.equal(got.skipped, imageSkipped(other, binaryDigest()));
  assert.equal(got.end, 640);
  assert.ok(got.pages !== null && got.pages > 0 && got.pages < PAGES / 8, 'pages ' + got.pages);
  assert.notEqual(instantiate(), before, 'the fresh image was restored into a new instance');
  // The stored image is not read: spoiled, it spoils nothing on another binary,
  // and it is refused on the binary that recorded it.
  if (!bundle.image) {
    throw new Error('no image');
  }
  const spoiled = { ...bundle.image, digest: '0123456789abcdef' };
  assert.equal(replayBundle({ ...from, image: spoiled }).status, 'ok');
  const own = replayBundle({ ...bundle, image: spoiled });
  assert.equal(own.status, 'refused');
  assert.match(own.status === 'refused' ? own.reason : '', /the sparse image restores to digest [0-9a-f]{16}, not its own 0123456789abcdef/);
  // Red: a fresh image of tick 102 restored at 97 does not rerun the same,
  // and the block names the save tick.
  const planted = replayBundle(from, { imageFrom: 102 });
  assert.equal(planted.status, 'different', JSON.stringify(planted));
  if (planted.status === 'different') {
    assert.equal(planted.stage, 'rerun');
    assert.match(planted.block, /^first difference at tick 97\n(snapshot|body walker field [a-z]+)\n {2}whole\.trace {4}.+\n {2}restored\.trace .+\n$/);
  }
});

test('(c) a bundle whose trace hashes differ fails with the first-difference block, from this binary or another', () => {
  const bundle = makeBundle(stall, { name: 'chain', tick: 60, image: true });
  const hashes = bundle.hashes.slice();
  const was = hashes[33];
  hashes[33] = was === '0000000000000000' ? '0000000000000001' : '0000000000000000';
  const block = 'first difference at tick 33\nhash\n  bundle ' + hashes[33] + '\n  replay ' + was + '\n';
  const here = replayCommand(writeBundle({ ...bundle, hashes }, dir));
  assert.equal(here.status, 1);
  assert.equal(here.stdout, block);
  // Recorded on another binary: the image line, then the same block. A law
  // change looks like this whatever the binary.
  const away = replayCommand(writeBundle({ ...bundle, hashes, binary: other }, dir));
  assert.equal(away.status, 1);
  assert.equal(away.stdout, 'image skipped: recorded on ' + other + ', running ' + binaryDigest() + '\n' + block);
  // A run that ends before the bundle's save tick is a length block.
  const short = replayBundle({ ...bundle, steps: 30 });
  assert.deepEqual(short, { status: 'different', stage: 'hashes', skipped: null, block: 'first difference at tick 31\nlength\n  bundle continues\n  replay ends after 31 lines\n' });
});

test('a malformed bundle is refused with what is wrong and exit 2, before anything runs: a play bundle with no steps does not hang', (t) => {
  const bundle = makeBundle(stall, { name: 'no steps', tick: 20, image: true });
  const noSteps = /** @type {Record<string, unknown>} */ ({ ...bundle });
  delete noSteps.steps;
  const path = join(dir, 'no-steps.bundle.json');
  writeFileSync(path, JSON.stringify(noSteps));
  const t0 = performance.now();
  const run = spawnSync(process.execPath, ['packages/tick/bin/replay.js', path], { encoding: 'utf8', timeout: 60000 });
  t.diagnostic('refused in ' + (performance.now() - t0).toFixed(0) + ' ms');
  assert.equal(run.signal, null, 'not killed by the timeout');
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, 'not a bundle: ' + path + ': a play bundle has whole-number steps, at least 19, its save tick less one\n');
  // Each run kind is checked for what its replay reads.
  const product = makeBundle({ scene: 'product' }, { name: 'p', tick: 3, image: false });
  const minds = JSON.parse(readFileSync('fixtures/behavior-minds.json', 'utf8'));
  const log = makeBundle({ seed: minds.seed, world: minds.world, log: minds.log }, { name: 'l', tick: 2, image: false });
  /** @type {Array<[Record<string, unknown>, RegExp]>} */
  const cases = [
    [{ ...bundle, steps: 10 }, /a play bundle has whole-number steps, at least 19, its save tick less one/],
    [{ ...bundle, driven: 'walker' }, /a play bundle has a driven array of body ids/],
    [{ ...bundle, world: { bodies: stall.world.bodies } }, /the world has bodies and colliders/],
    [{ ...bundle, hashes: bundle.hashes.slice(1) }, /the hashes run from the load to the save tick, 21 of them/],
    [{ ...bundle, image: { worldId: 1, digest: 'x' } }, /the image is null, or a world id, a digest, a page bitmap, and page data/],
    [{ ...product, quanta: undefined }, /a product bundle has whole-number quanta, at least 2, its save tick less one/],
    [{ ...log, seed: 'seven' }, /a log bundle has a seed/],
    [{ ...log, log: [{ tick: 4, hash: 'x', proposal: {} }, { tick: 2, hash: 'y', proposal: {} }] }, /log entry 1 has a tick no earlier than the entry before, a hash, and a proposal/],
    [{ ...log, law: 'box' }, /a log bundle's law is product or reference/],
  ];
  for (const [value, reason] of cases) {
    assert.match(String(bundleProblem(value)), reason);
  }
  assert.equal(bundleProblem(bundle), null);
  assert.equal(bundleProblem(product), null);
  assert.equal(bundleProblem(log), null);
  // A run's length may be one short of the save tick, which is how a failure
  // bundle records where its run stopped (#66); two short is refused.
  assert.equal(bundleProblem({ ...bundle, steps: 19 }), null);
  assert.match(String(bundleProblem({ ...bundle, steps: 18 })), /whole-number steps, at least 19, its save tick less one/);
  assert.equal(bundleProblem({ ...product, quanta: 2 }), null);
  assert.match(String(bundleProblem({ ...product, quanta: 1 })), /whole-number quanta, at least 2, its save tick less one/);
  // Not JSON at all: refused the same way.
  const garbled = join(dir, 'garbled.bundle.json');
  writeFileSync(garbled, '{ "bundle": 1, ');
  const bad = replayCommand(garbled);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /^not a bundle: .*garbled\.bundle\.json: /);
});

test('a run that throws is a difference at the tick it threw on, exit 1, not a crash: at the load, and partway', () => {
  // At the load: a coordinate JSON reads as Infinity, which the law refuses.
  const infinite = join(dir, 'infinite.bundle.json');
  const bundle = makeBundle(stall, { name: 'infinite', tick: 5, image: false });
  writeFileSync(infinite, bundleText(bundle).replace('"x": 10,', '"x": 1e999,'));
  const atLoad = replayCommand(infinite);
  assert.equal(atLoad.status, 1, atLoad.stderr);
  assert.equal(atLoad.stdout, 'first difference at tick 0: the run threw: NaN\n');
  // Partway: the minds log's second admission, at tick 76, was recorded
  // against another frame, so the tick's replay throws producing tick 77.
  const minds = JSON.parse(readFileSync('fixtures/behavior-minds.json', 'utf8'));
  const logged = makeBundle({ seed: minds.seed, world: minds.world, log: minds.log }, { name: 'minds', tick: 120, image: true });
  const real = logged.log[1].hash;
  const log = logged.log.map((e, i) => (i === 1 ? { ...e, hash: '0000000000000000' } : e));
  const partway = replayCommand(writeBundle({ ...logged, log }, dir));
  assert.equal(partway.status, 1, partway.stderr);
  assert.equal(partway.stdout, 'first difference at tick 77: the run threw: entry 1 was admitted against ' + real + ', not 0000000000000000\n');
  assert.equal(runThrew(77, new Error('entry 1')), 'first difference at tick 77: the run threw: entry 1\n');
});

test('every failure writes one: when the corpus\'s untraced and traced product runs part, it writes a bundle of the run to the tick they part', () => {
  const into = join(dir, 'corpus-split');
  const was = process.env.SI_RPG_BUNDLES;
  process.env.SI_RPG_BUNDLES = into;
  /** @type {ReturnType<typeof runCorpus>} */
  let results;
  try {
    // Planted: the traced run's walker is nudged after the frame at 150.
    results = runCorpus({ quanta: 400, points: 2, only: 'product scene', plantSplit: 150, say: () => {} });
  } finally {
    if (was === undefined) {
      delete process.env.SI_RPG_BUNDLES;
    } else {
      process.env.SI_RPG_BUNDLES = was;
    }
  }
  assert.deepEqual(results.map((r) => r.name + ' ' + r.status), ['product scene 400 different']);
  const [split] = results;
  assert.match(split.block || '', /^first difference at tick 151\nhash\n {2}untraced [0-9a-f]{16}\n {2}traced {3}[0-9a-f]{16}\n$/);
  assert.ok(split.bundle, 'the split wrote a bundle');
  assert.deepEqual(readdirSync(into), ['product-scene-400.bundle.json']);
  const bundle = readBundle(split.bundle || '');
  assert.equal(bundle.run, 'product');
  assert.equal(bundle.quanta, 400);
  assert.equal(bundle.tick, 151);
  assert.equal(bundle.hashes.length, 152);
  assert.ok(bundle.image, 'imaged at the split');
  assert.deepEqual(bundle.failure, { test: 'corpus', block: split.block });
  // The bundle is the untraced run to the split, which replays as it ran.
  assert.equal(replayBundle(bundle).status, 'ok');
});

test('every failure writes one: when the corpus\'s two product runs stop at the same tick short of its quanta, the bundle carries the run through the tick they stopped at, and replay prints the same length block (#66)', () => {
  const into = join(dir, 'corpus-stop');
  const was = process.env.SI_RPG_BUNDLES;
  process.env.SI_RPG_BUNDLES = into;
  /** @type {ReturnType<typeof runCorpus>} */
  let results;
  try {
    // Planted: the scene's own length is 300 and the corpus asks for 400, so
    // both runs make frames 0 to 300 and stop, and neither throws.
    results = runCorpus({ quanta: 400, points: 2, only: 'product scene', plantStop: 300, say: () => {} });
  } finally {
    if (was === undefined) {
      delete process.env.SI_RPG_BUNDLES;
    } else {
      process.env.SI_RPG_BUNDLES = was;
    }
  }
  assert.deepEqual(results.map((r) => r.name + ' ' + r.status), ['product scene 400 different']);
  const [stop] = results;
  assert.ok(stop.bundle, 'the stop wrote a bundle');
  const path = stop.bundle || '';
  // The reproduction first: replay on the bundle stops where the runs did and
  // prints the block the corpus wrote into it, with the exit of any difference.
  const bundle = readBundle(path);
  const replayed = replayCommand(path);
  assert.equal(replayed.stdout, bundle.failure ? bundle.failure.block : '(no failure block)', 'replay reproduces the stop');
  assert.equal(replayed.status, 1, replayed.stderr);
  assert.equal(stop.block, 'first difference at tick 301\nlength\n  bundle continues\n  replay ends after 301 lines\n');
  assert.deepEqual(bundle.failure, { test: 'corpus', block: stop.block });
  // Carried through the tick the runs stopped at: frames 0 to 300 as they ran,
  // and `-` for 301, the frame neither made.
  assert.equal(bundle.run, 'product');
  assert.equal(bundle.quanta, 300);
  assert.equal(bundle.tick, 301);
  assert.equal(bundle.hashes.length, 302);
  assert.equal(bundle.hashes[301], '-');
  assert.match(bundle.hashes[300], /^[0-9a-f]{16}$/);
  assert.equal(bundle.image, null, 'no capture reaches a frame the run never made');
});

test('every failure writes one: planted failures in a real test run write bundles, and replay reproduces the restore failure with the same first-difference block', () => {
  const planted = join(dir, 'planted.test.js');
  const url = (/** @type {string} */ file) => JSON.stringify(pathToFileURL(resolve('harness', file)).href);
  writeFileSync(planted, [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    'import { expectIdentical, recordRun, withBundles } from ' + url('bundle.mjs') + ';',
    'import { replayTo } from ' + url('replay-to.mjs') + ';',
    'import { createWorld } from ' + url('../packages/tick/world.js') + ';',
    'const spec = ' + JSON.stringify(stall) + ';',
    // A restore test's failure: the image saved at 45 restored at 40.
    "test('planted restore: the image of 45 restored at 40', () => {",
    '  const whole = replayTo(spec, 0);',
    '  const lines = [whole.line()];',
    '  while (whole.advance()) { lines.push(whole.line()); }',
    '  const later = replayTo(spec, 45).world.save();',
    '  const run = replayTo(spec, 40);',
    '  run.world.restore({ ...run.world.save(), worldId: later.worldId, image: later.image });',
    '  const restored = lines.slice(0, 40);',
    '  restored.push(run.line());',
    '  while (run.advance()) { restored.push(run.line()); }',
    "  expectIdentical('planted restore at 40', lines, restored, [{ spec, tick: 40, image: { bytes: later.image.bytes, worldId: later.worldId } }]);",
    '});',
    // An outcome test's failure: a course case whose number is wrong.
    "test('planted course: the walker is past x 20', withBundles('planted course', () => {",
    '  recordRun(spec);',
    "  const world = createWorld(spec.world, 'product');",
    '  for (let q = 0; q < spec.steps; q = q + 1) { world.step(new Set(spec.driven)); }',
    "  assert.ok(world.body('walker').x > 20, 'x ' + world.body('walker').x);",
    '}));',
    '',
  ].join('\n'));
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, SI_RPG_BUNDLES: join(dir, 'written') };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', planted], { encoding: 'utf8', env });
  const output = child.stdout + child.stderr;
  assert.equal(child.status, 1, output);
  const written = readdirSync(join(dir, 'written')).sort();
  assert.deepEqual(written, ['planted-course.bundle.json', 'planted-restore-at-40.bundle.json']);
  for (const file of written) {
    assert.match(output, new RegExp('bundle: .*' + file.replace(/\./g, '\\.')), 'the path is printed');
  }

  // The restore failure: its bundle carries the wrong image, and replay
  // restores it and prints the block the failing test printed.
  const restore = readBundle(join(dir, 'written', 'planted-restore-at-40.bundle.json'));
  assert.equal(restore.tick, 40);
  assert.ok(restore.failure);
  const block = restore.failure.block;
  assert.match(block, /^first difference at tick 40\n/);
  for (const line of block.trim().split('\n')) {
    assert.ok(output.includes(line.trim()), 'the failing test printed ' + line);
  }
  const replayed = replayCommand(join(dir, 'written', 'planted-restore-at-40.bundle.json'));
  assert.equal(replayed.status, 1, replayed.stderr);
  assert.equal(replayed.stdout, block, 'replay prints the same first-difference block');

  // The course failure: its bundle is the run it drove, which reproduces.
  const course = readBundle(join(dir, 'written', 'planted-course.bundle.json'));
  assert.equal(course.tick, stall.steps);
  assert.ok(course.failure && /x \d/.test(course.failure.block));
  const again = replayCommand(join(dir, 'written', 'planted-course.bundle.json'));
  assert.equal(again.stdout, 'bundle ok\n', again.stderr);
});

test('the corpus: the walker stall and the product scene\'s verb-boundary switches replay green on this binary, with their stored images where it recorded them and fresh ones where it did not, and the job counts which', (t) => {
  const files = readdirSync('fixtures/corpus').filter((f) => f.endsWith('.bundle.json')).sort();
  assert.deepEqual(files, ['product-rebuild-261.bundle.json', 'walker-stall-flat-ground.bundle.json']);
  const here = binaryDigest();
  for (const item of CORPUS) {
    const bundle = readBundle('fixtures/corpus/' + item.name + '.bundle.json');
    assert.equal(bundle.name, item.name);
    assert.equal(bundle.tick, item.tick);
    assert.ok(bundle.image, item.name + ' has an image');
    assert.ok(bundle.note.length > 100, item.name + ' says what it records');
    const result = replayBundle(bundle);
    assert.equal(result.status, 'ok', JSON.stringify(result));
    if (result.status === 'ok') {
      assert.equal(result.image, bundle.binary === here ? 'stored' : 'fresh');
      assert.equal(result.skipped, bundle.binary === here ? null : imageSkipped(bundle.binary, here));
      t.diagnostic(item.name + ': recorded on ' + bundle.binary + ', running ' + here + ': ' + result.image + ' image of ' + result.pages + ' pages, rerun to ' + result.end + ' identically');
    }
  }
  assert.match(readBundle('fixtures/corpus/walker-stall-flat-ground.bundle.json').note, /on 0 of its 640 quanta it moves less than half a stride\. Until F2 it stalled on 23, first at 98 /);
  assert.match(readBundle('fixtures/corpus/product-rebuild-261.bundle.json').note, /switches bodies in place.*201 .*261 .*401 .*cross all three switches/);
  // What the job prints: how many stored images it used and how many it skipped.
  const results = runCorpus({ quanta: 0, points: 10, only: 'walker-stall', say: () => {} });
  assert.deepEqual(results.map((r) => r.name + ' ' + r.status), ['walker-stall-flat-ground ok']);
  const stored = readBundle('fixtures/corpus/walker-stall-flat-ground.bundle.json').binary === here;
  assert.deepEqual({ used: imageCounts(results).used, skipped: imageCounts(results).skipped }, stored ? { used: 1, skipped: 0 } : { used: 0, skipped: 1 });
  assert.match(imageCounts(results).line, /^stored images: [01] used, [01] skipped \(recorded on another binary; a fresh image restored instead\)$/);
});
