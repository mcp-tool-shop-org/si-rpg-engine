// The reachability sweep, T6 pin 11 (docs/dispatch-t6-reachability-sweep.md).
// The worlds in fixtures/sweep/ are closed rooms built for one check each:
// the vault walled on four sides past the climb's maxRise and the same with a
// wall gone, a plateau past maxRise and one the climb covers, and a gap in the
// floor. Each sweep here runs under load world's own budget, LOAD_BUDGET, and
// every zone witness of every world swept is replayed through the ordinary
// replay path and compared hash for hash (pin 8). A sweep whose restore omits
// the hasher's lanes has witnesses that do not replay, so the replay is the
// check that exploring by restore explores the real world. A throw planted
// into the tick, in the processes of load world and replay only, is refused
// with its bundle, and replay reproduces it. Two tests hold existing content
// to what the sweep says of it: everything that loads today still loads, the
// minds fixture included since F3 stopped the push launching its crate over
// its walls, pinned here, and the scheduled job's record of every world it
// sweeps fails on any verdict that moves.
//
// Swept twice, a world with findings gives the same findings in the same
// order, with bundles equal byte for byte (#83); and a sweep that throws in
// the scheduled job fails with a block naming the world and the throw, and
// the issue the job writes quotes the block.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBundle, specOf } from '../packages/tick/bundle.js';
import { replayTo } from '../packages/tick/runs.js';
import { settles } from '../packages/tick/admit-world.js';
import { loadScene, validateScene } from '../packages/tick/scene.js';
import { costLine, replayWitness, sceneInput, sweep, sweepVerdict } from '../packages/load/sweep.js';
import { LOAD_BUDGET, considerWorld } from '../packages/load/world.js';
import { SWEEP_BUDGET, issueText, readSweepRecord, runCorpus, sweepCorpus, sweepWorlds } from './corpus.mjs';

const dir = mkdtempSync(join(tmpdir(), 'si-rpg-sweep-'));

/**
 * @typedef {import('../packages/load/sweep.js').SweepInput} SweepInput
 * @typedef {import('../packages/load/sweep.js').SweepReport} SweepReport
 */

/** @type {Map<string, { input: SweepInput, report: SweepReport, verdict: ReturnType<typeof sweepVerdict> }>} */
const swept = new Map();

/**
 * A world file swept once under LOAD_BUDGET, its findings bundled into this
 * run's directory; the tests share the reports.
 * @param {string} file
 */
function sweepOf(file) {
  const known = swept.get(file);
  if (known) {
    return known;
  }
  const loaded = loadScene(file);
  if (!loaded.ok) {
    throw new Error(file + ': ' + loaded.reason);
  }
  const input = sceneInput(loaded.scene);
  const report = sweep(input, { budget: LOAD_BUDGET, bundles: dir });
  const made = { input, report, verdict: sweepVerdict(report) };
  swept.set(file, made);
  return made;
}

/**
 * @param {SweepReport} report
 * @param {string} id
 */
function zoneOf(report, id) {
  const zone = report.zones.find((item) => item.id === id);
  if (!zone) {
    throw new Error('no zone ' + id);
  }
  return zone;
}

test('the vault walled in on four sides past the climb\'s reach is refused with the zone named, and the same vault with one wall gone is admitted with a witness into it', (t) => {
  const walled = sweepOf('fixtures/sweep/walled.json');
  t.diagnostic('walled: ' + costLine(walled.report));
  assert.equal(walled.report.complete, true, 'the frontier emptied inside the budget');
  assert.equal(walled.verdict.admitted, false);
  assert.equal(walled.verdict.reasons.length, 1, walled.verdict.reasons.join('\n'));
  assert.match(walled.verdict.reasons[0], /^zone vault is not reached: actors walker; \d+ cells explored; move to the centres of the 8 neighbouring cells; /);
  assert.equal(zoneOf(walled.report, 'yard').reached, true, 'the sweep reaches the rest of the room');
  const open = sweepOf('fixtures/sweep/walled-open.json');
  t.diagnostic('walled-open: ' + costLine(open.report));
  assert.equal(open.verdict.admitted, true, open.verdict.reasons.join('\n'));
  const vault = zoneOf(open.report, 'vault');
  assert.equal(vault.reached, true);
  assert.ok(vault.witness && vault.witness.log.length > 0, 'a witness of admitted intents');
  assert.ok(vault.witness.log.every((entry) => entry.proposal.kind === 'intent' && entry.proposal.actor === 'walker'));
  t.diagnostic('into the vault: ' + vault.witness.log.map((entry) => /** @type {import('../packages/frame/types.js').Intent} */ (entry.proposal).verb + ' ' + JSON.stringify(/** @type {import('../packages/frame/types.js').Intent} */ (entry.proposal).target)).join(', '));
});

