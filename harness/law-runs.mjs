#!/usr/bin/env node
// Law runs (F3, docs/dispatch-f3-character-push.md). A law run is what the
// tick hands the solver over one run: the records its load wrote, and before
// each quantum every slot the tick wrote differently from what the law left
// there, with a digest of every record and snapshot the law returned. The
// native tests at the end of solver/src/rapier_law.rs read fixtures/law-runs/
// and step each run through the law. A replay that reproduces the digest is
// the product's run bit for bit, so the control test and the guard measure
// the product's own runs, not a model of them.
//
// The runs: the product scene as harness/sim.mjs runs it; every behaviour
// fixture run on the product law, as harness/corpus.mjs lists them, each
// checked frame by frame against the hashes the fixture recorded; and every
// fixture with a push, fixtures/push/*.json, as harness/push.test.js plays it.
// A fixture run of no quanta (behavior-verbs refusals) gives the law nothing
// to step and has no file.
//
// A file is lines of words. Every double is its bit pattern in hex.
//   run <name> <quanta> <shape> <rows> <cols> <cell>
//   collider <10 values>                  each collider, as the load wrote it
//   heights <values>                      the heightfield's heights, when it has one
//   body <id> <17 values>                 each body's record as the load wrote it
//   pin <first> <last> <body> <actor>     before each quantum from first to last,
//                                         the carried body sits on the actor as
//                                         the tick's pinCarried puts it: the
//                                         actor's x and z, its y plus both
//                                         half-heights, no velocity, no rotation
//   edit <quantum> <body> <slot> <value>  before the quantum the tick wrote this
//                                         slot differently from what the law and
//                                         the pins left there
//   final <body> <17 values>              the records after the last quantum
//   digest <16 hex digits>                packages/frame/hash.js's byte stream
//                                         over each quantum's records, then its
//                                         snapshot
// Bodies and slots count from 0, and quanta from 1. The colliders and the
// heights are the same at every quantum; recording refuses a run where they
// are not, and a run that changes its number of bodies.
//
// `node harness/law-runs.mjs --write` records every run into fixtures/law-runs/.
// `--check` records them again and exits 1 unless every file is unchanged;
// harness/push.test.js makes the same check.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHasher } from '../packages/frame/hash.js';
import { createMemory } from '../packages/tick/memory.js';
import { loadIntentRules } from '../packages/tick/predicates.js';
import { createTick } from '../packages/tick/tick.js';
import { createWorld } from '../packages/tick/world.js';
import { instantiate, snapshotBytes } from '../solver/dist/solver.mjs';
import { fixtureRuns } from './corpus.mjs';
import { productSession } from './product-run.mjs';
import { replayTo } from './replay-to.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the law runs live. */
export const LAW_RUNS = join(root, 'fixtures', 'law-runs');

/** Where the fixtures with a push live. */
export const PUSHES = join(root, 'fixtures', 'push');

/** Doubles in one body record and in one collider record. */
const STRIDE = 17;
const COLLIDER = 10;
/** Record slots 0 to 12 are what the law writes back; 14 is the half-height. */
const WRITTEN = 13;
const HY = 14;

/**
 * @typedef {ReturnType<typeof createWorld>} World
 * @typedef {Parameters<typeof createWorld>[0]} WorldInit
 * @typedef {{ tick: number, hash: string, proposal: import('../packages/frame/types.js').Proposal }} LogEntry
 * @typedef {{ tick: number, kind: string, verb: string, actor: string, target: unknown }} ScriptEntry
 * @typedef {{ name: string, note: string, seed: number, quanta: number, world: WorldInit & { shape?: 'box' | 'capsule' }, script: ScriptEntry[], log: LogEntry[], hash: string }} PushFixture
 */

const bitsView = new DataView(new ArrayBuffer(8));

/**
 * A double's bit pattern, as sixteen hex digits.
 * @param {number} x
 */
