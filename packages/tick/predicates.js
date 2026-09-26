// The intent predicate. Hand-authored. The rules are data the tick reads:
// predicates/intents/index.json names the rule files, and this code only
// knows the fields a rule may carry. Reachability is a query against the
// tick's own collider, not a judgment.

import { readFileSync } from 'node:fs';
import { DT } from './world.js';

/** The character controller's step height. A shorter rise is a move. */
const STEP_HEIGHT = 0.3;

/**
 * A body at rest sits a contact margin below the surface it rests on, deeper
 * the more it holds up: the product law leaves a 0.25 box on a static floor
 * 5.6e-5 low, and the product scene's lower box, with another stacked on it,
 * 1.1e-4 low (measured, T6). A path tested at the centre's own height then
 * starts inside the floor padded by the actor's half-extents, and every path
 * reads as crossing the floor. So every path that starts at the actor's centre
 * is tested this far above it: the character controller's skin, SKIN in
 * solver/src/rapier_law.rs, inside which the controller already treats a
 * surface as touching. Before T6 only pick-up allowed for this, by 1e-4, and a
 * move, a push, a climb, or a use from a settled state was refused with "path
 * crosses collider floor".
 */
export const REST_MARGIN = 0.01;

/**
 * Quanta a drop keeps scheduled after the actor has stopped, so the body set
 * down 0.05 above the support can land and sleep before the action ends.
 * Measured on the carry fixture's far floor: that crate sleeps in 39.
 */
const RELEASE_LAND = 48;

/**
 * Steps of the drive left outside the faces that would touch. One step is not
 * enough: a drop off the room's ledge overshoots the predicted step and the
 * boxes meet by about 0.005.
 */
export const RELEASE_MARGIN_STEPS = 4;

/**
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {import('../frame/types.js').Intent} Intent
 * @typedef {import('../frame/types.js').Proposal} Proposal
 */

/**
 * Reads the index at its literal path, relative to the repository root.
 * @returns {{ rules: Map<string, IntentRule>, retired: Set<string> }}
 */
export function loadIntentRules() {
  const index = JSON.parse(readFileSync('predicates/intents/index.json', 'utf8'));
  /** @type {Set<string>} */
  const retired = new Set(Array.isArray(index.retired) ? index.retired : []);
  /** @type {Map<string, IntentRule>} */
  const rules = new Map();
  for (const file of index.rules) {
    const rule = JSON.parse(readFileSync('predicates/intents/' + file, 'utf8'));
    if (!retired.has(rule.verb)) {
      if (!rule.effect) {
        rule.effect = 'drive';
      }
      rules.set(rule.verb, rule);
    }
  }
  return { rules, retired };
}

/**
 * @param {{ x: number, y: number, z: number, hx: number, hy: number, hz: number }} actor
 * @param {{ x: number, y: number, z: number, hx: number, hy: number, hz: number }} other
 */
function nearFace(actor, other) {
  const left = other.x - other.hx;
  const right = other.x + other.hx;
  const bottom = other.y - other.hy;
  const top = other.y + other.hy;
  const near = other.z - other.hz;
  const far = other.z + other.hz;
  let x = actor.x;
  if (actor.x < left) {
    x = left;
  } else if (actor.x > right) {
    x = right;
  }
  let y = actor.y;
  if (actor.y < bottom) {
    y = bottom;
  } else if (actor.y > top) {
    y = top;
  }
  let z = actor.z;
  if (actor.z < near) {
    z = near;
  } else if (actor.z > far) {
    z = far;
  }
  return { x, y, z };
}

/**
 * @param {number} distance
 * @param {import('../frame/types.js').IntentRule} rule
 */
function quantaFor(distance, rule) {
  let quanta = Math.ceil(distance / rule.speed / DT);
  if (quanta < 1) {
    quanta = 1;
  }
  if (quanta > rule.maxQuanta) {
    quanta = rule.maxQuanta;
  }
  return quanta;
}

/**
 * @param {import('../frame/types.js').Body} actor
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {ReturnType<import('./world.js').createWorld>} world
 */
