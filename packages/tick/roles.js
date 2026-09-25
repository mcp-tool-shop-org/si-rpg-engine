// Roles (T7a pin 1). A role is a manifest, admitted like a verb: a file under
// predicates/roles, named by predicates/roles/index.json. It says what the
// role may read, what it may propose, where its proposals act, and which
// model, prompt, and schema it uses. The loader refuses a manifest that breaks
// any rule below, each with its reason, and derives the Rule of Two's three
// properties from the manifest, which does not declare them (finding 23):
//   A, untrusted input: an untrusted source, or a source whose content carries
//      its own labels (mind, other-minds);
//   B, private data: a private source in a live world; in a scratch world
//      nothing is sensitive;
//   C, changing state: true for every role, since every role proposes.
// A role that holds all three is refused. The tick's gate (gate.js) enforces a
// loaded manifest; no model drafts this file, and no prompt enforces a freeze.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical } from './canonical.js';

/**
 * @typedef {import('../frame/types.js').RoleManifest} RoleManifest
 * @typedef {import('../frame/types.js').RoleSource} RoleSource
 * @typedef {import('../frame/types.js').SourceTrust} SourceTrust
 * @typedef {import('./trust.js').Label} Label
 * @typedef {{ A: boolean, B: boolean, C: boolean, label: Label, inputs: Array<{ source: RoleSource, trust: SourceTrust }> }} Derived
 * @typedef {{ manifest: RoleManifest, hash: string, derived: Derived, template: string | null }} RoleEntry
 * @typedef {{ source: 'files' | 'log', byName: Map<string, RoleEntry>, byHash: Map<string, RoleEntry>, maxAge: number, maxWindow: number }} Catalog
 */

/**
 * The sources a role may read, closed in code. Each carries a trust and a
 * privacy class that no manifest can set. A mind's beliefs, and other minds',
 * carry their own labels (trust.js), so their trust is `labelled`: they count
 * as untrusted input for the Rule of Two, and a belief formed from them is no
 * more trusted than the least trusted belief they held (gate.js).
 * @type {Readonly<Record<RoleSource, { trust: SourceTrust, privacy: 'public' | 'private' }>>}
 */
export const SOURCES = Object.freeze({
  dispatch: { trust: 'trusted', privacy: 'public' },
  access: { trust: 'trusted', privacy: 'public' },
  catalog: { trust: 'trusted', privacy: 'public' },
  feedback: { trust: 'trusted', privacy: 'public' },
  'frame-in-sight': { trust: 'trusted', privacy: 'public' },
  diff: { trust: 'untrusted', privacy: 'public' },
  'player-text': { trust: 'untrusted', privacy: 'public' },
  mind: { trust: 'labelled', privacy: 'public' },
  world: { trust: 'trusted', privacy: 'private' },
  'other-minds': { trust: 'labelled', privacy: 'private' },
});

/** The two classes these rails check. A body or verb draft keeps its own reviewed path, `load admit`. */
export const CLASSES = ['intent', 'belief'];

/** The schema builders the seat has (packages/propose/schema.js builds each by this name). */
export const SCHEMA_BUILDERS = ['role-proposal'];

const FIELDS = ['role', 'purpose', 'status', 'decision', 'adversarialRun', 'world', 'inputs', 'outputs', 'model', 'prompt', 'schema', 'budget'];
const OUTPUT_FIELDS = ['classes', 'verbs', 'actors'];
const MODEL_FIELDS = ['name', 'digest', 'quantization', 'options'];
const OPTION_FIELDS = ['seed', 'temperature', 'top_k', 'top_p', 'num_ctx', 'stop'];

/**
 * Each budget and its bounds, inclusive. Pin 10 names each one's enforcer:
 * the seat enforces the first three per call and CI checks them from the
 * records; the seat's parser enforces freeSpanChars; the gate enforces the
 * admission budgets and maxAgeQuanta.
 * @type {Record<string, [number, number]>}
 */
const BUDGET = {
  callsPerSession: [1, 1000],
  outputTokens: [1, 8192],
  secondsPerCall: [1, 600],
  freeSpanChars: [0, 4000],
  maxProposalsPerWindow: [1, 64],
  windowQuanta: [1, 38400],
  maxAgeQuanta: [0, 38400],
};

