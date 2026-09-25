// One product-law run of a mind script. The fixture stores the frames and the
// behaviour numbers this returns.
// Sight episodes are derived: the admitted log does not contain them, and a
// second run from that log builds the same episodes and beliefs.

import { createTick, settle } from '../packages/tick/tick.js';
import { createWorld } from '../packages/tick/world.js';
import { createMemory } from '../packages/tick/memory.js';
import { subjectText } from '../packages/tick/beliefs.js';
import { finalPositions, sleepWatch } from './behaviour.mjs';

/**
 * @param {ReturnType<typeof createMemory>} memory
 * @param {ReturnType<typeof createWorld>} world
 */
export function mindSnapshot(memory, world) {
  return (world.minds || []).map((mind) => ({
    mind: mind.body,
    beliefs: memory.mindBeliefs(mind.body).map((item) => ({
      id: item.id,
      subject: subjectText(item.subject),
      key: item.key,
      value: item.value,
      confidence: item.confidence,
      source: item.source,
      supersededBy: item.supersededBy || null,
      withdrawnBy: item.withdrawnBy || null,
    })),
  }));
}

/**
 * @param {ReturnType<typeof createMemory>} memory
 */
function episodeSnapshot(memory) {
  return memory.episodes.map((item) => ({
    id: item.id,
    tick: item.tick,
    kind: item.kind,
    detail: item.detail,
  }));
}

/**
 * @typedef {{ id: string, tick: number, kind: string, detail: string }} MindEpisode
 * @typedef {{ id: string, subject: string, key: string, value: string | number | boolean, source: string, supersededBy: string | null }} MindBeliefRow
 * @typedef {{ mind: string, beliefs: MindBeliefRow[] }} MindBeliefList
 * @typedef {{ ok: true, frames: { tick: number, hash: string }[], episodes: MindEpisode[], beliefs: MindBeliefList[], goals: unknown[], log: { tick: number, hash: string, proposal: import('../packages/frame/types.js').Proposal }[], reasons: string[], bodies: import('../packages/frame/types.js').Body[], behaviour: import('./behaviour.mjs').CaseBehaviour } | { ok: false, reason: string, frames: { tick: number, hash: string }[], episodes: MindEpisode[], beliefs: MindBeliefList[], goals: unknown[], log: { tick: number, hash: string, proposal: import('../packages/frame/types.js').Proposal }[], reasons: string[], bodies: import('../packages/frame/types.js').Body[] }} MindPlay
 */

/**
 * @param {{ seed: number, world: Parameters<typeof createWorld>[0], script: Array<Record<string, unknown>> }} spec
 * @param {Map<string, import('../packages/frame/types.js').IntentRule>} rules
 * @returns {MindPlay}
 */