function volumeClear(actor, x, y, z, world) {
  for (let i = 0; i < world.bodies.length; i = i + 1) {
    const other = world.bodies[i];
    if (other.id === actor.id) {
      continue;
    }
    if (world.carriedByOf && world.carriedByOf(other.id) === actor.id) {
      continue;
    }
    if (Math.abs(other.x - x) < actor.hx + other.hx && Math.abs(other.y - y) < actor.hy + other.hy && Math.abs(other.z - z) < actor.hz + other.hz) {
      return other.id;
    }
  }
  const hit = world.overlaps({ x, y, z, hx: actor.hx, hy: actor.hy, hz: actor.hz });
  if (hit !== null && hit !== actor.id) {
    return hit;
  }
  return null;
}

/**
 * @param {import('../frame/types.js').Intent} intent
 * @param {import('../frame/types.js').Body} actor
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {import('../frame/types.js').IntentRule} rule
 * @param {ReadonlySet<string>} busy
 * @returns {{ ok: true, rule: import('../frame/types.js').IntentRule, quanta: number, riseQuanta: number, aimX: number, aimZ: number } | { ok: false, reason: string }}
 */
function admitClimb(intent, actor, world, rule, busy) {
  const point = intent.target;
  if (!point || !('x' in point) || typeof point.x !== 'number' || typeof point.z !== 'number') {
    return { ok: false, reason: 'target must be a point' };
  }
  if (busy.has(actor.id)) {
    return { ok: false, reason: actor.id + ' is mid-action' };
  }
  const dx = point.x - actor.x;
  const dz = point.z - actor.z;
  const ground = Math.sqrt(dx * dx + dz * dz);
  if (ground > rule.maxDistance) {
    return { ok: false, reason: 'target is beyond ' + rule.verb + ' range ' + rule.maxDistance };
  }
  const feet = actor.y - actor.hy;
  const fromY = feet + (rule.maxRise || 0);
  const support = world.supportAt ? world.supportAt(point.x, point.z, fromY + actor.hy) : null;
  if (support === null) {
    return { ok: false, reason: 'nothing is under the point' };
  }
  const rise = support - feet;
  if (rise <= STEP_HEIGHT) {
    return { ok: false, reason: 'move steps it' };
  }
  if (rise > (rule.maxRise || 0)) {
    return { ok: false, reason: 'rise is past maxRise' };
  }
  // The support comes from a ray cast, fromY - t0, which can land one unit in
  // the last place below a collider's top (0.7999999999999999 for a top at
  // 0.8, measured, T6), and a volume resting exactly there overlaps it. The
  // volume is tested the rest margin above the support, where a body stands.
  const stand = volumeClear(actor, point.x, support + actor.hy + REST_MARGIN, point.z, world);
  if (stand !== null) {
    return { ok: false, reason: 'standing volume is blocked' };
  }
  const pad = { hx: actor.hx, hy: actor.hy, hz: actor.hz };
  const up = world.segmentHits(actor.x, actor.y + REST_MARGIN, actor.z, actor.x, actor.y + rise + REST_MARGIN, actor.z, pad);
  if (up !== null) {
    return { ok: false, reason: 'path crosses collider ' + up };
  }
  const across = world.segmentHits(actor.x, actor.y + rise + REST_MARGIN, actor.z, point.x, actor.y + rise + REST_MARGIN, point.z, pad);
  if (across !== null) {
    return { ok: false, reason: 'path crosses collider ' + across };
  }
  const riseQuanta = quantaFor(rise, rule);
  const crossQuanta = ground === 0 ? 0 : quantaFor(ground, rule);
  let quanta = riseQuanta + crossQuanta;
  if (quanta > rule.maxQuanta) {
    quanta = rule.maxQuanta;
  }
  return { ok: true, rule, quanta, riseQuanta: Math.min(riseQuanta, quanta), aimX: point.x, aimZ: point.z };
}

/**
 * @param {import('../frame/types.js').Intent} intent
 * @param {import('../frame/types.js').Body} actor
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {import('../frame/types.js').IntentRule} rule
 * @param {ReadonlySet<string>} busy
 * @returns {{ ok: true, rule: import('../frame/types.js').IntentRule, quanta: number, otherId: string, aimX: number, aimZ: number } | { ok: false, reason: string }}
 */
