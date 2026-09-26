// The role gate (T7a pins 3, 5, 8, and 10). A hand-written predicate beside
// the verb predicates, which the tick calls for a proposal that carries
// provenance. A proposal without provenance is the host's and never reaches
// it. No model drafts this file, and no prompt enforces a freeze (findings
// 18, 21, 22): the gate reads the role's manifest and the tick's own state,
// never the model's text.
//
// It refuses, each with a reason:
//   provenance that is not the pinned shape;
//   a role the catalog does not hold, a manifest hash that does not match the
//     catalog's, or a frozen role;
//   provenance whose model or inputs are not the manifest's;
//   a class, verb, or actor outside the role's outputs, a body that is not the
//     one the instance speaks for, or a field the class does not have, a trust
//     label among them;
//   a proposal outside its freshness window: built from a frame the tick did
//     not commit within the role's maxAgeQuanta;
//   an instance over its admission budget.
// A proposal that passes is still checked by every predicate on the current
// state, in the tick, as the host's is.

import { findRole } from './roles.js';
import { lowerLabel } from './trust.js';

/**
 * @typedef {import('../frame/types.js').Proposal} Proposal
 * @typedef {import('../frame/types.js').Provenance} Provenance
 * @typedef {import('./roles.js').Catalog} Catalog
 * @typedef {import('./roles.js').RoleEntry} RoleEntry
 * @typedef {import('./trust.js').Label} Label
 * @typedef {{ tick: number, hash: string, minds: ReadonlyArray<readonly [string, Label | null]> }} WindowFrame
 */

const PROVENANCE_FIELDS = ['role', 'instance', 'manifest', 'model', 'prompt', 'schema', 'record', 'output', 'builtAt', 'inputs'];
const HASH_FIELDS = ['manifest', 'model', 'prompt', 'schema', 'record', 'output'];
const INTENT_FIELDS = ['kind', 'verb', 'actor', 'target', 'frameHash'];
const BELIEF_FIELDS = ['kind', 'mind', 'subject', 'key', 'value', 'confidence', 'source', 'supersedes', 'withdrawnBy'];
const HEX64 = /^[0-9a-f]{64}$/;

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
 * Why a value is not a provenance, or null.
 * @param {unknown} value
 * @returns {string | null}
 */
export function provenanceProblem(value) {
  if (!isObject(value)) {
    return 'provenance is an object';
  }
  const p = /** @type {Record<string, unknown>} */ (value);
  const extra = unknownField(p, PROVENANCE_FIELDS);
  if (extra) {
    return 'unknown field in provenance: ' + extra;
  }
  for (const key of PROVENANCE_FIELDS) {
    if (!Object.hasOwn(p, key)) {
      return 'provenance names no ' + key;
    }
  }
  if (typeof p.role !== 'string' || p.role.length === 0) {
    return 'provenance names its role';
  }
  if (typeof p.instance !== 'string' || p.instance.length === 0 || p.instance.length > 120) {
    return 'provenance names its instance in 1 to 120 characters';
  }
  for (const key of HASH_FIELDS) {
    if (typeof p[key] !== 'string' || !HEX64.test(/** @type {string} */ (p[key]))) {
      return 'provenance ' + key + ' is a SHA-256, 64 lowercase hex digits';
    }
  }
  const built = /** @type {Record<string, unknown>} */ (p.builtAt);
  if (!isObject(built) || unknownField(built, ['tick', 'hash']) !== null || typeof built.tick !== 'number' || !Number.isInteger(built.tick) || built.tick < 0 || typeof built.hash !== 'string') {
    return 'provenance builtAt is the tick and hash of a committed frame';
  }
  if (!Array.isArray(p.inputs) || !p.inputs.every((item) => isObject(item) && unknownField(item, ['source', 'trust']) === null && typeof item.source === 'string' && typeof item.trust === 'string')) {
    return 'provenance inputs are each a source and its trust';
  }
  return null;
}

/**
 * @param {unknown} target
 */
