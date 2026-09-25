// Canonical JSON: the one text a value hashes as (T7a pins 1, 4, and 6). Keys
// are sorted by code unit at every depth, arrays keep their order, nothing is
// indented, and a key whose value is undefined is left out, as JSON.stringify
// leaves it out. A number that is not finite has no JSON form and is refused.
// A role manifest's hash, a record's key, and the hashes a provenance names
// are SHA-256 of this text, so a file's layout and line endings never move one.
// No imports: nothing here reads a file or a clock.

/**
 * @param {unknown} value
 * @returns {string}
 */
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonical JSON has no form for ' + String(value));
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonical(item === undefined ? null : item)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
  }
  throw new Error('canonical JSON has no form for a ' + typeof value);
}
