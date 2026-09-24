// The law. One pipeline: declare, validate, resolve, record, emit.
// A proposal is admitted by a checker that is not the model, or refused with
// the checker's reason. Only admissions are recorded. Every quantum is hashed
// by the function in frame. A host receives committed frames and nothing else.

import { createHasher } from '../frame/hash.js';
import { commitFrame } from '../frame/frame.js';
import { admitIntent } from './predicates.js';

/**
 * @typedef {import('../frame/types.js').Proposal} Proposal
 * @typedef {import('../frame/types.js').Admission} Admission
 * @typedef {import('../frame/types.js').Frame} Frame
 * @typedef {import('../frame/types.js').Host} Host
 * @typedef {import('../frame/types.js').LogEntry} LogEntry
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 */

/**
 * @param {{
 *   seed: number;
 *   world: ReturnType<import('./world.js').createWorld>;
 *   rules: Map<string, IntentRule>;
 *   retired?: Set<string>;
 *   memory: ReturnType<import('./memory.js').createMemory>;
 * }} init
 */
export function createTick(init) {
  const { seed, world, rules, memory } = init;
  const retired = init.retired ?? new Set();
  const hasher = createHasher();
  /** @type {LogEntry[]} */
  const inputLog = [];
  /** @type {Host[]} */
  const hosts = [];
  let tick = 0;

  // No verb consumes randomness in slice 2. The seed is part of the hash so a
  // replay with the wrong seed fails on the first frame.
  hasher.u32(seed);
  /** @type {Frame} */
  let current = commitFrame(0, hasher.digest(), world.bodies);

  /** Mixes the serializable state after one quantum. NaN halts the tick. */
  function mixQuantum() {
    hasher.u32(tick);
    for (let i = 0; i < world.bodies.length; i = i + 1) {
      const b = world.bodies[i];
      hasher.text(b.id);
      if (!hasher.float(b.x) || !hasher.float(b.y) || !hasher.float(b.vx) || !hasher.float(b.vy)) {
        throw new Error('NaN in body ' + b.id + ' at tick ' + tick);
      }
    }
  }

  /** One quantum: step, hash, commit, emit. */
  function quantum() {
    world.step();
    tick = tick + 1;
    mixQuantum();
    current = commitFrame(tick, hasher.digest(), world.bodies);
    for (let i = 0; i < hosts.length; i = i + 1) {
      hosts[i].draw(current);
    }
  }

  /**
   * @param {Proposal} proposal
   * @param {string} hash
   */
  function record(proposal, hash) {
    inputLog.push({ tick, proposal, hash });
  }

  /**
   * The front door. Declare, validate, resolve, record, emit.
   * @param {Proposal} proposal
   * @returns {Admission}
   */
  function submit(proposal) {
    if (!proposal || typeof proposal !== 'object') {
      return { admitted: false, reason: 'a proposal is an object with a kind' };
    }
    switch (proposal.kind) {
      case 'intent': {
        if (proposal.frameHash !== current.hash) {
          return { admitted: false, reason: 'stale frame: intent names ' + String(proposal.frameHash) + ', current is ' + current.hash };
        }
        const check = admitIntent(proposal, world, rules, retired);
        if (!check.ok) {
          return { admitted: false, reason: check.reason };
        }
        const actor = world.body(proposal.actor);
        if (!actor) {
          return { admitted: false, reason: 'no body named ' + proposal.actor };
        }
        const dx = proposal.target.x - actor.x;
        actor.vx = dx < 0 ? 0 - check.rule.speed : check.rule.speed;
        memory.recordEpisode(tick, 'intent', proposal.verb + ' ' + proposal.actor);
        for (let i = 0; i < check.quanta; i = i + 1) {
          quantum();
        }
        actor.vx = 0;
        record(proposal, current.hash);
        return { admitted: true, quanta: check.quanta, hash: current.hash };
      }
      case 'belief': {
        const check = memory.admitBeliefWrite(proposal);
        if (!check.ok) {
          return { admitted: false, reason: check.reason };
        }
        hasher.text(check.belief.id);
        hasher.text(check.belief.subject);
        hasher.text(check.belief.key);
        hasher.text(check.belief.value);
        hasher.float(check.belief.confidence);
        hasher.text(check.belief.source);
        if (proposal.supersedes !== undefined) {
          hasher.text(proposal.supersedes);
          hasher.text(String(proposal.withdrawnBy));
        }
        memory.recordEpisode(tick, 'belief', check.belief.id);
        quantum();
        record(proposal, current.hash);
        return { admitted: true, quanta: 1, hash: current.hash };
      }
      case 'line': {
        return { admitted: false, reason: 'no line gate in slice 2: the stance-pair classifier has no owner; lines are not admitted' };
      }
      case 'verb': {
        return { admitted: false, reason: 'verb drafts are admitted at load, not during play' };
      }
      case 'body': {
        if (typeof proposal.id !== 'string' || world.body(proposal.id)) {
          return { admitted: false, reason: 'a body draft needs an unused id' };
        }
        const hit = world.overlaps(proposal);
        if (hit !== null) {
          return { admitted: false, reason: 'body draft overlaps ' + hit };
        }
        world.bodies.push({ id: proposal.id, x: proposal.x, y: proposal.y, vx: 0, vy: 0, hw: proposal.hw, hh: proposal.hh });
        memory.recordEpisode(tick, 'body', proposal.id);
        quantum();
        record(proposal, current.hash);
        return { admitted: true, quanta: 1, hash: current.hash };
      }
      default:
        return { admitted: false, reason: 'unknown proposal kind: ' + String(/** @type {any} */ (proposal).kind) };
    }
  }

  /**
   * The host boundary. A host gets every committed frame. It has no other
   * method to call on the tick but submit.
   * @param {Host} host
   */
  function attach(host) {
    hosts.push(host);
    host.draw(current);
  }

  return {
    submit,
    attach,
    /** @returns {Frame} */
    frame() {
      return current;
    },
    /** @returns {ReadonlyArray<LogEntry>} */
    log() {
      return inputLog;
    },
  };
}
