// Restore, rerun, compare. Every case of every behaviour fixture and the
// product scene is run once and traced as harness/trace.mjs traces the product
// scene. Restore points are chosen from that run: just after the first new
// contact, the first body to fall asleep, and the first to wake, where the case
// has them, and a third and two thirds of the way; the product scene adds its
// last new contact and nine tenths. A single point can pass while another
// fails, so every case is restored at each of its points. The chosen ticks are
// printed per case. At each point the run is restored two ways and the rest is
// rerun, and harness/first-difference.js must print `identical` against the
// uninterrupted trace:
//
//   replay: harness/replay-to.mjs builds a fresh world and replays the inputs
//   to the point;
//   image: a world.save() taken at the point in a second uninterrupted run is
//   restored into a replayed run whose solver has been evicted and whose
//   records have been scrambled, twice, so a restore is shown to be repeatable.
//
// Neither writes into Rapier. The tick itself (memory, minds, actions, log)
// is T5's bundle; replay rebuilds it here. A restore that does not rerun
// identically writes a bundle (harness/bundle.mjs) and fails with its path.
//
// Since F1 the solver switches a body in place when an action starts or ends
// or a body is picked up or put down, so Rapier's running world crosses every
// verb boundary. One more test restores on both sides of every quantum that
// switches a body, in the product scene (200 and 201, 260 and 261, 400 and
// 401) and in every fixture run that has one (the carry cases at each of
// their four switches, the climb, and the minds fixture), each point by
// replay and by image (F1 pin 6).
//
// T6 pin 1 adds a third way to restore, beside replay and the image, that
// replays nothing at all: the run's own save()
// (the tick's for a log, the session's for a fixture case or the product
// scene) is taken at each point of one uninterrupted run, which then runs on
// to its end; each save is restored into that same run, now past the point,
// with the solver evicted, and the rest is rerun, twice in a row. A save that
// leaves out one field is planted for the hasher's lanes, an action in
// flight, a mind's memory, the minds' sight, and the quanta owed to a body
// draft and a belief admitted at one tick, and each is caught by the diff. A
// save with a field out of shape anywhere in it, to the last sight record, is
// refused before anything changes, and the run traces on as if no restore had
// been tried. Those saves hold the solver's image in the sparse in-process
// form (pin 2), so the same tests prove its restore traces identically; the
// digest it is checked by is held to the byte loop it replaced, and the
// sparse restore refuses what the dense one refuses.
//
// T7a adds a tick with a role session in it (harness/role-session.mjs): probe,
// the test-only role in fixtures/roles, moves bodies, and two roles built here
// write beliefs into a mind, one from player text. Each proposal is offered
// some quanta after the frame it was built from, as a model's reply arrives,
// and one is offered over its budget, so the gate's window of frames and its
// admission ticks decide what it admits. The session's own save is restored
// at the points where they decide the next offer, twice, into the session run
// on to its end, and reruns identically with the gate saying what it said; a
// saved belief keeps its label and the source it heard. A save planted without
// the window's earlier frames, with its labels gone, or without the admission
// ticks is caught by the diff, where the gate refuses the late proposal as
// stale, labels a belief joined with the mind otherwise, or admits the
// proposal over budget. A save with any of them out of shape, or a belief's
// label, or a log entry's provenance, is refused before anything changes, and
// the session traces on as if no restore had been tried.
//
// #83 checks the save's committed frame record by record. A save whose frame
// has a record without one of its numbers, a number that is not one, an id
// that is not its body's, or one record too few or too many is refused, and
// the tick commits, frame for frame, the frames of a run never restored. A
// save taken between a body draft and the quantum that commits it has a frame
// one record short of the world, and it restores.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHasher } from '../packages/frame/hash.js';
import { createMemory } from '../packages/tick/memory.js';
import { loadIntentRules } from '../packages/tick/predicates.js';
import { catalogFromLog, catalogOf, loadRoles, sha256 } from '../packages/tick/roles.js';
import { createRestorableTick, createTick, settle } from '../packages/tick/tick.js';
import { createWorld } from '../packages/tick/world.js';
import { bytes as binary, imageDigest, imageRefusal, imageSolver, imageSparse, instantiate, restoreImage, restoreSparse, snapshotBytes, sparseDigest, stackPointer } from '../solver/dist/solver.mjs';
import { expectIdentical } from './bundle.mjs';
import { asleep as asleepIn, contacts as contactPairs, solverClasses, switched } from './events.mjs';
import { replayTo } from './replay-to.mjs';
import { roleSessionTo } from './role-session.mjs';
import { endLine } from './trace-line.mjs';
import { playVerbs } from './verbs-scene.mjs';

/**
 * @typedef {import('./replay-to.mjs').ReplaySpec} ReplaySpec
 * @typedef {import('./replay-to.mjs').Run} Run
 * @typedef {ReturnType<ReturnType<typeof createWorld>['save']>} WorldSave
 * @typedef {ReturnType<ReturnType<typeof createWorld>['saveSparse']>} SparseWorldSave
 * @typedef {{ name: string, spec: ReplaySpec }} Case
 * @typedef {import('./role-session.mjs').RoleSessionSpec} RoleSessionSpec
 * @typedef {import('../packages/tick/roles.js').RoleEntry} RoleEntry
 */

const dir = mkdtempSync(join(tmpdir(), 'si-rpg-restore-'));
const rules = loadIntentRules().rules;

/**
 * @param {string[]} a
 * @param {string[]} b
 */
function diff(a, b) {
  const left = join(dir, 'whole.trace');
  const right = join(dir, 'restored.trace');
  writeFileSync(left, a.join('\n') + '\n');
  writeFileSync(right, b.join('\n') + '\n');
  const run = spawnSync(process.execPath, ['harness/first-difference.js', left, right], { encoding: 'utf8' });
  assert.notEqual(run.status, 2, run.stderr);
  return run.stdout;
}

/** Loads and steps another world, so the solver no longer holds the one being restored. */
function evict() {
  const scratch = createWorld({
    bodies: [{ id: 'scratch', x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.3, hy: 0.3, hz: 0.3 }],
    colliders: [{ id: 'floor', minX: -2, maxX: 2, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }],
  }, 'product');
  scratch.mixLoad(createHasher(), new Set());
  scratch.step(new Set());
}

/** @param {Run} run */
function scramble(run) {
  for (const body of run.world.bodies) {
    body.x = body.x + 1;
    body.vy = body.vy - 1;
  }
}

/**
 * Pairs with at least one contact point.
 * @param {Run} run
 */
function contacts(run) {
  return contactPairs(run.world);
}

/**
 * @param {Run} run
 * @returns {string[]}
 */
function asleep(run) {
  return asleepIn(run.world);
}

/**
 * The uninterrupted run: its trace lines (without the end line), the ticks
 * of its first new contact, first sleep, first wake, and last new contact,
 * and the ticks of the quanta that switch a body (F1).
 * @param {ReplaySpec} spec
 */
function wholeRun(spec) {
  const run = replayTo(spec, 0);
  const lines = [run.line()];
  let touching = contacts(run);
  let sleepers = asleep(run);
  let classes = solverClasses(spec, run);
  /** @type {{ contact: number | null, lastContact: number | null, sleep: number | null, wake: number | null }} */
  const events = { contact: null, lastContact: null, sleep: null, wake: null };
  /** @type {number[]} */
  const switches = [];
  while (run.advance()) {
    lines.push(run.line());
    const nowTouching = contacts(run);
    const nowAsleep = asleep(run);
    const nowClasses = solverClasses(spec, run);
    if (nowTouching > touching) {
      events.contact = events.contact === null ? run.tick : events.contact;
      events.lastContact = run.tick;
    }
    if (events.sleep === null && nowAsleep.some((id) => !sleepers.includes(id))) {
      events.sleep = run.tick;
    }
    if (events.wake === null && sleepers.some((id) => !nowAsleep.includes(id))) {
      events.wake = run.tick;
    }
    if (switched(run, classes, nowClasses).length > 0) {
      switches.push(run.tick);
    }
    touching = nowTouching;
    sleepers = nowAsleep;
    classes = nowClasses;
  }
  return { lines, events, switches };
}

/**
 * @param {ReturnType<typeof wholeRun>} whole
 * @param {boolean} product
 */
function choosePoints(whole, product) {
  const end = whole.lines.length - 1;
  const e = whole.events;
  const wanted = [e.contact, e.sleep, e.wake, Math.floor(end / 3), Math.floor((2 * end) / 3)];
  if (product) {
    wanted.push(e.lastContact, Math.floor((9 * end) / 10));
  }
  /** @type {number[]} */
  const points = [];
  for (const tick of wanted) {
    if (tick !== null && tick < end && !points.includes(tick)) {
      points.push(tick);
    }
  }
  if (points.length === 0) {
    points.push(0);
  }
  return points.sort((a, b) => a - b);
}

/**
 * The rest of a run from its current frame, spliced after the whole run's
 * lines before that frame.
 * @param {string[]} whole
 * @param {Run} run
 */
function rerun(whole, run) {
  const lines = rerunLines(whole, run);
  lines.push(endLine(lines.length));
  return lines;
}

