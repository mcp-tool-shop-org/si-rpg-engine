// The intent predicate. Hand-authored. The rules are data the tick reads:
// predicates/intents/index.json names the rule files, and this code only
// knows the fields a rule may carry. Reachability is a query against the
// tick's own collider, not a judgment.

import { readFileSync } from 'node:fs';
import { DT } from './world.js';

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
 * @param {import('../frame/types.js').Intent} intent
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {Map<string, import('../frame/types.js').IntentRule>} rules
 * @param {Set<string>} retired
 * @param {ReadonlySet<string>} [scheduled]
 * @returns {{ ok: true, rule: import('../frame/types.js').IntentRule, quanta: number } | { ok: false, reason: string }}
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
