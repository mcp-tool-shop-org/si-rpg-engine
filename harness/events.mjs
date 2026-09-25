// What a run did at a quantum, read from the world: the contact pairs in the
// solver's snapshot, the bodies asleep, and the quanta that switch a body
// between dynamic, driven, and carried. harness/restore.test.js and
// harness/corpus.mjs choose their restore points from these.

import { productDriven } from './product-scene.mjs';
import { replayTo } from './replay-to.mjs';

/**
 * @typedef {ReturnType<import('../packages/tick/world.js').createWorld>} World
 * @typedef {import('./replay-to.mjs').ReplaySpec} ReplaySpec
 * @typedef {import('./replay-to.mjs').Run} Run
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

/**
 * @typedef {{ key: string, first: [number, number], second: [number, number], points: number, impulse: number, bytes: Uint8Array }} Pair
 */

/**
 * Every contact pair in the snapshot, in its order, from the layout contacts
 * reads: each pair's two collider handles as [index, generation], its point
 * count, the sum of its points' normal warm-start impulses, and its bytes
 * from the point count through its last point's seven warm-start words, so
 * two quanta's warm starts compare bit for bit. `key` is
 * `i1.g1-i2.g2`, the handles as the snapshot sorts them.
 * @param {World} world
 * @returns {Pair[]}
 */
export function pairs(world) {
  const snap = world.snapshot();
  if (!snap || snap.length === 0) {
    return [];
  }
  const view = new DataView(snap.buffer, snap.byteOffset, snap.byteLength);
  /** @param {number} word */
  const at = (word) => view.getFloat64(word * 8, true);
  const solverBodies = world.bodies.filter((body) => !world.carriedByOf(body.id)).length;
  let w = solverBodies * 15;
  const count = at(w);
  w = w + 1;
  /** @type {Pair[]} */
  const out = [];
  for (let p = 0; p < count; p = p + 1) {
    /** @type {[number, number]} */
    const first = [at(w), at(w + 1)];
    /** @type {[number, number]} */
    const second = [at(w + 2), at(w + 3)];
    const points = at(w + 4);
    let impulse = 0;
    for (let k = 0; k < points; k = k + 1) {
      impulse = impulse + at(w + 5 + k * 7);
    }
    out.push({
      key: first[0] + '.' + first[1] + '-' + second[0] + '.' + second[1],
      first,
      second,
      points,
      impulse,
      bytes: snap.slice((w + 4) * 8, (w + 5 + points * 7) * 8),
    });
    w = w + 5 + points * 7;
  }
  return out;
}

/**
 * What the solver does with each body, in record order: `d` dynamic, `D`
 * driven (modes 1 and 2, which are one mask), `C` carried. A body with no
 * mode yet was loaded with the run's driven set: the product walker, a
 * fixture case's `driven`, and nothing for a tick replaying a log.
 * @param {ReplaySpec} spec
 * @param {Run} run
 * @returns {string[]}
 */
export function solverClasses(spec, run) {
  const loaded = 'scene' in spec ? productDriven : 'driven' in spec ? spec.driven : [];
  return run.world.bodies.map((body) => {
    const mode = /** @type {{ solverMode?: number }} */ (body).solverMode;
    if (typeof mode !== 'number') {
      return loaded.includes(body.id) ? 'D' : 'd';
    }
    return mode === 3 ? 'C' : mode === 0 ? 'd' : 'D';
  });
}

/**
 * The bodies that change class between two quanta's solverClasses, as
 * `<id> <was>><is>` in record order.
 * @param {Run} run
 * @param {string[]} before
 * @param {string[]} now
 */
export function switched(run, before, now) {
  /** @type {string[]} */
  const bodies = [];
  for (let i = 0; i < now.length; i = i + 1) {
    if (now[i] !== before[i]) {
      bodies.push(run.world.bodies[i].id + ' ' + before[i] + '>' + now[i]);
    }
  }
  return bodies;
}

/**
 * Every quantum of a run in which a body switches, by the frame tick it
 * produces: an action starting or ending, a pick-up, or a drop (F1).
 * @param {ReplaySpec} spec
 * @returns {Array<{ tick: number, bodies: string[] }>}
 */
export function switchTicks(spec) {
  const run = replayTo(spec, 0);
  let before = solverClasses(spec, run);
  /** @type {Array<{ tick: number, bodies: string[] }>} */
  const found = [];
  while (run.advance()) {
    const now = solverClasses(spec, run);
    const bodies = switched(run, before, now);
    if (bodies.length > 0) {
      found.push({ tick: run.tick, bodies });
    }
    before = now;
  }
  return found;
}
