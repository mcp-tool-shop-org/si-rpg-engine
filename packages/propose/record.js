// Every model call is recorded, and the record, not a rerun of the model, is
// the truth for replay and for CI (T7a pins 6 and 7).
//
// A record holds the rendered messages; every sampling option (seed,
// temperature, top_k, top_p, num_ctx, num_predict, stop) and the format
// schema; the messages' and the schema's SHA-256; the model's digest and
// quantization read from the server at call time; the Ollama version and the
// server settings the client can read, the parallel setting among them; the
// GPU's name and count; the hash of the manifest it was made under; the raw
// output, its SHA-256, and the timing. Its key is the SHA-256 of the canonical
// JSON of everything but the output, its hash, and the timing, so a changed
// model can never match an old record (findings 29, 30). The key names the
// request and all the client can observe of the model and the server; it does
// not promise the same output, since batching on the server is invisible to a
// client and changes outputs (findings 24, 26). So CI never regenerates an
// output: it checks the records.
//
// The seat's deadline is a call's only one (seat.js askWithin). What the
// client can observe of the model, the server, and the GPU is read before the
// call, so a record holds it however the call ends. A call the seat cut off at
// its budget has one form: no output, the budget as its time, and nothing the
// server reported (cutOffTiming). So a timed-out record is the same whichever
// clock would have fired first, and it verifies; a call that returned after
// its budget does not.
//
// A session is a directory the session names: session.json, which is the
// log (seed, world, law, entries, and at its top level the manifests its
// records and entries cite, keyed by hash) with the session's calls and every
// frame hash, and records/<key>.json, one per call. verifySession checks a
// session with no GPU and no model: it imports nothing that calls one, and a
// missing record is a failure, never a reason to ask.

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonical } from '../tick/canonical.js';
import { loadIntentRules } from '../tick/predicates.js';
import { replay } from '../tick/replay.js';
import { catalogFromLog, manifestHash, sha256, validateManifest } from '../tick/roles.js';
import { readRoleOutput, stampProposal } from './parse.js';

/**
 * @typedef {import('../frame/types.js').RoleManifest} RoleManifest
 * @typedef {import('../frame/types.js').LogEntry} LogEntry
 * @typedef {import('./ollama.js').ChatRequest} ChatRequest
 * @typedef {import('./ollama.js').ModelSeen} ModelSeen
 * @typedef {import('./ollama.js').ServerSeen} ServerSeen
 * @typedef {import('./ollama.js').GpuSeen} GpuSeen
 * @typedef {import('./ollama.js').Timing} Timing
 * @typedef {{
 *   record: 1,
 *   session: string,
 *   call: number,
 *   role: string,
 *   manifest: string,
 *   request: ChatRequest,
 *   prompt: string,
 *   schema: string,
 *   timeoutMs: number,
 *   model: ModelSeen,
 *   server: ServerSeen,
 *   gpu: GpuSeen,
 *   output: string | null,
 *   outputSha256: string | null,
 *   timing: Timing,
 * }} CallRecord
 * @typedef {{ call: number, record: string, builtAt: { tick: number, hash: string }, read: string, reason: string | null, admitted: boolean, at: number | null }} CallLine
 * @typedef {{
 *   session: string,
 *   role: string,
 *   catalog: string,
 *   instance: string,
 *   worldFrom: string,
 *   lateQuanta: number,
 *   seed: number,
 *   law: 'product' | 'reference',
 *   world: Parameters<typeof import('../tick/world.js').createWorld>[0],
 *   calls: CallLine[],
 *   refused: string | null,
 *   log: LogEntry[],
 *   manifests: Record<string, RoleManifest>,
 *   frames: string[],
 * }} Session
 */

/** The fields the key does not cover: the output, its hash, and the timing. */
const UNKEYED = ['output', 'outputSha256', 'timing'];

/**
 * A record's key: SHA-256 of the canonical JSON of everything but the output,
 * its hash, and the timing.
 * @param {Record<string, unknown>} record
 */
