// The authored key table. A mind belief is refused when the key, the subject
// kind, or the value type is not what the table names, or when a string value
// is longer than the key's maxLength, or than 120 characters where the key
// declares none (T7a pin 5). A key's maxLength bounds its values only. A
// subject names a body or zone the world holds, and no loader bounds an id's
// length, so a subject keeps the 120-character default whatever its key
// declares.

import { readFileSync } from 'node:fs';
import { BELIEF_TEXT_LIMIT } from './memory.js';
import { subjectKind, subjectText } from './subject.js';

export { subjectKind, subjectText };

/**
 * @typedef {{ subject: 'body' | 'zone', value: 'zone' | 'body' | 'tick' | 'flag', maxLength?: number }} BeliefKey
 */

/** @type {Record<string, BeliefKey> | null} */
let table = null;

export function beliefKeys() {
  if (!table) {
    table = JSON.parse(readFileSync('predicates/beliefs/keys.json', 'utf8'));
  }
  return /** @type {Record<string, BeliefKey>} */ (table);
}

/**
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {{ subject: { body?: string, zone?: string } | string, key: string, value: unknown }} belief
 * @param {Record<string, BeliefKey>} [table] the key table; predicates/beliefs/keys.json when omitted
 * @returns {string | null}
 */
export function beliefRefusal(world, belief, table) {
  const keys = table || beliefKeys();
  const spec = Object.hasOwn(keys, belief.key) ? keys[belief.key] : undefined;
  if (!spec) {
    return 'unknown belief key: ' + belief.key;
  }
  const kind = subjectKind(belief.subject);
  if (kind !== spec.subject) {
    return 'belief ' + belief.key + ' applies to a ' + spec.subject;
  }
  const named = kind === 'body' ? /** @type {{ body: string }} */ (belief.subject).body : /** @type {{ zone: string }} */ (belief.subject).zone;
  if (named.length > BELIEF_TEXT_LIMIT) {
    return 'belief ' + belief.key + ' subject is ' + named.length + ' characters, over the bound of ' + BELIEF_TEXT_LIMIT;
  }
  const limit = typeof spec.maxLength === 'number' ? spec.maxLength : BELIEF_TEXT_LIMIT;
  if (typeof belief.value === 'string' && belief.value.length > limit) {
    return 'belief ' + belief.key + ' value is ' + belief.value.length + ' characters, over the bound of ' + limit;
  }
  if (kind === 'body' && !world.body(named)) {
    return 'belief subject names no body: ' + named;
  }
  if (kind === 'zone' && !(world.zones || []).some((zone) => zone.id === named)) {
    return 'belief subject names no zone: ' + named;
  }
  if (spec.value === 'tick') {
    if (typeof belief.value !== 'number' || !Number.isInteger(belief.value) || belief.value < 0) {
      return 'belief ' + belief.key + ' value must be a tick';
    }
    return null;
  }
  if (spec.value === 'flag') {
    if (typeof belief.value !== 'boolean') {
      return 'belief ' + belief.key + ' value must be a flag';
    }
    return null;
  }
  if (typeof belief.value !== 'string') {
    return 'belief ' + belief.key + ' value must be a ' + spec.value;
  }
  if (spec.value === 'zone') {
    if (belief.value === 'none') {
      return null;
    }
    if (!(world.zones || []).some((zone) => zone.id === belief.value)) {
      return 'belief ' + belief.key + ' value must be a zone';
    }
    return null;
  }
  if (!world.body(belief.value)) {
    return 'belief ' + belief.key + ' value must be a body';
  }
  return null;
}