test('the plateau past the climb\'s maxRise is refused with its zone named, and at a rise the climb covers it is admitted with a witness that climbs', (t) => {
  const high = sweepOf('fixtures/sweep/plateau-high.json');
  t.diagnostic('plateau-high: ' + costLine(high.report));
  assert.equal(high.report.complete, true);
  assert.equal(high.verdict.admitted, false);
  assert.equal(high.verdict.reasons.length, 1, high.verdict.reasons.join('\n'));
  assert.match(high.verdict.reasons[0], /^zone summit is not reached: /);
  const low = sweepOf('fixtures/sweep/plateau-low.json');
  t.diagnostic('plateau-low: ' + costLine(low.report));
  assert.equal(low.verdict.admitted, true, low.verdict.reasons.join('\n'));
  const summit = zoneOf(low.report, 'summit');
  assert.ok(summit.reached && summit.witness);
  const verbs = summit.witness.log.map((entry) => /** @type {import('../packages/frame/types.js').Intent} */ (entry.proposal).verb);
  t.diagnostic('onto the summit: ' + verbs.join(', '));
  assert.equal(verbs[verbs.length - 1], 'climb', 'the witness ends with the climb onto the plateau');
});

test('a gap in the floor is refused with a body-leaves-the-world finding, and replay on its bundle reproduces the fall', (t) => {
  const gap = sweepOf('fixtures/sweep/floor-gap.json');
  t.diagnostic('floor-gap: ' + costLine(gap.report));
  assert.equal(gap.verdict.admitted, false);
  assert.equal(gap.verdict.reasons.length, 1, gap.verdict.reasons.join('\n'));
  assert.match(gap.verdict.reasons[0], /^a body leaves the world: walker leaves the world after move \(\d+(\.\d+)?, \d+(\.\d+)?\) by walker: its centre is at y -1\.\d+, below the lowest collider minimum -1, at tick \d+ at \(x, z\) \(2\.\d+, \d\.\d+\), past the edge of every collider \(and \d+ more like it\); bundle /);
  const finding = gap.report.findings.find((item) => item.kind === 'leaves');
  assert.ok(finding && finding.bundle);
  // `replay <bundle>` in one command, as any bundle.
  const replayed = spawnSync(process.execPath, ['packages/tick/bin/replay.js', finding.bundle], { encoding: 'utf8' });
  assert.equal(replayed.status, 0, replayed.stdout + replayed.stderr);
  assert.equal(replayed.stdout, 'bundle ok\n');
  // What it reproduces: the walker on the floor at the last settled state
  // before the move, and below the world at the bundle's tick.
  const bundle = readBundle(finding.bundle);
  assert.equal(bundle.run, 'log');
  assert.equal(bundle.tick, finding.tick);
  const settled = finding.witness.path[finding.witness.path.length - 1];
  const before = replayTo(specOf(bundle), settled.tick);
  const standing = /** @type {import('../packages/frame/types.js').Body} */ (before.world.body('walker'));
  assert.ok(standing.y > 0, 'the walker stands on the floor before the move: y ' + standing.y);
  const after = replayTo(specOf(bundle), bundle.tick);
  const fallen = /** @type {import('../packages/frame/types.js').Body} */ (after.world.body('walker'));
  assert.ok(fallen.y < -1, 'the walker is below the floor at the bundle\'s tick: y ' + fallen.y);
  assert.equal(after.hash, bundle.hashes[bundle.tick]);
});

