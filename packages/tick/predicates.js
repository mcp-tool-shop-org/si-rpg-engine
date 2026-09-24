// The intent predicate. Hand-authored. The rules are data the tick reads:
// predicates/intents/index.json names the rule files, and this code only
// knows the fields a rule may carry. Reachability is a query against the
// tick's own collider, not a judgment.

import { readFileSync } from 'node:fs';

/**
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {import('../frame/types.js').Intent} Intent
 * @typedef {import('../frame/types.js').Proposal} Proposal
 */

/**
 * Reads the index at its literal path, relative to the repository root.
 * @returns {Map<string, IntentRule>}
 */
export function loadIntentRules() {
  const index = JSON.parse(readFileSync('predicates/intents/index.json', 'utf8'));
  /** @type {Map<string, IntentRule>} */
  const rules = new Map();
  for (const file of index.rules) {
    const rule = JSON.parse(readFileSync('predicates/intents/' + file, 'utf8'));
    rules.set(rule.verb, rule);
  }
  return rules;
}

/**
 * @param {Intent} intent
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {Map<string, IntentRule>} rules
 * @returns {{ ok: true; rule: IntentRule; quanta: number } | { ok: false; reason: string }}
 */
export function admitIntent(intent, world, rules) {
  const rule = rules.get(intent.verb);
  if (!rule) {
    return { ok: false, reason: 'unknown verb: ' + intent.verb };
  }
  const actor = world.body(intent.actor);
  if (!actor) {
    return { ok: false, reason: 'no body named ' + intent.actor };
  }
  if (!intent.target || typeof intent.target.x !== 'number' || typeof intent.target.y !== 'number') {
    return { ok: false, reason: 'target must be a point' };
  }
  const dx = intent.target.x - actor.x;
  const dy = intent.target.y - actor.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > rule.maxDistance) {
    return { ok: false, reason: 'target is beyond ' + rule.verb + ' range ' + rule.maxDistance };
  }
  if (rule.requiresClearPath) {
    const hit = world.segmentHits(actor.x, actor.y, intent.target.x, intent.target.y);
    if (hit !== null) {
      return { ok: false, reason: 'path crosses collider ' + hit };
    }
  }
  let quanta = Math.ceil(distance / rule.speed / (1 / 64));
  if (quanta < 1) {
    quanta = 1;
  }
  if (quanta > rule.maxQuanta) {
    quanta = rule.maxQuanta;
  }
  return { ok: true, rule, quanta };
}
