// The grammar a role's call asks the sampler to obey (T7a pin 9), built by
// name: a manifest's `schema` names its builder here, and the concrete schema
// of each call is hashed in that call's record. A role's output is one JSON
// object: an optional `notes` string, bounded by the role's freeSpanChars and
// never acted on, before the proposal, so the model may reason in a bounded
// free span before its constrained proposal (finding 38). The proposal's
// branches are the classes the role may make, with enums drawn from the
// catalog and the world. A belief branch has no label field: the gate sets a
// belief's label, and a proposal that carries one is refused. The seat's
// parser reads every output again without trusting the decoder (parse.js).

import { SCHEMA_BUILDERS } from '../tick/roles.js';
import { BELIEF_TEXT_LIMIT } from '../tick/memory.js';

/**
 * @typedef {import('../frame/types.js').RoleManifest} RoleManifest
 * @typedef {{
 *   verbs: string[],
 *   actors: string[],
 *   bodies: string[],
 *   zones: string[],
 *   minds: string[],
 *   keys: string[],
 *   sources: string[],
 * }} SchemaContext the verbs the role may propose now, the bodies it may act for, the bodies and zones a target or subject may name, the minds it may write, the belief keys, and the admitted episodes a belief may cite
 */

/**
 * @param {SchemaContext} context
 * @returns {object | null}
 */
function intentBranch(context) {
  if (context.verbs.length === 0 || context.actors.length === 0) {
    return null;
  }
  /** @type {object[]} */
  const targets = [{
    type: 'object',
    additionalProperties: false,
    required: ['x', 'z'],
    properties: { x: { type: 'number' }, z: { type: 'number' } },
  }];
  if (context.bodies.length > 0) {
    targets.push({ type: 'object', additionalProperties: false, required: ['body'], properties: { body: { type: 'string', enum: context.bodies } } });
  }
  if (context.zones.length > 0) {
    targets.push({ type: 'object', additionalProperties: false, required: ['zone'], properties: { zone: { type: 'string', enum: context.zones } } });
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'verb', 'actor', 'target'],
    properties: {
      kind: { const: 'intent' },
      verb: { type: 'string', enum: context.verbs },
      actor: { type: 'string', enum: context.actors },
      target: targets.length === 1 ? targets[0] : { anyOf: targets },
    },
  };
}

/**
 * @param {SchemaContext} context
 * @returns {object | null}
 */
function beliefBranch(context) {
  if (context.minds.length === 0 || context.keys.length === 0 || context.sources.length === 0 || (context.bodies.length === 0 && context.zones.length === 0)) {
    return null;
  }
  /** @type {object[]} */
  const subjects = [];
  if (context.bodies.length > 0) {
    subjects.push({ type: 'object', additionalProperties: false, required: ['body'], properties: { body: { type: 'string', enum: context.bodies } } });
  }
  if (context.zones.length > 0) {
    subjects.push({ type: 'object', additionalProperties: false, required: ['zone'], properties: { zone: { type: 'string', enum: context.zones } } });
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'mind', 'subject', 'key', 'value', 'confidence', 'source'],
    properties: {
      kind: { const: 'belief' },
      mind: { type: 'string', enum: context.minds },
      subject: subjects.length === 1 ? subjects[0] : { anyOf: subjects },
      key: { type: 'string', enum: context.keys },
      value: { anyOf: [{ type: 'string', maxLength: BELIEF_TEXT_LIMIT }, { type: 'integer', minimum: 0 }, { type: 'boolean' }] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      source: { type: 'string', enum: context.sources },
      supersedes: { type: 'string' },
      withdrawnBy: { type: 'string' },
    },
  };
}

/**
 * The schema `role-proposal` builds: notes, then one proposal of a class the
 * role may make. Null when no proposal the role may make is possible now.
 * @param {RoleManifest} manifest
 * @param {SchemaContext} context
 * @returns {object | null}
 */
export function roleProposalSchema(manifest, context) {
  /** @type {object[]} */
  const branches = [];
  if (manifest.outputs.classes.some((item) => item === 'intent')) {
    const branch = intentBranch(context);
    if (branch) {
      branches.push(branch);
    }
  }
  if (manifest.outputs.classes.some((item) => item === 'belief')) {
    const branch = beliefBranch(context);
    if (branch) {
      branches.push(branch);
    }
  }
  if (branches.length === 0) {
    return null;
  }
  /** @type {Record<string, object>} */
  const properties = {};
  /** @type {string[]} */
  const required = [];
  if (manifest.budget.freeSpanChars > 0) {
    // Required here, though the parser takes an output without it: a
    // grammar built from a schema writes required properties first, so this
    // is what puts the free span before the proposal.
    properties.notes = { type: 'string', maxLength: manifest.budget.freeSpanChars };
    required.push('notes');
  }
  properties.proposal = branches.length === 1 ? branches[0] : { oneOf: branches };
  required.push('proposal');
  return { type: 'object', additionalProperties: false, required, properties };
}

/** @type {Record<string, (manifest: RoleManifest, context: SchemaContext) => object | null>} */
export const BUILDERS = { 'role-proposal': roleProposalSchema };

/**
 * The concrete schema of one call, by the builder the manifest names.
 * @param {RoleManifest} manifest
 * @param {SchemaContext} context
 */
export function buildSchema(manifest, context) {
  if (!SCHEMA_BUILDERS.includes(manifest.schema) || !Object.hasOwn(BUILDERS, manifest.schema)) {
    throw new Error('the seat has no schema builder named ' + manifest.schema);
  }
  return BUILDERS[manifest.schema](manifest, context);
}
