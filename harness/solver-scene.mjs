// One product-law run, hashed the way the tick hashes a quantum: the seed,
// the heightfield once, then each frame's bodies and the solver snapshot.

import { createHasher } from '../packages/frame/hash.js';
import { createWorld } from '../packages/tick/world.js';

/**
 * @param {{ seed: number, steps: number, driven: string[], world: { bodies: unknown[], colliders: unknown[], heightfield?: unknown } }} spec
 */
export function play(spec) {
  const world = createWorld(/** @type {Parameters<typeof createWorld>[0]} */ (spec.world), 'product');
  const driven = new Set(spec.driven);
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
  for (let i = 0; i < spec.steps; i = i + 1) {
    world.step(driven);
    hasher.u32(i + 1);
    for (let b = 0; b < world.bodies.length; b = b + 1) {
      const body = world.bodies[b];
      hasher.text(body.id);
      if (!hasher.float(body.x) || !hasher.float(body.y) || !hasher.float(body.z) || !hasher.float(body.vx) || !hasher.float(body.vy) || !hasher.float(body.vz)) {
        throw new Error('NaN');
      }
    }
    mixSnapshot(hasher);
    frames.push({ tick: i + 1, hash: hasher.digest() });
  }
  return { frames, bodies: world.bodies };
}
