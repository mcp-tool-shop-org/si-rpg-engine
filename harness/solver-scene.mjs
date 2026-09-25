// One product-law run, hashed the way the tick hashes a quantum: the seed,
// the heightfield once, then each frame's bodies and the solver snapshot.
// It returns the case's behaviour numbers, and with `trace` the lines
// harness/trace.mjs would print, so a fixture diffs with first-difference.
// playSession is the same run one quantum at a time; harness/replay-to.mjs
// replays it to a tick.

import { createHasher } from '../packages/frame/hash.js';
import { createWorld } from '../packages/tick/world.js';
import { finalPositions, sleepWatch } from './behaviour.mjs';
import { endLine, traceLine } from './trace-line.mjs';

/**
 * @typedef {{ seed: number, steps: number, driven: string[], world: { bodies: unknown[], colliders: unknown[], heightfield?: unknown } }} PlaySpec
 */

/**
 * The run at quantum 0, stepped by advance(). The hash is the running frame
 * hash after the frame at `tick`.
 * @param {PlaySpec} spec
 */
export function playSession(spec) {
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
  };
}

/**
 * @param {PlaySpec} spec
 * @param {{ trace?: boolean }} [options]
 */
export function play(spec, options) {
  const session = playSession(spec);
  const world = session.world;
  const tracing = Boolean(options && options.trace);
  /** @type {string[]} */
  const trace = [];
  /** @type {{ tick: number, hash: string }[]} */
  const frames = [{ tick: 0, hash: session.hash }];
  const watch = sleepWatch(world, world.bodies.filter((body) => !session.driven.has(body.id)).map((body) => body.id));
  watch.see(0);
  if (tracing) {
    trace.push(traceLine(0, frames[0].hash, world, null));
  }
  while (session.advance()) {
    frames.push({ tick: session.tick, hash: session.hash });
    watch.see(session.tick);
    if (tracing) {
      trace.push(traceLine(session.tick, session.hash, world, null));
    }
  }
  if (tracing) {
    trace.push(endLine(trace.length));
  }
  return { frames, bodies: world.bodies, behaviour: { sleep: watch.sleep(), final: finalPositions(world.bodies) }, trace };
}