export function recordKey(record) {
  /** @type {Record<string, unknown>} */
  const keyed = {};
  for (const [name, value] of Object.entries(record)) {
    if (!UNKEYED.includes(name)) {
      keyed[name] = value;
    }
  }
  return sha256(canonical(keyed));
}

/**
 * SHA-256 of a call's rendered messages, as a provenance names its prompt.
 * @param {ChatRequest['messages']} messages
 */
export function promptHash(messages) {
  return sha256(canonical(messages));
}

/**
 * SHA-256 of a call's concrete schema, as a provenance names it.
 * @param {object} format
 */
export function schemaHash(format) {
  return sha256(canonical(format));
}

/**
 * SHA-256 of an output's text, or null for a call that returned none.
 * @param {string | null} output
 */
export function outputHash(output) {
  return output === null ? null : sha256(output);
}

/**
 * The timing of a call the seat cut off at its budget, in its one form: the
 * budget as its time, and nothing the server reported, since no reply was
 * taken. verifySession accepts a timed-out record only in this form.
 * @param {number} ms the call's budget, secondsPerCall in milliseconds
 * @returns {Timing}
 */
export function cutOffTiming(ms) {
  return { ms, timedOut: true, totalDuration: null, loadDuration: null, promptEvalCount: null, promptEvalDuration: null, evalCount: null, evalDuration: null, doneReason: null };
}

/**
 * Writes a session's log and records into its directory.
 * @param {string} dir
 * @param {Session} session
 * @param {CallRecord[]} records
 */
export function writeSession(dir, session, records) {
  mkdirSync(join(dir, 'records'), { recursive: true });
  for (const record of records) {
    writeFileSync(join(dir, 'records', recordKey(record) + '.json'), JSON.stringify(record, null, 2) + '\n');
  }
  writeFileSync(join(dir, 'session.json'), JSON.stringify(session, null, 2) + '\n');
}

/**
 * Reads a session's log and every record in it, by key.
 * @param {string} dir
 * @returns {{ session: Session, records: Map<string, CallRecord> }}
 */
