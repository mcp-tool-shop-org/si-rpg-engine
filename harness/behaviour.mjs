// Behaviour numbers: what the hash cannot hide behind. The sleep quantum is
// the solver's own flag, read through world.sleeping; the reference law has
// no solver, so its bodies never sleep.

import { runProduct, PRODUCT_STEPS } from './product-run.mjs';
import { productDriven } from './product-scene.mjs';
import { snapshotDigest } from './trace-line.mjs';

/**
 * @typedef {{ x: number, y: number, z: number }} Position
 * @typedef {{ sleep: Record<string, number | null>, final: Record<string, Position> }} CaseBehaviour
 * @typedef {CaseBehaviour & { scene: string, quanta: number, walkerZone: string | null, snapshotBytes: { load: number | null, last: number | null }, snapshotDigest: { load: string | null, last: string | null } }} ProductBehaviour
 */

/** @param {number} v */
function plain(v) {
  return v === 0 ? 0 : v;
}

/**
 * Watches the first quantum each body is asleep.
 * @param {{ sleeping: (id: string) => boolean }} world
 * @param {string[]} ids the dynamic bodies, in record order
 */
export function sleepWatch(world, ids) {
  /** @type {Record<string, number | null>} */
  const first = {};
  for (const id of ids) {
    first[id] = null;
  }
  return {
    /** @param {number} tick */
    see(tick) {
      for (const id of ids) {
        if (first[id] === null && world.sleeping(id)) {
          first[id] = tick;
        }
      }
    },
    sleep() {
      return first;
    },
  };
}

/**
 * @param {ReadonlyArray<{ id: string, x: number, y: number, z: number }>} bodies
 * @returns {Record<string, Position>}
 */
export function finalPositions(bodies) {
  /** @type {Record<string, Position>} */
  const out = {};
  for (const body of bodies) {
    out[body.id] = { x: plain(body.x), y: plain(body.y), z: plain(body.z) };
  }
  return out;
}

/**
 * The product scene's numbers, from the same run the trace prints.
 * @returns {ProductBehaviour & { hash: string }}
 */
export function productBehaviour() {
  const driven = new Set(productDriven);
  /** @type {ReturnType<typeof sleepWatch> | null} */
  let watch = null;
  /** @type {number | null} */
  let load = null;
  /** @type {number | null} */
  let last = null;
  /** @type {string | null} */
  let loadDigest = null;
  /** @type {Uint8Array | null} */
  let lastSnap = null;
  /** @type {string | null} */
  let walkerZone = null;
  /** @type {Record<string, Position>} */
  let final = {};
  const hash = runProduct((tick, _hash, world) => {
    if (!watch) {
      watch = sleepWatch(world, world.bodies.filter((body) => !driven.has(body.id)).map((body) => body.id));
    }
    watch.see(tick);
    const snap = world.snapshot();
    if (tick === 0) {
      load = snap ? snap.length : null;
      loadDigest = snap ? snapshotDigest(snap) : null;
    }
    last = snap ? snap.length : null;
    lastSnap = snap;
    walkerZone = world.zoneOf('walker');
    final = finalPositions(world.bodies);
  });
  return {
    scene: 'product',
    quanta: PRODUCT_STEPS,
    sleep: watch ? /** @type {ReturnType<typeof sleepWatch>} */ (watch).sleep() : {},
    final,
    walkerZone,
    snapshotBytes: { load, last },
    snapshotDigest: { load: loadDigest, last: lastSnap ? snapshotDigest(lastSnap) : null },
    hash,
  };
}

/**
 * Every number that differs, each naming its body. Empty when they agree.
 * @param {Partial<ProductBehaviour>} expected
 * @param {Partial<ProductBehaviour>} actual
 */
export function behaviourDifferences(expected, actual) {
  /** @type {string[]} */
  const out = [];
  /**
   * @param {string} what
   * @param {unknown} want
   * @param {unknown} got
   */
  const note = (what, want, got) => {
    if (!Object.is(want, got)) {
      out.push(what + ': expected ' + String(want) + ', got ' + String(got));
    }
  };
  const sleepWant = expected.sleep || {};
  const sleepGot = actual.sleep || {};
  for (const id of union(sleepWant, sleepGot)) {
    note('body ' + id + ' sleep quantum', has(sleepWant, id) ? sleepWant[id] : 'absent', has(sleepGot, id) ? sleepGot[id] : 'absent');
  }
  const finalWant = expected.final || {};
  const finalGot = actual.final || {};
  for (const id of union(finalWant, finalGot)) {
    const want = has(finalWant, id) ? finalWant[id] : null;
    const got = has(finalGot, id) ? finalGot[id] : null;
    if (!want || !got) {
      note('body ' + id + ' final position', want ? 'present' : 'absent', got ? 'present' : 'absent');
      continue;
    }
    note('body ' + id + ' final x', want.x, got.x);
    note('body ' + id + ' final y', want.y, got.y);
    note('body ' + id + ' final z', want.z, got.z);
  }
  if ('walkerZone' in expected || 'walkerZone' in actual) {
    note('body walker final zone', expected.walkerZone, actual.walkerZone);
  }
  // A changed length is named as that, with the change in bytes and doubles:
  // it can be a contact pair more or fewer (five doubles, and seven per point),
  // not only a changed encoding, so the line does not guess which. A changed digest at
  // the same length means the values in it changed. The digest mixes the
  // length, so it is named only when the length held.
  if (expected.snapshotBytes || actual.snapshotBytes || expected.snapshotDigest || actual.snapshotDigest) {
    const wantBytes = expected.snapshotBytes || { load: null, last: null };
    const gotBytes = actual.snapshotBytes || { load: null, last: null };
    const wantDigest = expected.snapshotDigest || { load: null, last: null };
    const gotDigest = actual.snapshotDigest || { load: null, last: null };
    /** @type {Array<['load' | 'last', string]>} */
    const moments = [['load', 'at load'], ['last', 'at the last quantum']];
    for (const [key, where] of moments) {
      if (!Object.is(wantBytes[key], gotBytes[key])) {
        out.push('snapshot bytes ' + where + ': expected ' + String(wantBytes[key]) + ', got ' + String(gotBytes[key]) + ': ' + lengthChange(wantBytes[key], gotBytes[key]));
      } else if (!Object.is(wantDigest[key], gotDigest[key])) {
        const why = wantDigest[key] === null ? ': not recorded before' : ': same length, the values changed';
        out.push('snapshot digest ' + where + ': expected ' + String(wantDigest[key]) + ', got ' + String(gotDigest[key]) + why);
      }
    }
  }
  return out;
}

/**
 * The snapshot length changed, by how much. A snapshot is little-endian
 * doubles, so the change is also given in doubles when it is whole.
 * @param {number | null} want
 * @param {number | null} got
 */
function lengthChange(want, got) {
  if (typeof want !== 'number' || typeof got !== 'number') {
    return 'the snapshot length changed';
  }
  const delta = got - want;
  const sign = delta > 0 ? '+' : '';
  const doubles = delta % 8 === 0 ? ' (' + sign + delta / 8 + (Math.abs(delta) === 8 ? ' double)' : ' doubles)') : '';
  return 'the snapshot length changed by ' + sign + delta + ' bytes' + doubles;
}

/**
 * @param {object} record
 * @param {string} key
 */
function has(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * @param {object} a
 * @param {object} b
 */
function union(a, b) {
  const keys = Object.keys(a);
  for (const key of Object.keys(b)) {
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}
