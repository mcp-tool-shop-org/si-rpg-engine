// Compile a verb draft against the fixed primitives. A draft is data.
// Unknown fields, wrong types, and code are refused here. Nothing is written.

const REQUIRED = ['verb', 'speed', 'maxDistance', 'requiresClearPath', 'maxQuanta'];
const EFFECTS = ['drive', 'climb', 'carry', 'release', 'episode'];
/** Fields beyond the five every rule carries. An effect refuses the rest. */
const EFFECT_FIELDS = {
  drive: ['targetKind'],
  climb: ['maxRise'],
  carry: ['targetKind', 'maxHalfExtent'],
  release: [],
  episode: ['targetKind'],
};
const VERB = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * @param {unknown} draft
 * @returns {{ ok: true, rule: import('../frame/types.js').IntentRule } | { ok: false, reason: string }}
 */
export function compileVerb(draft) {
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
    return { ok: false, reason: 'a verb draft is an object' };
  }
  const obj = /** @type {Record<string, unknown>} */ (draft);
  const effect = obj.effect === undefined ? 'drive' : obj.effect;
  if (typeof effect !== 'string' || !EFFECTS.some((name) => name === effect)) {
    return { ok: false, reason: 'unknown effect: ' + String(obj.effect) };
  }
  const allowed = EFFECT_FIELDS[/** @type {keyof typeof EFFECT_FIELDS} */ (effect)];
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (!REQUIRED.includes(key) && key !== 'effect' && !allowed.some((name) => name === key)) {
      return { ok: false, reason: 'unknown field: ' + key };
    }
  }
  for (const key of REQUIRED) {
    if (!Object.hasOwn(obj, key)) {
      return { ok: false, reason: 'missing field: ' + key };
    }
  }
  if (typeof obj.verb !== 'string' || !VERB.test(obj.verb)) {
    return { ok: false, reason: 'verb must be a short lowercase name' };
  }
  if (typeof obj.speed !== 'number' || !Number.isFinite(obj.speed) || obj.speed <= 0 || obj.speed > 2) {
    return { ok: false, reason: 'speed must be a finite number from above 0 through 2' };
  }
  if (typeof obj.maxDistance !== 'number' || !Number.isFinite(obj.maxDistance) || obj.maxDistance <= 0 || obj.maxDistance > 8) {
    return { ok: false, reason: 'maxDistance must be a finite number from above 0 through 8' };
  }
  if (typeof obj.requiresClearPath !== 'boolean') {
    return { ok: false, reason: 'requiresClearPath must be a boolean' };
  }
  if (typeof obj.maxQuanta !== 'number' || !Number.isInteger(obj.maxQuanta) || obj.maxQuanta < 1 || obj.maxQuanta > 256) {
    return { ok: false, reason: 'maxQuanta must be an integer from 1 through 256' };
  }
  if (obj.targetKind !== undefined && obj.targetKind !== 'point' && obj.targetKind !== 'body' && obj.targetKind !== 'zone') {
    return { ok: false, reason: 'targetKind must be point, body, or zone' };
  }
  if (effect === 'carry' && obj.targetKind !== 'body') {
    return { ok: false, reason: 'carry targets a body' };
  }
  if (effect === 'climb' && obj.targetKind !== undefined) {
    return { ok: false, reason: 'unknown field: targetKind' };
  }
  if ((effect === 'drive' || effect === 'release') && obj.targetKind === 'zone') {
    return { ok: false, reason: 'unknown field: targetKind' };
  }
  if (effect === 'climb') {
    if (typeof obj.maxRise !== 'number' || !Number.isFinite(obj.maxRise) || obj.maxRise <= 0 || obj.maxRise > 4) {
      return { ok: false, reason: 'maxRise must be a finite number from above 0 through 4' };
    }
  }
  if (effect === 'carry') {
    if (typeof obj.maxHalfExtent !== 'number' || !Number.isFinite(obj.maxHalfExtent) || obj.maxHalfExtent <= 0 || obj.maxHalfExtent > 2) {
      return { ok: false, reason: 'maxHalfExtent must be a finite number from above 0 through 2' };
    }
  }
  if (effect === 'episode' && obj.targetKind !== undefined && obj.targetKind !== 'body' && obj.targetKind !== 'zone') {
    return { ok: false, reason: 'targetKind must be point, body, or zone' };
  }
  return {
    ok: true,
    rule: {
      verb: obj.verb,
      speed: obj.speed,
      maxDistance: obj.maxDistance,
      requiresClearPath: obj.requiresClearPath,
      maxQuanta: obj.maxQuanta,
      effect: /** @type {'drive' | 'climb' | 'carry' | 'release' | 'episode'} */ (effect),
      ...(obj.targetKind === undefined ? {} : { targetKind: /** @type {'point' | 'body' | 'zone'} */ (obj.targetKind) }),
      ...(effect === 'climb' ? { maxRise: /** @type {number} */ (obj.maxRise) } : {}),
      ...(effect === 'carry' ? { maxHalfExtent: /** @type {number} */ (obj.maxHalfExtent) } : {}),
    },
  };
}
