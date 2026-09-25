// The product scene stepped and hashed exactly as harness/sim.mjs does, with a
// callback after the load and after each quantum. harness/sim.mjs keeps its
// own loop so the golden's source does not move; the trace test holds this
// loop to that golden. productSession is the same run one quantum at a time;
// harness/replay-to.mjs replays it to a tick. The session itself is
// packages/tick/sessions.js, which the replay command shares for a bundle;
// this file gives it the scene's own records by default.
//
// Runs under node and the three shells.

import { PRODUCT_STEPS, productSession as session } from '../packages/tick/sessions.js';
import { productInit } from './product-scene.mjs';

export { PRODUCT_STEPS };

/**
 * @typedef {ReturnType<typeof session>['world']} ProductWorld
 * @typedef {ReturnType<typeof session>['memory']} ProductMemory
 * @typedef {(tick: number, hash: string | null, world: ProductWorld, memory: ProductMemory) => void} Visit
 */

/**
 * The product scene after its load. advance() runs one quantum and returns
 * 'frame' (hash is null when a float would not mix), 'thrown' when the step
 * threw, or 'done' when the run is over. `init` replaces the scene's records
 * (a bundle carries its own world file) and `steps` its length (the corpus
 * runs it to 100,000); the scene's act is the same either way.
 * @param {{ init?: import('../packages/tick/sessions.js').WorldInit, steps?: number }} [options]
 */
export function productSession(options) {
  return session({
    init: options && options.init ? options.init : productInit(),
    steps: options && typeof options.steps === 'number' ? options.steps : PRODUCT_STEPS,
  });
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