export function bits(x) {
  bitsView.setFloat64(0, x);
  return bitsView.getBigUint64(0).toString(16).padStart(16, '0');
}

/**
 * Every fixture with a push, fixtures/push/*.json, in file order.
 * @returns {PushFixture[]}
 */
export function pushFixtures() {
  return readdirSync(PUSHES)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => /** @type {PushFixture} */ (JSON.parse(readFileSync(join(PUSHES, file), 'utf8'))));
}

/**
 * A push fixture through the tick with the product law, one quantum at a
 * time. Each log entry is submitted at its tick against the newest frame and
 * must be admitted against the hash it names.
 * @param {PushFixture} fixture
 */
export function pushRun(fixture) {
  const world = createWorld(fixture.world, 'product');
  const tick = createTick({ seed: fixture.seed, world, rules: loadIntentRules().rules, memory: createMemory() });
  let next = 0;
  return {
    world,
    tick,
    /** Submits what is due, then runs one quantum and returns its frame. */
    advance() {
      while (next < fixture.log.length && fixture.log[next].tick === tick.frame().tick) {
        const entry = fixture.log[next];
        const result = tick.submit(entry.proposal);
        if (!result.admitted) {
          throw new Error(fixture.name + ': the entry at tick ' + entry.tick + ' was refused: ' + result.reason);
        }
        if (result.hash !== entry.hash) {
          throw new Error(fixture.name + ': the entry at tick ' + entry.tick + ' was admitted against ' + result.hash + ', not ' + entry.hash);
        }
        next = next + 1;
      }
      return tick.advance();
    },
  };
}

/**
 * The carried bodies now, as body index to actor index.
 * @param {World} world
 * @returns {Map<number, number>}
 */
function carriedNow(world) {
  /** @type {Map<number, number>} */
  const out = new Map();
  for (let i = 0; i < world.bodies.length; i = i + 1) {
    const actor = world.carriedByOf(world.bodies[i].id);
    if (actor !== null) {
      out.set(i, world.linkIndex(actor));
    }
  }
  return out;
}

/**
 * Records the law run `world` makes from here: the records its load wrote,
 * which are still in the solver's buffers, and each step it takes. Call it
 * after the load and before the first step.
 * @param {string} name
 * @param {World} world
 * @param {number} shape 0 for boxes, 1 for capsules, as the world passes it
 */
