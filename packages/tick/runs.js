// Restore by replay (T2), and the run a bundle names (T5). replayTo(spec, tick)
// builds a fresh world from the spec, replays the admitted inputs up to
// `tick`, and returns the run there, ready to continue one quantum at a time.
// It writes nothing into the solver but what the run itself writes, so it is
// sound by construction; the T1 trace of the continuation is the proof that it
// is the same run. harness/replay-to.mjs is this with the product scene's own
// records as the default; the replay command uses it for a bundle.
//
// A spec is one of:
//   { scene: 'product', world, quanta? }   the product scene's act over these
//     records, stepped and hashed as harness/sim.mjs does, for `quanta`
//     (10000 when omitted);
//   a fixture case with `steps` and `driven`, as harness/solver-scene.mjs plays it;
//   { seed, world, log, law?, retired?, quanta? }   a tick replaying an
//     admitted-input log, as packages/tick/replay.js does, with each
//     admission's hash checked. It ends when nothing is scheduled after the
//     last entry, or, with `quanta`, at that tick: the world keeps stepping
//     while nothing is scheduled, which is how a sweep's witness reaches the
//     settled state it names and a finding's bundle reaches the quantum a
//     body left the world (T6).
//
// Every run saves and restores its whole state without replay (T6 pin 1):
// save() takes it, and restore(saved) puts it back into the same run, or into
// another run of the same spec, wherever that run has got to.

import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { playSession, productSession } from './sessions.js';
import { createRestorableTick } from './tick.js';
import { traceLine } from './trace-line.js';
import { createWorld } from './world.js';

/**
 * @typedef {ReturnType<typeof createWorld>} World
 * @typedef {ReturnType<typeof createMemory>} Memory
 * @typedef {Parameters<typeof createWorld>[0]} WorldInit
 * @typedef {{ tick: number, hash: string, proposal: import('../frame/types.js').Proposal }} LogEntry
 * @typedef {{ scene: 'product', world: WorldInit, quanta?: number }} ProductSpec
 * @typedef {import('./sessions.js').PlaySpec} PlaySpec
 * @typedef {{ seed: number, world: WorldInit, log: ReadonlyArray<LogEntry>, law?: 'product' | 'reference', retired?: boolean, quanta?: number }} LogSpec
 * @typedef {ProductSpec | PlaySpec | LogSpec} RunSpec
 * @typedef {{ world: World, memory: Memory | null, readonly tick: number, readonly hash: string, advance: () => boolean, line: () => string, save: () => RunSave, restore: (saved: RunSave) => void }} Run
 * @typedef {import('./sessions.js').ProductSave | import('./sessions.js').PlaySave | { next: number, tick: import('./tick.js').TickSave }} RunSave
 */

/** @type {ReturnType<typeof loadIntentRules> | null} */
let catalog = null;

/**
 * @param {ProductSpec} spec
 * @returns {Run}
 */
function productRun(spec) {
  if (!spec.world) {
    throw new Error('a product run carries the records it runs');
  }
  const session = productSession({ init: spec.world, steps: spec.quanta });
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
    save() {
      return session.save();
    },
    restore(saved) {
      session.restore(/** @type {import('./sessions.js').ProductSave} */ (saved));
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
    save() {
      return session.save();
    },
    restore(saved) {
      session.restore(/** @type {import('./sessions.js').PlaySave} */ (saved));
    },
  };
}

/**
 * The tick advances to each entry's tick, submits it, and after the last one
 * runs until nothing is scheduled, as `replay` and settle do, or to the
 * spec's `quanta` when it names one.
 * @param {LogSpec} spec
 * @returns {Run}
 */
function logRun(spec) {
  if (!catalog) {
    catalog = loadIntentRules();
  }
  const world = createWorld(spec.world, spec.law || 'product');
  const memory = createMemory();
  const tick = createRestorableTick({ seed: spec.seed, world, rules: catalog.rules, retired: spec.retired ? catalog.retired : undefined, memory });
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
      if (next < spec.log.length || !tick.idle() || (typeof spec.quanta === 'number' && tick.frame().tick < spec.quanta)) {
        tick.advance();
        return true;
      }
      return false;
    },
    line() {
      return traceLine(tick.frame().tick, tick.frame().hash, world, memory);
    },
    /** The tick's save and how far into the log the run has submitted. */
    save() {
      return { next, tick: tick.save() };
    },
    restore(saved) {
      const kept = /** @type {{ next: number, tick: import('./tick.js').TickSave }} */ (saved);
      if (!kept || !Number.isInteger(kept.next) || kept.next < 0 || kept.next > spec.log.length || !kept.tick) {
        throw new Error('restore refused: a log run saves its place in the log beside the save of its tick');
      }
      tick.restore(kept.tick);
      next = kept.next;
    },
  };
}

/**
 * A fresh run of the spec, replayed to the frame at `tick`.
 * @param {RunSpec} spec
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
