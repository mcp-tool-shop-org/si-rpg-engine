// Run a compiled verb against the hand-authored hazard scenarios.
// This module imports the tick. The tick does not import it.

import { readFileSync } from 'node:fs';
import { createTick, settle } from '../tick/tick.js';
import { createWorld } from '../tick/world.js';
import { createMemory } from '../tick/memory.js';

/**
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {import('../frame/types.js').Body} Body
 * @typedef {import('../frame/types.js').StaticCollider} StaticCollider
 * @typedef {{
 *   id: string;
 *   bodies: Body[];
 *   colliders: StaticCollider[];
 *   actor: string;
 *   target: { x: number; z: number };
 *   targetBody?: string;
 *   targetZone?: string;
 *   asleep?: string[];
 *   carrying?: string;
 *   zones?: import('../frame/types.js').Zone[];
 *   heightfield?: { rows: number, cols: number, cell: number, heights: number[] } | null;
 *   effect?: string;
 *   expect: 'admit' | 'refuse';
 * }} HazardScenario
 */

/** Reads predicates/hazards/index.json by its literal path. */
export function loadHazards() {
  const index = JSON.parse(readFileSync('predicates/hazards/index.json', 'utf8'));
  /** @type {HazardScenario[]} */
  const scenarios = [];
  for (const entry of index.scenarios) {
    const file = typeof entry === 'string' ? entry : entry.file;
    const effect = typeof entry === 'string' ? 'drive' : entry.effect;
    const scenario = JSON.parse(readFileSync('predicates/hazards/' + file, 'utf8'));
    scenario.effect = effect;
    scenarios.push(scenario);
  }
  return scenarios;
}

/**
 * @param {IntentRule} rule
 * @param {ReadonlyArray<HazardScenario>} scenarios
 * @returns {string[]}
 */
export function runHazards(rule, scenarios) {
  /** @type {string[]} */
  const failures = [];
  const effect = rule.effect || 'drive';
  for (const scenario of scenarios) {
    if ((scenario.effect || 'drive') !== effect) {
      continue;
    }
    const rules = new Map([[rule.verb, rule]]);
    const world = createWorld({
      bodies: scenario.bodies,
      colliders: scenario.colliders,
      zones: scenario.zones,
      heightfield: scenario.heightfield,
    });
    if (scenario.carrying && !world.carry(scenario.actor, scenario.carrying)) {
      failures.push(scenario.id + ' could not start carrying');
      continue;
    }
    const tick = createTick({
      seed: 1,
      world,
      rules,
      memory: createMemory(),
    });
    if (Array.isArray(scenario.asleep)) {
      for (let n = 0; n < 128; n = n + 1) {
        if (scenario.asleep.every((id) => world.sleeping(id))) {
          break;
        }
        tick.advance();
      }
    }
    /** @type {{ x: number, z: number } | { body: string } | { zone: string }} */
    let target = scenario.target;
    if (effect === 'episode' && scenario.targetZone) {
      target = { zone: scenario.targetZone };
    } else if (effect === 'carry' || effect === 'episode' || rule.targetKind === 'body') {
      if (effect !== 'episode' && typeof scenario.targetBody !== 'string') {
        failures.push(scenario.id + ' has no targetBody');
        continue;
      }
      if (typeof scenario.targetBody === 'string') {
        target = { body: scenario.targetBody };
      }
    }
    const result = tick.submit({
      kind: 'intent',
      verb: rule.verb,
      actor: scenario.actor,
      target,
      frameHash: tick.frame().hash,
    });
    if (result.admitted) {
      // An admitted step runs to completion on the real tick before it is judged.
      settle(tick);
    }
    if (scenario.expect === 'refuse' && result.admitted) {
      failures.push(scenario.id + ' was admitted');
    }
    if (scenario.expect === 'admit' && !result.admitted) {
      failures.push(scenario.id + ' was refused: ' + result.reason);
    }
  }
  return failures;
}