/**
 * rerun without the end line.
 * @param {string[]} whole
 * @param {Run} run
 */
function rerunLines(whole, run) {
  const lines = whole.slice(0, run.tick);
  lines.push(run.line());
  while (run.advance()) {
    lines.push(run.line());
  }
  return lines;
}

/**
 * The hash of each line from the load to `tick`.
 * @param {string[]} lines
 * @param {number} tick
 */
function hashesTo(lines, tick) {
  return lines.slice(0, tick + 1).map((line) => line.split(' ')[1]);
}

/**
 * A second uninterrupted run, saved at each point. Its trace must match the first.
 * @param {ReplaySpec} spec
 * @param {number[]} points
 * @param {string[]} lines
 */
function savesAt(spec, points, lines) {
  const run = replayTo(spec, 0);
  /** @type {Map<number, WorldSave>} */
  const saves = new Map();
  const again = [run.line()];
  for (;;) {
    if (points.includes(run.tick)) {
      saves.set(run.tick, run.world.save());
    }
    if (!run.advance()) {
      break;
    }
    again.push(run.line());
  }
  assert.deepEqual(again, lines, 'a second uninterrupted run traces the same');
  return saves;
}

/** @type {Case[]} */
const cases = [];
for (const file of ['behavior-solver', 'behavior-rotation', 'behavior-ramp', 'shape-traversal']) {
  for (const spec of JSON.parse(readFileSync('fixtures/' + file + '.json', 'utf8')).cases) {
    cases.push({ name: file + ' ' + spec.name, spec });
  }
}
for (const spec of JSON.parse(readFileSync('fixtures/behavior-verbs.json', 'utf8')).cases) {
  const played = playVerbs(spec, rules);
  if (!played.ok || !played.log) {
    throw new Error(spec.name + ' did not play');
  }
  // The script's admitted log; replaying it reproduces the fixture's frames.
  cases.push({ name: 'behavior-verbs ' + spec.name, spec: { seed: spec.seed, world: spec.world, log: played.log } });
}
const minds = JSON.parse(readFileSync('fixtures/behavior-minds.json', 'utf8'));
cases.push({ name: 'behavior-minds', spec: { seed: minds.seed, world: minds.world, log: minds.log } });
const threeD = JSON.parse(readFileSync('fixtures/behavior-3d.json', 'utf8'));
cases.push({ name: 'behavior-3d (reference law)', spec: { seed: threeD.seed, world: threeD.world, log: threeD.log, law: 'reference', retired: true } });
cases.push({ name: 'the product scene', spec: { scene: 'product' } });

/**
 * Restores the case at each point by replay, and by image `rounds` times,
 * and requires every rerun to trace as the whole run did. A difference
 * writes a bundle (T5 pin 3): the case, the point, the whole run's hashes to
 * it, and the image that was restored, if one was.
 * @param {Case} item
 * @param {ReturnType<typeof wholeRun>} whole
 * @param {number[]} points
 * @param {number} rounds
 */
function restoresAt(item, whole, points, rounds) {
  for (const point of points) {
    evict();
    const replayed = replayTo(item.spec, point);
    expectIdentical(item.name + ' replay to ' + point, whole.lines, rerunLines(whole.lines, replayed), [{ spec: item.spec, tick: point, hashes: hashesTo(whole.lines, point) }]);
  }
  const saves = savesAt(item.spec, points, whole.lines);
  for (const point of points) {
    const saved = saves.get(point);
    if (!saved) {
      throw new Error('no save at ' + point);
    }
    const image = saved.image ? { bytes: saved.image.bytes, worldId: saved.worldId } : false;
    for (let again = 0; again < rounds; again = again + 1) {
      const run = replayTo(item.spec, point);
      evict();
      scramble(run);
      run.world.restore(saved);
      expectIdentical(item.name + ' image at ' + point + ' restore ' + (again + 1), whole.lines, rerunLines(whole.lines, run), [{ spec: item.spec, tick: point, hashes: hashesTo(whole.lines, point), image }]);
    }
  }
}

for (const item of cases) {
  const product = 'scene' in item.spec;
  test(item.name + ': replay and image restores rerun identically at every chosen point', (t) => {
    const whole = wholeRun(item.spec);
    const points = choosePoints(whole, product);
    t.diagnostic(item.name + ': ' + (whole.lines.length - 1) + ' quanta, restored at ' + points.join(', ') + ' (events ' + JSON.stringify(whole.events) + ')');
    restoresAt(item, whole, points, 2);
  });
}

test('restores straddle every switch: replay and image restores on both sides of every quantum that switches a body rerun identically, in the product scene and in every fixture run that switches one', (t) => {
  let switches = 0;
  /** @type {string[]} */
  const runs = [];
  for (const item of cases) {
    const whole = wholeRun(item.spec);
    if (whole.switches.length === 0) {
      continue;
    }
    const end = whole.lines.length - 1;
    const points = Array.from(new Set(whole.switches.flatMap((tick) => [tick - 1, tick]))).filter((tick) => tick < end).sort((a, b) => a - b);
    t.diagnostic(item.name + ': switches at ' + whole.switches.join(', ') + '; restored at ' + points.join(', '));
    if (item.name === 'the product scene') {
      assert.deepEqual(whole.switches, [201, 261, 401], 'the product scene switches where the climber starts and ends and the parcel is picked up');
    }
    restoresAt(item, whole, points, 1);
    switches = switches + whole.switches.length;
    runs.push(item.name);
  }
  t.diagnostic(switches + ' switches straddled in ' + runs.join(', '));
  for (const name of ['the product scene', 'behavior-verbs carry', 'behavior-verbs carry-capsule', 'behavior-minds']) {
    assert.ok(runs.includes(name), name + ' has no switch to straddle');
  }
});

/**
 * One uninterrupted run that saves itself at each point with its own save(),
 * then runs on to its end. The run is returned there, past every point.
 * @param {ReplaySpec} spec
 * @param {number[]} points
 * @param {string[]} lines the whole run's trace, which this run must match
 */
function ownSaves(spec, points, lines) {
  const run = replayTo(spec, 0);
  /** @type {Map<number, ReturnType<Run['save']>>} */
  const saves = new Map();
  const again = [run.line()];
  for (;;) {
    if (points.includes(run.tick)) {
      saves.set(run.tick, run.save());
    }
    if (!run.advance()) {
      break;
    }
    again.push(run.line());
  }
  assert.deepEqual(again, lines, 'a run that saves itself traces the same as one that does not');
  return { run, saves };
}

for (const item of cases) {
  const product = 'scene' in item.spec;
  test(item.name + ': its own save restores without replay into a run that has gone on, twice, at every chosen point', (t) => {
    const whole = wholeRun(item.spec);
    const points = choosePoints(whole, product);
    const { run, saves } = ownSaves(item.spec, points, whole.lines);
    t.diagnostic(item.name + ': saved at ' + points.join(', ') + ', restored from tick ' + run.tick);
    for (const point of points) {
      const saved = saves.get(point);
      if (!saved) {
        throw new Error('no save at ' + point);
      }
      for (let again = 0; again < 2; again = again + 1) {
        evict();
        const from = run.tick;
        run.restore(saved);
        assert.equal(run.tick, point, 'the restore puts the run back at ' + point + ' from ' + from);
        expectIdentical(item.name + ' own save at ' + point + ' restore ' + (again + 1), whole.lines, rerunLines(whole.lines, run), [{ spec: item.spec, tick: point, hashes: hashesTo(whole.lines, point) }]);
      }
    }
  });
}

/**
 * rerun, but a step that throws ends the lines with the trace's mark for a
 * thrown step. A planted save can make a log's next entry name a frame the
 * run no longer has, and the replay refuses it; the diff then still names
 * the first quantum that differed, which comes before the refusal.
 * @param {string[]} whole
 * @param {Run} run
 */
function rerunCaught(whole, run) {
  const lines = whole.slice(0, run.tick);
  lines.push(run.line());
  for (;;) {
    const before = run.tick;
    try {
      if (!run.advance()) {
        break;
      }
    } catch {
      lines.push((before + 1) + ' NAN');
      break;
    }
    lines.push(run.line());
  }
  lines.push(endLine(lines.length));
  return lines;
}

/**
 * The first-difference block of a run restored from a planted save and rerun
 * to its end, against the whole run. The run is at its end when restored.
 * @param {ReplaySpec} spec
 * @param {number} point
 * @param {(saved: any, end: any) => any} plant makes the planted save from the true one and the run's save at its end
 */
function plantedRerun(spec, point, plant) {
  const whole = wholeRun(spec);
  const { run, saves } = ownSaves(spec, [point], whole.lines);
  const saved = saves.get(point);
  const end = run.save();
  // Unplanted, the save reruns identically from the run's end.
  evict();
  run.restore(/** @type {any} */ (saved));
  assert.equal(diff(whole.lines.concat([endLine(whole.lines.length)]), rerunCaught(whole.lines, run)), 'identical\n');
  evict();
  run.restore(plant(saved, end));
  return { saved: /** @type {any} */ (saved), block: diff(whole.lines.concat([endLine(whole.lines.length)]), rerunCaught(whole.lines, run)).split('\n') };
}

