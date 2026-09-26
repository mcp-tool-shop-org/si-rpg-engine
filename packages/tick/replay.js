// Replay is the seed plus the admitted-input log. The model is not called:
// this file imports nothing that generates a proposal. Each entry names the
// tick it was admitted at and the hash it was admitted against. Replay
// advances to that tick, submits, and checks the hash. It fails at the first
// entry that does not come back.
//
// A role's entry carries its provenance (T7a pin 4), and the log carries, at
// its top level, the manifests its entries cite, keyed by hash. Replay gates
// each such entry against the manifest as it was when the log was recorded,
// never against today's catalog, and still calls no model: a role frozen
// since the log was written replays to the same hashes.
//
// An entry's hash is the frame it was admitted against, taken before its
// provenance is mixed, so only a later frame's hash holds that provenance. A
// log that carries manifests therefore also carries its end: the tick and
// hash of the last frame its recording reached, a frame after its last entry.
// Replay reaches that tick and checks the hash, so an edit to any entry's
// provenance, the last entry's included, is refused by replay alone. A log
// without provenance keeps its old form, with no end.

import { catalogFromLog } from './roles.js';
import { createTick, settle } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';

/**
 * @typedef {import('../frame/types.js').LogEntry} LogEntry
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {import('../frame/types.js').Frame} Frame
 */

/** A frame's hash: sixteen lowercase hex digits (frame/hash.js). */
const FRAME_HASH = /^[0-9a-f]{16}$/;

/**
 * Why a log's end is not the tick and hash of a frame after its last entry, or null.
 * @param {unknown} end
 * @param {ReadonlyArray<LogEntry>} log
 * @returns {string | null}
 */
function endProblem(end, log) {
  const e = /** @type {Record<string, unknown>} */ (end);
  if (e === null || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).sort().join(',') !== 'hash,tick'
    || typeof e.tick !== 'number' || !Number.isInteger(e.tick) || e.tick < 0
    || typeof e.hash !== 'string' || !FRAME_HASH.test(e.hash)) {
    return 'a log\'s end is { tick, hash }: the tick and hash of the last frame its recording reached';
  }
  const last = log.length > 0 ? log[log.length - 1] : null;
  if (last !== null && !(e.tick > last.tick)) {
    return 'the log ends at tick ' + e.tick + ', and its last entry is at tick ' + last.tick + ': its end is a frame after its last entry, whose hash holds every entry\'s provenance';
  }
  return null;
}

/**
 * @param {{
 *   seed: number;
 *   world: Parameters<typeof createWorld>[0];
 *   rules: Map<string, IntentRule>;
 *   retired?: Set<string>;
 *   log: ReadonlyArray<LogEntry>;
 *   manifests?: unknown;
 *   end?: unknown;
 *   until?: number;
 *   onFrame?: (frame: Frame) => void;
 *   law?: 'product' | 'box' | 'reference';
 * }} init
 * @returns {{ ok: true; hashes: string[]; final: string; quanta: number } | { ok: false; at: number; reason: string }}
 */
export function replay(init) {
  for (let i = 0; i < init.world.bodies.length; i = i + 1) {
    const body = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (init.world.bodies[i]));
    if (body.hw !== undefined || body.hh !== undefined || typeof body.z !== 'number') {
      return { ok: false, at: 0, reason: 'a body record is three-dimensional' };
    }
  }
  /** @type {import('./roles.js').Catalog | undefined} */
  let roles;
  if (init.manifests !== undefined) {
    const carried = catalogFromLog(init.manifests);
    if (!carried.ok) {
      return { ok: false, at: 0, reason: 'the log\'s manifests are refused: ' + carried.reason };
    }
    roles = carried.catalog;
  }
  /** @type {{ tick: number, hash: string } | undefined} */
  let end;
  if (init.end !== undefined) {
    const problem = endProblem(init.end, init.log);
    if (problem !== null) {
      return { ok: false, at: 0, reason: problem };
    }
    end = /** @type {{ tick: number, hash: string }} */ (init.end);
  } else if (init.manifests !== undefined) {
    return { ok: false, at: 0, reason: 'a log that carries manifests carries its end: the tick and hash of the last frame its recording reached' };
  }
  const tick = createTick({
    seed: init.seed,
    world: createWorld(init.world, init.law || 'product'),
    rules: init.rules,
    retired: init.retired,
    memory: createMemory(),
    roles,
  });
  if (init.onFrame) {
    tick.attach({ draw: init.onFrame });
  }
  /** @type {string[]} */
  const hashes = [];
  for (let i = 0; i < init.log.length; i = i + 1) {
    const entry = init.log[i];
    while (tick.frame().tick < entry.tick) {
      tick.advance();
    }
    if (tick.frame().tick > entry.tick) {
      return { ok: false, at: i, reason: 'entry ' + i + ' was admitted at tick ' + entry.tick + ' but replay is already at ' + tick.frame().tick };
    }
    const admission = tick.submit(entry.proposal, entry.provenance);
    if (!admission.admitted) {
      return { ok: false, at: i, reason: 'replay refused a recorded proposal: ' + admission.reason };
    }
    if (admission.hash !== entry.hash) {
      return { ok: false, at: i, reason: 'hash ' + admission.hash + ' does not match recorded ' + entry.hash };
    }
    hashes.push(admission.hash);
  }
  if (end !== undefined) {
    while (tick.frame().tick < end.tick) {
      tick.advance();
    }
    if (tick.frame().hash !== end.hash) {
      return { ok: false, at: init.log.length, reason: 'the log ends at tick ' + end.tick + ' with hash ' + end.hash + ', and the replay reached ' + tick.frame().hash + ' there' };
    }
  }
  settle(tick);
  // A run can step on past its last admission, idle, as a session does while
  // a call it refused was out; `until` names the tick it reached.
  while (init.until !== undefined && tick.frame().tick < init.until) {
    tick.advance();
  }
  return { ok: true, hashes, final: tick.frame().hash, quanta: tick.frame().tick };
}
