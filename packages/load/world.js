// Decide whether a world file is admitted. The load hazards run in order, the
// reachability sweep last (T6 pin 9): after the world settles and its load
// hash comes back the same twice, it is swept under LOAD_BUDGET. The command
// in bin/load.js prints what this returns and writes the index; this writes
// nothing but the bundles of a sweep's findings.

import { loadHash, settles } from '../tick/admit-world.js';
import { costLine, sceneInput, sweep, sweepVerdict } from './sweep.js';

/**
 * The sweep's budget at load. A world whose sweep does not finish inside it
 * is admitted with the sweep deferred to the scheduled job (pin 10). Measured
 * on the builder's machine after T6 pin 2: worlds/crate-and-door.json sweeps in
 * 226,362 quanta and 2,190 restores, 13 s (81 s before pin 2), and the largest
 * world in fixtures/sweep/ in 50,486 quanta and 575 restores, 3 s. The budget
 * is about four times crate-and-door, so a world of its size finishes at load
 * in under a minute.
 */
export const LOAD_BUDGET = { quanta: 1000000, restores: 10000 };

/**
 * @param {import('../tick/scene.js').Scene} scene a scene validateScene admitted
 * @param {{ budget?: { quanta: number, restores: number }, bundles?: string | null }} [options]
 * @returns {{ ok: true, hash: string, lines: string[], report: import('./sweep.js').SweepReport | null } | { ok: false, reason: string, lines: string[], report: import('./sweep.js').SweepReport | null }}
 */
export function considerWorld(scene, options) {
  /** @type {string[]} */
  const lines = [];
  if (!settles(scene)) {
    return { ok: false, reason: 'world does not settle', lines, report: null };
  }
  const hash = loadHash(scene);
  if (hash !== loadHash(scene)) {
    return { ok: false, reason: 'load hash is not stable', lines, report: null };
  }
  const input = sceneInput(scene);
  if (input.actors.length === 0) {
    lines.push('sweep: the world has no actor, so there is nothing to sweep');
    return { ok: true, hash, lines, report: null };
  }
  const budget = options && options.budget ? options.budget : LOAD_BUDGET;
  const report = sweep(input, { budget, bundles: options && options.bundles !== undefined ? options.bundles : null, say: (line) => lines.push('sweep: ' + line) });
  lines.push('sweep: actors ' + report.actors.join(', ') + '; ' + report.actionSet);
  lines.push('sweep: ' + costLine(report));
  for (const zone of report.zones) {
    lines.push('sweep: zone ' + zone.id + (zone.reached && zone.witness ? ' reached by ' + zone.body + ' at tick ' + zone.witness.tick + ' in ' + zone.witness.log.length + ' intents' : report.complete ? ' not reached' : ' not reached yet'));
  }
  const verdict = sweepVerdict(report);
  for (const note of verdict.notes) {
    lines.push('sweep: ' + note);
  }
  if (!verdict.admitted) {
    return { ok: false, reason: verdict.reasons.join('\n'), lines, report };
  }
  return { ok: true, hash, lines, report };
}
