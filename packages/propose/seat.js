// The proposer seat. Both conditions see the previous proposal and its
// verdict. Only one sees the checker's reason. Replay never calls ask.

import { proposalPrompt } from './prompt.js';
import { readProposal } from './parse.js';
import { proposalSchema } from './schema.js';

/**
 * @typedef {import('../frame/types.js').Proposal} Proposal
 * @typedef {{
 *   seed: number;
 *   prompt: string;
 *   raw: string;
 *   verdict: 'ok' | 'not-json' | 'wrong-shape';
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
 * @param {Proposal} proposal
 */
function previousText(proposal) {
  if (proposal.kind === 'intent') {
    return JSON.stringify({ kind: 'intent', verb: proposal.verb, actor: proposal.actor, target: proposal.target });
  }
  return JSON.stringify(proposal);
}

/**
 * @param {{
 *   tick: ReturnType<import('../tick/tick.js').createTick>;
 *   ask: (prompt: string, call: { schema: object, seed: number, temperature: number }) => Promise<string>;
 *   budget: number;
 *   withReason: boolean;
 *   verbs: string[];
 *   seedBase: number;
 *   temperature: number;
 * }} init
 */
export async function runSeat(init) {
  /** @type {Attempt[]} */
  const attempts = [];
  /** @type {string | null} */
  let previous = null;
  /** @type {'admitted' | 'rejected' | null} */
  let verdict = null;
  /** @type {string | null} */
  let lastReason = null;
  for (let i = 0; i < init.budget; i = i + 1) {
    const frame = init.tick.frame();
    const walker = frame.bodies[0];
    const actors = frame.bodies.map((body) => body.id);
    const schema = proposalSchema(init.verbs, actors);
    const seed = init.seedBase + i;
    const prompt = proposalPrompt({
      tick: frame.tick,
      x: walker.x,
      y: walker.y,
      episodes: episodesOf(init.tick.log()),
      previous,
      verdict,
      lastReason: init.withReason ? lastReason : null,
    });
    const raw = await init.ask(prompt, { schema, seed, temperature: init.temperature });
    const read = readProposal(raw, frame.hash);
    if (read.verdict !== 'ok') {
      attempts.push({
        seed,
        prompt,
        raw,
        verdict: read.verdict,
        kind: null,
        admitted: false,
        reason: read.verdict,
      });
      previous = raw;
      verdict = 'rejected';
      lastReason = read.verdict;
      continue;
    }
    const admission = init.tick.submit(read.proposal);
    attempts.push({
      seed,
      prompt,
      raw,
      verdict: 'ok',
      kind: read.proposal.kind,
      admitted: admission.admitted,
      reason: admission.admitted ? null : admission.reason,
    });
    previous = previousText(read.proposal);
    verdict = admission.admitted ? 'admitted' : 'rejected';
    lastReason = admission.admitted ? null : admission.reason;
  }
  const admitted = attempts.filter((attempt) => attempt.admitted).length;
  return {
    budget: init.budget,
    withReason: init.withReason,
    seedBase: init.seedBase,
    temperature: init.temperature,
    admitted,
    rate: admitted / init.budget,
    attempts,
    log: init.tick.log(),
  };
}
