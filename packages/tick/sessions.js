// The runs a bundle can name, one quantum at a time (T5). A bundle's hashes
// are the T1 trace hashes of one of three runs: a log replayed by the tick
// (packages/tick/runs.js), a fixture case, or the product scene. The last two
// are stepped and hashed here, so the replay command can rerun a bundle
// without the harness, which measures the tick and is never imported by it.
//
//   playSession: a fixture case, as harness/solver-scene.mjs plays it: the
//     seed, the load, then each quantum's bodies and the solver snapshot.
//   productSession: the product scene's act over a world's records, hashed
//     exactly as harness/sim.mjs hashes it (sim.mjs keeps its own loop so the
//     golden's source does not move; the trace test holds this one to it).
//   applyProductAct: the act itself. The scene's records are
//     harness/product-scene.mjs, which re-exports the act beside them; a
//     bundle carries the records it ran.
//
// Each session also saves and restores its whole state without replay, as
// the tick does (T6 pin 1): the hasher's lanes, the quantum, the world's save,
// and for the product scene the minds and their memory. The act is a function
// of the quantum, so it needs no state of its own. harness/restore.test.js
// restores every fixture case and the product scene this way.
//
// Runs under node and the three shells: no console, process, or fs here.

import { createHasher } from '../frame/hash.js';
import { instantiate } from '../../solver/dist/solver.mjs';
import { createMemory, memorySaveProblem } from './memory.js';
import { installMinds, mindsSaveProblem, mixMinds, observeMinds, restoreMinds, saveMinds } from './minds.js';
import { createWorld } from './world.js';

/** The product scene's length: fixtures/golden.txt is its last hash. */
export const PRODUCT_STEPS = 10000;

/** The product scene's driven body. */
export const productDriven = ['walker'];

/**
 * @typedef {ReturnType<typeof createWorld>} World
 * @typedef {ReturnType<typeof createMemory>} Memory
 * @typedef {Parameters<typeof createWorld>[0]} WorldInit
 * @typedef {{ seed: number, steps: number, driven: string[], world: { bodies: unknown[], colliders: unknown[], heightfield?: unknown } }} PlaySpec
 * @typedef {ReturnType<World['save']>} WorldSave
 * @typedef {{ tick: number, hash: string, lanes: [number, number], world: WorldSave }} PlaySave
 * @typedef {{ tick: number, hash: string | null, ok: boolean, lanes: [number, number], world: WorldSave, minds: import('./minds.js').MindsSave, memory: import('./memory.js').MemorySave }} ProductSave
 */

/**
 * Why a value is not a session save, or null: the quantum, the hash, and the lanes.
 * @param {any} saved
 * @returns {string | null}
 */
function sessionSaveProblem(saved) {
  if (!saved || typeof saved !== 'object') {
    return 'a save is an object';
  }
  if (!Number.isInteger(saved.tick) || saved.tick < 0) {
    return 'the tick is a whole number';
  }
  if (!Array.isArray(saved.lanes) || saved.lanes.length !== 2 || !saved.lanes.every((/** @type {unknown} */ lane) => Number.isInteger(lane) && /** @type {number} */ (lane) >= 0 && /** @type {number} */ (lane) <= 0xffffffff)) {
    return 'the lanes are two whole numbers from 0 through 2^32 - 1';
  }
  if (!saved.world || typeof saved.world !== 'object') {
    return 'the save has no world';
  }
  return null;
}

/**
 * A short lift, then the walker carries the parcel. Both enter the product hash.
 * @param {World} world
 * @param {number} step
 */
export function applyProductAct(world, step) {
  world.lifted.delete('climber');
  const driven = new Set(productDriven);
  if (step >= 200 && step < 260) {
    const climber = world.body('climber');
    if (climber) {
      climber.vy = 0.8;
      world.lifted.add('climber');
      driven.add('climber');
    }
  }
  if (step === 400) {
    world.carry('walker', 'parcel');
  }
  return driven;
}

/**
 * A fixture case at quantum 0, stepped by advance(). The hash is the running
 * frame hash after the frame at `tick`: the seed, the heightfield once, then
 * each frame's bodies and the solver snapshot.
 * @param {PlaySpec} spec
 */
