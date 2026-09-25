// One product-law run, hashed the way the tick hashes a quantum: the seed,
// the heightfield once, then each frame's bodies and the solver snapshot.
// It returns the case's behaviour numbers, and with `trace` the lines
// harness/trace.mjs would print, so a fixture diffs with first-difference.
// playSession is the same run one quantum at a time; harness/replay-to.mjs
// replays it to a tick. The session is packages/tick/sessions.js, which the
// replay command shares for a bundle of a fixture case.

import { playSession } from '../packages/tick/sessions.js';
import { finalPositions, sleepWatch } from './behaviour.mjs';
import { endLine, traceLine } from './trace-line.mjs';

export { playSession };

/**
 * @typedef {import('../packages/tick/sessions.js').PlaySpec} PlaySpec
 */

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
