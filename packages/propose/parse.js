// The seat's parser (T7a pins 7 and 9). It reads a role's output without
// trusting the decoder's constraint (finding 31): the whole output must be one
// JSON object with a proposal and, optionally, notes no longer than the role's
// freeSpanChars. Only the proposal is read for an action. The notes are kept
// in the record and never parsed, so a proposal written inside them is not
// acted on. The proposal must be a class the role may make, with exactly that
// class's fields: a trust label, or a frame hash, from the model is an unknown
// field. The seat stamps the frame the proposal was built from; the model does
// not name it. CI's record test parses every recorded output again with this
// same code and requires the proposal the log admitted.

/**
 * @typedef {import('../frame/types.js').RoleManifest} RoleManifest
 * @typedef {import('../frame/types.js').Intent} Intent
 * @typedef {import('../frame/types.js').BeliefWrite} BeliefWrite
 * @typedef {Omit<Intent, 'frameHash'> | BeliefWrite} RoleProposal
 * @typedef {{ verdict: 'ok', notes: string | null, proposal: RoleProposal }
 *   | { verdict: 'not-json' | 'wrong-shape' | 'notes-over-bound' | 'class-not-allowed', reason: string }} RoleRead
 */

const INTENT_FIELDS = ['kind', 'verb', 'actor', 'target'];
const BELIEF_FIELDS = ['kind', 'mind', 'subject', 'key', 'value', 'confidence', 'source', 'supersedes', 'withdrawnBy'];

/** @param {unknown} value */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string[]} allowed
 */
function unknownField(obj, allowed) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      return key;
    }
  }
  return null;
}

/**
 * @param {string} reason
 * @returns {RoleRead}
 */
function wrong(reason) {
  return { verdict: 'wrong-shape', reason };
}

/**
 * @param {unknown} value
 * @returns {{ x: number, z: number } | { body: string } | { zone: string } | null}
 */
function readTarget(value) {
  if (!isObject(value)) {
    return null;
  }
  const t = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(t).sort().join(',');
  if (keys === 'x,z' && typeof t.x === 'number' && typeof t.z === 'number') {
    return { x: t.x, z: t.z };
  }
  if (keys === 'body' && typeof t.body === 'string') {
    return { body: t.body };
  }
  if (keys === 'zone' && typeof t.zone === 'string') {
    return { zone: t.zone };
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {{ body: string } | { zone: string } | null}
 */
function readSubject(value) {
  if (!isObject(value)) {
    return null;
  }
  const s = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(s).join(',');
  if (keys === 'body' && typeof s.body === 'string') {
    return { body: s.body };
  }
  if (keys === 'zone' && typeof s.zone === 'string') {
    return { zone: s.zone };
  }
  return null;
}

/**
 * Reads one role output.
 * @param {string} text the model's raw output
 * @param {RoleManifest} manifest the role the call was made under
 * @returns {RoleRead}
 */
export function readRoleOutput(text, manifest) {
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { verdict: 'not-json', reason: 'the output is not one JSON object' };
  }
  if (!isObject(value)) {
    return { verdict: 'not-json', reason: 'the output is not one JSON object' };
  }
  const output = /** @type {Record<string, unknown>} */ (value);
  const extra = unknownField(output, ['notes', 'proposal']);
  if (extra) {
    return wrong('unknown field: ' + extra);
  }
  /** @type {string | null} */
  let notes = null;
  if (output.notes !== undefined) {
    if (typeof output.notes !== 'string') {
      return wrong('notes is a string');
    }
    if (output.notes.length > manifest.budget.freeSpanChars) {
      return { verdict: 'notes-over-bound', reason: 'the notes are ' + output.notes.length + ' characters, over role ' + manifest.role + '\'s freeSpanChars of ' + manifest.budget.freeSpanChars };
    }
    notes = output.notes;
  }
  if (!isObject(output.proposal)) {
    return wrong('the output has no proposal object');
  }
  const raw = /** @type {Record<string, unknown>} */ (output.proposal);
  if (typeof raw.kind !== 'string' || !manifest.outputs.classes.some((item) => item === raw.kind)) {
    return { verdict: 'class-not-allowed', reason: 'role ' + manifest.role + ' does not propose ' + String(raw.kind) };
  }
  if (raw.kind === 'intent') {
    const field = unknownField(raw, INTENT_FIELDS);
    if (field) {
      return wrong('unknown field: ' + field);
    }
    const target = readTarget(raw.target);
    if (typeof raw.verb !== 'string' || typeof raw.actor !== 'string' || target === null) {
      return wrong('an intent is a verb, an actor, and a target of { x, z }, { body }, or { zone }');
    }
    return { verdict: 'ok', notes, proposal: { kind: 'intent', verb: raw.verb, actor: raw.actor, target } };
  }
  const field = unknownField(raw, BELIEF_FIELDS);
  if (field) {
    return wrong('unknown field: ' + field);
  }
  const subject = readSubject(raw.subject);
  if (typeof raw.mind !== 'string' || subject === null || typeof raw.key !== 'string' || typeof raw.source !== 'string') {
    return wrong('a belief is a mind, a subject of { body } or { zone }, a key, a value, a confidence, and a source');
  }
  if (typeof raw.value !== 'string' && typeof raw.value !== 'number' && typeof raw.value !== 'boolean') {
    return wrong('a belief value is a string, a number, or a flag');
  }
  if (typeof raw.confidence !== 'number') {
    return wrong('a belief confidence is a number');
  }
  /** @type {BeliefWrite} */
  const belief = { kind: 'belief', mind: raw.mind, subject, key: raw.key, value: raw.value, confidence: raw.confidence, source: raw.source };
  for (const key of ['supersedes', 'withdrawnBy']) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== 'string') {
        return wrong(key + ' names an id');
      }
    }
  }
  if (typeof raw.supersedes === 'string') {
    belief.supersedes = raw.supersedes;
  }
  if (typeof raw.withdrawnBy === 'string') {
    belief.withdrawnBy = raw.withdrawnBy;
  }
  return { verdict: 'ok', notes, proposal: belief };
}

/**
 * The proposal the seat submits: an intent names the frame it was built
 * from, which the gate checks against its window.
 * @param {RoleProposal} proposal
 * @param {{ tick: number, hash: string }} builtAt
 * @returns {import('../frame/types.js').Proposal}
 */
export function stampProposal(proposal, builtAt) {
  if (proposal.kind === 'intent') {
    return { kind: 'intent', verb: proposal.verb, actor: proposal.actor, target: proposal.target, frameHash: builtAt.hash };
  }
  return proposal;
}
