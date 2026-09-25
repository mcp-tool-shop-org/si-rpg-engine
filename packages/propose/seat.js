// The proposer seat (T7a). The only code that calls a model. It reaches the
// tick through one function, submitAsRole, which refuses to submit without
// provenance; a source test fails if anything else in packages/propose names
// the tick's submit (propose.test.js). A session runs a role only while the
// catalog holds it thawed: the propose command refuses a frozen role before
// any model call, and the tick's gate refuses a frozen role's proposal. A
// scratch world is built only from the repository's own files. Every call is
// recorded (record.js), and the tick never waits for a model: while a call is
// outstanding, the session advances the tick by the quanta it names, and the
// proposal is checked against the world as it is when it arrives (pin 8).
// The seat enforces the call budgets: at most callsPerSession calls,
// outputTokens as each call's num_predict, and secondsPerCall as its timeout.

import { readFileSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, relative } from 'node:path';
import { beliefKeys } from '../tick/beliefs.js';
import { validateScene } from '../tick/scene.js';
import { settle } from '../tick/tick.js';
import { readRoleOutput, stampProposal } from './parse.js';
import { accessText, catalogText, feedbackText, renderTemplate, worldText } from './prompt.js';
import { outputHash, promptHash, recordKey, schemaHash } from './record.js';
import { buildSchema } from './schema.js';

/**
 * @typedef {import('../frame/types.js').Proposal} Proposal
 * @typedef {import('../frame/types.js').Provenance} Provenance
 * @typedef {import('../frame/types.js').Admission} Admission
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {import('../frame/types.js').Frame} Frame
 * @typedef {import('../frame/types.js').RoleSource} RoleSource
 * @typedef {import('../tick/roles.js').RoleEntry} RoleEntry
 * @typedef {import('./ollama.js').ChatRequest} ChatRequest
 * @typedef {import('./ollama.js').CallResult} CallResult
 * @typedef {import('./record.js').CallRecord} CallRecord
 * @typedef {import('./record.js').CallLine} CallLine
 * @typedef {import('./prompt.js').Feedback} Feedback
 * @typedef {(request: ChatRequest, options: { timeoutMs: number, pin: string }) => Promise<CallResult>} Ask
 * @typedef {Parameters<typeof import('../tick/world.js').createWorld>[0]} WorldInit
 */

/**
 * The seat's one way into the tick. Refuses, before the tick is reached,
 * a proposal that has no provenance.
 * @param {{ submit: (proposal: Proposal, provenance?: Provenance) => Admission }} tick
 * @param {Proposal} proposal
 * @param {Provenance} provenance
 * @returns {Admission}
 */
export function submitAsRole(tick, proposal, provenance) {
  if (provenance === undefined || provenance === null || typeof provenance !== 'object') {
    return { admitted: false, reason: 'the seat submits a proposal only with its provenance' };
  }
  return tick.submit(proposal, provenance);
}

/**
 * A scratch world, built only from the repository's own files: a world file
 * or a fixture under fixtures/ or worlds/, named by its path from the
 * repository root, or `product`, the product scene. Any other path is
 * refused, and so is a link that leads out of those folders. Nothing a
 * player typed or saved, and no live session, can name one.
 * @param {string} spec
 * @param {string} root the repository root
 * @returns {Promise<{ ok: true, world: WorldInit, seed: number, from: string } | { ok: false, reason: string }>}
 */
export async function scratchWorld(spec, root) {
  if (spec === 'product') {
    // The product scene's records are the harness's own; this is the one
    // place a package reads them, and only when a session names the scene.
    const { productInit } = await import('../../harness/product-scene.mjs');
    return { ok: true, world: productInit(), seed: 0, from: 'product' };
  }
  const refusal = 'a scratch world is built only from a file under fixtures/ or worlds/, or the product scene, and ' + String(spec) + ' is not one';
  if (typeof spec !== 'string' || spec.length === 0 || isAbsolute(spec) || spec.includes('\\') || spec.includes(':') || !spec.endsWith('.json')) {
    return { ok: false, reason: refusal };
  }
  const parts = spec.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..') || (parts[0] !== 'fixtures' && parts[0] !== 'worlds') || parts.length < 2) {
    return { ok: false, reason: refusal };
  }
  /** @type {string} */
  let real;
  /** @type {string} */
  let home;
  try {
    real = realpathSync(join(root, spec));
    home = realpathSync(join(root, parts[0]));
  } catch {
    return { ok: false, reason: spec + ' did not read' };
  }
  const inside = relative(home, real);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    return { ok: false, reason: refusal };
  }
  /** @type {any} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(real, 'utf8'));
  } catch {
    return { ok: false, reason: spec + ' is not JSON' };
  }
  /** @type {unknown} */
  let scene = null;
  if (raw && Array.isArray(raw.bodies)) {
    scene = raw;
  } else if (raw && raw.world && typeof raw.world === 'object' && Array.isArray(raw.world.bodies)) {
    scene = {
      ...raw.world,
      name: typeof raw.world.name === 'string' ? raw.world.name : basename(spec, '.json'),
      seed: typeof raw.seed === 'number' ? raw.seed : 0,
      zones: Array.isArray(raw.world.zones) ? raw.world.zones : [],
    };
  }
  if (scene === null) {
    return { ok: false, reason: spec + ' holds no world' };
  }
  const checked = validateScene(scene);
  if (!checked.ok) {
    return { ok: false, reason: spec + ': ' + checked.reason };
  }
  const s = checked.scene;
  return {
    ok: true,
    world: {
      bodies: s.bodies,
      colliders: s.colliders,
      zones: s.zones,
      name: s.name,
      ...(s.heightfield ? { heightfield: s.heightfield } : {}),
      ...(s.minds ? { minds: s.minds } : {}),
    },
    seed: s.seed,
    from: spec,
  };
}