/** The carry script of behavior-verbs as a log, and a tick inside its move, with the move in flight. */
function carryCase() {
  const spec = JSON.parse(readFileSync('fixtures/behavior-verbs.json', 'utf8')).cases.find((/** @type {{ name: string }} */ c) => c.name === 'carry');
  const played = playVerbs(spec, rules);
  if (!played.ok || !played.log) {
    throw new Error('carry did not play');
  }
  const move = played.log.find((entry) => entry.proposal.kind === 'intent' && entry.proposal.verb === 'move');
  if (!move) {
    throw new Error('carry has no move');
  }
  return { spec: { seed: spec.seed, world: spec.world, log: played.log }, point: move.tick + 5 };
}

test('a save planted without the hasher lanes is caught at the next quantum, by its hash', () => {
  const { spec, point } = carryCase();
  const { block } = plantedRerun(spec, point, (saved, end) => ({ ...saved, tick: { ...saved.tick, lanes: end.tick.lanes } }));
  assert.equal(block[0], 'first difference at tick ' + (point + 1), block.join('\n'));
  assert.equal(block[1], 'hash');
});

test('a save planted without the action in flight is caught: the actor stops where it should walk on', () => {
  const { spec, point } = carryCase();
  const { saved, block } = plantedRerun(spec, point, (kept, end) => ({ ...kept, tick: { ...kept.tick, actions: end.tick.actions } }));
  assert.equal(saved.tick.actions.length, 1, 'the save carries the move in flight');
  assert.equal(saved.tick.actions[0][0], 'walker');
  assert.equal(block[0], 'first difference at tick ' + (point + 1), block.join('\n'));
  assert.match(block[1], /^body walker field /);
});

test('a save planted without a mind memory is caught at the mind, by its newest belief', () => {
  const spec = { seed: minds.seed, world: minds.world, log: minds.log };
  const whole = wholeRun(spec);
  const point = Math.floor((whole.lines.length - 1) / 3);
  const { saved, block } = plantedRerun(spec, point, (kept, end) => ({ ...kept, tick: { ...kept.tick, memory: end.tick.memory } }));
  assert.ok(saved.tick.memory.minds.length > 0, 'the save carries a mind with beliefs');
  assert.equal(block[0], 'first difference at tick ' + point, block.join('\n'));
  assert.match(block[1], /^mind /);
});

test('a save planted without the minds sight is caught at the next quantum, where the mind sees everything anew', () => {
  const spec = { seed: minds.seed, world: minds.world, log: minds.log };
  const whole = wholeRun(spec);
  const point = Math.floor((whole.lines.length - 1) / 3);
  // What a run that has seen nothing holds. The run's own end remembers the
  // same sight as the point here, so leaving the end's in place would pass.
  const { saved, block } = plantedRerun(spec, point, (kept) => ({ ...kept, tick: { ...kept.tick, minds: { ...kept.tick.minds, sight: [] } } }));
  assert.ok(saved.tick.minds.sight.length > 0, 'the save carries what the mind has seen');
  assert.equal(block[0], 'first difference at tick ' + (point + 1), block.join('\n'));
  assert.match(block[1], /^mind /);
});

/**
 * A log that owes a quantum at a save point (pin 1: the quanta owed to
 * admissions that are not actions). In crate-and-door, once the load has
 * settled, a body draft and a belief citing the draft's episode are admitted
 * at one tick. Each is owed one quantum, so the run is not idle for two, and
 * a save taken one quantum after the admissions still owes one. The log is
 * the play's admitted log, so replaying it is the same run.
 */
function owedCase() {
  const file = JSON.parse(readFileSync('worlds/crate-and-door.json', 'utf8'));
  const world = createWorld(file, 'product');
  const memory = createMemory();
  const tick = createTick({ seed: file.seed, world, rules, memory });
  for (let i = 0; i < 64; i = i + 1) {
    tick.advance();
  }
  const draft = tick.submit({ kind: 'body', id: 'parcel', x: 1.5, y: 0.5, z: 1, hx: 0.2, hy: 0.2, hz: 0.2 });
  assert.ok(draft.admitted, draft.admitted ? '' : draft.reason);
  const source = memory.episodes[memory.episodes.length - 1].id;
  const belief = tick.submit({ kind: 'belief', subject: 'parcel', key: 'placed', value: 'by hand', confidence: 1, source });
  assert.ok(belief.admitted, belief.admitted ? '' : belief.reason);
  const admitted = tick.frame().tick;
  assert.equal(settle(tick), 2, 'a body draft and a belief admitted at one tick owe two quanta');
  const log = tick.log().map((entry) => ({ tick: entry.tick, hash: entry.hash, proposal: entry.proposal }));
  return { spec: { seed: file.seed, world: file, log }, point: admitted + 1 };
}

test('a save taken while a quantum is owed restores it into a run that has gone on, and one planted without it ends a quantum early', () => {
  const { spec, point } = owedCase();
  // The run's own end owes nothing, so leaving the end's count in place is
  // what a restore that omits the quanta owed does.
  const { saved, block } = plantedRerun(spec, point, (kept, end) => ({ ...kept, tick: { ...kept.tick, pending: end.tick.pending } }));
  assert.equal(saved.tick.pending, 1, 'the save owes a quantum');
  assert.equal(saved.next, spec.log.length, 'and the log is spent: only the quantum owed runs the run on');
  assert.deepEqual(saved.tick.actions, [], 'nothing is scheduled');
  assert.equal(block[0], 'first difference at tick ' + (point + 1), block.join('\n'));
  assert.equal(block[1], 'length', block.join('\n'));
});

