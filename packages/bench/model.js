// The model proposer (T7c). Loaded in the sweep process, and only when a run
// names --model: the bench imports packages/propose from this file alone.
// One seat session per world. A fake client is built here from the outputs
// the run names, so no test starts Ollama or opens a socket. The real client
// is loaded only when a run names none.

import { loadIntentRules } from '../tick/predicates.js';
import { loadRoles } from '../tick/roles.js';
import { createMemory } from '../tick/memory.js';
import { createTick, settle } from '../tick/tick.js';
import { createWorld } from '../tick/world.js';
import { readRoleOutput } from '../propose/parse.js';
import { writeSession } from '../propose/record.js';
import { runSession, sessionRefusal } from '../propose/seat.js';

/**
 * @typedef {import('../propose/prompt.js').Feedback} Feedback
 * @typedef {import('../propose/seat.js').Client} Client
 */

/**
 * A client that never opens a socket. Each call returns the next output, or
 * nothing once they are spent. With cutOff set, the ask never resolves and
 * the seat's own timer records the cut-off.
 * @param {string[]} outputs
 * @param {boolean} cutOff
 * @returns {Client}
 */
function fakeClient(outputs, cutOff) {
  let n = 0;
  return {
    observe: async (name, digest) => ({
      model: { name, digest, quantization: 'Q4_K_M', format: 'gguf', family: 'qwen2', parameterSize: '7.6B' },
      server: { version: 'test', loadedBefore: null },
      client: { environment: {} },
      gpu: { names: ['test'], count: 1, driver: null },
    }),
    ask: () => {
      if (cutOff) {
        return new Promise(() => {});
      }
      const output = n < outputs.length ? outputs[n] : null;
      n = n + 1;
      return Promise.resolve({
        output,
        timing: { ms: 1, timedOut: false, totalDuration: null, loadDuration: null, promptEvalCount: null, promptEvalDuration: null, evalCount: 1, evalDuration: null, doneReason: 'stop' },
      });
    },
    loaded: async () => null,
  };
}

/** @type {any} */
let current = null;

/**
 * Opens the world's one session. A role the seat cannot run is refused
 * before any call, and no world is opened.
 * @param {any} a
 */
export async function openModel(a) {
  const loaded = loadRoles(a.catalog);
  if (!loaded.ok) {
    return { refused: loaded.reason, callsPerSession: 0 };
  }
  const entry = loaded.catalog.byName.get(a.role);
  if (!entry) {
    return { refused: a.catalog + ' holds no role named ' + a.role, callsPerSession: 0 };
  }
  const refusal = sessionRefusal(entry);
  if (refusal !== null) {
    return { refused: refusal, callsPerSession: entry.manifest.budget.callsPerSession };
  }
  const rules = loadIntentRules();
  const world = createWorld(a.world, 'product');
  const memory = createMemory();
  const tick = createTick({ seed: a.seed, world, rules: rules.rules, retired: rules.retired, memory, roles: loaded.catalog });
  /** @type {string[]} */
  const frames = [];
  tick.attach({ draw: (/** @type {{ hash: string }} */ frame) => {
    frames.push(frame.hash);
  } });
  /** @type {Feedback[]} */
  const feedback = [];
  /** @type {Client} */
  let client;
  if (Array.isArray(a.outputs) || a.cutOff) {
    client = fakeClient(Array.isArray(a.outputs) ? a.outputs : [], Boolean(a.cutOff));
  } else {
    const { ollamaClient } = await import('../propose/ollama.js');
    client = ollamaClient();
  }
  const bodies = world.bodies.map((/** @type {{ id: string }} */ body) => body.id);
  current = {
    entry, tick, world, memory, rules: rules.rules, feedback, frames,
    records: [], calls: [], next: 0, refused: null, timeouts: 0, stopped: false,
    witness: [], witnessEnd: tick.frame().tick,
    worldInit: a.world, seed: a.seed, worldName: a.worldName, catalog: a.catalog,
    instance: bodies[0] || 'walker',
    diff: a.diff, dispatch: a.dispatch, access: a.access || {},
    callBudget: a.calls, client, cutOff: Boolean(a.cutOff),
  };
  return { refused: null, callsPerSession: entry.manifest.budget.callsPerSession, instance: current.instance };
}

