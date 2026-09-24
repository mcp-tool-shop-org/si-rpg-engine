// Replay is the seed plus the admitted-input log. The model is not called:
// this file imports nothing that generates a proposal. Every recorded hash
// must come back, or the replay fails at the first one that does not.

import { createTick } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';

/**
 * @typedef {import('../frame/types.js').LogEntry} LogEntry
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 */

/**
 * @param {{
 *   seed: number;
 *   world: Parameters<typeof createWorld>[0];
 *   rules: Map<string, IntentRule>;
 *   log: ReadonlyArray<LogEntry>;
 * }} init
 * @returns {{ ok: true; hashes: string[] } | { ok: false; at: number; reason: string }}
 */
export function replay(init) {
  const tick = createTick({
    seed: init.seed,
    world: createWorld(init.world),
    rules: init.rules,
    memory: createMemory(),
  });
  /** @type {string[]} */
  const hashes = [];
  for (let i = 0; i < init.log.length; i = i + 1) {
    const entry = init.log[i];
    const admission = tick.submit(entry.proposal);
    if (!admission.admitted) {
      return { ok: false, at: i, reason: 'replay refused a recorded proposal: ' + admission.reason };
    }
    if (admission.hash !== entry.hash) {
      return { ok: false, at: i, reason: 'hash ' + admission.hash + ' does not match recorded ' + entry.hash };
    }
    hashes.push(admission.hash);
  }
  return { ok: true, hashes };
}
