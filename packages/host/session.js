// The adapter beside the pump. It stamps the newest committed hash.
// A hash supplied by the page is ignored. The page may be showing an older frame.

import { createTick } from '../tick/tick.js';
import { createWorld, DT, fixtureColliders } from '../tick/world.js';
import { createMemory } from '../tick/memory.js';
import { loadIntentRules } from '../tick/predicates.js';
import { FIXTURE_SEED, fixtureWorld } from '../tick/fixture.js';

/**
 * @typedef {import('../frame/types.js').Frame} Frame
 * @typedef {import('../frame/types.js').Admission} Admission
 */

const STEPS = { left: [-1, 0], right: [1, 0] };

export function createSession() {
  const catalog = loadIntentRules();
  const tick = createTick({
    seed: FIXTURE_SEED,
    world: createWorld(fixtureWorld()),
    rules: catalog.rules,
    retired: catalog.retired,
    memory: createMemory(),
  });
  /** @type {Array<(frame: Frame) => void>} */
  const watchers = [];
  tick.attach({
    draw(frame) {
      for (let i = 0; i < watchers.length; i = i + 1) {
        watchers[i](frame);
      }
    },
  });

  /**
   * @param {(frame: Frame) => void} watcher
   */
  function watch(watcher) {
    watchers.push(watcher);
  }

  function worldRecord() {
    return { kind: 'world', dt: DT, colliders: fixtureColliders() };
  }

  /**
   * @param {Frame} frame
   */
  function frameRecord(frame) {
    return {
      kind: 'frame',
      tick: frame.tick,
      hash: frame.hash,
      bodies: frame.bodies.map((body) => ({
        id: body.id,
        x: body.x,
        y: body.y,
        vx: body.vx,
        vy: body.vy,
        hw: body.hw,
        hh: body.hh,
      })),
    };
  }

  /**
   * @param {object} input
   * @returns {Admission}
   */
  function intent(input) {
    if (!input || typeof input !== 'object') {
      return { admitted: false, reason: 'an intent is an object' };
    }
    const record = /** @type {Record<string, unknown>} */ (input);
    const actor = typeof record.actor === 'string' ? record.actor : 'walker';
    const verb = typeof record.verb === 'string' ? record.verb : 'move';
    const frame = tick.frame();
    /** @type {{ x: number, y: number } | null} */
    let target = null;
    if (record.direction === 'up' || record.direction === 'down') {
      return { admitted: false, reason: 'move has no vertical; click a point' };
    }
    if (typeof record.direction === 'string' && Object.hasOwn(STEPS, record.direction)) {
      const body = frame.bodies.find((item) => item.id === actor);
      if (!body) {
        return { admitted: false, reason: 'no body named ' + actor };
      }
      const step = STEPS[/** @type {keyof typeof STEPS} */ (record.direction)];
      target = { x: body.x + step[0], y: body.y + step[1] };
    } else if (record.target && typeof record.target === 'object') {
      const point = /** @type {{ x?: unknown, y?: unknown }} */ (record.target);
      if (typeof point.x === 'number' && typeof point.y === 'number') {
        target = { x: point.x, y: point.y };
      }
    }
    if (!target) {
      return { admitted: false, reason: 'an intent needs a target or a direction' };
    }
    return tick.submit({
      kind: 'intent',
      verb,
      actor,
      target,
      frameHash: frame.hash,
    });
  }

  return {
    dt: DT,
    watch,
    worldRecord,
    frameRecord,
    intent,
    advance() {
      return tick.advance();
    },
    frame() {
      return tick.frame();
    },
    idle() {
      return tick.idle();
    },
    log() {
      return tick.log();
    },
  };
}

/**
 * One quantum per timer fire. A late timer does not catch up.
 * 16 ms is what an integer timer can schedule. A quantum is 1/64 s,
 * 15.625 ms, so the picture runs about two percent slow. The tick's
 * step does not change.
 * @param {ReturnType<typeof createSession>} session
 * @param {{ every: (ms: number, fn: () => void) => unknown, cancel: (timer: unknown) => void }} clock
 */
export function startPump(session, clock) {
  const timer = clock.every(16, () => {
    session.advance();
  });
  return {
    stop() {
      clock.cancel(timer);
    },
  };
}