const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TEMPLATE = /^[a-z0-9][a-z0-9.-]{0,63}\.txt$/;
const REPORT = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

/** @param {string} text */
export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Text as every platform hashes it: CRLF becomes LF, so a Windows checkout
 * and a Linux checkout agree.
 * @param {string} text
 */
export function lf(text) {
  return text.replace(/\r\n/g, '\n');
}

/**
 * The manifest's hash: SHA-256 of its canonical JSON.
 * @param {unknown} manifest
 */
export function manifestHash(manifest) {
  return sha256(canonical(manifest));
}

/**
 * A template's hash: SHA-256 of its text with LF line endings.
 * @param {string} text
 */
export function templateHash(text) {
  return sha256(lf(text));
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
 * @param {Record<string, unknown>} obj
 * @param {string[]} required
 */
function missingField(obj, required) {
  for (const key of required) {
    if (!Object.hasOwn(obj, key)) {
      return key;
    }
  }
  return null;
}

/** @param {unknown} value */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const inner of Object.values(value)) {
      deepFreeze(inner);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * The Rule of Two's properties, the role's own trust label, and each input's
 * source with the trust the closed list gives it. Derived, never declared.
 * @param {RoleManifest} manifest
 * @returns {Derived}
 */
export function derive(manifest) {
  const sources = manifest.inputs.map((input) => input.source);
  const A = sources.some((source) => SOURCES[source].trust !== 'trusted');
  const B = manifest.world === 'live' && sources.some((source) => SOURCES[source].privacy === 'private');
  const C = manifest.outputs.classes.length > 0;
  /** @type {Label} */
  let label = { label: 'role' };
  if (sources.includes('player-text')) {
    label = { label: 'hearsay', heard: 'player-text' };
  } else if (sources.some((source) => SOURCES[source].trust === 'untrusted')) {
    label = { label: 'untrusted' };
  }
  return {
    A,
    B,
    C,
    label,
    inputs: manifest.inputs.map((input) => ({ source: input.source, trust: SOURCES[input.source].trust })),
  };
}

/**
 * The derived properties as the list command prints them: `A C`, `A B C`, or `C`.
 * @param {Derived} derived
 */
export function propertiesText(derived) {
  return [derived.A ? 'A' : '', derived.B ? 'B' : '', derived.C ? 'C' : ''].filter((item) => item !== '').join(' ');
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function budgetProblem(value) {
  if (!isObject(value)) {
    return 'budget is an object';
  }
  const budget = /** @type {Record<string, unknown>} */ (value);
  const names = Object.keys(BUDGET);
  const extra = unknownField(budget, names);
  if (extra) {
    return 'unknown field: budget.' + extra;
  }
  const missing = missingField(budget, names);
  if (missing) {
    return 'missing field: budget.' + missing;
  }
  for (const name of names) {
    const [low, high] = BUDGET[name];
    const n = budget[name];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < low || n > high) {
      return 'budget.' + name + ' must be a whole number from ' + low + ' through ' + high;
    }
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function modelProblem(value) {
  if (value === null) {
    return null;
  }
  if (!isObject(value)) {
    return 'model is null or an object';
  }
  const model = /** @type {Record<string, unknown>} */ (value);
  const extra = unknownField(model, MODEL_FIELDS);
  if (extra) {
    return 'unknown field: model.' + extra;
  }
  const missing = missingField(model, MODEL_FIELDS);
  if (missing) {
    return 'missing field: model.' + missing;
  }
  if (typeof model.name !== 'string' || model.name.length === 0 || model.name.length > 64) {
    return 'model.name is a name of 1 to 64 characters';
  }
  if (typeof model.digest !== 'string' || !HEX64.test(model.digest)) {
    return 'model.digest is a SHA-256 digest, 64 lowercase hex digits';
  }
  if (typeof model.quantization !== 'string' || model.quantization.length === 0 || model.quantization.length > 16) {
    return 'model.quantization is a name of 1 to 16 characters';
  }
  if (!isObject(model.options)) {
    return 'model.options is an object';
  }
  const options = /** @type {Record<string, unknown>} */ (model.options);
  const extraOption = unknownField(options, OPTION_FIELDS);
  if (extraOption) {
    return 'unknown field: model.options.' + extraOption;
  }
  const missingOption = missingField(options, OPTION_FIELDS);
  if (missingOption) {
    return 'missing field: model.options.' + missingOption;
  }
  if (typeof options.seed !== 'number' || !Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0x7fffffff) {
    return 'model.options.seed is a whole number from 0 through 2^31 - 1';
  }
  if (typeof options.temperature !== 'number' || !(options.temperature >= 0 && options.temperature <= 2)) {
    return 'model.options.temperature is a number from 0 through 2';
  }
  if (typeof options.top_k !== 'number' || !Number.isInteger(options.top_k) || options.top_k < 1 || options.top_k > 1000) {
    return 'model.options.top_k is a whole number from 1 through 1000';
  }
  if (typeof options.top_p !== 'number' || !(options.top_p > 0 && options.top_p <= 1)) {
    return 'model.options.top_p is a number above 0 through 1';
  }
  if (typeof options.num_ctx !== 'number' || !Number.isInteger(options.num_ctx) || options.num_ctx < 256 || options.num_ctx > 131072) {
    return 'model.options.num_ctx is a whole number from 256 through 131072';
  }
  if (!Array.isArray(options.stop) || options.stop.length > 8 || !options.stop.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 32)) {
    return 'model.options.stop is a list of at most 8 strings of 1 to 32 characters';
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function outputsProblem(value) {
  if (!isObject(value)) {
    return 'outputs is an object';
  }
  const outputs = /** @type {Record<string, unknown>} */ (value);
  const extra = unknownField(outputs, OUTPUT_FIELDS);
  if (extra) {
    return 'unknown field: outputs.' + extra;
  }
  const missing = missingField(outputs, OUTPUT_FIELDS);
  if (missing) {
    return 'missing field: outputs.' + missing;
  }
  if (!Array.isArray(outputs.classes) || outputs.classes.length === 0) {
    return 'outputs.classes is a list of at least one class';
  }
  /** @type {Set<string>} */
  const classes = new Set();
  for (const item of outputs.classes) {
    if (item === 'body' || item === 'verb') {
      return 'class ' + item + ' has no rails: a ' + item + ' draft is admitted by load admit, and a role may not declare it';
    }
    if (typeof item !== 'string' || !CLASSES.includes(item)) {
      return 'class ' + String(item) + ' is not a class a role may declare: intent and belief have rails, and no class writes a consequence';
    }
    if (classes.has(item)) {
      return 'class ' + item + ' is named twice';
    }
    classes.add(item);
  }
  if (outputs.verbs !== 'catalog') {
    if (!Array.isArray(outputs.verbs) || outputs.verbs.length > 32) {
      return 'outputs.verbs is catalog or a list of at most 32 verbs';
    }
    /** @type {Set<string>} */
    const verbs = new Set();
    for (const verb of outputs.verbs) {
      if (typeof verb !== 'string' || !NAME.test(verb) || verbs.has(verb)) {
        return 'outputs.verbs names each verb once, as a short lowercase name';
      }
      verbs.add(verb);
    }
    if (!classes.has('intent') && verbs.size > 0) {
      return 'outputs.verbs names verbs, but the role proposes no intent';
    }
  } else if (!classes.has('intent')) {
    return 'outputs.verbs is catalog, but the role proposes no intent';
  }
  if (outputs.actors !== 'world' && outputs.actors !== 'own-body') {
    return 'outputs.actors is world or own-body';
  }
  return null;
}

/**
 * Checks a manifest's shape and rules. It does not read the template: the
 * catalog's loader does that (loadRoles), and a manifest a log carries is
 * checked without it, since replay renders no prompt.
 * @param {unknown} value
 * @returns {{ ok: true, manifest: RoleManifest, derived: Derived } | { ok: false, reason: string }}
 */
export function validateManifest(value) {
  if (!isObject(value)) {
    return { ok: false, reason: 'a manifest is an object' };
  }
  const raw = /** @type {Record<string, unknown>} */ (value);
  const extra = unknownField(raw, FIELDS);
  if (extra) {
    return { ok: false, reason: 'unknown field: ' + extra };
  }
  const missing = missingField(raw, FIELDS);
  if (missing) {
    return { ok: false, reason: 'missing field: ' + missing };
  }
  if (typeof raw.role !== 'string' || !NAME.test(raw.role)) {
    return { ok: false, reason: 'role is a short lowercase name' };
  }
  if (typeof raw.purpose !== 'string' || raw.purpose.length === 0 || raw.purpose.length > 240 || raw.purpose.includes('\n')) {
    return { ok: false, reason: 'purpose is one sentence on one line, at most 240 characters' };
  }
  if (raw.status !== 'frozen' && raw.status !== 'thawed') {
    return { ok: false, reason: 'status is frozen or thawed' };
  }
  if (raw.decision !== null) {
    if (!isObject(raw.decision)) {
      return { ok: false, reason: 'decision is null or { by, on }' };
    }
    const decision = /** @type {Record<string, unknown>} */ (raw.decision);
    const decisionExtra = unknownField(decision, ['by', 'on']);
    if (decisionExtra) {
      return { ok: false, reason: 'unknown field: decision.' + decisionExtra };
    }
    if (typeof decision.by !== 'string' || decision.by.length === 0 || decision.by.length > 64) {
      return { ok: false, reason: 'decision.by names who decided, in 1 to 64 characters' };
    }
    if (typeof decision.on !== 'string' || !DATE.test(decision.on)) {
      return { ok: false, reason: 'decision.on is a date, YYYY-MM-DD' };
    }
  }
  if (raw.adversarialRun !== null) {
    if (typeof raw.adversarialRun !== 'string' || raw.adversarialRun.length > 200 || !REPORT.test(raw.adversarialRun) || raw.adversarialRun.split('/').includes('..')) {
      return { ok: false, reason: 'adversarialRun is null or the repository path of the run\'s report' };
    }
  }
  if (raw.world !== 'scratch' && raw.world !== 'live') {
    return { ok: false, reason: 'world is scratch or live' };
  }
  if (!Array.isArray(raw.inputs) || raw.inputs.length === 0 || raw.inputs.length > 16) {
    return { ok: false, reason: 'inputs is a list of 1 to 16 inputs' };
  }
  /** @type {Set<string>} */
  const names = new Set();
  for (const item of raw.inputs) {
    if (!isObject(item)) {
      return { ok: false, reason: 'an input is { name, source }' };
    }
    const input = /** @type {Record<string, unknown>} */ (item);
    const inputExtra = unknownField(input, ['name', 'source']);
    if (inputExtra) {
      return { ok: false, reason: 'unknown field: inputs.' + inputExtra };
    }
    if (typeof input.name !== 'string' || !NAME.test(input.name) || names.has(input.name)) {
      return { ok: false, reason: 'each input has its own short lowercase name' };
    }
    names.add(input.name);
    if (typeof input.source !== 'string' || !Object.hasOwn(SOURCES, input.source)) {
      return { ok: false, reason: 'source ' + String(input.source) + ' is not in the closed list: ' + Object.keys(SOURCES).join(', ') };
    }
  }
  const outputs = outputsProblem(raw.outputs);
  if (outputs) {
    return { ok: false, reason: outputs };
  }
  const model = modelProblem(raw.model);
  if (model) {
    return { ok: false, reason: model };
  }
  if (!isObject(raw.prompt)) {
    return { ok: false, reason: 'prompt is { template, sha256 }' };
  }
  const prompt = /** @type {Record<string, unknown>} */ (raw.prompt);
  const promptExtra = unknownField(prompt, ['template', 'sha256']);
  if (promptExtra) {
    return { ok: false, reason: 'unknown field: prompt.' + promptExtra };
  }
  if (typeof prompt.template !== 'string' || !TEMPLATE.test(prompt.template)) {
    return { ok: false, reason: 'prompt.template is a .txt file name beside the manifest' };
  }
  if (typeof prompt.sha256 !== 'string' || !HEX64.test(prompt.sha256)) {
    return { ok: false, reason: 'prompt.sha256 is the template\'s SHA-256, 64 lowercase hex digits' };
  }
  if (typeof raw.schema !== 'string' || !SCHEMA_BUILDERS.includes(raw.schema)) {
    return { ok: false, reason: 'schema ' + String(raw.schema) + ' names no builder the seat has: ' + SCHEMA_BUILDERS.join(', ') };
  }
  const budget = budgetProblem(raw.budget);
  if (budget) {
    return { ok: false, reason: budget };
  }
  const manifest = /** @type {RoleManifest} */ (/** @type {unknown} */ (deepFreeze(structuredClone(raw))));
  const sources = manifest.inputs.map((input) => input.source);
  if (manifest.world === 'scratch') {
    for (const source of ['player-text', 'other-minds']) {
      if (sources.some((item) => item === source)) {
        return { ok: false, reason: 'a scratch role may not read ' + source + ': a scratch world is built only from the repository\'s own files' };
      }
    }
  }
  if (sources.includes('mind') && manifest.outputs.actors !== 'own-body') {
    return { ok: false, reason: 'a mind input is the instance\'s own mind, so it needs an own-body role' };
  }
  if (manifest.status === 'thawed') {
    if (manifest.decision === null) {
      return { ok: false, reason: 'a thawed role records the decision that it may run' };
    }
    if (manifest.adversarialRun === null) {
      return { ok: false, reason: 'a thawed role names the adversarial run it rests on' };
    }
    if (manifest.model === null) {
      return { ok: false, reason: 'a thawed role pins its model by digest' };
    }
  }
  const derived = derive(manifest);
  if (derived.A && derived.B && derived.C) {
    return { ok: false, reason: 'the role holds A, B, and C: it reads untrusted input, reads private data in a live world, and changes state' };
  }
  return { ok: true, manifest, derived };
}

/**
 * @param {Array<{ manifest: RoleManifest, derived: Derived, hash: string, template: string | null }>} entries
 * @param {'files' | 'log'} source
 * @returns {{ ok: true, catalog: Catalog } | { ok: false, reason: string }}
 */
function assemble(entries, source) {
  /** @type {Map<string, RoleEntry>} */
  const byName = new Map();
  /** @type {Map<string, RoleEntry>} */
  const byHash = new Map();
  let maxAge = 0;
  let maxWindow = 1;
  for (const entry of entries) {
    if (source === 'files' && byName.has(entry.manifest.role)) {
      return { ok: false, reason: 'role ' + entry.manifest.role + ' is named twice' };
    }
    if (!byName.has(entry.manifest.role)) {
      byName.set(entry.manifest.role, entry);
    }
    byHash.set(entry.hash, entry);
    maxAge = Math.max(maxAge, entry.manifest.budget.maxAgeQuanta);
    maxWindow = Math.max(maxWindow, entry.manifest.budget.windowQuanta);
  }
  return { ok: true, catalog: { source, byName, byHash, maxAge, maxWindow } };
}

/**
 * A catalog of manifests already in hand, looked up by role name as the
 * catalog on disk is. Tests build test-only roles with this; no template is read.
 * @param {unknown[]} manifests
 * @returns {{ ok: true, catalog: Catalog } | { ok: false, reason: string }}
 */
export function catalogOf(manifests) {
  /** @type {Array<{ manifest: RoleManifest, derived: Derived, hash: string, template: string | null }>} */
  const entries = [];
  for (const value of manifests) {
    const checked = validateManifest(value);
    if (!checked.ok) {
      return { ok: false, reason: checked.reason };
    }
    entries.push({ manifest: checked.manifest, derived: checked.derived, hash: manifestHash(checked.manifest), template: null });
  }
  return assemble(entries, 'files');
}

/**
 * The catalog on disk: `<dir>/index.json` names the manifests, and each
 * manifest's template sits beside it. Refuses the whole catalog, naming the
 * file, if any manifest or template is refused.
 * @param {string} [dir] predicates/roles by default, read from the repository root
 * @returns {{ ok: true, catalog: Catalog } | { ok: false, reason: string }}
 */
export function loadRoles(dir) {
  const root = dir ?? 'predicates/roles';
  /** @type {unknown} */
  let index;
  try {
    index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
  } catch (error) {
    return { ok: false, reason: 'the role index did not read: ' + (error instanceof Error ? error.message : String(error)) };
  }
  if (!isObject(index)) {
    return { ok: false, reason: 'the role index is { roles }' };
  }
  const listed = /** @type {Record<string, unknown>} */ (index);
  const extra = unknownField(listed, ['roles']);
  if (extra) {
    return { ok: false, reason: 'unknown field in the role index: ' + extra };
  }
  if (!Array.isArray(listed.roles)) {
    return { ok: false, reason: 'the role index names its manifests in roles' };
  }
  /** @type {Array<{ manifest: RoleManifest, derived: Derived, hash: string, template: string | null }>} */
  const entries = [];
  for (const file of listed.roles) {
    if (typeof file !== 'string' || !/^[a-z][a-z0-9-]{0,31}\.json$/.test(file)) {
      return { ok: false, reason: 'the role index names ' + String(file) + ', which is not a manifest file name' };
    }
    /** @type {unknown} */
    let raw;
    try {
      raw = JSON.parse(readFileSync(join(root, file), 'utf8'));
    } catch (error) {
      return { ok: false, reason: file + ': ' + (error instanceof Error ? error.message : String(error)) };
    }
    const checked = validateManifest(raw);
    if (!checked.ok) {
      return { ok: false, reason: file + ': ' + checked.reason };
    }
    if (checked.manifest.role + '.json' !== file) {
      return { ok: false, reason: file + ': names role ' + checked.manifest.role };
    }
    /** @type {string} */
    let text;
    try {
      text = lf(readFileSync(join(root, checked.manifest.prompt.template), 'utf8'));
    } catch {
      return { ok: false, reason: file + ': the template ' + checked.manifest.prompt.template + ' did not read' };
    }
    const found = templateHash(text);
    if (found !== checked.manifest.prompt.sha256) {
      return { ok: false, reason: file + ': the template ' + checked.manifest.prompt.template + ' hashes to ' + found + ', not the pinned ' + checked.manifest.prompt.sha256 };
    }
    entries.push({ manifest: checked.manifest, derived: checked.derived, hash: manifestHash(checked.manifest), template: text });
  }
  return assemble(entries, 'files');
}

/**
 * The catalog a log carries: its manifests keyed by hash, as they were when
 * the log was recorded. Replay gates each entry against the manifest its
 * provenance cites here, never against today's catalog (pin 4). Each manifest
 * is checked again, and its key must be its hash.
 * @param {unknown} manifests
 * @returns {{ ok: true, catalog: Catalog } | { ok: false, reason: string }}
 */
export function catalogFromLog(manifests) {
  if (!isObject(manifests)) {
    return { ok: false, reason: 'a log\'s manifests are an object keyed by hash' };
  }
  /** @type {Array<{ manifest: RoleManifest, derived: Derived, hash: string, template: string | null }>} */
  const entries = [];
  for (const [hash, value] of Object.entries(/** @type {Record<string, unknown>} */ (manifests))) {
    const checked = validateManifest(value);
    if (!checked.ok) {
      return { ok: false, reason: 'manifest ' + hash + ': ' + checked.reason };
    }
    const found = manifestHash(checked.manifest);
    if (found !== hash) {
      return { ok: false, reason: 'manifest ' + hash + ' hashes to ' + found };
    }
    entries.push({ manifest: checked.manifest, derived: checked.derived, hash, template: null });
  }
  return assemble(entries, 'log');
}

/**
 * The manifest a provenance cites. A catalog on disk is looked up by role and
 * must hold that hash; a log's catalog is looked up by hash and must name that role.
 * @param {Catalog} catalog
 * @param {string} role
 * @param {string} hash
 * @returns {{ ok: true, entry: RoleEntry } | { ok: false, reason: string }}
 */
export function findRole(catalog, role, hash) {
  if (catalog.source === 'files') {
    const entry = catalog.byName.get(role);
    if (!entry) {
      return { ok: false, reason: 'role ' + role + ' is not in the catalog' };
    }
    if (entry.hash !== hash) {
      return { ok: false, reason: 'role ' + role + ' cites manifest ' + hash + ', and the catalog holds ' + entry.hash };
    }
    return { ok: true, entry };
  }
  const entry = catalog.byHash.get(hash);
  if (!entry) {
    return { ok: false, reason: 'the log carries no manifest ' + hash };
  }
  if (entry.manifest.role !== role) {
    return { ok: false, reason: 'manifest ' + hash + ' is role ' + entry.manifest.role + ', not ' + role };
  }
  return { ok: true, entry };
}

/**
 * Which of pin 1's three kinds a change to one role is. A widening is a
 * thaw, a new source, class, verb, or actor range, a live world, or a looser
 * budget: it is reviewed like the law and names the Director's approval and
 * its adversarial run. A new model, prompt, or schema changes behaviour
 * within the same capability and is reviewed with the role's evaluation run
 * again. A narrowing or a freeze takes effect when merged. A change with any
 * widening in it is a widening.
 * @param {RoleManifest} before
 * @param {RoleManifest} after
 * @returns {{ kind: 'none' | 'narrowing' | 'behaviour' | 'widening', widening: string[], behaviour: string[], narrowing: string[] }}
 */
export function classifyChange(before, after) {
  /** @type {string[]} */
  const widening = [];
  /** @type {string[]} */
  const behaviour = [];
  /** @type {string[]} */
  const narrowing = [];
  if (before.role !== after.role) {
    widening.push('a different role, ' + after.role + ', in place of ' + before.role);
  }
  if (before.status === 'frozen' && after.status === 'thawed') {
    widening.push('a thaw');
  } else if (before.status === 'thawed' && after.status === 'frozen') {
    narrowing.push('a freeze');
  }
  if (before.world === 'scratch' && after.world === 'live') {
    widening.push('a live world');
  } else if (before.world === 'live' && after.world === 'scratch') {
    narrowing.push('a scratch world in place of a live one');
  }
  const was = new Set(before.inputs.map((input) => input.source));
  const now = new Set(after.inputs.map((input) => input.source));
  for (const source of now) {
    if (!was.has(source)) {
      widening.push('a new source, ' + source);
    }
  }
  for (const source of was) {
    if (!now.has(source)) {
      narrowing.push('source ' + source + ' removed');
    }
  }
  const classesWere = new Set(before.outputs.classes);
  const classesNow = new Set(after.outputs.classes);
  for (const item of classesNow) {
    if (!classesWere.has(item)) {
      widening.push('a new class, ' + item);
    }
  }
  for (const item of classesWere) {
    if (!classesNow.has(item)) {
      narrowing.push('class ' + item + ' removed');
    }
  }
  if (before.outputs.verbs === 'catalog' && after.outputs.verbs !== 'catalog') {
    narrowing.push('verbs narrowed from the catalog to a list');
  } else if (before.outputs.verbs !== 'catalog' && after.outputs.verbs === 'catalog') {
    widening.push('verbs widened from a list to the catalog');
  } else if (before.outputs.verbs !== 'catalog' && after.outputs.verbs !== 'catalog') {
    const verbsWere = new Set(before.outputs.verbs);
    const verbsNow = new Set(after.outputs.verbs);
    for (const verb of verbsNow) {
      if (!verbsWere.has(verb)) {
        widening.push('a new verb, ' + verb);
      }
    }
    for (const verb of verbsWere) {
      if (!verbsNow.has(verb)) {
        narrowing.push('verb ' + verb + ' removed');
      }
    }
  }
  if (before.outputs.actors === 'own-body' && after.outputs.actors === 'world') {
    widening.push('actors widened from its own body to the world');
  } else if (before.outputs.actors === 'world' && after.outputs.actors === 'own-body') {
    narrowing.push('actors narrowed from the world to its own body');
  }
  for (const name of Object.keys(BUDGET)) {
    const was = /** @type {Record<string, number>} */ (/** @type {unknown} */ (before.budget))[name];
    const now = /** @type {Record<string, number>} */ (/** @type {unknown} */ (after.budget))[name];
    if (was === now) {
      continue;
    }
    // A shorter window with the same count admits more proposals a second.
    const looser = name === 'windowQuanta' ? now < was : now > was;
    (looser ? widening : narrowing).push('budget.' + name + ' ' + was + ' to ' + now);
  }
  if (canonical(before.model) !== canonical(after.model)) {
    behaviour.push('a new model or model setting');
  }
  if (canonical(before.prompt) !== canonical(after.prompt)) {
    behaviour.push('a new prompt');
  }
  if (before.schema !== after.schema) {
    behaviour.push('a new schema');
  }
  const kind = widening.length > 0 ? 'widening' : behaviour.length > 0 ? 'behaviour' : narrowing.length > 0 ? 'narrowing' : 'none';
  return { kind, widening, behaviour, narrowing };
}
