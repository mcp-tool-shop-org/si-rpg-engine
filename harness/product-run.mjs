// The product scene stepped and hashed exactly as harness/sim.mjs does, with a
// callback after the load and after each quantum. harness/sim.mjs keeps its
// own loop so the golden's source does not move; the trace test holds this
// loop to that golden.
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
 * The hash passed to visit is null when a float would not mix, and visit is
 * not called for a quantum whose step threw.
 * @param {Visit} visit
 * @param {(tick: number) => void} [thrown]
 * @returns {string} the final digest, or NAN
 */
export function runProduct(visit, thrown) {
  instantiate();
  const world = createProductWorld();
  const memory = createMemory();
  installMinds(world, memory);
  const h = createHasher();
  let ok = true;

  try {
    world.mixLoad(h, new Set(['walker']));
    mixMinds(h, world, memory);
  } catch {
    ok = false;
  }
  if (!ok) {
    if (thrown) {
      thrown(0);
    }
    return 'NAN';
  }
  visit(0, h.digest(), world, memory);

  for (let i = 0; ok && i < PRODUCT_STEPS; i = i + 1) {
    try {
      world.step(applyProductAct(world, i));
      observeMinds(world, memory, i + 1);
    } catch {
      ok = false;
      if (thrown) {
        thrown(i + 1);
      }
      break;
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
    visit(i + 1, ok ? h.digest() : null, world, memory);
  }
  return ok ? h.digest() : 'NAN';
}