export function recordLaw(name, world, shape) {
  const exp = instantiate().exports;
  const memory = exp.memory;
  const view = new Float64Array(memory.buffer);
  const n = world.bodies.length;
  const bodyAt = exp.bodies_ptr() / 8;
  const colliderAt = exp.colliders_ptr() / 8;
  const heightAt = exp.heights_ptr() / 8;
  const field = world.heightfield;
  const cells = field ? field.rows * field.cols : 0;
  /** @returns {number[]} the solver's body records now */
  const records = () => Array.from(view.subarray(bodyAt, bodyAt + n * STRIDE));
  const load = records();
  /** @returns {string} the colliders and heights now, as bits */
  const statics = () => Array.from(view.subarray(colliderAt, colliderAt + world.colliders.length * COLLIDER)).map(bits).join(' ')
    + ' | ' + Array.from(view.subarray(heightAt, heightAt + cells)).map(bits).join(' ');
  const colliders = Array.from(view.subarray(colliderAt, colliderAt + world.colliders.length * COLLIDER));
  const heights = Array.from(view.subarray(heightAt, heightAt + cells));
  const loaded = statics();
  const ids = world.bodies.map((b) => b.id);
  const hasher = createHasher();
  /** @type {Array<[number, number, number, number]>} */
  const edits = [];
  /** @type {Array<{ first: number, last: number, body: number, actor: number }>} */
  const pins = [];
  /** @type {Map<number, number>} */
  let carriedLast = new Map();
  let quanta = 0;
  const step = world.step;
  /** @param {ReadonlySet<string>} [driving] */
  world.step = (driving) => {
    const q = quanta + 1;
    if (world.bodies.length !== n) {
      throw new Error(name + ': the run changed its number of bodies at quantum ' + q + '; a law run cannot hold that');
    }
    const left = records();
    const carried = carriedNow(world);
    const writes = world.bodies.map((b) => [b.x, b.y, b.z, b.vx, b.vy, b.vz, b.qx, b.qy, b.qz, b.qw, b.wx, b.wy, b.wz]);
    step(driving);
    const after = records();
    // What the replay holds before this quantum's edits: what the law left,
    // with each body that stayed carried by the same actor pinned to it.
    const base = left.slice();
    for (const [body, actor] of carried) {
      if (carriedLast.get(body) !== actor) {
        continue;
      }
      const c = body * STRIDE;
      const a = actor * STRIDE;
      const pose = [left[a], left[a + 1] + left[a + HY] + left[c + HY], left[a + 2], 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
      for (let s = 0; s < WRITTEN; s = s + 1) {
        base[c + s] = pose[s];
      }
      const open = pins.find((p) => p.body === body && p.actor === actor && p.last === q - 1);
      if (open) {
        open.last = q;
      } else {
        pins.push({ first: q, last: q, body, actor });
      }
    }
    for (let i = 0; i < n; i = i + 1) {
      for (let s = 0; s < STRIDE; s = s + 1) {
        // Slots 0 to 12 are what the tick wrote; the law leaves 13 to 16 as written.
        const wrote = s < WRITTEN ? writes[i][s] : after[i * STRIDE + s];
        if (bits(wrote) !== bits(base[i * STRIDE + s])) {
          edits.push([q, i, s, wrote]);
        }
      }
    }
    if (statics() !== loaded) {
      throw new Error(name + ': the colliders or the heights changed at quantum ' + q + '; a law run cannot hold that');
    }
    hasher.bytes(new Uint8Array(memory.buffer, exp.bodies_ptr(), n * STRIDE * 8));
    hasher.bytes(snapshotBytes());
    carriedLast = carried;
    quanta = q;
  };
  return {
    /** The run so far, as its file holds it. */
    text() {
      const rows = field ? field.rows : 0;
      const cols = field ? field.cols : 0;
      const cell = field ? field.cell : 0;
      const lines = ['run ' + name + ' ' + quanta + ' ' + shape + ' ' + rows + ' ' + cols + ' ' + bits(cell)];
      for (let j = 0; j < world.colliders.length; j = j + 1) {
        lines.push('collider ' + colliders.slice(j * COLLIDER, (j + 1) * COLLIDER).map(bits).join(' '));
      }
      if (cells > 0) {
        lines.push('heights ' + heights.map(bits).join(' '));
      }
      for (let i = 0; i < n; i = i + 1) {
        lines.push('body ' + ids[i] + ' ' + load.slice(i * STRIDE, (i + 1) * STRIDE).map(bits).join(' '));
      }
      for (const p of pins) {
        lines.push('pin ' + p.first + ' ' + p.last + ' ' + p.body + ' ' + p.actor);
      }
      for (const [q, i, s, v] of edits) {
        lines.push('edit ' + q + ' ' + i + ' ' + s + ' ' + bits(v));
      }
      const end = records();
      for (let i = 0; i < n; i = i + 1) {
        lines.push('final ' + i + ' ' + end.slice(i * STRIDE, (i + 1) * STRIDE).map(bits).join(' '));
      }
      lines.push('digest ' + hasher.digest());
      return lines.join('\n') + '\n';
    },
  };
}

/**
 * A fixture run's file name: its corpus name with spaces as dashes.
 * @param {string} name
 */
export function fileName(name) {
  return name.split(' ').join('-');
}

/**
 * Every behaviour fixture run on the product law, as harness/corpus.mjs
 * lists them, with the hashes each fixture recorded.
 */
export function productFixtureRuns() {
  return fixtureRuns().filter((run) => !('law' in run.spec && run.spec.law === 'reference') && run.hashes.length > 1);
}

/**
 * Every law run, recorded now from this build: the product scene, each
 * behaviour fixture run on the product law, then each fixture with a push.
 * @returns {Array<{ name: string, text: string }>}
 */
export function recordLawRuns() {
  /** @type {Array<{ name: string, text: string }>} */
  const out = [];
  const session = productSession();
  if (!session.loaded) {
    throw new Error('the product scene did not load');
  }
  const product = recordLaw('product-scene', session.world, 0);
  for (;;) {
    const step = session.advance();
    if (step === 'done') {
      break;
    }
    if (step === 'thrown') {
      throw new Error('the product scene threw at quantum ' + session.tick);
    }
  }
  out.push({ name: 'product-scene', text: product.text() });
  for (const fixture of productFixtureRuns()) {
    const name = fileName(fixture.name);
    const run = replayTo(fixture.spec, 0);
    const world = /** @type {World} */ (run.world);
    const shape = /** @type {{ shape?: string }} */ (fixture.spec.world).shape === 'capsule' ? 1 : 0;
    const law = recordLaw(name, world, shape);
    if (run.hash !== fixture.hashes[0]) {
      throw new Error(fixture.name + ': the frame at tick 0 is ' + run.hash + ', and the fixture recorded ' + fixture.hashes[0]);
    }
    while (run.advance()) {
      const want = fixture.hashes[run.tick];
      if (run.hash !== want) {
        throw new Error(fixture.name + ': the frame at tick ' + run.tick + ' is ' + run.hash + ', and the fixture recorded ' + want);
      }
    }
    if (run.tick !== fixture.hashes.length - 1) {
      throw new Error(fixture.name + ': the run ends at tick ' + run.tick + ', and the fixture recorded ' + (fixture.hashes.length - 1));
    }
    out.push({ name, text: law.text() });
  }
  for (const fixture of pushFixtures()) {
    const run = pushRun(fixture);
    const law = recordLaw(fixture.name, run.world, fixture.world.shape === 'capsule' ? 1 : 0);
    for (let q = 0; q < fixture.quanta; q = q + 1) {
      run.advance();
    }
    out.push({ name: fixture.name, text: law.text() });
  }
  return out;
}

/**
 * Each law run recorded now against its file: the names whose file differs
 * or is missing, and the files no run writes.
 */
export function staleLawRuns() {
  const runs = recordLawRuns();
  /** @type {string[]} */
  const stale = [];
  for (const run of runs) {
    const path = join(LAW_RUNS, run.name + '.txt');
    const kept = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null;
    if (kept !== run.text) {
      stale.push(run.name + (kept === null ? ' (no file)' : ''));
    }
  }
  const named = new Set(runs.map((run) => run.name + '.txt'));
  const extra = existsSync(LAW_RUNS) ? readdirSync(LAW_RUNS).filter((file) => !named.has(file)).sort() : [];
  return { runs, stale, extra };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const write = process.argv.includes('--write');
  const check = process.argv.includes('--check');
  if (write === check) {
    process.stdout.write('usage: node harness/law-runs.mjs --write | --check\n');
    process.exit(2);
  }
  process.chdir(root);
  if (write) {
    mkdirSync(LAW_RUNS, { recursive: true });
    for (const run of recordLawRuns()) {
      const path = join(LAW_RUNS, run.name + '.txt');
      writeFileSync(path, run.text);
      process.stdout.write('wrote ' + path + '\n');
    }
  } else {
    const { runs, stale, extra } = staleLawRuns();
    for (const run of runs) {
      process.stdout.write((stale.some((s) => s.startsWith(run.name)) ? 'stale ' : 'ok ') + run.name + '\n');
    }
    for (const file of extra) {
      process.stdout.write('no run writes fixtures/law-runs/' + file + '\n');
    }
    process.exit(stale.length > 0 || extra.length > 0 ? 1 : 0);
  }
}
