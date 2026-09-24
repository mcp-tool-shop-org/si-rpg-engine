// The proposer seat. It asks, the tick admits or refuses, and the reason
// comes back only when the condition says so. Replay never calls ask.

import { proposalPrompt } from './prompt.js';
import { parseProposal, stamp } from './parse.js';

/**
 * @typedef {import('../frame/types.js').Proposal} Proposal
 * @typedef {{
 *   kind: string | null;
 *   admitted: boolean;
 *   reason: string | null;
 * }} Attempt
 */

/**
 * @param {ReadonlyArray<import('../frame/types.js').LogEntry>} log
 */
function episodesOf(log) {
  /** @type {string[]} */
  const lines = [];
  for (let i = 0; i < log.length; i = i + 1) {
    lines.push('e' + (i + 1) + ' ' + log[i].proposal.kind);
  }
  return lines;
}

/**
 * @param {{
 *   tick: ReturnType<import('../tick/tick.js').createTick>;
 *   ask: (prompt: string) => Promise<string>;
 *   budget: number;
 *   withReason: boolean;
 * }} init
 */
export async function runSeat(init) {
  /** @type {Attempt[]} */
  const attempts = [];
  /** @type {string | null} */
  let lastReason = null;
  for (let i = 0; i < init.budget; i = i + 1) {
    const frame = init.tick.frame();
    const walker = frame.bodies[0];
    const prompt = proposalPrompt({
      tick: frame.tick,
      x: walker.x,
      y: walker.y,
      episodes: episodesOf(init.tick.log()),
      lastReason: init.withReason ? lastReason : null,
    });
    const text = await init.ask(prompt);
    const raw = parseProposal(text);
    const proposal = raw ? stamp(raw, frame.hash) : null;
    if (!proposal) {
      attempts.push({ kind: null, admitted: false, reason: 'unreadable proposal' });
      lastReason = 'unreadable proposal';
      continue;
    }
    const admission = init.tick.submit(proposal);
    attempts.push({
      kind: proposal.kind,
      admitted: admission.admitted,
      reason: admission.admitted ? null : admission.reason,
    });
    lastReason = admission.admitted ? null : admission.reason;
  }
  const admitted = attempts.filter((attempt) => attempt.admitted).length;
  return {
    budget: init.budget,
    withReason: init.withReason,
    admitted,
    rate: admitted / init.budget,
    attempts,
    log: init.tick.log(),
  };
}