function admitCarry(intent, actor, world, rule, busy) {
  if (world.carryingOf && world.carryingOf(actor.id)) {
    return { ok: false, reason: 'actor is already carrying' };
  }
  const named = intent.target && /** @type {{ body?: unknown }} */ (intent.target).body;
  if (typeof named !== 'string') {
    return { ok: false, reason: 'target must name a body' };
  }
  const other = world.body(named);
  if (!other) {
    return { ok: false, reason: 'no body named ' + named };
  }
  if (other.id === actor.id) {
    return { ok: false, reason: 'target is the actor' };
  }
  if (busy.has(other.id)) {
    return { ok: false, reason: 'target is mid-action' };
  }
  if (world.carriedByOf && world.carriedByOf(other.id)) {
    return { ok: false, reason: 'target is already carried' };
  }
  const limit = rule.maxHalfExtent || 0;
  if (other.hx > limit || other.hy > limit || other.hz > limit) {
    return { ok: false, reason: 'body is past maxHalfExtent' };
  }
  // A product world the binary does not hold cannot say whether a body
  // sleeps (T5 pin 7); the checker refuses rather than read another world.
  if (world.law === 'product' && world.holds && !world.holds()) {
    return { ok: false, reason: 'the solver does not hold this world' };
  }
  if (!world.sleeping || !world.sleeping(other.id)) {
    return { ok: false, reason: 'body is awake' };
  }
  const face = nearFace(actor, other);
  const dx = face.x - actor.x;
  const dz = face.z - actor.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance > rule.maxDistance) {
    return { ok: false, reason: 'target is beyond ' + rule.verb + ' range ' + rule.maxDistance };
  }
  if (rule.requiresClearPath) {
    // A sleeping body rests a contact-margin below the surface. The walk is
    // tested just above that, or a floor the actor is standing on reads as a wall.
    const pathY = actor.y + REST_MARGIN;
    const hit = world.segmentHits(actor.x, pathY, actor.z, face.x, pathY, face.z, { hx: actor.hx, hy: actor.hy, hz: actor.hz });
    if (hit !== null) {
      return { ok: false, reason: 'path crosses collider ' + hit };
    }
  }
  return { ok: true, rule, quanta: quantaFor(distance, rule), otherId: other.id, aimX: other.x, aimZ: other.z };
}

/**
 * @param {import('../frame/types.js').Intent} intent
 * @param {import('../frame/types.js').Body} actor
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {import('../frame/types.js').IntentRule} rule
 * @returns {{ ok: true, rule: import('../frame/types.js').IntentRule, quanta: number, aimX: number, aimZ: number, standX: number, standZ: number } | { ok: false, reason: string }}
 */
function admitRelease(intent, actor, world, rule) {
  const carriedId = world.carryingOf ? world.carryingOf(actor.id) : null;
  if (!carriedId) {
    return { ok: false, reason: 'nothing is carried' };
  }
  const carried = world.body(carriedId);
  if (!carried) {
    return { ok: false, reason: 'nothing is carried' };
  }
  const point = intent.target;
  if (!point || !('x' in point) || typeof point.x !== 'number' || typeof point.z !== 'number') {
    return { ok: false, reason: 'target must be a point' };
  }
  const dx = point.x - actor.x;
  const dz = point.z - actor.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance > rule.maxDistance) {
    return { ok: false, reason: 'target is beyond ' + rule.verb + ' range ' + rule.maxDistance };
  }
  const support = world.supportAt ? world.supportAt(point.x, point.z, actor.y + 8) : null;
  if (support === null) {
    return { ok: false, reason: 'nothing is under the point' };
  }
  const blocked = volumeClear(carried, point.x, support + carried.hy + 0.05, point.z, world);
  if (blocked !== null) {
    return { ok: false, reason: 'standing volume is blocked' };
  }
  if (rule.requiresClearPath) {
    const pathY = actor.y + actor.hy + carried.hy;
    const hit = world.segmentHits(actor.x, pathY, actor.z, point.x, pathY, point.z, { hx: carried.hx, hy: carried.hy, hz: carried.hz });
    if (hit !== null) {
      return { ok: false, reason: 'path crosses collider ' + hit };
    }
  }
  // The drive stops short of the target by enough that the carried box, set
  // down on the surface under the point, does not overlap the actor. One step
  // of the drive is left outside the touching faces, which are not an overlap.
  const approach = releaseApproach(actor, carried, point.x, point.z, rule.speed);
  const walk = quantaFor(approach.travel, rule);
  const quanta = walk + RELEASE_LAND > rule.maxQuanta ? rule.maxQuanta : walk + RELEASE_LAND;
  return { ok: true, rule, quanta, aimX: point.x, aimZ: point.z, standX: approach.x, standZ: approach.z };
}

