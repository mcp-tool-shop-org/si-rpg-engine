// Restore by replay. replayTo(spec, tick) builds a fresh world from the spec,
// replays the admitted inputs up to `tick`, and returns the run there, ready
// to continue one quantum at a time. It writes nothing into the solver but
// what the run itself writes, so it is sound by construction; the T1 trace of
// the continuation is the proof that it is the same run.
//
// A spec is one of:
//   { scene: 'product' }   the product scene, stepped as harness/sim.mjs does;
//   a fixture case with `steps` and `driven`, stepped as harness/solver-scene.mjs does;
//   { seed, world, log, law?, retired? }   a tick replaying an admitted-input log,
//     as packages/tick/replay.js does, with each admission's hash checked.

import { createMemory } from '../packages/tick/memory.js';
import { loadIntentRules } from '../packages/tick/predicates.js';
import { createTick } from '../packages/tick/tick.js';
import { createWorld } from '../packages/tick/world.js';
import { productSession } from './product-run.mjs';
import { playSession } from './solver-scene.mjs';
import { traceLine } from './trace-line.mjs';

/**
 * @typedef {ReturnType<typeof createWorld>} World
 * @typedef {ReturnType<typeof createMemory>} Memory
 * @typedef {{ tick: number, hash: string, proposal: import('../packages/frame/types.js').Proposal }} LogEntry
 * @typedef {{ scene: 'product' }} ProductSpec
 * @typedef {import('./solver-scene.mjs').PlaySpec} PlaySpec
 * @typedef {{ seed: number, world: Parameters<typeof createWorld>[0], log: ReadonlyArray<LogEntry>, law?: 'product' | 'reference', retired?: boolean }} LogSpec
 * @typedef {ProductSpec | PlaySpec | LogSpec} ReplaySpec
 * @typedef {{ world: World, memory: Memory | null, readonly tick: number, readonly hash: string, advance: () => boolean, line: () => string }} Run
 */

/** @type {ReturnType<typeof loadIntentRules> | null} */
let catalog = null;

/**
 * @param {ProductSpec} _spec
 * @returns {Run}
 */
function productRun(_spec) {
  const session = productSession();
  if (!session.loaded) {
    throw new Error('the product scene did not load');
  }
  return {
    world: session.world,
    memory: session.memory,
    get tick() {
      return session.tick;
    },
    get hash() {
      return session.hash === null ? 'NAN' : session.hash;
    },
    advance() {
      const step = session.advance();
      if (step === 'thrown') {
        throw new Error('the product scene threw at ' + session.tick);
      }
      return step === 'frame';
    },
    line() {
      return traceLine(session.tick, session.hash === null ? 'NAN' : session.hash, session.world, session.memory);
    },
  };
}

/**
 * @param {PlaySpec} spec
 * @returns {Run}
 */
function playRun(spec) {
  const session = playSession(spec);
  return {
    world: session.world,
    memory: null,
    get tick() {
      return session.tick;
    },
    get hash() {
      return session.hash;
    },
    advance() {
      return session.advance();
    },
    line() {
      return traceLine(session.tick, session.hash, session.world, null);
    },
  };
}

/**
 * The tick advances to each entry's tick, submits it, and after the last one
 * runs until nothing is scheduled, as `replay` and settle do.
 * @param {LogSpec} spec
 * @returns {Run}
 */
function logRun(spec) {
  if (!catalog) {
    catalog = loadIntentRules();
  }
  const world = createWorld(spec.world, spec.law || 'product');
  const memory = createMemory();
  const tick = createTick({ seed: spec.seed, world, rules: catalog.rules, retired: spec.retired ? catalog.retired : undefined, memory });
  let next = 0;
  function submitDue() {
    while (next < spec.log.length && spec.log[next].tick === tick.frame().tick) {
      const entry = spec.log[next];
      const result = tick.submit(entry.proposal);
      if (!result.admitted) {
        throw new Error('replay refused entry ' + next + ': ' + result.reason);
      }
      if (result.hash !== entry.hash) {
        throw new Error('entry ' + next + ' was admitted against ' + result.hash + ', not ' + entry.hash);
      }
      next = next + 1;
    }
    if (next < spec.log.length && spec.log[next].tick < tick.frame().tick) {
      throw new Error('entry ' + next + ' is at tick ' + spec.log[next].tick + ' and replay is at ' + tick.frame().tick);
    }
  }
  return {
    world,
    memory,
    get tick() {
      return tick.frame().tick;
    },
    get hash() {
      return tick.frame().hash;
    },
    advance() {
      submitDue();
      if (next < spec.log.length || !tick.idle()) {
        tick.advance();
        return true;
      }
      return false;
    },
    line() {
      return traceLine(tick.frame().tick, tick.frame().hash, world, memory);
    },
  };
}

/**
 * A fresh run of the spec, replayed to the frame at `tick`.
 * @param {ReplaySpec} spec
 * @param {number} tick
 * @returns {Run}
 */
export function replayTo(spec, tick) {
  /** @type {Run} */
  let run;
  if ('scene' in spec) {
    run = productRun(spec);
  } else if ('log' in spec) {
    run = logRun(spec);
  } else {
    run = playRun(spec);
  }
  while (run.tick < tick) {
    if (!run.advance()) {
      throw new Error('the run ends at ' + run.tick + ', before ' + tick);
    }
  }
  return run;
}