/**
 * @typedef {{
 *   entry: RoleEntry,
 *   session: string,
 *   instance: string,
 *   tick: ReturnType<typeof import('../tick/tick.js').createTick>,
 *   world: ReturnType<typeof import('../tick/world.js').createWorld>,
 *   memory: ReturnType<typeof import('../tick/memory.js').createMemory>,
 *   rules: Map<string, IntentRule>,
 *   inputs: { dispatch: string, diff: string, access: Record<string, string[]> },
 *   calls: number,
 *   lateQuanta: number,
 *   ask: Ask,
 *   timer?: (ms: number) => Promise<void>,
 * }} SessionInit
 */

/**
 * One input's text, rendered from the engine's typed state or the session's files.
 * @param {RoleSource} source
 * @param {SessionInit} init
 * @param {Frame} frame
 * @param {ReadonlyArray<Feedback>} feedback
 */
function sourceText(source, init, frame, feedback) {
  switch (source) {
    case 'dispatch':
      return init.inputs.dispatch.trim();
    case 'diff':
      return init.inputs.diff.trim();
    case 'access':
      return accessText(init.inputs.access);
    case 'catalog':
      return catalogText(init.rules);
    case 'world':
      return worldText({ bodies: frame.bodies, colliders: init.world.colliders, zones: init.world.zones || [], zoneOf: (id) => init.world.zoneOf(id) });
    case 'feedback':
      return feedbackText(feedback);
    default:
      throw new Error('the seat has no scratch source for ' + source);
  }
}

/**
 * The enums a call's schema draws from the catalog and the world.
 * @param {SessionInit} init
 */
function schemaContext(init) {
  const manifest = init.entry.manifest;
  const bodies = init.world.bodies.map((body) => body.id);
  const zones = (init.world.zones || []).map((zone) => zone.id);
  const catalog = [...init.rules.keys()].sort();
  const allowed = manifest.outputs.verbs;
  const verbs = allowed === 'catalog' ? catalog : catalog.filter((verb) => allowed.includes(verb));
  const own = manifest.outputs.actors === 'own-body';
  return {
    verbs,
    actors: own ? bodies.filter((id) => id === init.instance) : bodies,
    bodies,
    zones,
    minds: (init.world.minds || []).map((mind) => mind.body).filter((id) => !own || id === init.instance),
    keys: Object.keys(beliefKeys()).sort(),
    sources: init.memory.episodes.map((episode) => episode.id),
  };
}

/**
 * Resolves with the call's result, or with null once the timeout passes
 * first: the seat's own bound, beside the one the call is given.
 * @param {Promise<CallResult>} asked
 * @param {number} ms
 * @param {((ms: number) => Promise<void>) | undefined} timer
 * @returns {Promise<CallResult | null>}
 */
async function within(asked, ms, timer) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let handle;
  const clock = timer ? timer(ms) : new Promise((resolve) => {
    handle = setTimeout(resolve, ms);
  });
  try {
    return await Promise.race([asked, clock.then(() => null)]);
  } finally {
    if (handle !== undefined) {
      clearTimeout(handle);
    }
  }
}

/**
 * Runs a thawed scratch role for the session's calls. Each call: the frame it
 * is built from, a prompt rendered fresh from the role's declared inputs, the
 * schema its builder makes, the call, its record, the seat's own parse, and,
 * if it reads, the stamped proposal submitted with its provenance.
 * @param {SessionInit} init
 * @returns {Promise<{ records: CallRecord[], calls: CallLine[], refused: string | null }>}
 */