/**
 * The point a drop's drive walks to. The carried body is set down at the
 * target; the actor stops short of that target by enough that the two boxes
 * do not overlap, or backs out to that distance when already inside it.
 * @param {{ x: number, y: number, z: number, hx: number, hy: number, hz: number }} actor
 * @param {{ x: number, y: number, z: number, hx: number, hy: number, hz: number }} carried
 * @param {number} targetX
 * @param {number} targetZ
 * @param {number} speed
 * @returns {{ x: number, z: number, travel: number }}
 */
function releaseApproach(actor, carried, targetX, targetZ, speed) {
  // The actor is separated as though they will stand on the same support as
  // the placement. A drop admitted from a ledge is clear in y at that moment
  // and then the actor walks down into the box; the stand is short of the
  // target anyway.
  const dx = actor.x - targetX;
  const dz = actor.z - targetZ;
  const ground = Math.sqrt(dx * dx + dz * dz);
  const hx = actor.hx + carried.hx;
  const hz = actor.hz + carried.hz;
  let ux = 1;
  let uz = 0;
  if (ground > 0) {
    ux = dx / ground;
    uz = dz / ground;
  }
  const ax = Math.abs(ux);
  const az = Math.abs(uz);
  let boundary = hx;
  if (ax === 0) {
    boundary = hz / az;
  } else if (az === 0) {
    boundary = hx / ax;
  } else {
    boundary = Math.min(hx / ax, hz / az);
  }
  const stand = boundary + speed * DT * RELEASE_MARGIN_STEPS;
  const x = targetX + ux * stand;
  const z = targetZ + uz * stand;
  const sx = x - actor.x;
  const sz = z - actor.z;
  return { x, z, travel: Math.sqrt(sx * sx + sz * sz) };
}

/**
 * @param {import('../frame/types.js').Intent} intent
 * @param {import('../frame/types.js').Body} actor
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {import('../frame/types.js').IntentRule} rule
 * @param {ReadonlySet<string>} busy
 * @returns {{ ok: true, rule: import('../frame/types.js').IntentRule, quanta: number, zoneId?: string, otherId?: string } | { ok: false, reason: string }}
 */
function admitEpisode(intent, actor, world, rule, busy) {
  const target = /** @type {{ body?: unknown, zone?: unknown }} */ (intent.target || {});
  if (typeof target.zone === 'string') {
    const zone = world.zoneOf ? world.zoneOf(actor.id) : null;
    if (zone !== target.zone) {
      return { ok: false, reason: 'actor is not in zone ' + target.zone };
    }
    return { ok: true, rule, quanta: 1, zoneId: target.zone };
  }
  if (typeof target.body !== 'string') {
    return { ok: false, reason: 'target must name a body or a zone' };
  }
  const other = world.body(target.body);
  if (!other) {
    return { ok: false, reason: 'no body named ' + target.body };
  }
  if (other.id === actor.id) {
    return { ok: false, reason: 'target is the actor' };
  }
  if (busy.has(other.id)) {
    return { ok: false, reason: 'target is mid-action' };
  }
  const face = nearFace(actor, other);
  const dx = face.x - actor.x;
  const dz = face.z - actor.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance > rule.maxDistance) {
    return { ok: false, reason: 'target is beyond ' + rule.verb + ' range ' + rule.maxDistance };
  }
  if (rule.requiresClearPath) {
    const hit = world.segmentHits(actor.x, actor.y + REST_MARGIN, actor.z, face.x, face.y + REST_MARGIN, face.z, { hx: actor.hx, hy: actor.hy, hz: actor.hz });
    if (hit !== null) {
      return { ok: false, reason: 'path crosses collider ' + hit };
    }
  }
  return { ok: true, rule, quanta: 1, otherId: other.id };
}