test('crate-and-door: its door is reached and the witness replays; its costs are on record; walled on all four sides, it is admitted with no finding', (t) => {
  const crate = sweepOf('worlds/crate-and-door.json');
  const report = crate.report;
  t.diagnostic('crate-and-door: ' + costLine(report));
  t.diagnostic('crate-and-door: ' + report.cells + ' cells, ' + report.tried + ' actions tried, ' + report.admitted + ' admitted, ' + report.quanta + ' quanta, ' + report.restores + ' restores, ' + (report.ms / 1000).toFixed(1) + ' s');
  assert.equal(report.complete, true, 'the sweep finishes inside load world\'s budget');
  const door = zoneOf(report, 'door');
  assert.ok(door.reached && door.witness, 'the door is reached');
  assert.equal(replayWitness(crate.input, door.witness), null);
  // T6 found the room open at z = -2 and z = 2: a move off either edge carried
  // the walker out of the world, and a crate dropped near one tipped over it.
  // The room now has walls on those sides, as tall as its end walls, so the
  // sweep admits it with no finding, as the dispatch expected.
  assert.equal(crate.verdict.admitted, true, crate.verdict.reasons.join('; '));
  assert.deepEqual(report.findings.map((finding) => finding.kind + ' ' + finding.body), []);
});

test('every world and every product-law fixture world that loads today still loads with the sweep, and the minds fixture, whose crate the push launched over its walls until F3, is admitted with no finding', (t) => {
  // What loads today: each world in worlds/index.json, and each fixture
  // world on the product law that passes validateScene and the settle
  // hazard as a world file. As load world sweeps them, their actors are the
  // goal's actor and every body with a mind; a fixture world has neither
  // unless it has minds, so most have nothing to sweep.
  /** @type {Array<{ name: string, scene: import('../packages/tick/scene.js').Scene }>} */
  const loadable = [];
  const index = JSON.parse(readFileSync('worlds/index.json', 'utf8'));
  for (const name of Object.keys(index.worlds)) {
    const loaded = loadScene('worlds/' + name + '.json');
    assert.ok(loaded.ok, name);
    if (loaded.ok) {
      loadable.push({ name, scene: loaded.scene });
    }
  }
  /** @param {string} file */
  const read = (file) => JSON.parse(readFileSync('fixtures/' + file, 'utf8'));
  /** @type {Array<{ name: string, seed: number, world: Record<string, unknown> }>} */
  const fixtures = [];
  for (const file of ['behavior-solver', 'behavior-rotation', 'behavior-ramp', 'shape-traversal', 'behavior-verbs']) {
    for (const spec of read(file + '.json').cases) {
      fixtures.push({ name: file + ' ' + spec.name, seed: spec.seed, world: spec.world });
    }
  }
  const minds = read('behavior-minds.json');
  fixtures.push({ name: 'behavior-minds', seed: minds.seed, world: minds.world });
  for (const fixture of fixtures) {
    const checked = validateScene({ ...fixture.world, name: fixture.name, seed: fixture.seed, zones: fixture.world.zones || [] });
    if (checked.ok && settles(checked.scene)) {
      loadable.push({ name: fixture.name, scene: checked.scene });
    }
  }
  t.diagnostic('loads today: ' + loadable.map((item) => item.name).join(', '));
  assert.ok(loadable.length >= 10);
  // T6 found two rooms open at their edges, worlds/crate-and-door.json and the
  // minds fixture's, where a move, a push, or a drop carried a body over an
  // open edge and out of the world. Both are walled now, and both load. Under
  // F2's law the sweep still refused the minds fixture: after the watcher
  // pushed shade with the crate near it, the crate, at rest against the inner
  // wall, left in one quantum at 141 units a second and cleared the 8-unit
  // walls, found as `leaves crate by watcher`. That was the character's push
  // pushing the crate at the shade's contact points, which F3
  // (docs/dispatch-f3-character-push.md) removes with the engine's copy of
  // Rapier's impulse routine and Rapier's #1004. Now no body leaves the minds
  // fixture inside load world's budget: it is admitted with no finding, both
  // its zones reached, and the rest of its sweep deferred to the scheduled
  // job, since the budget runs out before its archive does. This pins exactly
  // that verdict: any change to what the sweep says of it fails this test and
  // has to say why.
  /** @type {ReturnType<typeof considerWorld> | null} */
  let mindsVerdict = null;
  for (const item of loadable) {
    const considered = considerWorld(item.scene, { bundles: null });
    const findings = considered.report ? considered.report.findings : [];
    const named = findings.map((finding) => finding.kind + ' ' + finding.body + ' by ' + finding.actor).sort();
    t.diagnostic(item.name + ': ' + (considered.ok ? 'admitted' : 'refused') + (considered.report ? ', ' + costLine(considered.report) : ', nothing to sweep') + (named.length > 0 ? '; ' + named.join(', ') : ''));
    assert.equal(considered.ok, true, item.name + ' still loads: ' + (considered.ok ? '' : considered.reason));
    if (item.name === 'behavior-minds') {
      mindsVerdict = considered;
    }
  }
  assert.ok(mindsVerdict && mindsVerdict.report, 'the minds fixture loads and is swept');
  if (!mindsVerdict || !mindsVerdict.report) {
    return;
  }
  const report = mindsVerdict.report;
  assert.deepEqual(report.findings.map((finding) => finding.kind + ' ' + finding.body + ' by ' + finding.actor), [], 'no body leaves the minds fixture');
  // Load world sweeps the fixture's one mind, the watcher.
  assert.deepEqual(report.actors, ['watcher']);
  assert.deepEqual(report.zones.map((zone) => zone.id + (zone.reached ? ' reached' : ' not reached')), ['west reached', 'east reached']);
  assert.equal(report.complete, false, 'the minds fixture is swept to the end inside load world\'s budget');
  assert.equal(report.quanta >= LOAD_BUDGET.quanta || report.restores >= LOAD_BUDGET.restores, true, 'the sweep stopped short of its budget');
  const deferred = 'sweep: sweep deferred: the budget of ' + LOAD_BUDGET.quanta + ' quanta and ' + LOAD_BUDGET.restores + ' restores ran out';
  assert.ok(mindsVerdict.lines.some((line) => line.startsWith(deferred)), mindsVerdict.lines.join(' | '));
});

