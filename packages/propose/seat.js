// The proposer seat. Both conditions see the previous proposal and its
// verdict. Only one sees the checker's reason. Replay never calls ask.

import { settle } from '../tick/tick.js';
import { proposalPrompt } from './prompt.js';
import { readProposal } from './parse.js';
import { proposalSchema } from './schema.js';
import { goalText, obstacleText } from './scene.js';

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
 *   x: number;
 *   y: number;
 *   z: number;
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
    const actors = frame.bodies.map((body) => body.id);
    const sources = [];
    for (let n = 0; n < init.tick.log().length; n = n + 1) {
      sources.push('e' + (n + 1));
    }
    const schema = proposalSchema(init.verbs, actors, sources);
    const seed = init.seedBase + i;
    const prompt = proposalPrompt({
      tick: frame.tick,
      bodies: frame.bodies.map((body) => ({
        id: body.id, x: body.x, y: body.y, z: body.z, hx: body.hx, hy: body.hy, hz: body.hz,
      })),
      episodes: episodesOf(init.tick.log()),
      goal: goalText(),
      obstacle: obstacleText(),
      previous,
      verdict,
      lastReason: init.withReason ? lastReason : null,
    });
    const raw = await init.ask(prompt, { schema, seed, temperature: init.temperature });
    const read = readProposal(raw, frame.hash, actors);
    const place = () => {
      const after = init.tick.frame().bodies[0];
      return { x: after.x, y: after.y, z: after.z };
    };
    if (read.verdict !== 'ok') {
      const at = place();
      attempts.push({
        seed,
        prompt,
        raw,
        verdict: read.verdict,
        kind: null,
        admitted: false,
        reason: read.verdict,
        x: at.x,
        y: at.y,
        z: at.z,
      });
      previous = raw;
      verdict = 'rejected';
      lastReason = read.verdict;
      continue;
    }
    const admission = init.tick.submit(read.proposal);
    settle(init.tick);
    const at = place();
    attempts.push({
      seed,
      prompt,
      raw,
      verdict: 'ok',
      kind: read.proposal.kind,
      admitted: admission.admitted,
      reason: admission.admitted ? null : admission.reason,
      x: at.x,
      y: at.y,
      z: at.z,
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