function targetProblem(target) {
  if (!isObject(target)) {
    return 'an intent\'s target is a point, a body, or a zone';
  }
  const t = /** @type {Record<string, unknown>} */ (target);
  const keys = Object.keys(t).sort().join(',');
  if (keys === 'x,z' && typeof t.x === 'number' && Number.isFinite(t.x) && typeof t.z === 'number' && Number.isFinite(t.z)) {
    return null;
  }
  if (keys === 'body' && typeof t.body === 'string') {
    return null;
  }
  if (keys === 'zone' && typeof t.zone === 'string') {
    return null;
  }
  return 'an intent\'s target is exactly { x, z }, { body }, or { zone }';
}

/**
 * The proposal's own fields, checked against its class. A field the class
 * does not have is refused, a trust label or a frame hash the model made up
 * among them; a role's belief names the mind it writes, with a body or zone
 * subject, since the unscoped path takes free strings the key table does not govern.
 * @param {Proposal} proposal
 * @returns {string | null}
 */
function fieldProblem(proposal) {
  const raw = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (proposal));
  if (proposal.kind === 'intent') {
    const extra = unknownField(raw, INTENT_FIELDS);
    if (extra) {
      return 'unknown field: ' + extra;
    }
    if (typeof raw.verb !== 'string' || typeof raw.actor !== 'string' || typeof raw.frameHash !== 'string') {
      return 'an intent names its verb, its actor, and its frame';
    }
    return targetProblem(raw.target);
  }
  const extra = unknownField(raw, BELIEF_FIELDS);
  if (extra) {
    return 'unknown field: ' + extra;
  }
  if (typeof raw.mind !== 'string') {
    return 'a role\'s belief names the mind it writes';
  }
  const subject = /** @type {Record<string, unknown>} */ (raw.subject);
  if (!isObject(subject) || !((Object.keys(subject).join(',') === 'body' && typeof subject.body === 'string') || (Object.keys(subject).join(',') === 'zone' && typeof subject.zone === 'string'))) {
    return 'a role\'s belief subject is exactly { body } or { zone }';
  }
  for (const key of ['supersedes', 'withdrawnBy']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') {
      return key + ' names an id';
    }
  }
  return null;
}

/**
 * The checks that need only the manifest and the proposal: the catalog,
 * the freeze, the pins provenance must match, and the role's outputs.
 * @param {Catalog | null} catalog
 * @param {Proposal} proposal
 * @param {unknown} provenance
 * @returns {{ ok: true, entry: RoleEntry, provenance: Provenance } | { ok: false, reason: string }}
 */
export function roleRefusal(catalog, proposal, provenance) {
  if (catalog === null) {
    return { ok: false, reason: 'a proposal with provenance needs a role catalog, and this tick has none' };
  }
  const shape = provenanceProblem(provenance);
  if (shape) {
    return { ok: false, reason: shape };
  }
  const p = /** @type {Provenance} */ (provenance);
  const found = findRole(catalog, p.role, p.manifest);
  if (!found.ok) {
    return found;
  }
  const { manifest, derived } = found.entry;
  if (manifest.status !== 'thawed') {
    return { ok: false, reason: 'role ' + manifest.role + ' is frozen' };
  }
  if (manifest.model === null || p.model !== manifest.model.digest) {
    return { ok: false, reason: 'the model ' + p.model + ' is not role ' + manifest.role + '\'s pin' };
  }
  const inputs = derived.inputs;
  if (p.inputs.length !== inputs.length || !p.inputs.every((item, i) => item.source === inputs[i].source && item.trust === inputs[i].trust)) {
    return { ok: false, reason: 'provenance inputs are not the manifest\'s: each source with the trust the closed list gives it' };
  }
  if (!proposal || typeof proposal !== 'object') {
    return { ok: false, reason: 'a proposal is an object with a kind' };
  }
  const kind = /** @type {string} */ (proposal.kind);
  if (!manifest.outputs.classes.some((item) => item === kind)) {
    return { ok: false, reason: 'role ' + manifest.role + ' does not propose ' + String(kind) };
  }
  const fields = fieldProblem(proposal);
  if (fields) {
    return { ok: false, reason: fields };
  }
  if (proposal.kind === 'intent') {
    const verbs = manifest.outputs.verbs;
    if (verbs !== 'catalog' && !verbs.includes(proposal.verb)) {
      return { ok: false, reason: 'role ' + manifest.role + ' may not propose verb ' + proposal.verb };
    }
    if (manifest.outputs.actors === 'own-body' && proposal.actor !== p.instance) {
      return { ok: false, reason: 'role ' + manifest.role + ' speaks for ' + p.instance + ', not ' + proposal.actor };
    }
    if (proposal.frameHash !== p.builtAt.hash) {
      return { ok: false, reason: 'the intent names frame ' + proposal.frameHash + ', not the frame it was built from, ' + p.builtAt.hash };
    }
  }
  if (proposal.kind === 'belief' && manifest.outputs.actors === 'own-body' && proposal.mind !== p.instance) {
    return { ok: false, reason: 'role ' + manifest.role + ' writes the mind of ' + p.instance + ', not ' + String(proposal.mind) };
  }
  return { ok: true, entry: found.entry, provenance: p };
}

