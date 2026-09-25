// One trace line per quantum. The format is fixed; harness/first-difference.js
// parses it and docs/PHASE-2.md states it.
//
//   <tick> <hash> body <id> <13 fields> <zone> <links> ... snap <len> <digest> mind <body> <met> <belief> ...
//   end <lines>
//
// tick: the quantum, 0 for the load. hash: the running frame hash as sixteen
// hex digits, or NAN when a float would not mix. A line of just `<tick> NAN`
// means the step threw. Each body: `body`, its id, then x y z vx vy vz qx qy qz
// qw wx wy wz as sixteen-hex-digit IEEE bit patterns, high word first; the zone
// index or `-`; the carry links or `-` (`>id` carries id, `<id` is carried by
// id, both when both). Then `snap`, the snapshot's byte length and its FNV
// digest, or `snap - -` with no snapshot. Then per mind: `mind`, its body, one
// 0 or 1 per goal (met) or `-` with no goals, and the newest belief id or `-`.
// The last line is `end` and the count of quantum lines before it.
//
// Runs under node and the three shells: no console, process, or fs here.

import { createHasher, hex } from '../packages/frame/hash.js';

export const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'qx', 'qy', 'qz', 'qw', 'wx', 'wy', 'wz'];

const buf = new ArrayBuffer(8);
const f64 = new Float64Array(buf);
const view = new DataView(buf);

/**
 * The IEEE bit pattern of a double, high word first.
 * @param {number} x
 */
export function bits(x) {
  f64[0] = x;
  return hex(view.getUint32(4, true)) + hex(view.getUint32(0, true));
}

/**
 * @param {Uint8Array | null} snap
 */
export function snapshotField(snap) {
  if (!snap) {
    return 'snap - -';
  }
  const h = createHasher();
  h.u32(snap.length);
  for (let i = 0; i < snap.length; i = i + 1) {
    h.u32(snap[i]);
  }
  return 'snap ' + snap.length + ' ' + h.digest();
}

/**
 * @typedef {ReturnType<import('../packages/tick/world.js').createWorld>} World
 * @typedef {ReturnType<import('../packages/tick/memory.js').createMemory>} Memory
 */

/**
 * @param {number} tick
 * @param {string} hash sixteen hex digits or NAN
 * @param {World} world
 * @param {Memory | null} memory
 */
export function traceLine(tick, hash, world, memory) {
  const parts = [String(tick), hash];
  const zoned = world.zones && world.zones.length > 0;
  for (let b = 0; b < world.bodies.length; b = b + 1) {
    const body = /** @type {Record<string, number> & { id: string }} */ (/** @type {unknown} */ (world.bodies[b]));
    parts.push('body', body.id);
    for (let f = 0; f < FIELDS.length; f = f + 1) {
      parts.push(bits(body[FIELDS[f]]));
    }
    const index = zoned ? world.zoneIndex(body.id) : null;
    parts.push(index === null ? '-' : String(index));
    const carrying = world.carryingOf(body.id);
    const carriedBy = world.carriedByOf(body.id);
    const links = (carrying ? '>' + carrying : '') + (carriedBy ? '<' + carriedBy : '');
    parts.push(links === '' ? '-' : links);
  }
  parts.push(snapshotField(world.snapshot()));
  const minds = world.minds || [];
  for (let m = 0; m < minds.length; m = m + 1) {
    const mind = minds[m];
    let met = '';
    for (let g = 0; g < mind.goals.length; g = g + 1) {
      met = met + (mind.goals[g].metTick === undefined ? '0' : '1');
    }
    const list = memory ? memory.mindBeliefs(mind.body) : [];
    parts.push('mind', mind.body, met === '' ? '-' : met, list.length === 0 ? '-' : list[list.length - 1].id);
  }
  return parts.join(' ');
}

/**
 * @param {number} tick
 */
export function thrownLine(tick) {
  return tick + ' NAN';
}

/**
 * @param {number} lines the quantum lines before it
 */
export function endLine(lines) {
  return 'end ' + lines;
}