test('sweeping a world twice gives the same archive, the same witnesses, and the same verdicts, and for a world with findings the same findings in the same order, with bundles equal byte for byte', () => {
  /** @param {SweepReport} report */
  const summary = (report) => JSON.stringify({
    archive: report.archive.map((part) => ({ actor: part.actor, cells: part.cells.map((cell) => ({ key: cell.key, tick: cell.tick, hash: cell.hash, log: cell.witness().log })) })),
    zones: report.zones.map((zone) => ({ id: zone.id, reached: zone.reached, witness: zone.witness })),
    findings: report.findings.map((finding) => ({ ...finding, bundle: null })),
    // The verdict names each bundle by its path, whose directory is each
    // sweep's own; it is compared with the bundles named by their files.
    verdict: sweepVerdict({ ...report, findings: report.findings.map((finding) => ({ ...finding, bundle: finding.bundle && basename(finding.bundle) })) }),
    counts: [report.cells, report.tried, report.admitted, report.quanta, report.restores],
  });
  // walled-open has no finding. floor-gap has one, so its two sweeps also
  // compare what walled-open cannot (#83): which finding of each kind comes
  // first, the order of the findings list, and the bundles written for it.
  // Each sweep writes into a directory of its own, so the second does not
  // number its files past the first's.
  for (const file of ['fixtures/sweep/walled-open.json', 'fixtures/sweep/floor-gap.json']) {
    const loaded = loadScene(file);
    assert.ok(loaded.ok, file);
    if (!loaded.ok) {
      continue;
    }
    const input = sceneInput(loaded.scene);
    const first = sweep(input, { budget: LOAD_BUDGET, bundles: mkdtempSync(join(dir, 'twice-')) });
    const second = sweep(input, { budget: LOAD_BUDGET, bundles: mkdtempSync(join(dir, 'twice-')) });
    assert.ok(first.cells > 10, file);
    assert.equal(summary(second), summary(first), file);
    assert.equal(second.findings.length, first.findings.length, file);
    first.findings.forEach((finding, i) => {
      const again = second.findings[i];
      assert.ok(finding.bundle && again.bundle, file + ': finding ' + i + ' is bundled');
      assert.deepEqual({ ...again, bundle: basename(again.bundle) }, { ...finding, bundle: basename(finding.bundle) }, file + ': finding ' + i);
      assert.ok(readFileSync(again.bundle).equals(readFileSync(finding.bundle)), file + ': finding ' + i + '\'s bundles differ');
    });
    if (file.endsWith('floor-gap.json')) {
      assert.ok(first.findings.length > 0, 'floor-gap has findings to compare');
    }
  }
});

