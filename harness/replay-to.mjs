// Restore by replay. replayTo(spec, tick) builds a fresh world from the spec,
// replays the admitted inputs up to `tick`, and returns the run there, ready
// to continue one quantum at a time. It writes nothing into the solver but
// what the run itself writes, so it is sound by construction; the T1 trace of
// the continuation is the proof that it is the same run.
//
// The runs are packages/tick/runs.js, which the replay command shares for a
// bundle (T5); the tick never imports the harness. This adds one default: a
// product spec that names no records runs the product scene's own,
// harness/product-scene.mjs.
//
// A spec is one of:
//   { scene: 'product', world?, quanta? }   the product scene, stepped as
//     harness/sim.mjs does, optionally from other records or for another length;
//   a fixture case with `steps` and `driven`, stepped as harness/solver-scene.mjs does;
//   { seed, world, log, law?, retired? }   a tick replaying an admitted-input log,
//     as packages/tick/replay.js does, with each admission's hash checked.

import { replayTo as replayRun } from '../packages/tick/runs.js';
import { productInit } from './product-scene.mjs';

/**
 * @typedef {import('../packages/tick/runs.js').World} World
 * @typedef {import('../packages/tick/runs.js').Memory} Memory
 * @typedef {import('../packages/tick/runs.js').LogEntry} LogEntry
 * @typedef {import('../packages/tick/runs.js').PlaySpec} PlaySpec
 * @typedef {import('../packages/tick/runs.js').LogSpec} LogSpec
 * @typedef {import('../packages/tick/runs.js').RunSpec} RunSpec
 * @typedef {import('../packages/tick/runs.js').Run} Run
 * @typedef {{ scene: 'product', world?: import('../packages/tick/runs.js').WorldInit, quanta?: number }} ProductSpec
 * @typedef {ProductSpec | PlaySpec | LogSpec} ReplaySpec
 */

/**
 * The spec with the product scene's own records when it is a product spec
 * that names none.
 * @param {ReplaySpec} spec
 * @returns {RunSpec}
 */
export function withRecords(spec) {
  if ('scene' in spec) {
    return { scene: 'product', world: spec.world || productInit(), quanta: spec.quanta };
  }
  return spec;
}

/**
 * A fresh run of the spec, replayed to the frame at `tick`.
 * @param {ReplaySpec} spec
 * @param {number} tick
 * @returns {Run}
 */
export function replayTo(spec, tick) {
  return replayRun(withRecords(spec), tick);
}
