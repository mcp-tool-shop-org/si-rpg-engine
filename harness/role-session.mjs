// A role session as a run the restore proof can save, restore, and trace
// (T7a with T6). The tick has a role catalog built from the manifests the
// session cites, as a log carries them, and every proposal the session
// offered is offered again at its tick with its provenance, whether the gate
// admitted it or refused it. A log holds only admissions; a session's offers
// hold its refusals too, and the gate's state decides some of them: a
// proposal built before a save and offered after it is admitted only if the
// window still holds the frame it was built from, and one over its budget is
// refused only if the instance's admission ticks were kept. Replaying the
// offers is the same session, so a tick restored mid-session that lost either
// decides one of them otherwise, and its trace parts from the session's.
//
// The run saves and restores as packages/tick/runs.js's log run does: the
// tick's save beside how far into its offers the session has got. Its `said`
// holds what the gate said to each offer, for a test to read.

import { createMemory } from '../packages/tick/memory.js';
import { loadIntentRules } from '../packages/tick/predicates.js';
import { catalogFromLog } from '../packages/tick/roles.js';
import { createRestorableTick } from '../packages/tick/tick.js';
import { traceLine } from '../packages/tick/trace-line.js';
import { createWorld } from '../packages/tick/world.js';

/**
 * @typedef {import('../packages/frame/types.js').Proposal} Proposal
 * @typedef {import('../packages/frame/types.js').Provenance} Provenance
 * @typedef {import('../packages/frame/types.js').RoleManifest} RoleManifest
 * @typedef {import('../packages/tick/runs.js').RunSave} RunSave
 * @typedef {Parameters<typeof createWorld>[0]} WorldInit
 * @typedef {{ tick: number, proposal: Proposal, provenance: Provenance }} Offer
 * @typedef {{ seed: number, world: WorldInit, law?: 'product' | 'reference', manifests: Record<string, RoleManifest>, offers: ReadonlyArray<Offer>, quanta: number }} RoleSessionSpec
 */

/**
 * A fresh run of the session, at its load. It offers what is due at a tick,
 * then runs one quantum, until the session's last.
 * @param {RoleSessionSpec} spec
 */
export function roleSessionRun(spec) {
  const carried = catalogFromLog(spec.manifests);
  if (!carried.ok) {
    throw new Error('the session\'s manifests are refused: ' + carried.reason);
  }
  const catalog = loadIntentRules();
  const world = createWorld(spec.world, spec.law || 'product');
  const memory = createMemory();
  const tick = createRestorableTick({ seed: spec.seed, world, rules: catalog.rules, retired: catalog.retired, memory, roles: carried.catalog });
  let next = 0;
  /** @type {string[]} what the gate said to each offer: `admitted`, or its reason */
  const said = [];
  function offerDue() {
    while (next < spec.offers.length && spec.offers[next].tick === tick.frame().tick) {
      const offer = spec.offers[next];
      const admission = tick.submit(offer.proposal, offer.provenance);
      said[next] = admission.admitted ? 'admitted' : admission.reason;
      next = next + 1;
    }
  }
  return {
    world,
    memory,
    said,
    get tick() {
      return tick.frame().tick;
    },
    get hash() {
      return tick.frame().hash;
    },
    advance() {
      offerDue();
      if (tick.frame().tick < spec.quanta) {
        tick.advance();
        return true;
      }
      return false;
    },
    line() {
      return traceLine(tick.frame().tick, tick.frame().hash, world, memory);
    },
    /** The tick's save, and how far into its offers the session has got. */
    save() {
      return { next, tick: tick.save() };
    },
    /** @param {RunSave} saved */
    restore(saved) {
      const kept = /** @type {{ next: number, tick: import('../packages/tick/tick.js').TickSave }} */ (saved);
      if (!kept || !Number.isInteger(kept.next) || kept.next < 0 || kept.next > spec.offers.length || !kept.tick) {
        throw new Error('restore refused: a role session saves its place in its offers beside the save of its tick');
      }
      tick.restore(kept.tick);
      next = kept.next;
    },
  };
}

/**
 * A fresh run of the session, run to the frame at `tick`.
 * @param {RoleSessionSpec} spec
 * @param {number} tick
 */
export function roleSessionTo(spec, tick) {
  const run = roleSessionRun(spec);
  while (run.tick < tick) {
    if (!run.advance()) {
      throw new Error('the session ends at ' + run.tick + ', before ' + tick);
    }
  }
  return run;
}