test('every zone witness of every world swept here replays hash for hash, and a sweep whose restore omits the hasher lanes has witnesses that do not', (t) => {
  let replayed = 0;
  for (const file of ['fixtures/sweep/walled.json', 'fixtures/sweep/walled-open.json', 'fixtures/sweep/plateau-high.json', 'fixtures/sweep/plateau-low.json', 'fixtures/sweep/floor-gap.json', 'worlds/crate-and-door.json']) {
    const { input, report } = sweepOf(file);
    for (const zone of report.zones) {
      if (zone.witness) {
        assert.equal(replayWitness(input, zone.witness), null, file + ' zone ' + zone.id);
        replayed = replayed + 1;
      }
    }
  }
  // Every archived cell of one world, not only the zones' witnesses.
  const open = sweepOf('fixtures/sweep/walled-open.json');
  for (const part of open.report.archive) {
    for (const cell of part.cells) {
      assert.equal(replayWitness(open.input, cell.witness()), null, cell.key);
      replayed = replayed + 1;
    }
  }
  t.diagnostic(replayed + ' witnesses replayed');
  // Planted: a restore that puts back everything but the hasher's lanes,
  // which stay where the last action left them.
  const planted = sweep(open.input, {
    budget: LOAD_BUDGET,
    bundles: null,
    restore: (tick, saved) => tick.restore({ ...saved, lanes: tick.save().lanes }),
  });
  const vault = zoneOf(planted, 'vault');
  assert.ok(vault.witness, 'the planted sweep still names a witness into the vault');
  const why = replayWitness(open.input, vault.witness);
  assert.match(String(why), /^at tick \d+ the replay hashes [0-9a-f]{16}, and the sweep recorded [0-9a-f]{16}$|^the replay threw at \d+: replay refused entry/);
  t.diagnostic('planted: ' + why);
});

test('load world refuses a zone nothing reaches and a body leaving the world, naming the zone and the bundle, and says so when there is no actor or the budget runs out', () => {
  const walled = spawnSync(process.execPath, ['packages/load/bin/load.js', 'world', 'fixtures/sweep/walled.json'], { encoding: 'utf8', env: { ...process.env, SI_RPG_BUNDLES: dir } });
  assert.equal(walled.status, 1);
  assert.equal(walled.stdout, '');
  assert.match(walled.stderr, /\nzone vault is not reached: actors walker; \d+ cells explored; /);
  const gap = spawnSync(process.execPath, ['packages/load/bin/load.js', 'world', 'fixtures/sweep/floor-gap.json'], { encoding: 'utf8', env: { ...process.env, SI_RPG_BUNDLES: dir } });
  assert.equal(gap.status, 1);
  assert.match(gap.stderr, /\na body leaves the world: walker leaves the world after move .*; bundle .*\.bundle\.json\n$/);
  // No actor: the goal is gone, and nobody has a mind.
  const loaded = loadScene('fixtures/sweep/walled.json');
  assert.ok(loaded.ok);
  if (!loaded.ok) {
    return;
  }
  const idle = { ...loaded.scene };
  delete idle.goal;
  const none = considerWorld(idle, { bundles: null });
  assert.equal(none.ok, true);
  assert.deepEqual(none.lines, ['sweep: the world has no actor, so there is nothing to sweep']);
  // A budget that runs out first: the sweep is deferred and the world is
  // admitted, with no zone refused as unreached.
  const deferred = considerWorld(loaded.scene, { budget: { quanta: 2000, restores: 20 }, bundles: null });
  assert.equal(deferred.ok, true);
  assert.ok(deferred.lines.some((line) => /^sweep: sweep deferred: the budget of 2000 quanta and 20 restores ran out with \d+ cells archived and \d+ left in the frontier/.test(line)), deferred.lines.join('\n'));
});

