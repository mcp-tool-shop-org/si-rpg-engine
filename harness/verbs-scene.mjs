// One product-law run of a verb script. The fixture stores the frames and the
// behaviour numbers this returns.

import { createTick, settle } from '../packages/tick/tick.js';
import { createWorld } from '../packages/tick/world.js';
import { createMemory } from '../packages/tick/memory.js';
import { finalPositions, sleepWatch } from './behaviour.mjs';

/**
 * @typedef {(tick: number, hash: string, world: ReturnType<typeof createWorld>, memory: ReturnType<typeof createMemory>) => void} FrameVisit
 */

/**
 * @param {{ seed: number, world: Parameters<typeof createWorld>[0], waitSleep?: string, script: Array<{ verb: string, actor: string, target: { x?: number, z?: number, body?: string, zone?: string }, admit: boolean, reason?: string }> }} spec
 * @param {Map<string, import('../packages/frame/types.js').IntentRule>} rules
 * @param {{ onFrame?: FrameVisit }} [options] onFrame sees each committed frame; harness/restore.test.js traces and restores there
 */
export function playVerbs(spec, rules, options) {
  const world = createWorld(spec.world);
  const memory = createMemory();
  const tick = createTick({ seed: spec.seed, world, rules, memory });
  /** @type {{ tick: number, hash: string }[]} */
  const frames = [];
  const watch = sleepWatch(world, world.bodies.map((body) => body.id));
  const onFrame = options && options.onFrame;
  tick.attach({
    draw(frame) {
      frames.push({ tick: frame.tick, hash: frame.hash });
      watch.see(frame.tick);
      if (onFrame) {
        onFrame(frame.tick, frame.hash, world, memory);
      }
    },
  });
  if (spec.waitSleep) {
    for (let i = 0; i < 128 && !world.sleeping(spec.waitSleep); i = i + 1) {
      tick.advance();
    }
  }
  for (const step of spec.script) {
    const result = tick.submit({
      kind: 'intent',
      verb: step.verb,
      actor: step.actor,
      target: /** @type {import('../packages/frame/types.js').Intent['target']} */ (step.target),
      frameHash: tick.frame().hash,
    });
    if (result.admitted !== step.admit) {
      return { ok: false, reason: step.verb + ' admit ' + result.admitted + ' ' + (result.admitted ? '' : result.reason), frames, episodes: memory.episodes.map((item) => item.detail), bodies: world.bodies };
    }
    if (!result.admitted && step.reason && result.reason !== step.reason && !result.reason.includes(step.reason)) {
      return { ok: false, reason: step.verb + ' reason ' + result.reason, frames, episodes: memory.episodes.map((item) => item.detail), bodies: world.bodies };
    }
    if (result.admitted) {
      settle(tick);
    }
  }
  return { ok: true, frames, episodes: memory.episodes.map((item) => item.detail), bodies: world.bodies, behaviour: { sleep: watch.sleep(), final: finalPositions(world.bodies) } };
}