export function playSession(spec) {
  const world = createWorld(/** @type {WorldInit} */ (spec.world), 'product');
  const driven = new Set(spec.driven);
  const hasher = createHasher();
  hasher.u32(spec.seed);
  world.mixLoad(hasher, driven);
  /** @param {import('../frame/types.js').Hasher} target */
  function mixSnapshot(target) {
    const snap = world.snapshot();
    if (!snap) {
      return;
    }
    target.u32(snap.length);
    for (let i = 0; i < snap.length; i = i + 1) {
      target.u32(snap[i]);
    }
  }
  mixSnapshot(hasher);
  let tick = 0;
  let hash = hasher.digest();
  return {
    world,
    memory: null,
    driven,
    get tick() {
      return tick;
    },
    get hash() {
      return hash;
    },
    /** @returns {boolean} false when the run has no quantum left */
    advance() {
      if (tick >= spec.steps) {
        return false;
      }
      world.step(driven);
      hasher.u32(tick + 1);
      for (let b = 0; b < world.bodies.length; b = b + 1) {
        const body = world.bodies[b];
        hasher.text(body.id);
        if (!hasher.float(body.x) || !hasher.float(body.y) || !hasher.float(body.z) || !hasher.float(body.vx) || !hasher.float(body.vy) || !hasher.float(body.vz)) {
          throw new Error('NaN');
        }
        if (!hasher.float(body.qx) || !hasher.float(body.qy) || !hasher.float(body.qz) || !hasher.float(body.qw) || !hasher.float(body.wx) || !hasher.float(body.wy) || !hasher.float(body.wz)) {
          throw new Error('NaN');
        }
      }
      mixSnapshot(hasher);
      tick = tick + 1;
      hash = hasher.digest();
      return true;
    },
    /**
     * The quantum, its hash, the hasher's lanes, and the world's save.
     * @returns {PlaySave}
     */
    save() {
      return { tick, hash, lanes: hasher.lanes(), world: world.save() };
    },
    /**
     * Puts back a save; the world refuses first, and then nothing has changed.
     * @param {PlaySave} saved
     */
    restore(saved) {
      const why = sessionSaveProblem(saved);
      if (why !== null || typeof saved.hash !== 'string' || saved.tick > spec.steps) {
        throw new Error('restore refused: ' + (why || 'the save is not a quantum of this case'));
      }
      world.restore(saved.world);
      tick = saved.tick;
      hash = saved.hash;
      hasher.resume(saved.lanes);
    },
  };
}

/**
 * The product scene after its load, from `init`'s records, for `steps`
 * quanta. advance() runs one quantum and returns 'frame' (hash is null when a
 * float would not mix), 'thrown' when the step threw, or 'done' when the run
 * is over.
 * @param {{ init: WorldInit, steps?: number }} options
 */
export function productSession(options) {
  instantiate();
  const steps = typeof options.steps === 'number' ? options.steps : PRODUCT_STEPS;
  const world = createWorld(options.init, 'product');
  const memory = createMemory();
  installMinds(world, memory);
  const h = createHasher();
  let ok = true;
  let tick = 0;
  /** @type {string | null} */
  let hash = null;
  try {
    world.mixLoad(h, new Set(['walker']));
    mixMinds(h, world, memory);
    hash = h.digest();
  } catch {
    ok = false;
  }
  const loaded = ok;
  return {
    world,
    memory,
    /** False when the load threw. */
    loaded,
    get tick() {
      return tick;
    },
    get hash() {
      return hash;
    },
    get ok() {
      return ok;
    },
    /** @returns {'frame' | 'thrown' | 'done'} */
    advance() {
      if (!ok || tick >= steps) {
        return 'done';
      }
      const i = tick;
      try {
        world.step(applyProductAct(world, i));
        observeMinds(world, memory, i + 1);
      } catch {
        ok = false;
        tick = i + 1;
        hash = null;
        return 'thrown';
      }
      for (let b = 0; b < world.bodies.length; b = b + 1) {
        const body = world.bodies[b];
        if (!h.float(body.x) || !h.float(body.y) || !h.float(body.z) || !h.float(body.vx) || !h.float(body.vy) || !h.float(body.vz)) {
          ok = false;
          break;
        }
        if (!h.float(body.qx) || !h.float(body.qy) || !h.float(body.qz) || !h.float(body.qw) || !h.float(body.wx) || !h.float(body.wy) || !h.float(body.wz)) {
          ok = false;
          break;
        }
        if (world.zones && world.zones.length > 0) {
          const index = world.zoneIndex(body.id);
          h.u32(index === null ? 0xffffffff : index);
        }
        if (world.anyCarried()) {
          h.u32(world.linkIndex(world.carryingOf(body.id)));
          h.u32(world.linkIndex(world.carriedByOf(body.id)));
        }
      }
      if (ok) {
        mixMinds(h, world, memory);
        const snap = world.snapshot();
        if (snap) {
          h.u32(snap.length);
          for (let s = 0; s < snap.length; s = s + 1) {
            h.u32(snap[s]);
          }
        }
      }
      tick = i + 1;
      hash = ok ? h.digest() : null;
      return 'frame';
    },
    /** The final digest, or NAN. */
    final() {
      return ok ? h.digest() : 'NAN';
    },
    /**
     * The quantum, its hash, whether the run is still whole, the hasher's
     * lanes, the world's save, and the minds' state and memory.
     * @returns {ProductSave}
     */
    save() {
      return { tick, hash, ok, lanes: h.lanes(), world: world.save(), minds: saveMinds(world), memory: memory.save() };
    },
    /**
     * Puts back a save; the world refuses first, and then nothing has changed.
     * @param {ProductSave} saved
     */
    restore(saved) {
      const why = sessionSaveProblem(saved) || mindsSaveProblem(world, saved.minds) || memorySaveProblem(saved.memory);
      if (why !== null || typeof saved.ok !== 'boolean' || saved.tick > steps) {
        throw new Error('restore refused: ' + (why || 'the save is not a quantum of this run'));
      }
      world.restore(saved.world);
      tick = saved.tick;
      hash = saved.hash;
      ok = saved.ok;
      h.resume(saved.lanes);
      restoreMinds(world, saved.minds);
      memory.restore(saved.memory);
    },
  };
}
