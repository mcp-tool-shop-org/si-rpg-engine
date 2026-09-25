// The reachability sweep, T6 pin 11 (docs/dispatch-t6-reachability-sweep.md).
// The worlds in fixtures/sweep/ are closed rooms built for one check each:
// the vault walled on four sides past the climb's maxRise and the same with a
// wall gone, a plateau past maxRise and one the climb covers, and a gap in the
// floor. Each sweep here runs under load world's own budget, LOAD_BUDGET, and
// every zone witness of every world swept is replayed through the ordinary
// replay path and compared hash for hash (pin 8). A sweep whose restore omits
// the hasher's lanes has witnesses that do not replay, so the replay is the
// check that exploring by restore explores the real world. The last two tests
// hold existing content to what the sweep says of it: everything that loads
// today still loads but for two open rooms, pinned here, and the scheduled
// job's record of every world it sweeps fails on any verdict that moves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBundle, specOf } from '../packages/tick/bundle.js';
import { replayTo } from '../packages/tick/runs.js';
import { settles } from '../packages/tick/admit-world.js';
import { loadScene, validateScene } from '../packages/tick/scene.js';
import { costLine, replayWitness, sceneInput, sweep, sweepVerdict } from '../packages/load/sweep.js';
import { LOAD_BUDGET, considerWorld } from '../packages/load/world.js';
import { SWEEP_BUDGET, readSweepRecord, sweepCorpus, sweepWorlds } from './corpus.mjs';

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

test('crate-and-door: its door is reached and the witness replays; its costs are on record; it is refused because its room is open on two sides', (t) => {
  const crate = sweepOf('worlds/crate-and-door.json');
  const report = crate.report;
  t.diagnostic('crate-and-door: ' + costLine(report));
  t.diagnostic('crate-and-door: ' + report.cells + ' cells, ' + report.tried + ' actions tried, ' + report.admitted + ' admitted, ' + report.quanta + ' quanta, ' + report.restores + ' restores, ' + (report.ms / 1000).toFixed(1) + ' s');
  assert.equal(report.complete, true, 'the sweep finishes inside load world\'s budget');
  const door = zoneOf(report, 'door');
  assert.ok(door.reached && door.witness, 'the door is reached');
  assert.equal(replayWitness(crate.input, door.witness), null);
  // The finding for the coordinator (the dispatch expected crate-and-door
  // admitted). Its room has walls at x = 0 and x = 4 and none at z = -2 or
  // z = 2, so a move off either edge carries the walker out of the world, and
  // a crate dropped near one tips over it. This pins exactly that refusal:
  // walls on those edges, or any other change to it, fails this test.
  assert.equal(crate.verdict.admitted, false);
  const left = report.findings.filter((finding) => finding.kind === 'leaves').map((finding) => finding.body).sort();
  assert.deepEqual(left, ['crate', 'walker']);
  assert.deepEqual(report.findings.map((finding) => finding.kind).sort(), ['leaves', 'leaves']);
  for (const finding of report.findings) {
    assert.match(finding.detail, /, past the edge of every collider$/);
    const bundle = readBundle(/** @type {string} */ (finding.bundle));
    const run = replayTo(specOf(bundle), bundle.tick);
    const body = /** @type {import('../packages/frame/types.js').Body} */ (run.world.body(/** @type {string} */ (finding.body)));
    assert.ok(Math.abs(body.z) > 2, finding.body + ' left over an open edge: z ' + body.z);
  }
});

test('every world and every product-law fixture world that loads today still loads, but for the two open rooms the sweep refuses, pinned here as findings for the coordinator', (t) => {
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
  // The refusals T6 found in content that loads today. Both rooms have walls
  // on two sides and none on the other two, so a move, a push, or a drop
  // carries a body over an open edge and out of the world. Each is a finding
  // for the coordinator, named in the pull request; a wall on the open edges,
  // or any other change to what the sweep says of them, fails this test.
  /** @type {Record<string, string[]>} */
  const refused = {
    'crate-and-door': ['leaves crate by walker', 'leaves walker by walker'],
    'behavior-minds': ['leaves crate by watcher', 'leaves walker by watcher', 'leaves watcher by watcher'],
  };
  for (const item of loadable) {
    const considered = considerWorld(item.scene, { bundles: null });
    const findings = considered.report ? considered.report.findings : [];
    const named = findings.map((finding) => finding.kind + ' ' + finding.body + ' by ' + finding.actor).sort();
    t.diagnostic(item.name + ': ' + (considered.ok ? 'admitted' : 'refused') + (considered.report ? ', ' + costLine(considered.report) : ', nothing to sweep') + (named.length > 0 ? '; ' + named.join(', ') : ''));
    if (refused[item.name]) {
      assert.equal(considered.ok, false, item.name + ' is refused');
      assert.deepEqual(named.filter((finding) => finding.startsWith('leaves ')), refused[item.name], item.name);
      for (const finding of findings.filter((each) => each.kind === 'leaves')) {
        assert.match(finding.detail, /, past the edge of every collider$/, item.name + ': ' + finding.detail);
      }
    } else {
      assert.equal(considered.ok, true, item.name + ' still loads: ' + (considered.ok ? '' : considered.reason));
    }
  }
});

test('sweeping a world twice gives the same archive, the same witnesses, and the same verdicts', () => {
  const loaded = loadScene('fixtures/sweep/walled-open.json');
  assert.ok(loaded.ok);
  if (!loaded.ok) {
    return;
  }
  const input = sceneInput(loaded.scene);
  /** @param {SweepReport} report */
  const summary = (report) => JSON.stringify({
    archive: report.archive.map((part) => ({ actor: part.actor, cells: part.cells.map((cell) => ({ key: cell.key, tick: cell.tick, hash: cell.hash, log: cell.witness().log })) })),
    zones: report.zones.map((zone) => ({ id: zone.id, reached: zone.reached, witness: zone.witness })),
    findings: report.findings.map((finding) => ({ ...finding, bundle: null })),
    verdict: sweepVerdict(report),
    counts: [report.cells, report.tried, report.admitted, report.quanta, report.restores],
  });
  const first = sweep(input, { budget: LOAD_BUDGET, bundles: null });
  const second = sweep(input, { budget: LOAD_BUDGET, bundles: null });
  assert.ok(first.cells > 10);
  assert.equal(summary(second), summary(first));
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
