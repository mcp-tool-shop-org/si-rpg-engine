// Proves the seat's scene is solvable with the real tick before a model runs.
// Search depth is two moves on a half-unit grid, which is inside the budget.

import { createTick, settle } from '../tick/tick.js';
import { createWorld } from '../tick/world.js';
import { createMemory } from '../tick/memory.js';
import { loadIntentRules } from '../tick/predicates.js';
import { FIXTURE_SEED } from '../tick/fixture.js';
import { GOAL, proposeWorld, reachedGoal } from './scene.js';

/**
 * @returns {{ x: number, y: number }[]}
 */
function grid() {
  /** @type {{ x: number, y: number }[]} */
  const points = [{ x: GOAL.x, y: GOAL.y }];
  for (let x = 0.5; x <= 3.5; x = x + 0.5) {
    for (let y = 0.25; y <= 2.5; y = y + 0.5) {
      points.push({ x, y });
    }
  }
  return points;
}

/**
 * @param {{ x: number, y: number }[]} targets
 * @returns {{ ok: boolean, minDist: number, at: number | null, x: number | undefined, y: number | undefined }}
 */
function play(targets) {
  const catalog = loadIntentRules();
  const tick = createTick({
    seed: FIXTURE_SEED,
    world: createWorld(proposeWorld()),
    rules: catalog.rules,
    retired: catalog.retired,
    memory: createMemory(),
  });
  let minDist = Infinity;
  for (let i = 0; i < targets.length; i = i + 1) {
    const frame = tick.frame();
    const admission = tick.submit({
      kind: 'intent',
      verb: 'move',
      actor: 'walker',
      target: targets[i],
      frameHash: frame.hash,
    });
    if (!admission.admitted) {
      return { ok: false, minDist, at: null, x: undefined, y: undefined };
    }
    settle(tick);
    const body = tick.frame().bodies[0];
    const dx = body.x - GOAL.x;
    const dy = body.y - GOAL.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) {
      minDist = dist;
    }
    if (reachedGoal(body.x, body.y)) {
      return { ok: true, minDist: dist, at: i + 1, x: body.x, y: body.y };
    }
  }
  const body = tick.frame().bodies[0];
  return { ok: false, minDist, at: null, x: body.x, y: body.y };
}

export function oracleSearch() {
  const points = grid();
  let minDist = Infinity;
  for (let i = 0; i < points.length; i = i + 1) {
    const first = play([points[i]]);
    if (first.minDist < minDist) {
      minDist = first.minDist;
    }
    if (first.ok && first.at !== null) {
      return { solvable: true, minAttempts: first.at, minDist: first.minDist };
    }
    if (first.x === undefined) {
      continue;
    }
    for (let j = 0; j < points.length; j = j + 1) {
      const second = play([points[i], points[j]]);
      if (second.minDist < minDist) {
        minDist = second.minDist;
      }
      if (second.ok && second.at !== null) {
        return { solvable: true, minAttempts: second.at, minDist: second.minDist };
      }
    }
  }
  return { solvable: false, minAttempts: null, minDist };
}
