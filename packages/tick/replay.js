// Replay is the seed plus the admitted-input log. The model is not called:
// this file imports nothing that generates a proposal. Each entry names the
// tick it was admitted at and the hash it was admitted against. Replay
// advances to that tick, submits, and checks the hash. It fails at the first
// entry that does not come back.

import { createTick, settle } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';

/**
 * @typedef {import('../frame/types.js').LogEntry} LogEntry
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {import('../frame/types.js').Frame} Frame
 */

/**
 * @param {{
 *   seed: number;
 *   world: Parameters<typeof createWorld>[0];
 *   rules: Map<string, IntentRule>;
 *   retired?: Set<string>;
 *   log: ReadonlyArray<LogEntry>;
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
  const tick = createTick({
    seed: init.seed,
    world: createWorld(init.world, init.law || 'product'),
    rules: init.rules,
    retired: init.retired,
    memory: createMemory(),
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
    const admission = tick.submit(entry.proposal);
    if (!admission.admitted) {
      return { ok: false, at: i, reason: 'replay refused a recorded proposal: ' + admission.reason };
    }
    if (admission.hash !== entry.hash) {
      return { ok: false, at: i, reason: 'hash ' + admission.hash + ' does not match recorded ' + entry.hash };
    }
    hashes.push(admission.hash);
  }
  settle(tick);
  return { ok: true, hashes, final: tick.frame().hash, quanta: tick.frame().tick };
}
