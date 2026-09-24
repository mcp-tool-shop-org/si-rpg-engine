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
 *   target: { x: number; y: number };
 *   targetBody?: string;
 *   expect: 'admit' | 'refuse';
 * }} HazardScenario
 */

/** Reads predicates/hazards/index.json by its literal path. */
export function loadHazards() {
  const index = JSON.parse(readFileSync('predicates/hazards/index.json', 'utf8'));
  /** @type {HazardScenario[]} */
  const scenarios = [];
  for (const file of index.scenarios) {
    scenarios.push(JSON.parse(readFileSync('predicates/hazards/' + file, 'utf8')));
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
  for (const scenario of scenarios) {
    const rules = new Map([[rule.verb, rule]]);
    const tick = createTick({
      seed: 1,
      world: createWorld({ bodies: scenario.bodies, colliders: scenario.colliders }),
      rules,
      memory: createMemory(),
    });
    /** @type {{ x: number, y: number } | { body: string }} */
    let target = scenario.target;
    if (rule.targetKind === 'body') {
      if (typeof scenario.targetBody !== 'string') {
        failures.push(scenario.id + ' has no targetBody');
        continue;
      }
      target = { body: scenario.targetBody };
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
