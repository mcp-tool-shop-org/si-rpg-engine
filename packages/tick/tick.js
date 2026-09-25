// The law. One pipeline: declare, validate, resolve, record, emit.
// A proposal is admitted by a checker that is not the model, or refused with
// the checker's reason. Only admissions are recorded. Every quantum is hashed
// by the function in frame. A host receives committed frames and nothing else.
//
// submit declares and admits. It schedules the quanta an admission needs and
// returns before any of them run. advance runs exactly one quantum, whether
// or not anything is scheduled: the world keeps stepping and hashing while a
// person does nothing. A log entry records the tick and the hash at the moment
// of admission. Replay advances to that tick before it submits.

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

  /**
   * One scheduled action per actor. The count is the quanta still to run.
   * When it reaches zero the actor's horizontal velocity is cleared, after
   * that quantum has been hashed, which is where the old submit cleared it.
   * @type {Map<string, number>}
   */
  const actions = new Map();
  /** Quanta owed by admissions that are not actions: a belief or a body draft takes one. */
  let pending = 0;

  // No verb consumes randomness in slice 2. The seed is part of the hash so a
  // replay with the wrong seed fails on the first frame.
  hasher.u32(seed);
  if (world.mixLoad) {
    world.mixLoad(hasher, new Set());
  }
  mixSnapshot(hasher);

  /** @type {Frame} */
  let current = commitFrame(0, hasher.digest(), world.bodies);

  /**
   * The product snapshot. A reference or box world has none, so its hash does not move.
   * @param {import('../frame/types.js').Hasher} target
   */
  function mixSnapshot(target) {
    if (!world.snapshot) {
      return;
    }
    const snap = world.snapshot();
    if (!snap) {
      return;
    }
    target.u32(snap.length);
    for (let i = 0; i < snap.length; i = i + 1) {
      target.u32(snap[i]);
    }
  }

  /** Mixes the serializable state after one quantum. NaN halts the tick. */
  function mixQuantum() {
    hasher.u32(tick);
    for (let i = 0; i < world.bodies.length; i = i + 1) {
      const b = world.bodies[i];
      hasher.text(b.id);
      if (!hasher.float(b.x) || !hasher.float(b.y) || !hasher.float(b.z) || !hasher.float(b.vx) || !hasher.float(b.vy) || !hasher.float(b.vz)) {
        throw new Error('NaN in body ' + b.id + ' at tick ' + tick);
      }
      if (world.law === 'product') {
        if (!hasher.float(b.qx) || !hasher.float(b.qy) || !hasher.float(b.qz) || !hasher.float(b.qw) || !hasher.float(b.wx) || !hasher.float(b.wy) || !hasher.float(b.wz)) {
          throw new Error('NaN in body ' + b.id + ' at tick ' + tick);
        }
      }
    }
    mixSnapshot(hasher);
  }

  /**
   * Hands a committed frame to one host. A host that throws is detached and
   * the quantum completes. A host cannot hold the law by failing.
   * @param {Host} host
   * @param {Frame} frame
   */
  function show(host, frame) {
    try {
      host.draw(frame);
      return true;
    } catch {
      return false;
    }
  }

  /** Every attached host sees the frame. Hosts that throw are dropped. */
  function emit() {
    for (let i = hosts.length - 1; i >= 0; i = i - 1) {
      if (!show(hosts[i], current)) {
        hosts.splice(i, 1);
      }
    }
  }

  /**
   * One quantum: step, hash, commit, emit, then retire what finished.
   * @returns {Frame}
   */
  function advance() {
    world.step(new Set(actions.keys()));
    tick = tick + 1;
    mixQuantum();
    current = commitFrame(tick, hasher.digest(), world.bodies);
    emit();
    if (pending > 0) {
      pending = pending - 1;
    }
    for (const [actorId, remaining] of actions) {
      if (remaining <= 1) {
        const actor = world.body(actorId);
        if (actor) {
          actor.vx = 0;
          actor.vz = 0;
        }
        actions.delete(actorId);
      } else {
        actions.set(actorId, remaining - 1);
      }
    }
    return current;
  }

  /** True when nothing is scheduled. The world still steps if advanced. */
  function idle() {
    return actions.size === 0 && pending === 0;
  }

  /**
   * Records an admission at the tick and hash it was admitted against.
   * @param {Proposal} proposal
   */
  function record(proposal) {
    inputLog.push({ tick, proposal, hash: current.hash });
  }

  /**
   * The front door. Declare and validate now; resolve across later quanta.
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
        const busy = actions.get(proposal.actor);
        if (busy !== undefined) {
          return { admitted: false, reason: proposal.actor + ' is mid-action; ' + busy + ' quanta remain' };
        }
        const check = admitIntent(proposal, world, rules, retired, new Set(actions.keys()));
        if (!check.ok) {
          return { admitted: false, reason: check.reason };
        }
        const actor = world.body(proposal.actor);
        if (!actor) {
          return { admitted: false, reason: 'no body named ' + proposal.actor };
        }
        const named = /** @type {{ body?: unknown, x?: unknown, z?: unknown }} */ (proposal.target);
        let aimX = actor.x;
        let aimZ = actor.z;
        if (typeof named.body === 'string') {
          const other = world.body(named.body);
          if (!other) {
            return { admitted: false, reason: 'no body named ' + named.body };
          }
          aimX = other.x;
          aimZ = other.z;
        } else if (typeof named.x === 'number' && typeof named.z === 'number') {
          aimX = named.x;
          aimZ = named.z;
        }
        const dx = aimX - actor.x;
        const dz = aimZ - actor.z;
        const ground = Math.sqrt(dx * dx + dz * dz);
        if (ground === 0) {
          actor.vx = 0;
          actor.vz = 0;
        } else {
          actor.vx = check.rule.speed * dx / ground;
          actor.vz = check.rule.speed * dz / ground;
        }
        memory.recordEpisode(tick, 'intent', proposal.verb + ' ' + proposal.actor);
        record(proposal);
        actions.set(proposal.actor, check.quanta);
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
        record(proposal);
        pending = pending + 1;
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
        world.bodies.push({
          id: proposal.id, x: proposal.x, y: proposal.y, z: proposal.z,
          vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, wx: 0, wy: 0, wz: 0,
          hx: proposal.hx, hy: proposal.hy, hz: proposal.hz,
        });
        memory.recordEpisode(tick, 'body', proposal.id);
        record(proposal);
        pending = pending + 1;
        return { admitted: true, quanta: 1, hash: current.hash };
      }
      default:
        return { admitted: false, reason: 'unknown proposal kind: ' + String(/** @type {any} */ (proposal).kind) };
    }
  }

  /**
   * The host boundary. A host gets every committed frame, starting with the
   * current one. It has no other method to call on the tick but submit.
   * A host that throws on attach is not attached.
   * @param {Host} host
   */
  function attach(host) {
    if (show(host, current)) {
      hosts.push(host);
    }
  }

  return {
    submit,
    advance,
    idle,
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

/**
 * Runs quanta until nothing is scheduled. What play, replay, the hazard
 * suite, and the tests mean by "let the action finish".
 * @param {ReturnType<typeof createTick>} tick
 * @returns {number} the quanta run
 */
export function settle(tick) {
  let n = 0;
  while (!tick.idle()) {
    tick.advance();
    n = n + 1;
  }
  return n;
}
