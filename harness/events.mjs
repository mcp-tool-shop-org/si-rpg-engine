// What a run did at a quantum, read from the world: the contact pairs in the
// solver's snapshot and the bodies asleep. harness/restore.test.js and
// harness/corpus.mjs choose their restore points from these.

/**
 * @typedef {ReturnType<import('../packages/tick/world.js').createWorld>} World
 */

/**
 * Pairs with at least one contact point, read from the snapshot's layout:
 * 15 words per body in the solver, a pair count, then per pair 5 words and 7
 * per contact point.
 * @param {World} world
 */
export function contacts(world) {
  const snap = world.snapshot();
  if (!snap || snap.length === 0) {
    return 0;
  }
  const view = new DataView(snap.buffer, snap.byteOffset, snap.byteLength);
  const solverBodies = world.bodies.filter((body) => !world.carriedByOf(body.id)).length;
  let w = solverBodies * 15;
  const pairs = view.getFloat64(w * 8, true);
  w = w + 1;
  let touching = 0;
  for (let p = 0; p < pairs; p = p + 1) {
    const points = view.getFloat64((w + 4) * 8, true);
    touching = touching + (points > 0 ? 1 : 0);
    w = w + 5 + points * 7;
  }
  return touching;
}

/**
 * @param {World} world
 * @returns {string[]}
 */
export function asleep(world) {
  return world.bodies.filter((body) => world.sleeping(body.id)).map((body) => body.id);
}