export function readSession(dir) {
  const session = /** @type {Session} */ (JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')));
  /** @type {Map<string, CallRecord>} */
  const records = new Map();
  const folder = join(dir, 'records');
  if (existsSync(folder)) {
    for (const file of readdirSync(folder).sort()) {
      if (file.endsWith('.json')) {
        records.set(file.slice(0, -'.json'.length), /** @type {CallRecord} */ (JSON.parse(readFileSync(join(folder, file), 'utf8'))));
      }
    }
  }
  return { session, records };
}

/**
 * The seven checks of pin 7, over one session, with no GPU and no model. Each
 * failure names what it found; an empty list is a session that verifies.
 *   1. every record's key is recomputed from its content;
 *   2. every record's model digest is the pin in the manifest it cites, as
 *      the session carries that manifest, so a later re-pin breaks nothing;
 *   3. every output matches its hash, the prompt and schema hashes match the
 *      request, and every log entry's provenance matches its record: role,
 *      manifest, model, prompt, schema, and output;
 *   4. every output parses again, with the seat's own parser, to the proposal
 *      the log admitted;
 *   5. every record keeps its role's budgets: calls, output tokens, seconds,
 *      and notes; a call the seat cut off at its budget is accepted in its
 *      one form, and a call that returned after its budget is not;
 *   6. the admitted log replays, gated against its own manifests, to the same
 *      frame hashes;
 *   7. a record the session cites and does not hold is a failure.
 * @param {string} dir
 * @returns {{ failures: string[], records: number, entries: number }}
 */
export function verifySession(dir) {
  /** @type {string[]} */
  const failures = [];
  const { session, records } = readSession(dir);
  const manifests = session.manifests || {};
  /** @type {Map<string, RoleManifest>} */
  const byHash = new Map();
  for (const [hash, manifest] of Object.entries(manifests)) {
    const found = manifestHash(manifest);
    if (found !== hash) {
      failures.push('manifest ' + hash + ' hashes to ' + found);
      continue;
    }
    const checked = validateManifest(manifest);
    if (!checked.ok) {
      failures.push('manifest ' + hash + ' is refused: ' + checked.reason);
      continue;
    }
    byHash.set(hash, checked.manifest);
  }

  /** @type {Map<string, number>} records per manifest, for callsPerSession */
  const perManifest = new Map();
  for (const [key, record] of records) {
    const found = recordKey(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (record)));
    if (found !== key) {
      failures.push('record ' + key + ': its content keys to ' + found);
    }
    const manifest = byHash.get(record.manifest);
    if (!manifest) {
      failures.push('record ' + key + ': cites manifest ' + record.manifest + ', which the session does not carry');
      continue;
    }
    perManifest.set(record.manifest, (perManifest.get(record.manifest) || 0) + 1);
    if (record.role !== manifest.role) {
      failures.push('record ' + key + ': names role ' + record.role + ', and its manifest is ' + manifest.role);
    }
    if (manifest.model === null || record.model.digest !== manifest.model.digest) {
      failures.push('record ' + key + ': model digest ' + record.model.digest + ' is not the pin in manifest ' + record.manifest);
    }
    if (outputHash(record.output) !== record.outputSha256) {
      failures.push('record ' + key + ': its output does not hash to its outputSha256');
    }
    if (promptHash(record.request.messages) !== record.prompt) {
      failures.push('record ' + key + ': its messages do not hash to its prompt');
    }
    if (schemaHash(record.request.format) !== record.schema) {
      failures.push('record ' + key + ': its format does not hash to its schema');
    }
    const budget = manifest.budget;
    if (record.request.options.num_predict !== budget.outputTokens) {
      failures.push('record ' + key + ': num_predict ' + String(record.request.options.num_predict) + ' is not the outputTokens budget of ' + budget.outputTokens);
    }
    if (record.timing.evalCount !== null && record.timing.evalCount > budget.outputTokens) {
      failures.push('record ' + key + ': ' + record.timing.evalCount + ' output tokens, over the budget of ' + budget.outputTokens);
    }
    if (record.timeoutMs !== budget.secondsPerCall * 1000) {
      failures.push('record ' + key + ': a timeout of ' + record.timeoutMs + ' ms is not the secondsPerCall budget of ' + budget.secondsPerCall);
    }
    const budgetMs = budget.secondsPerCall * 1000;
    if (record.timing.timedOut) {
      if (record.output !== null) {
        failures.push('record ' + key + ': a call cut off at its budget holds no output, and this one holds one');
      }
      if (canonical(record.timing) !== canonical(cutOffTiming(budgetMs))) {
        failures.push('record ' + key + ': a call cut off at its budget is recorded at the budget of ' + budgetMs + ' ms, with nothing the server reported');
      }
    } else if (record.timing.ms > budgetMs) {
      failures.push('record ' + key + ': took ' + Math.round(record.timing.ms) + ' ms, over the budget of ' + budget.secondsPerCall + ' s');
    }
    if (record.output !== null) {
      const read = readRoleOutput(record.output, manifest);
      if (read.verdict === 'notes-over-bound') {
        failures.push('record ' + key + ': ' + read.reason);
      }
    }
  }
  for (const [hash, count] of perManifest) {
    const manifest = byHash.get(hash);
    if (manifest && count > manifest.budget.callsPerSession) {
      failures.push('the session made ' + count + ' calls under manifest ' + hash + ', over role ' + manifest.role + '\'s callsPerSession of ' + manifest.budget.callsPerSession);
    }
  }

  for (const line of session.calls || []) {
    if (!records.has(line.record)) {
      failures.push('call ' + line.call + ' cites record ' + line.record + ', which is missing; a missing record is never asked for again');
    }
  }

  const log = session.log || [];
  for (let i = 0; i < log.length; i = i + 1) {
    const entry = log[i];
    const p = entry.provenance;
    if (!p) {
      continue;
    }
    const record = records.get(p.record);
    if (!record) {
      failures.push('log entry ' + i + ' cites record ' + p.record + ', which is missing; a missing record is never asked for again');
      continue;
    }
    /** @type {Array<[string, unknown, unknown]>} */
    const pairs = [
      ['role', p.role, record.role],
      ['manifest', p.manifest, record.manifest],
      ['model', p.model, record.model.digest],
      ['prompt', p.prompt, record.prompt],
      ['schema', p.schema, record.schema],
      ['output', p.output, record.outputSha256],
    ];
    for (const [name, cited, held] of pairs) {
      if (cited !== held) {
        failures.push('log entry ' + i + ': provenance ' + name + ' ' + String(cited) + ' does not match record ' + p.record + ', which holds ' + String(held));
      }
    }
    const manifest = byHash.get(p.manifest);
    if (!manifest || record.output === null) {
      failures.push('log entry ' + i + ': record ' + p.record + ' has no output under a manifest the session carries');
      continue;
    }
    const read = readRoleOutput(record.output, manifest);
    if (read.verdict !== 'ok') {
      failures.push('log entry ' + i + ': the output of record ' + p.record + ' does not parse: ' + read.reason);
      continue;
    }
    const again = stampProposal(read.proposal, p.builtAt);
    if (canonical(again) !== canonical(entry.proposal)) {
      failures.push('log entry ' + i + ': the output of record ' + p.record + ' parses to ' + canonical(again) + ', not the admitted ' + canonical(entry.proposal));
    }
  }

  const carried = catalogFromLog(manifests);
  if (!carried.ok) {
    failures.push('the session\'s manifests are refused: ' + carried.reason);
  } else {
    const catalog = loadIntentRules();
    /** @type {string[]} */
    const frames = [];
    const again = replay({
      seed: session.seed,
      world: session.world,
      rules: catalog.rules,
      retired: catalog.retired,
      log,
      manifests,
      law: session.law,
      until: session.frames.length - 1,
      onFrame: (frame) => {
        frames.push(frame.hash);
      },
    });
    if (!again.ok) {
      failures.push('the log does not replay: entry ' + again.at + ': ' + again.reason);
    } else if (frames.length !== session.frames.length || frames.some((hash, i) => hash !== session.frames[i])) {
      const at = frames.findIndex((hash, i) => hash !== session.frames[i]);
      failures.push('the log replays to other frame hashes, first at tick ' + (at < 0 ? Math.min(frames.length, session.frames.length) : at));
    }
  }
  return { failures, records: records.size, entries: log.filter((entry) => entry.provenance).length };
}