test('a save of another tick, or one with a field out of shape anywhere in it, is refused and changes nothing', () => {
  const { spec, point } = carryCase();
  const whole = wholeRun(spec);
  const { run, saves } = ownSaves(spec, [point], whole.lines);
  const saved = /** @type {any} */ (saves.get(point));
  const moving = saved.tick.actions[0];
  const first = saved.tick.world.bodies[0];
  const before = run.line();
  for (const [planted, reason] of /** @type {Array<[any, RegExp]>} */ ([
    [{ ...saved, tick: { ...saved.tick, seed: saved.tick.seed + 1 } }, /restore refused: the save is of a tick seeded/],
    [{ ...saved, tick: { ...saved.tick, lanes: [1] } }, /restore refused: the lanes are two whole numbers/],
    [{ ...saved, tick: { ...saved.tick, frame: { ...saved.tick.frame, tick: saved.tick.tick + 1 } } }, /restore refused: the frame is the committed frame at the saved tick/],
    [{ ...saved, tick: { ...saved.tick, actions: [['walker', { effect: 'drive', remaining: 0 }]] } }, /restore refused: the actions are actor ids/],
    [{ ...saved, tick: { ...saved.tick, actions: [[moving[0], { ...moving[1], aimX: 'east' }]] } }, /restore refused: the actions are actor ids/],
    [{ ...saved, tick: { ...saved.tick, actions: [['nobody', moving[1]]] } }, /restore refused: the actions are actor ids/],
    [{ ...saved, tick: { ...saved.tick, pending: -1 } }, /restore refused: the quanta owed are a whole number/],
    [{ ...saved, tick: { ...saved.tick, minds: { ...saved.tick.minds, sight: [['walker', []]] } } }, /restore refused: the minds' sight is /],
    [{ ...saved, tick: { ...saved.tick, memory: undefined } }, /restore refused: the memory is/],
    [{ ...saved, tick: { ...saved.tick, memory: { ...saved.tick.memory, episodes: saved.tick.memory.episodes.concat([{ id: 'e9', tick: 'soon', kind: 'intent', detail: 'move walker' }]) } } }, /restore refused: the memory's episodes are /],
    [{ ...saved, tick: { ...saved.tick, memory: { ...saved.tick.memory, beliefs: [{ id: 'b1', subject: 's', key: 'k', value: 'v', confidence: 2, source: 'e1' }] } } }, /restore refused: the memory's beliefs are /],
    [{ ...saved, tick: { ...saved.tick, world: { ...saved.tick.world, bodies: [] } } }, /restore refused: the save does not have the 2 bodies of this world/],
    [{ ...saved, tick: { ...saved.tick, world: { ...saved.tick.world, bodies: [{ ...first, y: 'up' }].concat(saved.tick.world.bodies.slice(1)) } } }, /restore refused: body 0 \(walker\) is not a record of numbers/],
    [{ ...saved, tick: { ...saved.tick, world: { ...saved.tick.world, lifted: ['nobody'] } } }, /restore refused: the lifted bodies are body ids of this world/],
    [{ ...saved, tick: { ...saved.tick, world: { ...saved.tick.world, carried: [['walker']] } } }, /restore refused: the carried bodies are /],
    [{ ...saved, tick: { ...saved.tick, world: { ...saved.tick.world, worldId: 'this one' } } }, /restore refused: the world id is a whole number/],
    [{ ...saved, tick: { ...saved.tick, world: { ...saved.tick.world, image: null } } }, /restore refused: a product world restores from an image/],
    // A tick with no role catalog keeps no window and no admission ticks,
    // and logs no role's entry (T7a).
    [{ ...saved, tick: { ...saved.tick, window: [{ tick: saved.tick.tick, hash: saved.tick.frame.hash, minds: [] }] } }, /restore refused: a tick with no role catalog keeps no window$/],
    [{ ...saved, tick: { ...saved.tick, admissions: [['probe carry', [1]]] } }, /restore refused: a tick with no role catalog holds no admission ticks$/],
    [{ ...saved, tick: { ...saved.tick, log: saved.tick.log.map((/** @type {any} */ entry, /** @type {number} */ i) => (i === 0 ? { ...entry, provenance: { role: 'probe' } } : entry)) } }, /restore refused: a tick with no role catalog logs no role's entry$/],
  ])) {
    assert.throws(() => run.restore(planted), reason);
    assert.equal(run.line(), before, 'a refused restore changes nothing');
  }
});

/**
 * A log run on a restorable tick held here, so a test reads each frame the
 * tick commits (#83): the log's entries are submitted at their ticks, as the
 * log run of packages/tick/runs.js submits them, and the tick runs to `end`.
 * Before each quantum, after what is due at its tick, `at` is handed the tick.
 * @param {import('./replay-to.mjs').LogSpec} spec
 * @param {number} end
 * @param {(tick: ReturnType<typeof createRestorableTick>) => void} [at]
 */
function framesTo(spec, end, at) {
  const tick = createRestorableTick({ seed: spec.seed, world: createWorld(spec.world, 'product'), rules, memory: createMemory() });
  const frames = [tick.frame()];
  while (tick.frame().tick < end) {
    for (const entry of spec.log) {
      if (entry.tick === tick.frame().tick) {
        const admission = tick.submit(entry.proposal);
        assert.ok(admission.admitted, 'the entry at ' + entry.tick + ' is admitted');
      }
    }
    if (at) {
      at(tick);
    }
    tick.advance();
    frames.push(tick.frame());
  }
  return { tick, frames };
}

/**
 * The frames a tick commits from its current one to `end`.
 * @param {ReturnType<typeof createRestorableTick>} tick
 * @param {number} end
 */
function framesOn(tick, end) {
  const frames = [tick.frame()];
  while (tick.frame().tick < end) {
    tick.advance();
    frames.push(tick.frame());
  }
  return frames;
}

/**
 * Saves whose committed frame is planted (#83 pin 2). The carry script runs
 * to five quanta into its move, the walker carrying the crate, and saves
 * there. Each planted save is tried 20 quanta later, in a run of its own,
 * where a restore that took it would move the run back. It is refused with
 * its reason before anything is written: the tick shows the frame it showed,
 * and the run commits, frame for frame, the frames of a run that was never
 * restored. The save the plant was made from is then restored into the run
 * at its end, and the run commits the frames from the save on again, so the
 * refusal is the plant's alone.
 * @param {(records: any[]) => Array<[any[], string]>} plants each planted frame's records, made from the committed ones, and why a restore refuses them
 * @returns {number} how many planted saves were refused
 */
function refusesFrame(plants) {
  const { spec, point } = carryCase();
  // The script to its move; the drop and the uses come after the move ends.
  const move = { ...spec, log: spec.log.filter((entry) => entry.tick < point) };
  const later = point + 20;
  const end = later + 40;
  const whole = framesTo(move, end).frames;
  const records = /** @type {any[]} */ (whole[point].bodies);
  assert.deepEqual(records.map((record) => record.id), ['walker', 'crate']);
  const planted = plants(records);
  assert.ok(planted.length > 0);
  for (const [bodies, reason] of planted) {
    /** @type {any} */
    let saved = null;
    const { tick, frames } = framesTo(move, end, (run) => {
      if (run.frame().tick === point) {
        saved = run.save();
        assert.deepEqual(saved.actions.map((/** @type {any[]} */ entry) => entry[0]), ['walker'], 'the save has the move in flight');
        assert.deepEqual(saved.world.carried, [['walker', 'crate']], 'and the crate carried');
      } else if (run.frame().tick === later) {
        const shown = run.frame();
        assert.throws(() => run.restore({ ...saved, frame: { ...saved.frame, bodies } }), { message: 'restore refused: ' + reason });
        assert.equal(run.frame(), shown, 'a refused restore leaves the frame the tick shows');
      }
    });
    assert.deepEqual(frames, whole, reason + ': the run commits the frames of a run never restored');
    tick.restore(saved);
    assert.deepEqual(framesOn(tick, end), whole.slice(point), 'the save the plant was made from restores');
  }
  return planted.length;
}

test('a save whose frame has a record without one of its numbers is refused, for each number and each record, and the tick commits the frames of a run never restored', (t) => {
  // The numbers are the committed record's own keys, so a number commitFrame
  // gains is one this test plants without.
  const refused = refusesFrame((records) => records.flatMap((record, i) => Object.keys(record).filter((key) => key !== 'id').map((key) => {
    const without = { ...record };
    delete without[key];
    return /** @type {[any[], string]} */ ([records.map((each, j) => (j === i ? without : each)), 'frame record ' + i + ' (' + record.id + ') is not a record of numbers']);
  })));
  t.diagnostic(refused + ' planted saves refused');
});

test('a save whose frame has a record with a field that is not a number is refused, for each number and each record, and the tick commits the frames of a run never restored', (t) => {
  const refused = refusesFrame((records) => records.flatMap((record, i) => Object.keys(record).filter((key) => key !== 'id').map((key) => (
    /** @type {[any[], string]} */ ([records.map((each, j) => (j === i ? { ...record, [key]: String(record[key]) } : each)), 'frame record ' + i + ' (' + record.id + ') is not a record of numbers'])
  ))));
  t.diagnostic(refused + ' planted saves refused');
});

test('a save whose frame has a record whose id is not its body\'s is refused, and the tick commits the frames of a run never restored', (t) => {
  const refused = refusesFrame(([walker, crate]) => [
    [[crate, walker], 'frame record 0 is crate in the save and walker here'],
    [[walker, { ...crate, id: 'parcel' }], 'frame record 1 is parcel in the save and crate here'],
    [[null, crate], 'frame record 0 is null in the save and walker here'],
  ]);
  t.diagnostic(refused + ' planted saves refused');
});

test('a save whose frame has one record too few is refused, and the tick commits the frames of a run never restored', (t) => {
  const refused = refusesFrame(([walker, crate]) => [
    [[walker], 'the frame does not have the 2 bodies of this world'],
    [[crate], 'the frame does not have the 2 bodies of this world'],
  ]);
  t.diagnostic(refused + ' planted saves refused');
});

test('a save whose frame has one record too many is refused, and the tick commits the frames of a run never restored', (t) => {
  const refused = refusesFrame(([walker, crate]) => [
    [[walker, crate, { ...crate, id: 'parcel' }], 'the frame does not have the 2 bodies of this world'],
    [[walker, crate, crate], 'the frame does not have the 2 bodies of this world'],
  ]);
  t.diagnostic(refused + ' planted saves refused');
});

test('a save taken between a body draft and the quantum that commits it, whose frame has one record fewer than the world, restores; the same frame with a record for the drafted body, or with one fewer, is refused', () => {
  // A drafted body is in the world at once and in the frame at the next
  // quantum, so the frame of a save taken between the two is the world's
  // but for the body the log drafted at the saved tick.
  const { spec } = owedCase();
  const [draft] = spec.log;
  assert.equal(draft.proposal.kind, 'body');
  const drafted = draft.tick;
  const later = drafted + 20;
  const end = later + 40;
  const whole = framesTo(spec, end).frames;
  /** @type {any} */
  let saved = null;
  const { tick, frames } = framesTo(spec, end, (run) => {
    if (run.frame().tick === drafted) {
      saved = run.save();
      assert.deepEqual(saved.frame.bodies.map((/** @type {any} */ record) => record.id), ['walker', 'crate']);
      assert.deepEqual(saved.world.bodies.map((/** @type {any} */ record) => record.id), ['walker', 'crate', 'parcel']);
    } else if (run.frame().tick === later) {
      const shown = run.frame();
      const parcel = whole[end].bodies[2];
      for (const bodies of [saved.frame.bodies.concat([parcel]), saved.frame.bodies.slice(1)]) {
        assert.throws(() => run.restore({ ...saved, frame: { ...saved.frame, bodies } }), { message: 'restore refused: the frame does not have the 2 bodies of this world before the 1 drafted at tick ' + drafted });
      }
      assert.equal(run.frame(), shown, 'a refused restore leaves the frame the tick shows');
    }
  });
  assert.deepEqual(frames, whole, 'the run commits the frames of a run never restored');
  // The save itself restores, at the draft's tick with the draft's quantum
  // owed, and the run commits the rest of the frames again.
  tick.restore(saved);
  assert.deepEqual(framesOn(tick, end), whole.slice(drafted));
});

/**
 * The minds' part of a run's save: the tick's for a log, the session's for
 * the product scene.
 * @param {any} saved
 * @param {any} [minds] when given, the save with these minds in place of its own
 */
function mindsOf(saved, minds) {
  if ('next' in saved) {
    return minds === undefined ? saved.tick.minds : { ...saved, tick: { ...saved.tick, minds } };
  }
  return minds === undefined ? saved.minds : { ...saved, minds };
}

test('a save with one malformed sight entry is refused before the restore changes anything, and the run traces on exactly as if no restore had been tried', (t) => {
  for (const [name, spec] of /** @type {Array<[string, ReplaySpec]>} */ ([
    ['behavior-minds', { seed: minds.seed, world: minds.world, log: minds.log }],
    ['the product scene', { scene: 'product' }],
  ])) {
    const whole = wholeRun(spec);
    const end = whole.lines.length - 1;
    const point = Math.floor(end / 3);
    const later = Math.floor((2 * end) / 3);
    // The run saves itself at the point and goes on to `later`, where each
    // planted save is tried: a restore that took one would move it back.
    const run = replayTo(spec, point);
    const saved = /** @type {any} */ (run.save());
    const kept = mindsOf(saved);
    assert.ok(kept.sight.length > 0 && kept.sight[0][1].length > 1, name + ': the save carries what a mind has seen');
    while (run.tick < later) {
      run.advance();
    }
    const [mind, seen] = kept.sight[0];
    const [body, record] = seen[0];
    /** @param {any} entry the one malformed entry, in place of the first */
    const plant = (entry) => mindsOf(saved, { ...kept, sight: [entry].concat(kept.sight.slice(1)) });
    const before = run.line();
    const plants = [
      // These two threw inside the minds' restore, after the world's.
      plant(null),
      plant([mind, null]),
      plant([mind, [[body, { ...record, inSight: 'yes' }]].concat(seen.slice(1))]),
      plant([mind, [[body, { ...record, zone: 7 }]].concat(seen.slice(1))]),
      plant([mind, [['nobody', record]].concat(seen.slice(1))]),
      plant(['nobody', seen]),
    ];
    for (const planted of plants) {
      assert.throws(() => run.restore(planted), /^Error: restore refused: the minds' sight is /);
      assert.equal(run.line(), before, name + ': a refused restore changes nothing');
    }
    assert.equal(diff(whole.lines.concat([endLine(whole.lines.length)]), rerun(whole.lines, run)), 'identical\n', name);
    t.diagnostic(name + ': saved at ' + point + ', ' + plants.length + ' malformed sight entries refused at ' + later + ', and the run traced on to ' + end + ' identically');
  }
});

/**
 * A role session (T7a) and what the gate said to each of its offers when it
 * ran live. The world is a floor with three bodies, one of them a mind's:
 * watcher sees the other two. probe, from fixtures/roles, moves them; hearer
 * and reader, built here from probe's manifest as packages/tick/gate.test.js
 * builds its test-only roles, write beliefs into watcher's mind, hearer from
 * player text and reader from the mind itself. Each proposal is built from
 * the frame at one tick and offered some quanta later, as a model's reply
 * arrives, and probe's third move is offered with two of its admissions in
 * the last 64 quanta, its budget. The live run reads each frame a proposal is
 * built from; the offers, with their provenance and the manifests they cite,
 * are the spec a role run replays.
 * @returns {{ spec: RoleSessionSpec, said: string[] }}
 */
function roleSession() {
  const loaded = loadRoles('fixtures/roles');
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  const probe = /** @type {RoleEntry} */ (loaded.catalog.byName.get('probe'));
  const writes = { classes: ['belief'], verbs: [], actors: 'own-body' };
  const made = catalogOf([
    { ...probe.manifest, role: 'hearer', world: 'live', inputs: [{ name: 'player', source: 'player-text' }, { name: 'sight', source: 'frame-in-sight' }], outputs: writes },
    { ...probe.manifest, role: 'reader', world: 'live', inputs: [{ name: 'mind', source: 'mind' }, { name: 'sight', source: 'frame-in-sight' }], outputs: writes },
  ]);
  if (!made.ok) {
    throw new Error(made.reason);
  }
  const hearer = /** @type {RoleEntry} */ (made.catalog.byName.get('hearer'));
  const reader = /** @type {RoleEntry} */ (made.catalog.byName.get('reader'));
  /** @type {RoleSessionSpec['manifests']} */
  const manifests = { [probe.hash]: probe.manifest, [hearer.hash]: hearer.manifest, [reader.hash]: reader.manifest };
  const carried = catalogFromLog(manifests);
  if (!carried.ok) {
    throw new Error(carried.reason);
  }
  /** @type {RoleSessionSpec['world']} */
  const world = {
    name: 'role-session',
    bodies: [
      { id: 'watcher', x: 0, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'walker', x: 1, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'runner', x: 1, y: 0.25, z: 1.2, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
    ],
    colliders: [{ id: 'floor', minX: -3, maxX: 5, minY: -1, maxY: 0, minZ: -3, maxZ: 3 }],
    zones: [
      { id: 'west', minX: -3, maxX: 0.5, minY: -1, maxY: 3, minZ: -3, maxZ: 3 },
      { id: 'east', minX: 0.5, maxX: 5, minY: -1, maxY: 3, minZ: -3, maxZ: 3 },
    ],
    minds: [{ body: 'watcher', sight: 6, goals: [], beliefs: [{ subject: { body: 'walker' }, key: 'at', value: 'east', confidence: 1, source: 'e1' }] }],
  };
  const seed = 5;
  const quanta = 200;
  const session = 'restore-session';
  const pin = /** @type {NonNullable<RoleEntry['manifest']['model']>} */ (probe.manifest.model).digest;
  /** @param {number} x @param {number} z */
  const to = (x, z) => ({ x, z });
  /** @type {Array<{ entry: RoleEntry, instance: string, built: number, at: number, proposal: any }>} */
  const plan = [
    { entry: hearer, instance: 'watcher', built: 20, at: 22, proposal: { kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'at', value: 'west', confidence: 0.5, source: 'e1' } },
    { entry: probe, instance: session, built: 30, at: 38, proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: to(1.5, 0) } },
    { entry: reader, instance: 'watcher', built: 44, at: 52, proposal: { kind: 'belief', mind: 'watcher', subject: { zone: 'east' }, key: 'contains', value: 'walker', confidence: 0.9, source: 'e1' } },
    { entry: probe, instance: session, built: 56, at: 64, proposal: { kind: 'intent', verb: 'move', actor: 'runner', target: to(1.5, 1.2) } },
    { entry: probe, instance: session, built: 82, at: 90, proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: to(1, 0) } },
    { entry: probe, instance: session, built: 136, at: 144, proposal: { kind: 'intent', verb: 'move', actor: 'runner', target: to(1, 1.2) } },
  ];
  const catalog = loadIntentRules();
  const live = createTick({ seed, world: createWorld(structuredClone(world), 'product'), rules: catalog.rules, retired: catalog.retired, memory: createMemory(), roles: carried.catalog });
  /** @type {Map<number, { tick: number, hash: string }>} */
  const builtAt = new Map();
  /** @type {RoleSessionSpec['offers'][number][]} */
  const offers = [];
  /** @type {string[]} */
  const said = [];
  for (let t = 0; t <= quanta; t = t + 1) {
    plan.forEach((step, i) => {
      if (step.built === t) {
        builtAt.set(i, { tick: live.frame().tick, hash: live.frame().hash });
      }
    });
    plan.forEach((step, i) => {
      if (step.at !== t) {
        return;
      }
      const built = /** @type {{ tick: number, hash: string }} */ (builtAt.get(i));
      const proposal = step.proposal.kind === 'intent' ? { ...step.proposal, frameHash: built.hash } : step.proposal;
      const provenance = {
        role: step.entry.manifest.role,
        instance: step.instance,
        manifest: step.entry.hash,
        model: pin,
        prompt: sha256('prompt ' + i),
        schema: sha256('schema'),
        record: sha256('record ' + i),
        output: sha256('output ' + i),
        builtAt: built,
        inputs: step.entry.derived.inputs.map((input) => ({ source: input.source, trust: input.trust })),
      };
      offers.push({ tick: t, proposal, provenance });
      const admission = live.submit(proposal, provenance);
      said.push(admission.admitted ? 'admitted' : admission.reason);
    });
    if (t < quanta) {
      live.advance();
    }
  }
  return { spec: { seed, world, law: 'product', manifests, offers, quanta }, said };
}

/** What the gate said to the role session's six offers. */
const SESSION_SAID = [
  'admitted',
  'admitted',
  'admitted',
  'admitted',
  'over budget: 2 admissions in the last 64 quanta, and role probe allows 2',
  'admitted',
];

/**
 * The role session run once without a save: its trace and what the gate said.
 * @param {RoleSessionSpec} spec
 */
function roleWhole(spec) {
  const run = roleSessionTo(spec, 0);
  const lines = [run.line()];
  while (run.advance()) {
    lines.push(run.line());
  }
  return { lines, said: run.said.slice() };
}

/**
 * One run of the role session that saves itself at each point with its own
 * save(), then runs on to its end, where it is returned.
 * @param {RoleSessionSpec} spec
 * @param {number[]} points
 * @param {string[]} lines the whole session's trace, which this run must match
 */
function roleSaves(spec, points, lines) {
  const run = roleSessionTo(spec, 0);
  /** @type {Map<number, any>} */
  const saves = new Map();
  const again = [run.line()];
  for (;;) {
    if (points.includes(run.tick)) {
      saves.set(run.tick, run.save());
    }
    if (!run.advance()) {
      break;
    }
    again.push(run.line());
  }
  assert.deepEqual(again, lines, 'a session that saves itself traces the same as one that does not');
  return { run, saves };
}

/**
 * The first-difference block of the role session restored at `point` from a
 * planted save and run on to its end, with the run, which holds what the
 * gate said after the restore. Unplanted, the save reruns identically.
 * @param {RoleSessionSpec} spec
 * @param {ReturnType<typeof roleWhole>} whole
 * @param {number} point
 * @param {(saved: any) => any} plant makes the planted save from the true one
 */
function rolePlanted(spec, whole, point, plant) {
  const { run, saves } = roleSaves(spec, [point], whole.lines);
  const saved = saves.get(point);
  const ended = whole.lines.concat([endLine(whole.lines.length)]);
  evict();
  run.restore(saved);
  assert.equal(diff(ended, rerunCaught(whole.lines, run)), 'identical\n', 'unplanted, the save reruns identically');
  evict();
  run.restore(plant(saved));
  return { saved, run, block: diff(ended, rerunCaught(whole.lines, run)).split('\n') };
}

test('a role session\'s own save restores without replay into the session run on to its end, twice, where the gate reads its window or its budget, and a saved belief keeps its label and the source it heard', (t) => {
  const { spec, said } = roleSession();
  assert.deepEqual(said, SESSION_SAID, 'live: a hearsay belief, a late move, a belief joined with the mind, a second move, a third over budget, and a fourth once the window has passed');
  const whole = roleWhole(spec);
  assert.deepEqual(whole.said, said, 'the role run offers the same proposals and the gate says the same');
  // Each point is between a proposal's frame and its offer, or, at 76, between
  // probe's second admission and its move over budget.
  const points = [21, 34, 48, 76, 140, 170];
  const { run, saves } = roleSaves(spec, points, whole.lines);
  const ended = whole.lines.concat([endLine(whole.lines.length)]);
  for (const point of points) {
    const saved = saves.get(point);
    for (let again = 0; again < 2; again = again + 1) {
      evict();
      const from = run.tick;
      run.restore(saved);
      assert.equal(run.tick, point, 'the restore puts the session back at ' + point + ' from ' + from);
      assert.equal(diff(ended, rerun(whole.lines, run)), 'identical\n', 'restored at ' + point + ', restore ' + (again + 1));
      assert.deepEqual(run.said, said, 'restored at ' + point + ', the gate says what it said');
    }
  }
  const kept = saves.get(76).tick;
  assert.deepEqual(kept.admissions, [['hearer watcher', [22]], ['probe restore-session', [38, 64]], ['reader watcher', [52]]], 'the save carries each instance\'s admission ticks');
  assert.equal(kept.window.length, 65, 'and the window of frames the oldest a role may cite needs');
  assert.deepEqual(kept.window[kept.window.length - 1].minds, [['watcher', { label: 'hearsay', heard: 'player-text' }]], 'with each mind\'s least trusted label');
  /** @param {any[]} list */
  const hearsay = (list) => list.filter((belief) => belief.label === 'hearsay').map((belief) => [belief.key, belief.value, belief.label, belief.heard]);
  const [mind, list] = kept.memory.minds[0];
  assert.equal(mind, 'watcher');
  assert.deepEqual(hearsay(list), [['at', 'west', 'hearsay', 'player-text'], ['contains', 'walker', 'hearsay', 'player-text']], 'a saved belief keeps its label and the source it heard: hearer\'s, and reader\'s, joined with it');
  evict();
  run.restore(saves.get(76));
  assert.deepEqual(hearsay(run.memory.mindBeliefs('watcher')), hearsay(list), 'and the restored mind holds them so');
  t.diagnostic('role session of ' + spec.offers.length + ' offers over ' + spec.quanta + ' quanta, saved at ' + points.join(', ') + ', each restored twice from tick ' + (whole.lines.length - 1));
});

test('a role session\'s save planted without the window\'s earlier frames is caught: the gate refuses the proposal built before the save as stale', () => {
  const { spec } = roleSession();
  const whole = roleWhole(spec);
  const { saved, run, block } = rolePlanted(spec, whole, 48, (kept) => ({ ...kept, tick: { ...kept.tick, window: kept.tick.window.slice(-1) } }));
  assert.equal(saved.tick.window.length, 49, 'the save carries every frame since the load');
  assert.equal(run.said[2], 'stale: the tick keeps no frame at tick 44', 'reader\'s belief, built at 44 and offered at 52, is refused');
  assert.equal(block[0], 'first difference at tick 53', block.join('\n'));
});

test('a role session\'s save planted with its window\'s labels gone is caught: a belief joined with the mind is labelled role, not hearsay', () => {
  const { spec } = roleSession();
  const whole = roleWhole(spec);
  const { run, block } = rolePlanted(spec, whole, 48, (kept) => ({
    ...kept,
    tick: { ...kept.tick, window: kept.tick.window.map((/** @type {any} */ frame) => ({ ...frame, minds: frame.minds.map((/** @type {any[]} */ pair) => [pair[0], null]) })) },
  }));
  assert.equal(run.said[2], 'admitted');
  const joined = run.memory.mindBeliefs('watcher').find((belief) => belief.key === 'contains');
  assert.equal(joined && joined.label, 'role', 'reader reads a mind the window says holds nothing');
  assert.equal(block[0], 'first difference at tick 53', block.join('\n'));
  assert.equal(block[1], 'hash', 'the label is in the hash, and in nothing else the trace shows');
});

test('a role session\'s save planted without the admission ticks is caught: the move over budget is admitted', () => {
  const { spec } = roleSession();
  const whole = roleWhole(spec);
  const { saved, run, block } = rolePlanted(spec, whole, 76, (kept) => ({ ...kept, tick: { ...kept.tick, admissions: [] } }));
  assert.deepEqual(saved.tick.admissions.find((/** @type {any[]} */ entry) => entry[0] === 'probe restore-session'), ['probe restore-session', [38, 64]]);
  assert.equal(run.said[4], 'admitted', 'probe\'s third move, offered at 90');
  assert.equal(block[0], 'first difference at tick 91', block.join('\n'));
});

test('a role session\'s save with its window, its admission ticks, a belief\'s label, or a log entry\'s provenance out of shape is refused before anything changes, and the session traces on as if no restore had been tried', (t) => {
  const { spec } = roleSession();
  const whole = roleWhole(spec);
  const run = roleSessionTo(spec, 76);
  const saved = /** @type {any} */ (run.save());
  while (run.tick < 120) {
    run.advance();
  }
  const later = /** @type {any} */ (run.save());
  const kept = saved.tick;
  const first = kept.window[0];
  /** @param {object} patch */
  const plant = (patch) => ({ ...saved, tick: { ...kept, ...patch } });
  /** @param {(frame: any) => any} change */
  const reframe = (change) => kept.window.map((/** @type {any} */ frame, /** @type {number} */ i) => (i === 3 ? change(frame) : frame));
  const [mind, list] = kept.memory.minds[0];
  const heard = list.findIndex((/** @type {any} */ belief) => belief.label === 'hearsay');
  /** @param {(belief: any) => any} change */
  const relabel = (change) => ({ ...kept.memory, minds: [[mind, list.map((/** @type {any} */ belief, /** @type {number} */ i) => (i === heard ? change(belief) : belief))]] });
  /** @param {(provenance: any) => any} change */
  const recite = (change) => kept.log.map((/** @type {any} */ entry, /** @type {number} */ i) => (i === 0 ? { ...entry, provenance: change(entry.provenance) } : entry));
  const window = /^Error: restore refused: the window is one frame per tick, oldest first, /;
  const ticks = /^Error: restore refused: the admission ticks are, for each instance of a role in this catalog, /;
  const before = run.line();
  /** @type {Array<[any, RegExp]>} */
  const plants = [
    [plant({ window: undefined }), /^Error: restore refused: the window is a list of frames$/],
    [plant({ window: [] }), /^Error: restore refused: the window holds the saved frame and at most 64 frames before it$/],
    [plant({ window: [{ ...first, tick: first.tick - 1 }].concat(kept.window) }), /^Error: restore refused: the window holds the saved frame and at most 64 frames before it$/],
    [plant({ window: later.tick.window }), /^Error: restore refused: the window ends at the saved frame$/],
    [plant({ window: kept.window.slice(0, -1) }), /^Error: restore refused: the window ends at the saved frame$/],
    [plant({ window: kept.window.filter((/** @type {any} */ _frame, /** @type {number} */ i) => i !== 10) }), window],
    [plant({ window: reframe((frame) => ({ ...frame, hash: 'not a hash' })) }), window],
    [plant({ window: reframe((frame) => ({ ...frame, minds: [['watcher', { label: 'trusted' }]] })) }), window],
    [plant({ window: reframe((frame) => ({ ...frame, minds: [['watcher', { label: 'hearsay' }]] })) }), window],
    [plant({ window: reframe((frame) => ({ ...frame, minds: [['walker', null]] })) }), window],
    [plant({ window: reframe((frame) => ({ ...frame, seen: true })) }), window],
    [plant({ admissions: undefined }), /^Error: restore refused: the admission ticks are a list$/],
    [plant({ admissions: [['nobody restore-session', [38]]] }), ticks],
    [plant({ admissions: [['probe', [38]]] }), ticks],
    [plant({ admissions: [['probe restore-session', [64, 38]]] }), ticks],
    [plant({ admissions: [['probe restore-session', [38, 900]]] }), ticks],
    [plant({ admissions: [['probe restore-session', []]] }), ticks],
    [plant({ admissions: [['probe restore-session', [38]], ['probe restore-session', [64]]] }), ticks],
    [plant({ memory: relabel((belief) => ({ ...belief, heard: undefined })) }), /^Error: restore refused: the memory's beliefs are /],
    [plant({ memory: relabel((belief) => ({ ...belief, label: 'trusted', heard: undefined })) }), /^Error: restore refused: the memory's beliefs are /],
    [plant({ memory: relabel((belief) => ({ ...belief, label: 'observed' })) }), /^Error: restore refused: the memory's beliefs are /],
    [plant({ log: recite((provenance) => ({ ...provenance, manifest: sha256('another manifest') })) }), /^Error: restore refused: a log entry's provenance is refused: the log carries no manifest [0-9a-f]{64}$/],
    [plant({ log: recite((provenance) => Object.fromEntries(Object.entries(provenance).filter(([key]) => key !== 'builtAt'))) }), /^Error: restore refused: a log entry's provenance is refused: provenance names no builtAt$/],
  ];
  for (const [planted, reason] of plants) {
    assert.throws(() => run.restore(planted), reason);
    assert.equal(run.line(), before, 'a refused restore changes nothing');
  }
  const ended = whole.lines.concat([endLine(whole.lines.length)]);
  assert.equal(diff(ended, rerun(whole.lines, run)), 'identical\n', 'the session traces on to its end as if no restore had been tried');
  assert.deepEqual(run.said, SESSION_SAID, 'and the gate says what it said');
  t.diagnostic('saved at 76, ' + plants.length + ' planted saves refused at 120, and the session traced on to ' + spec.quanta + ' identically');
});

test('behavior-1c is a 2D capture the loader refuses, so it has no run to restore', () => {
  const capture = JSON.parse(readFileSync('fixtures/behavior-1c.json', 'utf8'));
  assert.equal(typeof capture.world.bodies[0].z, 'undefined');
});

test('the costs on record: replay per quantum, image size, copy out and in', (t) => {
  const quanta = 3333;
  const started = performance.now();
  const run = replayTo({ scene: 'product' }, quanta);
  const replayMs = performance.now() - started;
  const out0 = performance.now();
  const image = imageSolver();
  const outMs = performance.now() - out0;
  if (!image) {
    throw new Error('no image');
  }
  const copy0 = performance.now();
  const copied = new Uint8Array(image.bytes.length);
  copied.set(image.bytes);
  const copyMs = performance.now() - copy0;
  const in0 = performance.now();
  assert.equal(restoreImage(image), true);
  const inMs = performance.now() - in0;
  t.diagnostic('replay: ' + ((replayMs / quanta) * 1000).toFixed(1) + ' us per quantum over ' + quanta + ' quanta of the product scene (' + replayMs.toFixed(0) + ' ms)');
  t.diagnostic('image: ' + image.bytes.length + ' bytes; out ' + outMs.toFixed(2) + ' ms with its digest; in ' + inMs.toFixed(2) + ' ms with its checks; a bare copy ' + copyMs.toFixed(2) + ' ms');
  assert.ok(run.tick === quanta);
});

/**
 * The binary's globals, imports, and tables, from the section headers.
 * @param {Uint8Array} data
 */
function sections(data) {
  let at = 8;
  function u() {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = data[at];
      at = at + 1;
      result = result + (b & 0x7f) * 2 ** shift;
      shift = shift + 7;
      if ((b & 0x80) === 0) {
        return result;
      }
    }
  }
  const out = { imports: 0, globals: /** @type {Array<{ type: number, mutable: boolean }>} */ ([]), tables: /** @type {Array<{ min: number, max: number | null }>} */ ([]) };
  while (at < data.length) {
    const id = data[at];
    at = at + 1;
    const size = u();
    const end = at + size;
    if (id === 2) {
      out.imports = u();
    } else if (id === 4) {
      const n = u();
      for (let i = 0; i < n; i = i + 1) {
        at = at + 1;
        const flags = u();
        const min = u();
        out.tables.push({ min, max: flags & 1 ? u() : null });
      }
    } else if (id === 6) {
      const n = u();
      for (let i = 0; i < n; i = i + 1) {
        const type = data[at];
        const mutable = data[at + 1] === 1;
        out.globals.push({ type, mutable });
        at = at + 2;
        // i32.const or i64.const and its operand, then end.
        at = at + 1;
        u();
        at = at + 1;
      }
    }
    at = end;
  }
  return out;
}

test('linear memory and the stack pointer are the whole mutable state of the binary', (t) => {
  const found = sections(binary);
  t.diagnostic('imports ' + found.imports + '; globals ' + JSON.stringify(found.globals) + '; tables ' + JSON.stringify(found.tables));
  assert.equal(found.imports, 0, 'nothing imported');
  assert.deepEqual(found.globals, [{ type: 0x7f, mutable: true }], 'one global: the i32 stack pointer');
  const exported = WebAssembly.Module.exports(new WebAssembly.Module(binary)).filter((e) => e.kind === 'global').map((e) => e.name);
  assert.deepEqual(exported, ['__stack_pointer']);
  for (const table of found.tables) {
    assert.equal(table.max, table.min, 'a table that cannot grow');
  }
  const sp = stackPointer();
  assert.equal(sp.value, sp.base);
  assert.equal(sp.base, 1048576);
});

/** A small case saved mid-run: the rotation stack, in contact, before it sleeps. */
function stackCase() {
  const spec = JSON.parse(readFileSync('fixtures/behavior-rotation.json', 'utf8')).cases.find((/** @type {{ name: string }} */ c) => c.name === 'stack');
  const whole = wholeRun(spec);
  const point = 20;
  const run = replayTo(spec, point);
  const saved = run.world.save();
  if (!saved.image) {
    throw new Error('no image');
  }
  return { spec, whole, point, run, saved, image: saved.image };
}

/**
 * A refused restore throws with its reason and changes nothing: the same
 * instance, the same snapshot, the same records.
 * @param {Run} run
 * @param {WorldSave | SparseWorldSave} save
 * @param {RegExp} reason
 */
function refused(run, save, reason) {
  const instance = instantiate();
  const snap = snapshotBytes();
  const records = JSON.stringify(run.world.bodies);
  assert.throws(() => run.world.restore(save), reason);
  assert.equal(instantiate(), instance, 'the same instance');
  assert.deepEqual(snapshotBytes(), snap, 'the same snapshot');
  assert.equal(JSON.stringify(run.world.bodies), records, 'the same records');
}

/**
 * The image digest as it was written before T6: one byte at a time, byte i
 * to lane (i & 4) >> 2. The glue's word-at-a-time digest must equal it.
 * @param {Uint8Array} data
 */
function byteDigest(data) {
  let h0 = 0x811c9dc5;
  let h1 = 0x811c9dc5;
  const n = data.length;
  for (let i = 0; i < 4; i = i + 1) {
    const b = (n >>> (i * 8)) & 255;
    h0 = Math.imul(h0 ^ b, 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
  }
  for (let i = 0; i < n; i = i + 1) {
    if ((i & 4) === 0) {
      h0 = Math.imul(h0 ^ data[i], 0x01000193) >>> 0;
    } else {
      h1 = Math.imul(h1 ^ data[i], 0x01000193) >>> 0;
    }
  }
  return h0.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0');
}

test('the image digest, read a word at a time with a page of zeros as one multiplication, equals the byte loop at every length and alignment, and on a real image', () => {
  let seed = 7;
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed >>> 24;
  };
  for (const n of [0, 1, 7, 8, 9, 4095, 65535, 65536, 65537, 2 * 65536 + 12, 3 * 65536]) {
    const buffer = new Uint8Array(n + 3);
    for (let i = 0; i < buffer.length; i = i + 1) {
      // Mostly zero, so whole zero pages occur beside pages with data.
      buffer[i] = i % 97 === 0 || (i >= 65536 && i < 70000) ? next() : 0;
    }
    for (const offset of [0, 1, 2, 3]) {
      const data = buffer.subarray(offset, offset + n);
      assert.equal(imageDigest(data), byteDigest(data), n + ' bytes at offset ' + offset);
    }
    assert.equal(imageDigest(new Uint8Array(n)), byteDigest(new Uint8Array(n)), n + ' zero bytes');
  }
  const { image } = stackCase();
  assert.equal(imageDigest(image.bytes), byteDigest(image.bytes));
  assert.equal(image.digest, byteDigest(image.bytes));
});

test('a sparse image keeps only the pages in use, its digest is the whole memory\'s, and it restores in the process to the same memory', (t) => {
  const { run } = stackCase();
  const dense = imageSolver();
  const sparse = imageSparse();
  if (!dense || !sparse) {
    throw new Error('no image');
  }
  const count = dense.bytes.length / 65536;
  let marked = 0;
  for (let p = 0; p < count; p = p + 1) {
    /** @type {boolean} */
    const kept = (sparse.pages[p >> 3] & (1 << (p & 7))) !== 0;
    const used = dense.bytes.subarray(p * 65536, (p + 1) * 65536).some((byte) => byte !== 0);
    assert.equal(kept, used, 'page ' + p);
    marked = marked + (kept ? 1 : 0);
  }
  t.diagnostic(marked + ' of ' + count + ' pages in use; sparse ' + sparse.data.length + ' bytes against ' + dense.bytes.length);
  assert.equal(sparse.data.length, marked * 65536);
  assert.equal(sparse.digest, dense.digest);
  assert.equal(sparseDigest(sparse.pages, sparse.data, count), dense.digest);
  const before = instantiate();
  assert.equal(restoreSparse(sparse), true, imageRefusal());
  assert.notEqual(instantiate(), before, 'a fresh instance');
  const again = imageSolver();
  assert.ok(again);
  assert.equal(again.digest, dense.digest, 'the restored memory is the imaged one, byte for byte');
  assert.deepEqual(again.bytes, dense.bytes);
  assert.ok(run.tick > 0);
});

test('a sparse image from another binary, with one byte changed, or not a whole number of the pages it marks is refused, and changes nothing', () => {
  const { run } = stackCase();
  const saved = run.world.saveSparse();
  const image = saved.image;
  if (!image) {
    throw new Error('no image');
  }
  const other = image.binary.slice(0, 63) + (image.binary[63] === '0' ? '1' : '0');
  refused(run, { ...saved, image: { ...image, binary: other } }, /restore refused: the image is from another binary/);
  for (const at of [0, 65535, Math.floor(image.data.length / 2), image.data.length - 1]) {
    const changed = image.data.slice();
    changed[at] = changed[at] ^ 1;
    refused(run, { ...saved, image: { ...image, data: changed } }, /restore refused: the bytes do not match the image digest/);
  }
  refused(run, { ...saved, image: { ...image, data: image.data.subarray(0, image.data.length - 8) } }, /restore refused: the length is not a whole number of pages: the bitmap marks \d+ and the data holds \d+ bytes/);
  const extra = image.pages.slice();
  const free = Array.from({ length: extra.length * 8 }, (_, p) => p).find((p) => !(extra[p >> 3] & (1 << (p & 7))));
  extra[/** @type {number} */ (free) >> 3] = extra[/** @type {number} */ (free) >> 3] | (1 << (/** @type {number} */ (free) & 7));
  refused(run, { ...saved, image: { ...image, pages: extra } }, /restore refused: the length is not a whole number of pages/);
  refused(run, { ...saved, image: { ...image, pages: image.pages.subarray(0, image.pages.length - 1) } }, /restore refused: the page bitmap is \d+ bytes, not the \d+ that cover the 512 pages of the memory/);
  // The true image still restores.
  evict();
  run.world.restore(saved);
});

test('the costs on record, pin 2: a dense restore digests the whole 32 MiB, a sparse one only the pages in use', (t) => {
  replayTo({ scene: 'product' }, 3333);
  const dense = imageSolver();
  const sparse = imageSparse();
  if (!dense || !sparse) {
    throw new Error('no image');
  }
  /** @param {() => unknown} fn */
  const time = (fn) => {
    fn();
    const t0 = performance.now();
    for (let i = 0; i < 20; i = i + 1) {
      fn();
    }
    return (performance.now() - t0) / 20;
  };
  const byte = time(() => byteDigest(dense.bytes));
  const word = time(() => imageDigest(dense.bytes));
  const out = time(() => imageSparse());
  const inDense = time(() => restoreImage(dense));
  const inSparse = time(() => restoreSparse(sparse));
  t.diagnostic('the product scene at 3333: ' + sparse.data.length / 65536 + ' pages in use of 512');
  t.diagnostic('digest of 32 MiB: ' + byte.toFixed(1) + ' ms by the byte loop written in this file, ' + word.toFixed(1) + ' ms by the glue, a word at a time with zero pages multiplied');
  t.diagnostic('restore: ' + inDense.toFixed(2) + ' ms dense, ' + inSparse.toFixed(2) + ' ms sparse; a sparse image taken in ' + out.toFixed(2) + ' ms');
  assert.ok(inSparse < inDense, 'the sparse restore is the cheaper');
  assert.equal(restoreSparse(sparse), true);
});

test('an image from a binary with another digest is refused', () => {
  const { run, saved, image } = stackCase();
  const other = image.binary.slice(0, 63) + (image.binary[63] === '0' ? '1' : '0');
  refused(run, { ...saved, image: { ...image, binary: other } }, /restore refused: the image is from another binary/);
});

test('an image of the wrong length is refused', () => {
  const { run, saved, image } = stackCase();
  const short = image.bytes.slice(0, image.bytes.length - 8);
  refused(run, { ...saved, image: { ...image, bytes: short, digest: imageDigest(short) } }, /restore refused: the length is not a whole number of pages/);
  const long = new Uint8Array(image.bytes.length + 8);
  long.set(image.bytes);
  refused(run, { ...saved, image: { ...image, bytes: long, digest: imageDigest(long) } }, /restore refused: the length is not a whole number of pages/);
  const tiny = new Uint8Array(65536);
  refused(run, { ...saved, image: { ...image, bytes: tiny, digest: imageDigest(tiny) } }, /restore refused: the length is less than a fresh instance memory/);
});

test('an image with one byte changed is refused by its digest', () => {
  const { whole, run, saved, image } = stackCase();
  for (const at of [0, 1048575, Math.floor(image.bytes.length / 2), image.bytes.length - 1]) {
    const changed = image.bytes.slice();
    changed[at] = changed[at] ^ 1;
    refused(run, { ...saved, image: { ...image, bytes: changed } }, /restore refused: the bytes do not match the image digest/);
  }
  // The original still restores, and the run goes on as it did.
  evict();
  run.world.restore(saved);
  assert.equal(diff(whole.lines.concat([endLine(whole.lines.length)]), rerun(whole.lines, run)), 'identical\n');
});

test('an instance whose stack pointer is not at its base is not imaged, and a restore replaces it', () => {
  const { spec, whole, point, run, saved } = stackCase();
  const exp = /** @type {{ __stack_pointer: WebAssembly.Global }} */ (/** @type {unknown} */ (instantiate().exports));
  const base = exp.__stack_pointer.value;
  // What a trap leaves behind: the epilogue that restores the pointer never ran.
  exp.__stack_pointer.value = base - 64;
  assert.throws(() => run.world.save(), /save refused: the stack pointer is not at its base/);
  // The dead instance is replaced by a fresh one holding the last image.
  run.world.restore(saved);
  assert.equal(stackPointer().value, base);
  const expected = whole.lines.concat([endLine(whole.lines.length)]);
  assert.equal(diff(expected, rerun(whole.lines, run)), 'identical\n');
  assert.equal(run.tick, whole.lines.length - 1);
  assert.ok(point > 0 && spec);
});

test('without the image, an evicted solver does not rerun the same: the image is what carries it', () => {
  const { whole, point, run } = stackCase();
  evict();
  const found = diff(whole.lines.concat([endLine(whole.lines.length)]), rerun(whole.lines, run)).split('\n');
  // The frame at the point already reads the other world's snapshot, and the
  // next quantum rebuilds this world from its records alone.
  assert.equal(found[0], 'first difference at tick ' + point, found.join('\n'));
  assert.equal(found[1], 'snapshot');
});

test('a restore whose rerun was planted to differ by one velocity is caught by the diff', () => {
  const spec = JSON.parse(readFileSync('fixtures/behavior-rotation.json', 'utf8')).cases.find((/** @type {{ name: string }} */ c) => c.name === 'tumble');
  const whole = wholeRun(spec);
  const expected = whole.lines.concat([endLine(whole.lines.length)]);
  const point = Math.floor(spec.steps / 3);
  const saved = replayTo(spec, point).world.save();
  // Unplanted, the restore reruns identically.
  const clean = replayTo(spec, point);
  evict();
  clean.world.restore(saved);
  assert.equal(diff(expected, rerun(whole.lines, clean)), 'identical\n');
  // The walker's velocity, one step after the restore.
  const planted = replayTo(spec, point);
  evict();
  planted.world.restore(saved);
  const walker = planted.world.body('walker');
  if (!walker) {
    throw new Error('walker');
  }
  walker.vx = walker.vx + 0.001;
  const lines = rerun(whole.lines, planted);
  const found = diff(expected, lines).split('\n');
  assert.equal(found[0], 'first difference at tick ' + point);
  assert.equal(found[1], 'body walker field vx');
  // With that line taken from the whole run, the next quantum has moved a body.
  lines[point] = whole.lines[point];
  const later = diff(expected, lines).split('\n');
  assert.equal(later[0], 'first difference at tick ' + (point + 1));
  assert.match(later[1], /^body (walker|crate) field /);
});
