// The intent predicate. Hand-authored. The rules are data the tick reads:
// predicates/intents/index.json names the rule files, and this code only
// knows the fields a rule may carry. Reachability is a query against the
// tick's own collider, not a judgment.

import { readFileSync } from 'node:fs';
import { DT } from './world.js';

/** The character controller's step height. A shorter rise is a move. */
const STEP_HEIGHT = 0.3;

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
  const stand = volumeClear(actor, point.x, support + actor.hy, point.z, world);
  if (stand !== null) {
    return { ok: false, reason: 'standing volume is blocked' };
  }
  const pad = { hx: actor.hx, hy: actor.hy, hz: actor.hz };
  const up = world.segmentHits(actor.x, actor.y, actor.z, actor.x, actor.y + rise, actor.z, pad);
  if (up !== null) {
    return { ok: false, reason: 'path crosses collider ' + up };
  }
  const across = world.segmentHits(actor.x, actor.y + rise, actor.z, point.x, actor.y + rise, point.z, pad);
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
    const pathY = actor.y + 1e-4;
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
 * @returns {{ ok: true, rule: import('../frame/types.js').IntentRule, quanta: number, aimX: number, aimZ: number } | { ok: false, reason: string }}
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
  return { ok: true, rule, quanta: quantaFor(distance, rule), aimX: point.x, aimZ: point.z };
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
    const hit = world.segmentHits(actor.x, actor.y, actor.z, face.x, face.y, face.z, { hx: actor.hx, hy: actor.hy, hz: actor.hz });
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
 * @returns {{ ok: true, rule: import('../frame/types.js').IntentRule, quanta: number, riseQuanta?: number, aimX?: number, aimZ?: number, otherId?: string, zoneId?: string } | { ok: false, reason: string }}
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
      const hit = world.segmentHits(actor.x, actor.y, actor.z, face.x, face.y, face.z, { hx: actor.hx, hy: actor.hy, hz: actor.hz });
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
      const hit = world.segmentHits(actor.x, actor.y, actor.z, point.x, actor.y, point.z, {
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
