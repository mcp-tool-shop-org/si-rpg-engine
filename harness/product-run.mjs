// The product scene stepped and hashed exactly as harness/sim.mjs does, with a
// callback after the load and after each quantum. harness/sim.mjs keeps its
// own loop so the golden's source does not move; the trace test holds this
// loop to that golden. productSession is the same run one quantum at a time;
// harness/replay-to.mjs replays it to a tick.
//
// Runs under node and the three shells.

import { createHasher } from '../packages/frame/hash.js';
import { createMemory } from '../packages/tick/memory.js';
import { installMinds, mixMinds, observeMinds } from '../packages/tick/minds.js';
import { instantiate } from '../solver/dist/solver.mjs';
import { applyProductAct, createProductWorld } from './product-scene.mjs';

export const PRODUCT_STEPS = 10000;

/**
 * @typedef {ReturnType<typeof createProductWorld>} ProductWorld
 * @typedef {ReturnType<typeof createMemory>} ProductMemory
 * @typedef {(tick: number, hash: string | null, world: ProductWorld, memory: ProductMemory) => void} Visit
 */

/**
 * The product scene after its load. advance() runs one quantum and returns
 * 'frame' (hash is null when a float would not mix), 'thrown' when the step
 * threw, or 'done' when the run is over.
 */
export function productSession() {
  instantiate();
  const world = createProductWorld();
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
      if (!ok || tick >= PRODUCT_STEPS) {
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
  };
}

/**
 * The hash passed to visit is null when a float would not mix, and visit is
 * not called for a quantum whose step threw.
 * @param {Visit} visit
 * @param {(tick: number) => void} [thrown]
 * @returns {string} the final digest, or NAN
 */
export function runProduct(visit, thrown) {
  const session = productSession();
  if (!session.loaded) {
    if (thrown) {
      thrown(0);
    }
    return 'NAN';
  }
  visit(0, session.hash, session.world, session.memory);
  for (;;) {
    const step = session.advance();
    if (step === 'done') {
      break;
    }
    if (step === 'thrown') {
      if (thrown) {
        thrown(session.tick);
      }
      break;
    }
    visit(session.tick, session.hash, session.world, session.memory);
  }
  return session.final();
}
