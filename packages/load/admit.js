// Decide whether a draft joins the admitted verbs, or a verb is retired.
// Pure. The command in bin/load.js is what writes the index.

import { compileVerb } from './compile.js';
import { runHazards } from './suite.js';

/**
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {{ rules: string[]; retired: string[] }} IntentIndex
 */

/**
 * @param {unknown} draft
 * @param {ReadonlyArray<import('./suite.js').HazardScenario>} scenarios
 * @param {IntentIndex} index
 * @returns {{ ok: true, rule: IntentRule, index: IntentIndex } | { ok: false, reason: string }}
 */
export function considerDraft(draft, scenarios, index) {
  const compiled = compileVerb(draft);
  if (!compiled.ok) {
    return compiled;
  }
  const file = compiled.rule.verb + '.json';
  const retired = index.retired ?? [];
  if (index.rules.includes(file) || retired.includes(compiled.rule.verb)) {
    return { ok: false, reason: 'verb already recorded: ' + compiled.rule.verb };
  }
  const failures = runHazards(compiled.rule, scenarios);
  if (failures.length > 0) {
    return { ok: false, reason: failures.join('; ') };
  }
  return {
    ok: true,
    rule: compiled.rule,
    index: { rules: index.rules.concat(file), retired: retired.slice() },
  };
}

/**
 * @param {IntentIndex} index
 * @param {string} verb
 * @returns {{ ok: true, index: IntentIndex } | { ok: false, reason: string }}
 */
export function retireVerb(index, verb) {
  const file = verb + '.json';
  if (!index.rules.includes(file)) {
    return { ok: false, reason: 'no admitted verb ' + verb };
  }
  const retired = index.retired ?? [];
  return {
    ok: true,
    index: {
      rules: index.rules.filter((name) => name !== file),
      retired: retired.concat(verb),
    },
  };
}