export async function runSession(init) {
  const { entry, tick } = init;
  const manifest = entry.manifest;
  if (manifest.status !== 'thawed' || manifest.model === null) {
    throw new Error('role ' + manifest.role + ' is frozen');
  }
  if (manifest.world !== 'scratch') {
    throw new Error('role ' + manifest.role + ' acts in a live world, and the seat runs only scratch sessions');
  }
  if (entry.template === null) {
    throw new Error('role ' + manifest.role + ' has no template in hand: the seat renders from a catalog on disk');
  }
  const model = manifest.model;
  const budget = manifest.budget;
  /** @type {CallRecord[]} */
  const records = [];
  /** @type {CallLine[]} */
  const calls = [];
  /** @type {Feedback[]} */
  const feedback = [];
  /** @type {string | null} */
  let refused = null;
  for (let call = 0; call < init.calls; call = call + 1) {
    if (call >= budget.callsPerSession) {
      refused = 'the session asks for ' + init.calls + ' calls, and role ' + manifest.role + ' allows ' + budget.callsPerSession + ' a session';
      break;
    }
    const frame = tick.frame();
    const builtAt = { tick: frame.tick, hash: frame.hash };
    /** @type {Record<string, string>} */
    const fields = {};
    for (const input of manifest.inputs) {
      fields[input.name] = sourceText(input.source, init, frame, feedback);
    }
    const messages = [{ role: 'user', content: renderTemplate(entry.template, fields) }];
    const format = buildSchema(manifest, schemaContext(init));
    if (format === null) {
      refused = 'no proposal role ' + manifest.role + ' may make is possible at tick ' + frame.tick;
      break;
    }
    /** @type {ChatRequest} */
    const request = {
      model: model.name,
      messages,
      options: { ...model.options, num_predict: budget.outputTokens },
      format,
      stream: false,
    };
    const timeoutMs = budget.secondsPerCall * 1000;
    const asked = init.ask(request, { timeoutMs, pin: model.digest });
    // The tick never waits for a model: it runs on while the call is out.
    for (let i = 0; i < init.lateQuanta; i = i + 1) {
      tick.advance();
    }
    const result = await within(asked, timeoutMs, init.timer);
    /** @type {CallRecord} */
    const record = {
      record: 1,
      session: init.session,
      call,
      role: manifest.role,
      manifest: entry.hash,
      request,
      prompt: promptHash(messages),
      schema: schemaHash(format),
      timeoutMs,
      model: result ? result.model : { name: model.name, digest: 'unobserved', quantization: 'unobserved', format: 'unobserved', family: 'unobserved', parameterSize: 'unobserved' },
      server: result ? result.server : { version: 'unobserved', settings: {}, loaded: null, callsAtOnce: 1 },
      gpu: result ? result.gpu : { names: [], count: 0, driver: null },
      output: result ? result.output : null,
      outputSha256: outputHash(result ? result.output : null),
      timing: result ? result.timing : { ms: timeoutMs, timedOut: true, totalDuration: null, loadDuration: null, promptEvalCount: null, promptEvalDuration: null, evalCount: null, evalDuration: null, doneReason: null },
    };
    const key = recordKey(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (record)));
    records.push(record);
    /** @type {CallLine} */
    const line = { call, record: key, builtAt, read: 'ok', reason: null, admitted: false, at: null };
    const loaded = record.server.loaded;
    if (record.output === null) {
      line.read = 'timed-out';
      line.reason = 'no output within ' + budget.secondsPerCall + ' s';
      feedback.push({ call, proposal: null, read: line.read, admitted: false, reason: line.reason, at: null });
    } else if (loaded && typeof loaded.digest === 'string' && loaded.digest !== model.digest) {
      line.read = 'model-changed';
      line.reason = 'the server ran ' + loaded.digest + ', not the pin';
      feedback.push({ call, proposal: null, read: line.read, admitted: false, reason: line.reason, at: null });
    } else {
      const read = readRoleOutput(record.output, manifest);
      if (read.verdict !== 'ok') {
        line.read = read.verdict;
        line.reason = read.reason;
        feedback.push({ call, proposal: null, read: read.verdict, admitted: false, reason: read.reason, at: null });
      } else {
        /** @type {Provenance} */
        const provenance = {
          role: manifest.role,
          instance: init.instance,
          manifest: entry.hash,
          model: record.model.digest,
          prompt: record.prompt,
          schema: record.schema,
          record: key,
          output: /** @type {string} */ (record.outputSha256),
          builtAt,
          inputs: entry.derived.inputs.map((input) => ({ source: input.source, trust: input.trust })),
        };
        const at = tick.frame().tick;
        const admission = submitAsRole(tick, stampProposal(read.proposal, builtAt), provenance);
        line.admitted = admission.admitted;
        line.reason = admission.admitted ? null : admission.reason;
        line.at = admission.admitted ? at : null;
        feedback.push({ call, proposal: read.proposal, read: 'ok', admitted: admission.admitted, reason: line.reason, at: line.at });
        settle(tick);
      }
    }
    calls.push(line);
  }
  return { records, calls, refused };
}
