// Compile a verb draft against the fixed primitives. A draft is data.
// Unknown fields, wrong types, and code are refused here. Nothing is written.

const KEYS = ['verb', 'speed', 'maxDistance', 'requiresClearPath', 'maxQuanta'];
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
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (!KEYS.includes(key)) {
      return { ok: false, reason: 'unknown field: ' + key };
    }
  }
  for (const key of KEYS) {
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
  return {
    ok: true,
    rule: {
      verb: obj.verb,
      speed: obj.speed,
      maxDistance: obj.maxDistance,
      requiresClearPath: obj.requiresClearPath,
      maxQuanta: obj.maxQuanta,
    },
  };
}