/**
 * How far a reissued output drifts from the recorded one: whether the bytes
 * are the same, the first character where they part, and whether the seat's
 * parser reads the same proposal from both. The drift command reports it by
 * hand, on a GPU; nothing blocks on it.
 * @param {string} key
 * @param {CallRecord} record
 * @param {string | null} fresh
 * @param {RoleManifest | undefined} manifest
 */
export function driftOf(key, record, fresh, manifest) {
  const recorded = record.output === null ? '' : record.output;
  const now = fresh === null ? '' : fresh;
  /** @type {number | null} */
  let firstDifference = null;
  const shorter = Math.min(recorded.length, now.length);
  for (let i = 0; i < shorter; i = i + 1) {
    if (recorded[i] !== now[i]) {
      firstDifference = i;
      break;
    }
  }
  if (firstDifference === null && recorded.length !== now.length) {
    firstDifference = shorter;
  }
  /** @type {boolean | null} */
  let sameProposal = null;
  if (manifest && fresh !== null && record.output !== null) {
    const before = readRoleOutput(record.output, manifest);
    const after = readRoleOutput(fresh, manifest);
    sameProposal = before.verdict === 'ok' && after.verdict === 'ok'
      ? canonical(before.proposal) === canonical(after.proposal)
      : before.verdict === after.verdict;
  }
  return {
    record: key,
    call: record.call,
    same: fresh !== null && record.output !== null && recorded === now,
    firstDifference,
    recordedLength: recorded.length,
    freshLength: now.length,
    sameProposal,
  };
}