/**
 * @param {import('../frame/types.js').Intent} intent
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {Map<string, import('../frame/types.js').IntentRule>} rules
 * @param {Set<string>} retired
 * @param {ReadonlySet<string>} [scheduled]
 * @returns {{ ok: true, rule: import('../frame/types.js').IntentRule, quanta: number, riseQuanta?: number, aimX?: number, aimZ?: number, standX?: number, standZ?: number, otherId?: string, zoneId?: string } | { ok: false, reason: string }}
 */
export function admitIntent(intent, world, rules, retired, scheduled) {
  if (retired.has(intent.verb)) {
    return { ok: false, reason: 'retired verb: ' + intent.verb };
  }
  const rule = rules.get(intent.verb);
  if (!rule) {
    return { ok: false, reason: 'unknown verb: ' + intent.verb };
  }
  const actor = world.body(intent.actor);
  if (!actor) {
    return { ok: false, reason: 'no body named ' + intent.actor };
  }
  const busy = scheduled || new Set();
  const effect = rule.effect || 'drive';
  if (effect === 'climb') {
    return admitClimb(intent, actor, world, rule, busy);
  }
  if (effect === 'carry') {
    return admitCarry(intent, actor, world, rule, busy);
  }
  if (effect === 'release') {
    return admitRelease(intent, actor, world, rule);
  }
  if (effect === 'episode') {
    return admitEpisode(intent, actor, world, rule, busy);
  }
  const kind = rule.targetKind ?? 'point';
  /** @type {number} */
  let distance = 0;
  if (kind === 'body') {
    const named = intent.target && /** @type {{ body?: unknown }} */ (intent.target).body;
    if (typeof named !== 'string') {
      return { ok: false, reason: 'target must name a body' };
    }
    const other = world.body(named);
    if (!other) {
      return { ok: false, reason: 'no body named ' + named };
    }
    if (other.id === actor.id) {
      return { ok: false, reason: 'target is the actor' };
    }
    if (busy.has(other.id)) {
      return { ok: false, reason: 'target is mid-action' };
    }
    const face = nearFace(actor, other);
    const dx = face.x - actor.x;
    const dz = face.z - actor.z;
    distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > rule.maxDistance) {
      return { ok: false, reason: 'target is beyond ' + rule.verb + ' range ' + rule.maxDistance };
    }
    if (rule.requiresClearPath) {
      const hit = world.segmentHits(actor.x, actor.y + REST_MARGIN, actor.z, face.x, face.y + REST_MARGIN, face.z, { hx: actor.hx, hy: actor.hy, hz: actor.hz });
      if (hit !== null) {
        return { ok: false, reason: 'path crosses collider ' + hit };
      }
    }
    // The near face only has to be in range. The scheduled distance is the
    // rule's own range, so the walker is still moving after contact.
    distance = rule.maxDistance;
  } else {
    const point = intent.target;
    if (!point || !('x' in point) || typeof point.x !== 'number' || typeof point.z !== 'number') {
      return { ok: false, reason: 'target must be a point' };
    }
    const dx = point.x - actor.x;
    const dz = point.z - actor.z;
    distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > rule.maxDistance) {
      return { ok: false, reason: 'target is beyond ' + rule.verb + ' range ' + rule.maxDistance };
    }
    if (rule.requiresClearPath) {
      const pathY = actor.y + REST_MARGIN;
      const hit = world.segmentHits(actor.x, pathY, actor.z, point.x, pathY, point.z, {
        hx: actor.hx,
        hy: actor.hy,
        hz: actor.hz,
      });
      if (hit !== null) {
        return { ok: false, reason: 'path crosses collider ' + hit };
      }
    }
  }
  return { ok: true, rule, quanta: quantaFor(distance, rule) };
}
