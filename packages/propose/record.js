// Every model call is recorded, however it ends, and the record, not a rerun
// of the model, is the truth for replay and for CI (T7a pins 6 and 7, #87).
//
// A record holds the rendered messages; every sampling option (seed,
// temperature, top_k, top_p, num_ctx, num_predict, stop) and the format
// schema; the messages' and the schema's SHA-256; the model's digest and
// quantization read from the server at call time; the Ollama version; the
// model as the server holds it loaded; the client's own environment, the
// parallel setting among it; the GPU's name and count; the hash of the
// manifest it was made under; the raw output, its SHA-256, and the timing.
// Its key is the SHA-256 of the canonical JSON of everything but the output,
// its hash, and the timing, so a changed model can never match an old record
// (findings 29, 30). The key names the request and all the client can observe
// of the model and the server; it does not promise the same output, since
// batching on the server is invisible to a client and changes outputs
// (findings 24, 26). So CI never regenerates an output: it checks the records.
//
// A record is at version 2 (#87). The loaded model is read twice, before the
// call (server.loadedBefore) and after it ends, however it ends
// (server.loaded), so a model swapped while a call is out is seen; either
// reading naming a digest other than the pin makes the call read
// model-changed. A reading the client did not make, or one that failed or
// timed out, is the string `unread`, since null means the model was not
// loaded. The variables the client's environment names are its own
// (client.environment), with the one call at once it keeps
// (client.callsAtOnce): nothing in a version-2 record says they are the
// server's. `failure` is null for a call that ended, or what its reads or its
// ask threw. The committed probe sessions were made at version 1, at f06470d,
// when the one reading of the loaded model was taken after the call and the
// client's environment was named the server's settings. They verify under the
// rules they were made under, and their keys do not move.
//
// The seat's deadline is a call's only one (seat.js askWithin). What the
// client can observe of the model, the server, and the GPU is read before the
// call, so a record holds it however the call ends. A call the seat cut off at
// its budget has one form: no output, the budget as its time, and nothing the
// server reported (cutOffTiming). So a timed-out record is the same whichever
// clock would have fired first, and it verifies; a call that returned after
// its budget does not. A call that failed has one form too: no output,
// nothing the server reported, and the time from its ask to the ask's
// rejection, 0 when it failed before it was asked (failedTiming).
//
// How a call reads from its record, and so what its call line says, is one
// function, callRead, which the seat applies as it makes the record and
// verifySession applies again to check the line.
//
// A session is a directory the session names: session.json, which is the
// log (seed, world, law, entries, and at its top level the manifests its
// records and entries cite, keyed by hash, and its end, the tick and hash of
// the last frame it reached) with the session's calls and every frame hash,
// and records/<key>.json, one per call. verifySession checks a
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
 * @typedef {import('./parse.js').RoleProposal} RoleProposal
 * @typedef {import('./ollama.js').ChatRequest} ChatRequest
 * @typedef {import('./ollama.js').ModelSeen} ModelSeen
 * @typedef {import('./ollama.js').Loaded} Loaded
 * @typedef {import('./ollama.js').GpuSeen} GpuSeen
 * @typedef {import('./ollama.js').Timing} Timing
 * @typedef {'unread'} Unread a reading the client did not make, or one that failed or timed out
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
 *   server: { version: string, settings: Record<string, string | null>, loaded: Loaded, callsAtOnce: 1 },
 *   gpu: GpuSeen,
 *   output: string | null,
 *   outputSha256: string | null,
 *   timing: Timing,
 * }} CallRecord1 a record made at version 1: one reading of the loaded model, taken after the call, and the client's environment under the name server.settings
 * @typedef {{
 *   model: ModelSeen | Unread,
 *   server: { version: string | Unread, loadedBefore: Loaded | Unread, loaded: Loaded | Unread },
 *   client: { environment: Record<string, string | null> | Unread, callsAtOnce: 1 },
 *   gpu: GpuSeen | Unread,
 * }} Readings what the client read of the model, the server, itself, and the GPU for one call, each reading or unread
 * @typedef {{
 *   record: 2,
 *   session: string,
 *   call: number,
 *   role: string,
 *   manifest: string,
 *   request: ChatRequest,
 *   prompt: string,
 *   schema: string,
 *   timeoutMs: number,
 *   model: Readings['model'],
 *   server: Readings['server'],
 *   client: Readings['client'],
 *   gpu: Readings['gpu'],
 *   failure: string | null,
 *   output: string | null,
 *   outputSha256: string | null,
 *   timing: Timing,
 * }} CallRecord2 a record made at version 2 (#87)
 * @typedef {CallRecord1 | CallRecord2} CallRecord
 * @typedef {{ read: 'ok', proposal: RoleProposal } | { read: string, reason: string }} CallRead how a call reads from its record: its proposal, or why it proposes nothing
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
 *   end: { tick: number, hash: string },
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
 * The timing of a call that failed, in its one form: the time from its ask to
 * the ask's rejection, 0 when the call failed before it was asked, and
 * nothing the server reported, since no reply was taken. verifySession
 * accepts a failed record only in this form.
 * @param {number} ms
 * @returns {Timing}
 */
export function failedTiming(ms) {
  return { ms, timedOut: false, totalDuration: null, loadDuration: null, promptEvalCount: null, promptEvalDuration: null, evalCount: null, evalDuration: null, doneReason: null };
}

/** @param {unknown} value */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The model digest a record read from the server's model list, or null when
 * it read none.
 * @param {CallRecord} record
 * @returns {string | null}
 */
export function digestOf(record) {
  return isObject(record.model) && typeof (/** @type {ModelSeen} */ (record.model)).digest === 'string' ? (/** @type {ModelSeen} */ (record.model)).digest : null;
}

/**
 * Why a call's readings of the loaded model name a model other than the pin,
 * or null. A version-1 record holds one reading, taken after the call, and is
 * read by the rule it was made under. A version-2 record holds two, before
 * and after the call, and either naming a digest other than the pin is a
 * change. A model not loaded (null) or a reading not made (unread) names no
 * digest, so it is no change: a model not loaded before the call is loaded
 * by it.
 * @param {CallRecord} record
 * @param {string} pin
 * @returns {string | null}
 */
export function modelChange(record, pin) {
  /** @type {Array<[string, unknown]>} */
  const readings = record.record === 1
    ? [['', record.server.loaded]]
    : [[' before the call', record.server.loadedBefore], [' after the call', record.server.loaded]];
  for (const [when, reading] of readings) {
    const digest = isObject(reading) ? (/** @type {Record<string, unknown>} */ (reading)).digest : undefined;
    if (typeof digest === 'string' && digest !== pin) {
      return 'the server held ' + digest + ' loaded' + when + ', not the pin';
    }
  }
  return null;
}

/**
 * How a call reads from its record, by the rules the seat applies as it
 * makes the record (seat.js runSession) and verifySession applies again to
 * check the call's line. In order: a call that failed reads call-failed, with
 * its failure as the reason, and, when a reading names another model, that
 * change named with the failure; one cut off at its budget, timed-out; one whose
 * reply held nothing, no-output; one whose readings of the loaded model name
 * another model, model-changed; and otherwise what the seat's parser reads of
 * the output under the manifest, whose proposal is what the seat submits.
 * @param {CallRecord} record
 * @param {RoleManifest} manifest the manifest the record cites
 * @returns {CallRead}
 */
export function callRead(record, manifest) {
  if (record.record === 2 && record.failure !== null) {
    // The failure is still read first. A reading that names another model is
    // named with it; a reading of the pin leaves the reason as the failure.
    const changed = manifest.model === null ? null : modelChange(record, manifest.model.digest);
    return { read: 'call-failed', reason: changed === null ? record.failure : record.failure + '; ' + changed };
  }
  if (record.timing.timedOut) {
    return { read: 'timed-out', reason: 'no output within ' + manifest.budget.secondsPerCall + ' s' };
  }
  if (record.output === null) {
    return { read: 'no-output', reason: 'the reply held no output' };
  }
  const changed = manifest.model === null ? null : modelChange(record, manifest.model.digest);
  if (changed !== null) {
    return { read: 'model-changed', reason: changed };
  }
  const read = readRoleOutput(record.output, manifest);
  if (read.verdict !== 'ok') {
    return { read: read.verdict, reason: read.reason };
  }
  return { read: 'ok', proposal: read.proposal };
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
 * The seven checks of pin 7 over one session, and the check of its call lines
 * (#87 pin 6), with no GPU and no model. Each failure names what it found; an
 * empty list is a session that verifies.
 *   1. every record's key is recomputed from its content, and its version is
 *      1 or 2, each read by the rules it was made under;
 *   2. every record's model digest is the pin in the manifest it cites, as
 *      the session carries that manifest, so a later re-pin breaks nothing;
 *      a record that read no model is a call that failed before it was asked;
 *   3. every output matches its hash, the prompt and schema hashes match the
 *      request, and every log entry's provenance matches its record: role,
 *      manifest, model, prompt, schema, and output;
 *   4. every output parses again, with the seat's own parser, to the proposal
 *      the log admitted;
 *   5. every record keeps its role's budgets: calls, output tokens, seconds,
 *      and notes; a call the seat cut off at its budget is accepted in its
 *      one form, and so is a call that failed, and a call that returned
 *      after its budget is not;
 *   6. the admitted log replays, gated against its own manifests, to the same
 *      frame hashes, and to its end, which is the session's last frame;
 *   7. a record the session cites and does not hold is a failure;
 *   8. every call line agrees with its record and the log. Lines are numbered
 *      from 0 in order, each its record's call. Its builtAt is a frame of the
 *      session, at its tick with its hash, and an admitted line's is the frame
 *      its log entry was built from. Its read and reason are what callRead
 *      gives of its record under the manifest it cites; for a line whose
 *      record reads ok, the reason is null if it was admitted, and otherwise
 *      the checker's refusal, which neither the record nor the log holds, so
 *      it is checked only to name one. An admitted line's log entry is at its
 *      `at` and cites its record; a line not admitted has no entry and no
 *      `at`. Every admission in the log is a call line's.
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
    const version = /** @type {unknown} */ (record.record);
    if (version !== 1 && version !== 2) {
      failures.push('record ' + key + ': version ' + String(version) + ' is not one this check reads, 1 or 2');
      continue;
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
    const digest = digestOf(record);
    if (digest === null) {
      if (!(record.record === 2 && record.model === 'unread' && record.failure !== null)) {
        failures.push('record ' + key + ': it read no model, and only a call that failed before it was asked holds none');
      }
    } else if (manifest.model === null || digest !== manifest.model.digest) {
      failures.push('record ' + key + ': model digest ' + digest + ' is not the pin in manifest ' + record.manifest);
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
    if (record.record === 2 && record.failure !== null) {
      if (typeof record.failure !== 'string' || record.failure.length === 0) {
        failures.push('record ' + key + ': its failure is null or what the call threw, and it is ' + JSON.stringify(record.failure));
      }
      if (record.output !== null) {
        failures.push('record ' + key + ': a call that failed holds no output, and this one holds one');
      }
      const ms = /** @type {unknown} */ (record.timing.ms);
      if (typeof ms !== 'number' || ms < 0 || canonical(record.timing) !== canonical(failedTiming(ms))) {
        failures.push('record ' + key + ': a call that failed is recorded with the time from its ask to the ask\'s rejection, and nothing the server reported');
      }
    }
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

  const log = session.log || [];
  /** @type {Map<string, number[]>} the log entries whose provenance cites each record */
  const citing = new Map();
  for (let i = 0; i < log.length; i = i + 1) {
    const p = log[i].provenance;
    if (p) {
      citing.set(p.record, [...(citing.get(p.record) || []), i]);
    }
  }
  /** @type {Set<number>} the log entries an admitted call line accounts for */
  const accounted = new Set();
  const lines = session.calls || [];
  for (let index = 0; index < lines.length; index = index + 1) {
    const line = lines[index];
    const at = 'call ' + line.call + ': ';
    const record = records.get(line.record);
    if (!record) {
      failures.push('call ' + line.call + ' cites record ' + line.record + ', which is missing; a missing record is never asked for again');
    }
    if (line.call !== index) {
      failures.push(at + 'it is line ' + index + ' of the session, whose calls are numbered from 0 in order');
    }
    if (record && record.call !== line.call) {
      failures.push(at + 'record ' + line.record + ' is call ' + record.call);
    }
    const built = line.builtAt;
    const tick = built && Number.isInteger(built.tick) ? built.tick : -1;
    const framed = tick >= 0 && tick < session.frames.length;
    if (!built || !framed || session.frames[tick] !== built.hash) {
      failures.push(at + 'builtAt tick ' + (built ? built.tick : 'none') + ' ' + (built ? built.hash : 'none') + ' is not a frame of the session' + (framed ? ', whose frame at tick ' + tick + ' is ' + session.frames[tick] : ''));
    }
    const manifest = record ? byHash.get(record.manifest) : undefined;
    if (record && manifest && (record.record === 1 || record.record === 2)) {
      const read = callRead(record, manifest);
      if (line.read !== read.read) {
        failures.push(at + 'read ' + line.read + ', and record ' + line.record + ' reads ' + read.read);
      }
      if (!('proposal' in read)) {
        if (line.reason !== read.reason) {
          failures.push(at + 'reason ' + JSON.stringify(line.reason) + ', and record ' + line.record + ' gives ' + JSON.stringify(read.reason));
        }
      } else if (line.admitted === true) {
        if (line.reason !== null) {
          failures.push(at + 'reason ' + JSON.stringify(line.reason) + ', and an admitted call has none');
        }
      } else if (typeof line.reason !== 'string' || line.reason.length === 0) {
        failures.push(at + 'reason ' + JSON.stringify(line.reason) + ', and a call the checker refused names its refusal');
      }
    }
    const entries = citing.get(line.record) || [];
    if (line.admitted === true) {
      const hit = entries.find((i) => log[i].tick === line.at);
      if (entries.length === 0) {
        failures.push(at + 'admitted true, and no log entry cites record ' + line.record);
      } else if (hit === undefined) {
        failures.push(at + 'at ' + String(line.at) + ', and log entry ' + entries[0] + ' admits record ' + line.record + ' at tick ' + log[entries[0]].tick);
      } else {
        accounted.add(hit);
        const from = /** @type {NonNullable<LogEntry['provenance']>} */ (log[hit].provenance).builtAt;
        if (built && from && (built.tick !== from.tick || built.hash !== from.hash)) {
          failures.push(at + 'builtAt tick ' + built.tick + ' ' + built.hash + ' is not the frame log entry ' + hit + ' was built from, tick ' + from.tick + ' ' + from.hash);
        }
      }
    } else if (line.admitted === false) {
      if (entries.length > 0) {
        failures.push(at + 'admitted false, and log entry ' + entries[0] + ' cites record ' + line.record);
      }
      if (line.at !== null) {
        failures.push(at + 'at ' + String(line.at) + ', and a call not admitted has no tick');
      }
    } else {
      failures.push(at + 'admitted ' + JSON.stringify(line.admitted) + ', and admitted is true or false');
    }
  }
  for (let i = 0; i < log.length; i = i + 1) {
    const p = log[i].provenance;
    if (p && !accounted.has(i)) {
      failures.push('log entry ' + i + ': no call line admits record ' + p.record + ' at tick ' + log[i].tick);
    }
  }

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
      ['model', p.model, digestOf(record)],
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

  const lastFrame = session.frames.length - 1;
  const end = session.end;
  if (!end || end.tick !== lastFrame || end.hash !== session.frames[lastFrame]) {
    failures.push('the session\'s end, ' + (end ? 'tick ' + end.tick + ' ' + end.hash : 'missing') + ', is not its last frame, tick ' + lastFrame + ' ' + session.frames[lastFrame]);
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
      end: session.end,
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