/**
 * One call of the open session. The witness it returns is the one before
 * this call. An admitted intent is kept for the next call's witness.
 */
export async function stepModel() {
  const s = current;
  if (!s || s.stopped) {
    return { done: true, refused: s ? s.refused : 'no session' };
  }
  if (s.next >= s.callBudget) {
    s.stopped = true;
    return { done: true, refused: s.refused };
  }
  const witness = s.witness.map((/** @type {{ tick: number, proposal: any }} */ entry) => ({ tick: entry.tick, proposal: { ...entry.proposal } }));
  const witnessEnd = s.witnessEnd;
  const frameTick = s.tick.frame().tick;
  const result = await runSession({
    entry: s.entry,
    session: 'model-session',
    instance: s.instance,
    tick: s.tick,
    world: s.world,
    memory: s.memory,
    rules: s.rules,
    inputs: { dispatch: s.dispatch, diff: s.diff, access: s.access },
    calls: 1,
    callStart: s.next,
    lateQuanta: 0,
    client: s.client,
    feedback: s.feedback,
    timer: s.cutOff ? () => Promise.resolve() : undefined,
  });
  if (result.records.length === 0) {
    s.stopped = true;
    s.refused = result.refused;
    return { done: true, refused: result.refused };
  }
  const record = result.records[0];
  const line = result.calls[0];
  s.records.push(record);
  s.calls.push(line);
  s.next = s.next + 1;
  if (line.read === 'timed-out') {
    s.timeouts = s.timeouts + 1;
  }
  if (line.read === 'call-failed') {
    s.stopped = true;
    s.refused = result.refused;
  }
  /** @type {any} */
  let proposal = null;
  if (line.read === 'ok' && typeof record.output === 'string') {
    const read = readRoleOutput(record.output, s.entry.manifest);
    if (read.verdict === 'ok' && read.proposal.kind === 'intent') {
      proposal = { kind: 'intent', verb: read.proposal.verb, actor: read.proposal.actor, target: read.proposal.target };
    }
  }
  if (line.admitted && proposal) {
    s.witness.push({ tick: frameTick, proposal });
    s.witnessEnd = s.tick.frame().tick;
  }
  return {
    done: false,
    call: line.call,
    read: line.read,
    reason: line.reason,
    admitted: line.admitted,
    proposal,
    witness,
    witnessEnd,
    intentTick: frameTick,
    ms: record.timing.ms,
    timedOut: record.timing.timedOut === true,
  };
}

/**
 * The bench appends what the ladder reached, before the next call's prompt.
 * @param {any} a
 */
export function noteModel(a) {
  const last = current && current.feedback[current.feedback.length - 1];
  if (!last) {
    return { noted: false };
  }
  last.anchors = Array.isArray(a.anchors) ? a.anchors.slice() : [];
  last.rungs = Array.isArray(a.rungs) ? a.rungs.slice() : [];
  return { noted: true };
}

/**
 * Writes the version-2 session. The caller checks it with no model running.
 * @param {any} a
 */
export async function closeModel(a) {
  const s = current;
  if (!s) {
    return { refused: 'no session', records: 0, calls: 0, timeouts: 0 };
  }
  settle(s.tick);
  const end = s.tick.frame();
  writeSession(a.dir, {
    session: 'model-session',
    role: s.entry.manifest.role,
    catalog: s.catalog,
    instance: s.instance,
    worldFrom: s.worldName,
    lateQuanta: 0,
    seed: s.seed,
    law: 'product',
    world: s.worldInit,
    calls: s.calls,
    refused: s.refused,
    log: s.tick.log().slice(),
    manifests: { [s.entry.hash]: s.entry.manifest },
    end: { tick: end.tick, hash: end.hash },
    frames: s.frames,
  }, s.records);
  const summary = { refused: s.refused, records: s.records.length, calls: s.calls.length, timeouts: s.timeouts, dir: a.dir };
  current = null;
  return summary;
}