test('a throw planted after an admitted push is refused by load world with a throw finding and its bundle, and replay on the bundle reproduces the throw', () => {
  // No swept world throws, so the throw is planted: harness/plant-throw.mjs,
  // imported into these commands' own processes and no other, loads the tick
  // with the push's first quantum writing NaN into the pusher's vx, and the
  // tick's own check throws. The product path has no hook for it.
  const plant = ['--import', pathToFileURL(resolve('harness/plant-throw.mjs')).href];
  const index = readFileSync('worlds/index.json');
  const planted = spawnSync(process.execPath, plant.concat(['packages/load/bin/load.js', 'world', 'worlds/crate-and-door.json']), { encoding: 'utf8', env: { ...process.env, SI_RPG_BUNDLES: dir } });
  // A world load world admits is written to the index; this one must not be.
  const after = readFileSync('worlds/index.json');
  if (!after.equals(index)) {
    writeFileSync('worlds/index.json', index);
  }
  assert.ok(after.equals(index), 'the planted world was admitted and written to the index');
  assert.equal(planted.status, 1, planted.stderr);
  assert.equal(planted.stdout, '');
  // The throw is the one reason: the door is still reached by moves. A
  // warning node prints about the hook is not a reason.
  const reasons = planted.stderr.split(/\r?\n/).filter((line) => line !== '' && !line.startsWith('sweep: ') && !/^\((node:\d+|Use `node --trace-)/.test(line));
  assert.equal(reasons.length, 1, planted.stderr);
  const found = /^the tick throws: the tick throws after push crate by walker, producing tick (\d+): NaN in body walker at tick \1 \(and \d+ more like it\); bundle (.+\.bundle\.json)$/.exec(reasons[0]);
  assert.ok(found, reasons[0]);
  const tick = Number(found[1]);
  const path = found[2];
  // Pin 7's bundle: the witness and the push, and the hashes from the load to
  // the push's first quantum, the last of them the trace's NAN mark.
  const bundle = readBundle(path);
  assert.equal(bundle.run, 'log');
  assert.equal(bundle.tick, tick);
  assert.equal(bundle.hashes.length, tick + 1);
  assert.equal(bundle.hashes[tick], 'NAN');
  const last = bundle.log[bundle.log.length - 1];
  const push = /** @type {import('../packages/frame/types.js').Intent} */ (last.proposal);
  assert.deepEqual([push.verb, push.actor, push.target], ['push', 'walker', { body: 'crate' }]);
  assert.equal(last.tick, tick - 1, 'it throws on the push\'s first quantum');
  // Up to the push, the hashes are the product path's own.
  assert.equal(replayTo(specOf(bundle), tick - 1).hash, bundle.hashes[tick - 1]);
  // `replay <bundle>` with the plant reproduces the throw, at its tick.
  const replayed = spawnSync(process.execPath, plant.concat(['packages/tick/bin/replay.js', path]), { encoding: 'utf8' });
  assert.equal(replayed.status, 1, replayed.stderr);
  assert.equal(replayed.stdout, 'first difference at tick ' + tick + ': the run threw: NaN in body walker at tick ' + tick + '\n');
  // Without the plant the law does not throw there: the NAN mark is compared, not assumed.
  const clean = spawnSync(process.execPath, ['packages/tick/bin/replay.js', path], { encoding: 'utf8' });
  assert.equal(clean.status, 1, clean.stderr);
  assert.match(clean.stdout, new RegExp('^first difference at tick ' + tick + '\\nhash\\n  bundle NAN\\n  replay [0-9a-f]{16}\\n$'));
});

test('the scheduled sweep holds each world to its record: the recorded verdict passes, and a record planted with a finding gone, a zone moved, or no entry fails naming the difference, with the findings bundled', () => {
  const record = readSweepRecord();
  const names = sweepWorlds().map((world) => world.name).sort();
  assert.deepEqual(Object.keys(record.worlds).sort(), names, 'the record holds exactly the worlds the job sweeps');
  assert.deepEqual(record.budget, SWEEP_BUDGET, 'the record was written under the job\'s budget');
  const name = 'fixture shape-traversal ledge-box';
  const wanted = (/** @type {string} */ each) => each === 'sweep ' + name;
  const was = process.env.SI_RPG_BUNDLES;
  process.env.SI_RPG_BUNDLES = dir;
  try {
    const green = sweepCorpus({ budget: SWEEP_BUDGET, record, wanted, say: () => {} });
    assert.equal(green.results.length, 1);
    assert.equal(green.results[0].status, 'ok', green.results[0].detail);
    const entry = record.worlds[name];
    assert.deepEqual(entry.findings, ['leaves walker by walker']);
    /** @type {Array<[Record<string, unknown> | undefined, RegExp]>} */
    const planted = [
      [{ ...entry, findings: [] }, /^new finding: leaves walker by walker$/m],
      [{ ...entry, findings: ['leaves walker by walker', 'throws - by walker'] }, /^recorded finding gone: throws - by walker$/m],
      [{ ...entry, zones: { ledge: true } }, /^zone ledge: recorded reached, swept absent$/m],
      [{ ...entry, complete: false }, /^complete: recorded false, swept true$/m],
      [undefined, /^no record of this world; the sweep says /],
    ];
    for (const [moved, reason] of planted) {
      const worlds = { ...record.worlds };
      if (moved) {
        worlds[name] = /** @type {any} */ (moved);
      } else {
        delete worlds[name];
      }
      const red = sweepCorpus({ budget: SWEEP_BUDGET, record: { ...record, worlds }, wanted, say: () => {} });
      const result = red.results[0];
      assert.equal(result.status, 'different');
      assert.match(String(result.block), reason);
      assert.ok(result.bundle, 'the findings are bundled');
      const replayed = spawnSync(process.execPath, ['packages/tick/bin/replay.js', /** @type {string} */ (result.bundle)], { encoding: 'utf8' });
      assert.equal(replayed.status, 0, replayed.stdout + replayed.stderr);
    }
  } finally {
    if (was === undefined) {
      delete process.env.SI_RPG_BUNDLES;
    } else {
      process.env.SI_RPG_BUNDLES = was;
    }
  }
});

test('a sweep that throws in the scheduled job fails with a block naming the world and the throw, and the issue the job writes for the run quotes it', () => {
  // Planted: a budget whose quanta throws when it is read. The sweep reads
  // its budget once the load has settled, before its first action, so the
  // throw comes from inside the sweep of the one world the run wants, where
  // the job's catch meets it. Nothing in the job is changed for the plant.
  const name = 'fixture shape-traversal ledge-box';
  const message = 'planted: this budget cannot be read';
  /** @type {{ quanta: number, restores: number }} */
  const budget = {
    /** @returns {number} */
    get quanta() {
      throw new Error(message);
    },
    restores: SWEEP_BUDGET.restores,
  };
  const results = runCorpus({ quanta: 0, points: 0, only: 'sweep ' + name, sweepBudget: budget, say: () => {} });
  assert.deepEqual(results.map((result) => result.name + ' ' + result.status), ['sweep ' + name + ' error']);
  const [thrown] = results;
  assert.equal(thrown.detail, 'the sweep threw: ' + message);
  assert.equal(thrown.block, 'the sweep of ' + name + ' threw: ' + message + '\n');
  // The issue the job opens for the run: titled with the block's first line,
  // and quoting the block in its body.
  const issue = issueText(results);
  assert.equal(issue.title, 'corpus: sweep ' + name + ': the sweep of ' + name + ' threw: ' + message);
  assert.ok(issue.body.includes('```\n' + String(thrown.block).trim() + '\n```'), issue.body);
});