export function playMinds(spec, rules) {
  const world = createWorld(spec.world);
  const memory = createMemory();
  const tick = createTick({ seed: spec.seed, world, rules, memory });
  /** @type {{ tick: number, hash: string }[]} */
  const frames = [];
  const watch = sleepWatch(world, world.bodies.map((body) => body.id));
  tick.attach({
    draw(frame) {
      frames.push({ tick: frame.tick, hash: frame.hash });
      watch.see(frame.tick);
    },
  });
  /** @type {string[]} */
  const reasons = [];
  for (const step of spec.script) {
    if (typeof step.waitSleep === 'string') {
      for (let i = 0; i < 128 && !world.sleeping(step.waitSleep); i = i + 1) {
        tick.advance();
      }
      if (!world.sleeping(step.waitSleep)) {
        return fail(step.waitSleep + ' did not sleep', frames, memory, world, reasons);
      }
      continue;
    }
    if (typeof step.advance === 'number') {
      for (let i = 0; i < step.advance; i = i + 1) {
        tick.advance();
      }
      continue;
    }
    /** @type {import('../packages/frame/types.js').Proposal | null} */
    let proposal = null;
    if (typeof step.verb === 'string') {
      proposal = {
        kind: 'intent',
        verb: step.verb,
        actor: /** @type {string} */ (step.actor),
        target: /** @type {import('../packages/frame/types.js').Intent['target']} */ (step.target),
        frameHash: tick.frame().hash,
      };
    } else if (step.stale && typeof step.stale === 'object') {
      const stale = /** @type {{ mind?: string, subject: { body?: string, zone?: string }, key: string, value: string | number | boolean }} */ (step.stale);
      const mind = stale.mind || 'watcher';
      const list = memory.mindBeliefs(mind);
      /** @type {import('../packages/frame/types.js').Belief | null} */
      let current = null;
      for (let i = list.length - 1; i >= 0; i = i - 1) {
        const item = list[i];
        if (!item.supersededBy && item.key === stale.key && subjectText(item.subject) === subjectText(stale.subject)) {
          current = item;
          break;
        }
      }
      if (!current) {
        return fail('no belief to supersede', frames, memory, world, reasons);
      }
      proposal = {
        kind: 'belief',
        mind,
        subject: /** @type {import('../packages/frame/types.js').BeliefWrite['subject']} */ (stale.subject),
        key: stale.key,
        value: stale.value,
        confidence: 1,
        source: 'e1',
        supersedes: current.id,
        withdrawnBy: 'e1',
      };
    } else if (step.belief && typeof step.belief === 'object') {
      proposal = /** @type {import('../packages/frame/types.js').BeliefWrite} */ ({
        kind: 'belief',
        .../** @type {object} */ (step.belief),
      });
    }
    if (!proposal) {
      return fail('unknown script step', frames, memory, world, reasons);
    }
    const result = tick.submit(proposal);
    if (result.admitted !== step.admit) {
      return fail((step.verb || step.belief && /** @type {{ key?: string }} */ (step.belief).key || 'stale') + ' admit ' + result.admitted + ' ' + (result.admitted ? '' : result.reason), frames, memory, world, reasons);
    }
    if (!result.admitted) {
      reasons.push(result.reason);
      if (typeof step.reason === 'string' && result.reason !== step.reason && !result.reason.includes(step.reason)) {
        return fail('reason ' + result.reason, frames, memory, world, reasons);
      }
      continue;
    }
    settle(tick);
  }
  return {
    ok: true,
    frames,
    episodes: episodeSnapshot(memory),
    beliefs: mindSnapshot(memory, world),
    goals: (world.minds || []).map((mind) => ({ mind: mind.body, goals: world.goalsOf(mind.body) })),
    log: tick.log().map((entry) => ({ tick: entry.tick, hash: entry.hash, proposal: entry.proposal })),
    reasons,
    bodies: world.bodies,
    behaviour: { sleep: watch.sleep(), final: finalPositions(world.bodies) },
  };
}

/**
 * @param {string} reason
 * @param {{ tick: number, hash: string }[]} frames
 * @param {ReturnType<typeof createMemory>} memory
 * @param {ReturnType<typeof createWorld>} world
 * @param {string[]} reasons
 */
function fail(reason, frames, memory, world, reasons) {
  return {
    ok: /** @type {false} */ (false),
    reason,
    frames,
    episodes: episodeSnapshot(memory),
    beliefs: mindSnapshot(memory, world),
    goals: [],
    log: [],
    reasons,
    bodies: world.bodies,
  };
}

/**
 * Replay admits the log and nothing else. Sight is rebuilt by the tick.
 * @param {{ seed: number, world: Parameters<typeof createWorld>[0] }} spec
 * @param {Map<string, import('../packages/frame/types.js').IntentRule>} rules
 * @param {ReadonlyArray<{ tick: number, hash: string, proposal: import('../packages/frame/types.js').Proposal }>} log
 * @returns {{ ok: true, episodes: MindEpisode[], beliefs: MindBeliefList[], goals: unknown[] } | { ok: false, reason: string }}
 */
export function replayMinds(spec, rules, log) {
  const world = createWorld(spec.world);
  const memory = createMemory();
  const tick = createTick({ seed: spec.seed, world, rules, memory });
  for (let i = 0; i < log.length; i = i + 1) {
    const entry = log[i];
    while (tick.frame().tick < entry.tick) {
      tick.advance();
    }
    if (tick.frame().tick !== entry.tick) {
      return { ok: false, reason: 'replay is at ' + tick.frame().tick + ' for entry ' + i };
    }
    const result = tick.submit(entry.proposal);
    if (!result.admitted) {
      return { ok: false, reason: 'replay refused a recorded proposal: ' + result.reason };
    }
    if (result.hash !== entry.hash) {
      return { ok: false, reason: 'hash ' + result.hash + ' does not match recorded ' + entry.hash };
    }
  }
  settle(tick);
  return {
    ok: true,
    episodes: episodeSnapshot(memory),
    beliefs: mindSnapshot(memory, world),
    goals: (world.minds || []).map((mind) => ({ mind: mind.body, goals: world.goalsOf(mind.body) })),
  };
}