/**
 * The freshness window (pin 8): the proposal cites a frame the tick
 * committed no more than the role's maxAgeQuanta ago, with that hash.
 * @param {RoleEntry} entry
 * @param {Provenance} provenance
 * @param {number} now the current tick
 * @param {WindowFrame | undefined} built the tick's own record of that frame
 * @returns {string | null}
 */
export function freshnessRefusal(entry, provenance, now, built) {
  const at = provenance.builtAt.tick;
  if (at > now) {
    return 'stale: built at tick ' + at + ', which the tick has not committed; it is at ' + now;
  }
  const age = now - at;
  if (age > entry.manifest.budget.maxAgeQuanta) {
    return 'stale: built at tick ' + at + ', ' + age + ' quanta ago, past role ' + entry.manifest.role + '\'s maxAgeQuanta of ' + entry.manifest.budget.maxAgeQuanta;
  }
  if (!built || built.tick !== at) {
    return 'stale: the tick keeps no frame at tick ' + at;
  }
  if (built.hash !== provenance.builtAt.hash) {
    return 'stale: built at tick ' + at + ' from hash ' + provenance.builtAt.hash + ', but the tick committed ' + built.hash + ' there';
  }
  return null;
}

/**
 * The admission budget (pin 10): at most maxProposalsPerWindow admissions
 * per instance in the last windowQuanta quanta, this one included.
 * @param {RoleEntry} entry
 * @param {ReadonlyArray<number>} admitted the ticks of this instance's admissions
 * @param {number} now
 * @returns {string | null}
 */
export function budgetRefusal(entry, admitted, now) {
  const { maxProposalsPerWindow, windowQuanta } = entry.manifest.budget;
  let recent = 0;
  for (const tick of admitted) {
    if (tick > now - windowQuanta) {
      recent = recent + 1;
    }
  }
  if (recent >= maxProposalsPerWindow) {
    return 'over budget: ' + recent + ' admissions in the last ' + windowQuanta + ' quanta, and role ' + entry.manifest.role + ' allows ' + maxProposalsPerWindow;
  }
  return null;
}

/**
 * A model-produced belief's label (pin 5): the lower of the role's own
 * label, which the loader derived from its manifest, and, when the role reads
 * a mind or other minds, the least trusted belief in them at builtAt, from the
 * tick's own record of that frame. The role's own label is never authored or
 * observed, and a join only lowers it, so no role raises a label by passing
 * content through.
 * @param {RoleEntry} entry
 * @param {string} instance
 * @param {WindowFrame} built
 * @returns {Label}
 */
export function beliefLabel(entry, instance, built) {
  /** @type {Label | null} */
  let label = entry.derived.label;
  const sources = entry.manifest.inputs.map((input) => input.source);
  for (const [body, least] of built.minds) {
    const own = body === instance;
    if ((own && sources.includes('mind')) || (!own && sources.includes('other-minds'))) {
      label = lowerLabel(label, least);
    }
  }
  return /** @type {Label} */ (label);
}
