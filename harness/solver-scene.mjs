// One product-law run, hashed the way the tick hashes a quantum: the seed,
// the heightfield once, then each frame's bodies and the solver snapshot.
// It returns the case's behaviour numbers, and with `trace` the lines
// harness/trace.mjs would print, so a fixture diffs with first-difference.

import { createHasher } from '../packages/frame/hash.js';
import { createWorld } from '../packages/tick/world.js';
import { finalPositions, sleepWatch } from './behaviour.mjs';
import { endLine, traceLine } from './trace-line.mjs';

/**
 * @typedef {ReturnType<ReturnType<typeof createWorld>['save']>} WorldSave
 */

/**
 * With `restoreAt`, the run saves after that quantum, builds a fresh world of
 * the same file, restores the save into it, and plays the remainder there;
 * `change` may alter the save first. harness/restore.test.js diffs that
 * trace against the uninterrupted one.
 * @param {{ seed: number, steps: number, driven: string[], world: { bodies: unknown[], colliders: unknown[], heightfield?: unknown } }} spec
 * @param {{ trace?: boolean, restoreAt?: number, change?: (save: WorldSave) => void }} [options]
 */
export function play(spec, options) {
  const file = /** @type {Parameters<typeof createWorld>[0]} */ (spec.world);
  let world = createWorld(file, 'product');
  const restoreAt = options && typeof options.restoreAt === 'number' ? options.restoreAt : -1;
  const driven = new Set(spec.driven);
  const tracing = Boolean(options && options.trace);
  /** @type {string[]} */
  const trace = [];
  const hasher = createHasher();
  hasher.u32(spec.seed);
  world.mixLoad(hasher, driven);
  /** @param {import('../packages/frame/types.js').Hasher} target */
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
  /** @type {{ tick: number, hash: string }[]} */
  const frames = [{ tick: 0, hash: hasher.digest() }];
  const ids = world.bodies.filter((body) => !driven.has(body.id)).map((body) => body.id);
  // The watch reads the world through this indirection, so a restore swaps it.
  const watch = sleepWatch({ sleeping: (id) => world.sleeping(id) }, ids);
  /** @param {number} tick */
  function swap(tick) {
    if (tick !== restoreAt) {
      return;
    }
    const saved = world.save();
    if (options && options.change) {
      options.change(saved);
    }
    const fresh = createWorld(file, 'product');
    fresh.restore(saved);
    world = fresh;
  }
  swap(0);
  watch.see(0);
  if (tracing) {
    trace.push(traceLine(0, frames[0].hash, world, null));
  }
  for (let i = 0; i < spec.steps; i = i + 1) {
    world.step(driven);
    hasher.u32(i + 1);
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
    frames.push({ tick: i + 1, hash: hasher.digest() });
    swap(i + 1);
    watch.see(i + 1);
    if (tracing) {
      trace.push(traceLine(i + 1, frames[i + 1].hash, world, null));
    }
  }
  if (tracing) {
    trace.push(endLine(trace.length));
  }
  return { frames, bodies: world.bodies, behaviour: { sleep: watch.sleep(), final: finalPositions(world.bodies) }, trace };
}
