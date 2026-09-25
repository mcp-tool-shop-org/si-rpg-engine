// The adapter beside the pump. It stamps the newest committed hash.
// A hash supplied by the page is ignored. The page may be showing an older frame.

import { instantiate } from '../../solver/dist/solver.mjs';
import { createTick } from '../tick/tick.js';
import { createWorld, DT, fixtureColliders } from '../tick/world.js';
import { createMemory } from '../tick/memory.js';
import { loadIntentRules } from '../tick/predicates.js';
import { FIXTURE_SEED, fixtureWorld } from '../tick/fixture.js';
import { reachedGoal } from '../tick/scene.js';

/**
 * @typedef {import('../frame/types.js').Frame} Frame
 * @typedef {import('../frame/types.js').Admission} Admission
 */

const STEPS = { left: -1, right: 1 };

/**
 * @param {import('../tick/scene.js').Scene} [scene]
 * @param {'product' | 'box' | 'reference'} [law]
 */
export function createSession(scene, law) {
  instantiate();
  const catalog = loadIntentRules();
  const tick = createTick({
    seed: scene ? scene.seed : FIXTURE_SEED,
    world: createWorld(scene ? { bodies: scene.bodies, colliders: scene.colliders, heightfield: scene.heightfield } : fixtureWorld(), law),
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
    /** @type {{ kind: string, dt: number, colliders: ReturnType<typeof fixtureColliders>, goal?: import('../tick/scene.js').Zone }} */
    const record = {
      kind: 'world',
      dt: DT,
      colliders: scene ? scene.colliders : fixtureColliders(),
    };
    if (scene) {
      record.goal = scene.goal.zone;
    }
    return record;
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
        z: body.z,
        vx: body.vx,
        vy: body.vy,
        vz: body.vz,
        hx: body.hx,
        hy: body.hy,
        hz: body.hz,
      })),
      door: doorTick(frame),
    };
  }

  /**
   * The tick at which the goal was first reached, or null. Sticky: once
   * reached it stays that tick, so a page that missed frames still reports
   * the sim's tick and not the first frame it happened to draw.
   * @type {number | null}
   */
  let firstDoor = null;

  /**
   * @param {Frame} frame
   */
  function doorTick(frame) {
    if (firstDoor !== null) {
      return firstDoor;
    }
    if (!scene || !reachedGoal(scene, frame)) {
      return null;
    }
    firstDoor = frame.tick;
    return firstDoor;
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
    if (verb === 'push') {
      const actorBody = frame.bodies.find((item) => item.id === actor);
      const push = catalog.rules.get('push');
      if (!actorBody || !push) {
        return { admitted: false, reason: 'no body named ' + actor };
      }
      let nearest = null;
      let nearestDistance = Infinity;
      for (const body of frame.bodies) {
        if (body.id === actor) {
          continue;
        }
        const dx = body.x - actorBody.x;
        const dz = body.z - actorBody.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance <= push.maxDistance && distance < nearestDistance) {
          nearest = body;
          nearestDistance = distance;
        }
      }
      if (!nearest) {
        return { admitted: false, reason: 'no body in range to push' };
      }
      return tick.submit({
        kind: 'intent',
        verb: 'push',
        actor,
        target: { body: nearest.id },
        frameHash: frame.hash,
      });
    }
    /** @type {{ x: number, z: number } | null} */
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
      target = { x: body.x + step, z: body.z };
    } else if (record.target && typeof record.target === 'object') {
      const point = /** @type {{ x?: unknown, z?: unknown }} */ (record.target);
      if (typeof point.x === 'number' && typeof point.z === 'number') {
        target = { x: point.x, z: point.z };
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
    doorTick,
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
