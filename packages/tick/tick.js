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
//
// save and restore (T6 pin 1) take and put back the tick's whole state, so a
// state is returned to without replaying to it: what the reachability sweep
// does thousands of times. Restoring and then advancing traces identically to
// the run that was saved; harness/restore.test.js proves it on every fixture
// and the product scene, and shows a save that omits one field goes red. They
// are on the tick createRestorableTick makes, not the one createTick makes:
// restore writes body records, and a tick handed to a host has no method that
// writes geometry (packages/tick/tick.test.js, the host boundary). A restore
// checks the whole save before it writes anything, the committed frame record
// by record as the world checks its own records (#83).
//
// A role's proposal (T7a) carries provenance: submit(proposal, provenance).
// The role gate (gate.js) checks it against the role's manifest, its
// freshness window, and its admission budget before any predicate runs; then
// every predicate is checked on the current state, as for the host. Its log
// entry carries the provenance, and its admission mixes the provenance, and a
// belief's trust label, into the running hash after what the class already
// mixes. A proposal without provenance is the host's: admitted exactly as
// before, with a log entry of the same form and the same hashes. With a role
// catalog the tick keeps, for each of its last frames, the frame's hash and
// the least trusted label in each mind, which the gate reads.
//
// A save carries that window and each role instance's admission ticks beside
// the log and its provenance, so a tick restored mid-session gates a late
// proposal, and one over its budget, exactly as the uninterrupted tick would.
// A restore checks both, with every label in them, before anything is written.

import { createHasher } from '../frame/hash.js';
import { commitFrame } from '../frame/frame.js';
import { beliefRefusal, subjectText } from './beliefs.js';
import { canonical } from './canonical.js';
import { beliefLabel, budgetRefusal, freshnessRefusal, provenanceProblem, roleRefusal } from './gate.js';
import { memorySaveProblem } from './memory.js';
import { installMinds, mindsSaveProblem, mixMinds, observeMinds, restoreMinds, saveMinds } from './minds.js';
import { admitIntent } from './predicates.js';
import { findRole } from './roles.js';
import { AUTHORED, isLabel, labelFields } from './trust.js';

/** A frame's hash: sixteen lowercase hex digits (frame/hash.js). */
const FRAME_HASH = /^[0-9a-f]{16}$/;

/** The numbers in a committed frame's body record, beside its id: what commitFrame (frame/frame.js) copies. */
const FRAME_RECORD = /** @type {const} */ (['x', 'y', 'z', 'vx', 'vy', 'vz', 'qx', 'qy', 'qz', 'qw', 'wx', 'wy', 'wz', 'hx', 'hy', 'hz']);

/**
 * @typedef {import('../frame/types.js').Proposal} Proposal
 * @typedef {import('../frame/types.js').Admission} Admission
 * @typedef {import('../frame/types.js').Frame} Frame
 * @typedef {import('../frame/types.js').Host} Host
 * @typedef {import('../frame/types.js').LogEntry} LogEntry
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {{ remaining: number, effect: string, riseQuanta: number, aimX: number, aimZ: number, otherId: string | null, speed: number }} ScheduledAction
 * @typedef {ReturnType<ReturnType<typeof import('./world.js').createWorld>['saveSparse']>} WorldSave
 * @typedef {{
 *   seed: number, tick: number, lanes: [number, number], frame: Frame,
 *   actions: Array<[string, ScheduledAction]>, pending: number,
 *   minds: import('./minds.js').MindsSave, memory: import('./memory.js').MemorySave,
 *   log: LogEntry[], window: import('./gate.js').WindowFrame[], admissions: Array<[string, number[]]>,
 *   world: WorldSave
 * }} TickSave
 * @typedef {import('../frame/types.js').Provenance} Provenance
 * @typedef {import('./gate.js').WindowFrame} WindowFrame
 * @typedef {import('./trust.js').Label} Label
 * @typedef {{ entry: import('./roles.js').RoleEntry, provenance: Provenance, key: string, label: Label | null }} RoleAdmission
 */

/**
 * @typedef {{
 *   seed: number;
 *   world: ReturnType<import('./world.js').createWorld>;
 *   rules: Map<string, IntentRule>;
 *   retired?: Set<string>;
 *   memory: ReturnType<import('./memory.js').createMemory>;
 *   roles?: import('./roles.js').Catalog;
 * }} TickInit
 */

/**
 * The tick a host is handed: submit, advance, idle, attach, frame, and log.
 * @param {TickInit} init
 */
export function createTick(init) {
  return buildTick(init).tick;
}

/**
 * The same tick with save() and restore(saved) beside its six methods (T6
 * pin 1). The sweep, the runs a bundle names, and the tests make this one.
 * @param {TickInit} init
 */
export function createRestorableTick(init) {
  const built = buildTick(init);
  return { ...built.tick, save: built.save, restore: built.restore };
}

/**
 * @param {TickInit} init
 */
function buildTick(init) {
  const { seed, world, rules, memory } = init;
  const retired = init.retired ?? new Set();
  const roles = init.roles ?? null;
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
   * @typedef {ScheduledAction} Action
   * @type {Map<string, Action>}
   */
  const actions = new Map();
  /** Quanta owed by admissions that are not actions: a belief or a body draft takes one. */
  let pending = 0;

  /**
   * The freshness window (T7a pin 8): each of the last frames' tick, hash,
   * and the least trusted label in each mind (pin 5), oldest first, one per
   * committed frame. Kept only with a role catalog, and long enough for the
   * oldest frame any of its roles may cite.
   * @type {WindowFrame[]}
   */
  const frames = [];
  const frameCount = roles === null ? 0 : roles.maxAge + 1;
  /** The ticks of each role instance's admissions, for its admission budget (pin 10). @type {Map<string, number[]>} */
  const admissions = new Map();

  // No verb consumes randomness in slice 2. The seed is part of the hash so a
  // replay with the wrong seed fails on the first frame.
  installMinds(world, memory);
  hasher.u32(seed);
  if (world.mixLoad) {
    world.mixLoad(hasher, new Set());
  }
  mixMinds(hasher, world, memory);
  mixSnapshot(hasher);

  /** @type {Frame} */
  let current = commitFrame(0, hasher.digest(), world.bodies);
  remember(current);

  /** The least trusted label in each mind, as the minds stand now. */
  function mindLabels() {
    const minds = world.minds || [];
    return minds.map((mind) => /** @type {const} */ ([mind.body, memory.leastLabel(mind.body)]));
  }

  /**
   * Keeps a committed frame in the window.
   * @param {Frame} frame
   */
  function remember(frame) {
    if (frameCount === 0) {
      return;
    }
    frames.push({ tick: frame.tick, hash: frame.hash, minds: mindLabels() });
    if (frames.length > frameCount) {
      frames.shift();
    }
  }

  /**
   * A belief admitted before the next quantum is in the mind for any prompt
   * built from the current frame, so the window's newest frame is read again.
   */
  function rememberMinds() {
    if (frames.length > 0) {
      const last = frames[frames.length - 1];
      frames[frames.length - 1] = { tick: last.tick, hash: last.hash, minds: mindLabels() };
    }
  }

  /**
   * The window's frame at a tick, if the window still holds it.
   * @param {number} at
   * @returns {WindowFrame | undefined}
   */
  function frameAt(at) {
    if (frames.length === 0) {
      return undefined;
    }
    const i = at - frames[0].tick;
    return i >= 0 && i < frames.length ? frames[i] : undefined;
  }

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
      if (world.zones && world.zones.length > 0 && world.zoneIndex) {
        const index = world.zoneIndex(b.id);
        hasher.u32(index === null ? 0xffffffff : index);
      }
      // Carrying is mixed only while some body is carried, so a frame with
      // nothing carried hashes as it does today.
      if (world.anyCarried && world.anyCarried()) {
        hasher.u32(world.linkIndex(world.carryingOf(b.id)));
        hasher.u32(world.linkIndex(world.carriedByOf(b.id)));
      }
    }
    mixMinds(hasher, world, memory);
    mixSnapshot(hasher);
  }

  /**
   * The use verb's episode. Its text goes into the memory's episodes, which
   * the hash does not mix; a mind's use goal is met by reading it (minds.js).
   * It is a function of its own so the instrument's bench marks what it
   * writes apart from the rest of submit (T7b pin 3).
   * @param {string} actor
   * @param {string} name the zone or the body used
   */
  function recordUse(actor, name) {
    memory.recordEpisode(tick, 'use', 'use ' + actor + ' ' + name);
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
  /**
   * @param {string} effect
   */
  function drives(effect) {
    return effect === 'drive' || effect === 'climb' || effect === 'carry' || effect === 'release';
  }

  /**
   * Pose for this quantum, before the step. Drive keeps the velocity submit set.
   * @param {string} id
   * @param {Action} action
   */
  function applyAction(id, action) {
    const actor = world.body(id);
    if (!actor || !world.lifted) {
      return;
    }
    world.lifted.delete(id);
    if (action.effect === 'drive' || action.effect === 'episode') {
      return;
    }
    if (action.effect === 'carry' && action.remaining === 1 && action.otherId && world.carry) {
      world.carry(id, action.otherId);
    }
    if (action.effect === 'release' && action.remaining === 1 && world.release) {
      world.release(id, action.aimX, action.aimZ);
      return;
    }
    if (action.effect === 'climb' && action.riseQuanta > 0) {
      world.lifted.add(id);
      actor.vy = action.speed;
      actor.vx = 0;
      actor.vz = 0;
      return;
    }
    if (action.effect === 'climb') {
      const dx = action.aimX - actor.x;
      const dz = action.aimZ - actor.z;
      const ground = Math.sqrt(dx * dx + dz * dz);
      actor.vy = 0;
      if (ground === 0) {
        actor.vx = 0;
        actor.vz = 0;
      } else {
        actor.vx = action.speed * dx / ground;
        actor.vz = action.speed * dz / ground;
      }
    }
  }

  function advance() {
    /** @type {Set<string>} */
    const driving = new Set();
    for (const [id, action] of actions) {
      if (drives(action.effect)) {
        applyAction(id, action);
        driving.add(id);
      }
    }
    world.step(driving);
    tick = tick + 1;
    observeMinds(world, memory, tick);
    mixQuantum();
    current = commitFrame(tick, hasher.digest(), world.bodies);
    remember(current);
    emit();
    if (pending > 0) {
      pending = pending - 1;
    }
    for (const [actorId, action] of actions) {
      if (action.remaining <= 1) {
        const actor = world.body(actorId);
        if (actor && action.effect !== 'episode') {
          actor.vx = 0;
          actor.vz = 0;
          if (action.effect === 'climb') {
            actor.vy = 0;
          }
        }
        if (world.lifted) {
          world.lifted.delete(actorId);
        }
        actions.delete(actorId);
      } else {
        action.remaining = action.remaining - 1;
        if (action.effect === 'climb' && action.riseQuanta > 0) {
          action.riseQuanta = action.riseQuanta - 1;
        }
      }
    }
    return current;
  }

  /** True when nothing is scheduled. The world still steps if advanced. */
  function idle() {
    return actions.size === 0 && pending === 0;
  }

  /**
   * Records an admission at the tick and hash it was admitted against. A
   * role's entry carries its provenance, which is mixed into the running
   * hash with a belief's label; the host's entry is what it always was.
   * @param {Proposal} proposal
   * @param {RoleAdmission | null} role
   */
  function record(proposal, role) {
    if (role === null) {
      inputLog.push({ tick, proposal, hash: current.hash });
      return;
    }
    inputLog.push({ tick, proposal, hash: current.hash, provenance: role.provenance });
    hasher.text(canonical(role.provenance));
    if (role.label !== null) {
      hasher.text(role.label.label);
      hasher.text(role.label.heard || '');
    }
    const kept = (admissions.get(role.key) || []).filter((at) => roles !== null && at > tick - roles.maxWindow);
    kept.push(tick);
    admissions.set(role.key, kept);
  }

  /**
   * The role gate's checks that read the tick: the catalog and the manifest
   * (gate.js roleRefusal), then the freshness window, then the admission
   * budget. A belief's label is set here, from the manifest and the minds at
   * builtAt, never from the caller.
   * @param {Proposal} proposal
   * @param {unknown} provenance
   * @returns {{ ok: true, role: RoleAdmission } | { ok: false, reason: string }}
   */
  function roleGate(proposal, provenance) {
    const checked = roleRefusal(roles, proposal, provenance);
    if (!checked.ok) {
      return checked;
    }
    const p = checked.provenance;
    const built = frameAt(p.builtAt.tick);
    const stale = freshnessRefusal(checked.entry, p, tick, built);
    if (stale !== null) {
      return { ok: false, reason: stale };
    }
    const key = p.role + ' ' + p.instance;
    const over = budgetRefusal(checked.entry, admissions.get(key) || [], tick);
    if (over !== null) {
      return { ok: false, reason: over };
    }
    const label = proposal.kind === 'belief' ? beliefLabel(checked.entry, p.instance, /** @type {WindowFrame} */ (built)) : null;
    return { ok: true, role: { entry: checked.entry, provenance: structuredClone(p), key, label } };
  }

  /**
   * The front door. Declare and validate now; resolve across later quanta.
   * A proposal with provenance is a role's: the role gate checks it first,
   * and it is then held to every predicate on the current state. Without
   * provenance it is the host's, admitted exactly as before.
   * @param {Proposal} proposal
   * @param {Provenance} [provenance]
   * @returns {Admission}
   */
  function submit(proposal, provenance) {
    /** @type {RoleAdmission | null} */
    let role = null;
    if (provenance !== undefined) {
      const gate = roleGate(proposal, provenance);
      if (!gate.ok) {
        return { admitted: false, reason: gate.reason };
      }
      role = gate.role;
    }
    if (!proposal || typeof proposal !== 'object') {
      return { admitted: false, reason: 'a proposal is an object with a kind' };
    }
    switch (proposal.kind) {
      case 'intent': {
        // The host's intent cites the newest frame. A role's cites the frame
        // it was built from, which the gate has checked against its window.
        if (role === null && proposal.frameHash !== current.hash) {
          return { admitted: false, reason: 'stale frame: intent names ' + String(proposal.frameHash) + ', current is ' + current.hash };
        }
        const busy = actions.get(proposal.actor);
        if (busy !== undefined) {
          return { admitted: false, reason: proposal.actor + ' is mid-action; ' + busy.remaining + ' quanta remain' };
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
        const effect = check.rule.effect || 'drive';
        if (effect === 'episode') {
          const name = check.zoneId || check.otherId || '';
          recordUse(proposal.actor, name);
          record(proposal, role);
          actions.set(proposal.actor, { remaining: 1, effect, riseQuanta: 0, aimX: actor.x, aimZ: actor.z, otherId: check.otherId || null, speed: 0 });
          return { admitted: true, quanta: 1, hash: current.hash };
        }
        if (effect !== 'climb') {
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
        }
        if (effect === 'carry' && check.aimX !== undefined && check.aimZ !== undefined) {
          aimX = check.aimX;
          aimZ = check.aimZ;
        }
        if (effect === 'release' && check.aimX !== undefined && check.aimZ !== undefined) {
          aimX = check.aimX;
          aimZ = check.aimZ;
        }
        memory.recordEpisode(tick, 'intent', proposal.verb + ' ' + proposal.actor);
        record(proposal, role);
        actions.set(proposal.actor, {
          remaining: check.quanta,
          effect,
          riseQuanta: check.riseQuanta || 0,
          aimX: effect === 'climb' || effect === 'release' ? (check.aimX || aimX) : aimX,
          aimZ: effect === 'climb' || effect === 'release' ? (check.aimZ || aimZ) : aimZ,
          otherId: check.otherId || null,
          speed: check.rule.speed,
        });
        return { admitted: true, quanta: check.quanta, hash: current.hash };
      }
      case 'belief': {
        const mindName = proposal.mind;
        if (typeof mindName === 'string') {
          const minds = world.minds || [];
          if (!minds.some((mind) => mind.body === mindName)) {
            return { admitted: false, reason: 'no mind named ' + mindName };
          }
          if (typeof proposal.confidence !== 'number' || !(proposal.confidence >= 0 && proposal.confidence <= 1)) {
            return { admitted: false, reason: 'confidence must be a number in [0, 1]' };
          }
          const refusal = beliefRefusal(world, proposal);
          if (refusal) {
            return { admitted: false, reason: refusal };
          }
          const named = memory.admitMindBelief(mindName, proposal, role === null ? AUTHORED : /** @type {Label} */ (role.label));
          if (!named.ok) {
            return { admitted: false, reason: named.reason };
          }
          hasher.text(named.belief.id);
          hasher.text(subjectText(named.belief.subject));
          hasher.text(named.belief.key);
          hasher.text(String(named.belief.value));
          hasher.float(named.belief.confidence);
          hasher.text(named.belief.source);
          if (proposal.supersedes !== undefined) {
            hasher.text(proposal.supersedes);
            hasher.text(String(proposal.withdrawnBy));
          }
          memory.recordEpisode(tick, 'belief', named.belief.id);
          record(proposal, role);
          rememberMinds();
          pending = pending + 1;
          return { admitted: true, quanta: 1, hash: current.hash };
        }
        // The gate refuses a role's belief that names no mind, so only the host comes here.
        const check = memory.admitBeliefWrite(proposal, AUTHORED);
        if (!check.ok) {
          return { admitted: false, reason: check.reason };
        }
        hasher.text(check.belief.id);
        hasher.text(/** @type {string} */ (check.belief.subject));
        hasher.text(check.belief.key);
        hasher.text(/** @type {string} */ (check.belief.value));
        hasher.float(check.belief.confidence);
        hasher.text(check.belief.source);
        if (proposal.supersedes !== undefined) {
          hasher.text(proposal.supersedes);
          hasher.text(String(proposal.withdrawnBy));
        }
        memory.recordEpisode(tick, 'belief', check.belief.id);
        record(proposal, role);
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
        record(proposal, role);
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

  /**
   * The tick's whole state (T6 pin 1): the tick number, the running hasher's
   * lanes, the current frame, the scheduled actions, the quanta owed to
   * admissions that are not actions, the minds' state and memory, the input
   * log, and the world's save (its body records, its lifted and carried
   * sets, and an image of the solver). The log is copied, not cut back to a
   * length: a sweep restores states that other branches reached, so a
   * restored tick's log must be the path to its own state. A save taken with
   * an action in flight carries the action. The attached hosts are not state:
   * they stay attached across a restore. The solver's image is the sparse
   * in-process form (T6 pin 2): a save lives in this process, and a restore
   * from it costs about a millisecond.
   *
   * With a role catalog the save also carries what the role gate reads (T7a):
   * the window of frames, each with its hash and the least trusted label in
   * each mind, and the ticks of each role instance's admissions. The log's
   * entries keep their provenance. Every label is copied, not shared.
   * @returns {TickSave}
   */
  function save() {
    return {
      seed,
      tick,
      lanes: hasher.lanes(),
      frame: current,
      actions: Array.from(actions, ([id, action]) => /** @type {[string, Action]} */ ([id, { ...action }])),
      pending,
      minds: saveMinds(world),
      memory: memory.save(),
      log: inputLog.slice(),
      window: frames.map(copyFrame),
      admissions: Array.from(admissions, ([key, ticks]) => /** @type {[string, number[]]} */ ([key, ticks.slice()])),
      world: world.saveSparse(),
    };
  }

  /**
   * A window frame with its own copy of each mind's label.
   * @param {WindowFrame} frame
   * @returns {WindowFrame}
   */
  function copyFrame(frame) {
    return {
      tick: frame.tick,
      hash: frame.hash,
      minds: frame.minds.map(([body, least]) => /** @type {const} */ ([body, least === null ? null : labelFields(least)])),
    };
  }

  /**
   * Why a saved window is not one this tick could hold at the saved frame, or
   * null. The window is what the gate reads for a proposal built from an
   * earlier frame: one frame per tick, oldest first, ending at the saved
   * frame, no longer than the oldest frame a role of the catalog may cite, and
   * each frame's least trusted label in each of this world's minds, or null
   * for a mind with no beliefs. A window may hold fewer frames than the tick
   * had, which only refuses more; a tick with no role catalog keeps none.
   * @param {any} saved
   * @returns {string | null}
   */
  function windowProblem(saved) {
    const kept = saved.window;
    if (!Array.isArray(kept)) {
      return 'the window is a list of frames';
    }
    if (frameCount === 0) {
      return kept.length === 0 ? null : 'a tick with no role catalog keeps no window';
    }
    if (kept.length === 0 || kept.length > frameCount) {
      return 'the window holds the saved frame and at most ' + (frameCount - 1) + ' frames before it';
    }
    const minds = world.minds || [];
    const first = kept[0] && kept[0].tick;
    const shaped = Number.isInteger(first) && first >= 0 && kept.every((/** @type {any} */ frame, /** @type {number} */ i) => Boolean(frame) && typeof frame === 'object'
      && Object.keys(frame).sort().join(',') === 'hash,minds,tick' && frame.tick === first + i
      && typeof frame.hash === 'string' && FRAME_HASH.test(frame.hash)
      && Array.isArray(frame.minds) && frame.minds.length === minds.length
      && frame.minds.every((/** @type {any} */ pair, /** @type {number} */ m) => Array.isArray(pair) && pair.length === 2 && pair[0] === minds[m].body
        && (pair[1] === null || (Boolean(pair[1]) && typeof pair[1] === 'object' && Object.keys(pair[1]).every((key) => key === 'label' || key === 'heard') && isLabel(pair[1].label, pair[1].heard)))));
    if (!shaped) {
      return 'the window is one frame per tick, oldest first, each its tick, its hash, and the least trusted label in each mind of this world, or null';
    }
    const last = kept[kept.length - 1];
    if (last.tick !== saved.tick || last.hash !== saved.frame.hash) {
      return 'the window ends at the saved frame';
    }
    return null;
  }

  /**
   * Why saved admission ticks are not ones this tick could hold, or null. For
   * each role instance of the catalog, `role instance`, the ticks of its
   * admissions the gate has kept for its budget: whole numbers, ascending,
   * none after the saved tick. A tick with no role catalog holds none.
   * @param {any} saved
   * @returns {string | null}
   */
  function admissionsProblem(saved) {
    const kept = saved.admissions;
    if (!Array.isArray(kept)) {
      return 'the admission ticks are a list';
    }
    if (roles === null) {
      return kept.length === 0 ? null : 'a tick with no role catalog holds no admission ticks';
    }
    const catalog = roles;
    /** @type {Set<string>} */
    const keys = new Set();
    for (const entry of kept) {
      const key = Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' ? entry[0] : null;
      const space = key === null ? -1 : key.indexOf(' ');
      const fits = key !== null && !keys.has(key) && space > 0 && space < key.length - 1 && catalog.byName.has(key.slice(0, space))
        && Array.isArray(entry[1]) && entry[1].length > 0
        && entry[1].every((/** @type {unknown} */ at, /** @type {number} */ i) => Number.isInteger(at) && /** @type {number} */ (at) >= 0 && /** @type {number} */ (at) <= saved.tick && (i === 0 || /** @type {number} */ (at) >= entry[1][i - 1]));
      if (!fits) {
        return 'the admission ticks are, for each instance of a role in this catalog, the ticks of its admissions, ascending, none after the saved tick';
      }
      keys.add(/** @type {string} */ (key));
    }
    return null;
  }

  /**
   * Why a saved log's provenance is not one this tick could have admitted, or
   * null: each role's entry carries provenance of the pinned shape, citing a
   * role and a manifest this tick's catalog holds. A host's entry has none.
   * @param {any[]} log
   * @returns {string | null}
   */
  function logProvenanceProblem(log) {
    for (const entry of log) {
      if (entry.provenance === undefined) {
        continue;
      }
      if (roles === null) {
        return 'a tick with no role catalog logs no role\'s entry';
      }
      const shape = provenanceProblem(entry.provenance);
      if (shape !== null) {
        return 'a log entry\'s provenance is refused: ' + shape;
      }
      const found = findRole(roles, entry.provenance.role, entry.provenance.manifest);
      if (!found.ok) {
        return 'a log entry\'s provenance is refused: ' + found.reason;
      }
    }
    return null;
  }

  /**
   * Why a saved frame's body records are not the ones the tick committed, or
   * null (#83). They are checked as the world checks its own saved records:
   * one record per body of this world, in the world's order, each with its
   * body's id and every number commitFrame copies. A body drafted at the saved
   * tick is in the world and not yet in the frame, which the next quantum
   * commits, so the frame holds every body of this world but those the saved
   * log drafted at that tick.
   * @param {any} saved a save whose frame and log have their shape
   * @returns {string | null}
   */
  function frameProblem(saved) {
    const drafted = saved.log.filter((/** @type {any} */ entry) => entry.tick === saved.tick && entry.proposal.kind === 'body').length;
    const committed = world.bodies.length - drafted;
    const records = saved.frame.bodies;
    if (records.length !== committed) {
      return 'the frame does not have the ' + committed + ' bodies of this world' + (drafted > 0 ? ' before the ' + drafted + ' drafted at tick ' + saved.tick : '');
    }
    for (let i = 0; i < committed; i = i + 1) {
      const from = records[i];
      if (!from || typeof from !== 'object' || from.id !== world.bodies[i].id) {
        return 'frame record ' + i + ' is ' + (from && typeof from === 'object' ? from.id : String(from)) + ' in the save and ' + world.bodies[i].id + ' here';
      }
      if (!FRAME_RECORD.every((field) => typeof from[field] === 'number')) {
        return 'frame record ' + i + ' (' + from.id + ') is not a record of numbers';
      }
    }
    return null;
  }

  /**
   * Whether a value is a scheduled action as submit writes one.
   * @param {any} action
   */
  function isAction(action) {
    return Boolean(action) && typeof action === 'object' && Number.isInteger(action.remaining) && action.remaining >= 1
      && typeof action.effect === 'string' && Number.isInteger(action.riseQuanta) && action.riseQuanta >= 0
      && typeof action.aimX === 'number' && typeof action.aimZ === 'number'
      && (action.otherId === null || typeof action.otherId === 'string') && typeof action.speed === 'number';
  }

  /**
   * Why a value is not a save of this tick, or null. It checks the whole
   * save, the committed frame record by record and the world's part with the
   * world's own check, so restore changes nothing until nothing it reads can
   * fail.
   * @param {any} saved
   * @returns {string | null}
   */
  function saveProblem(saved) {
    if (!saved || typeof saved !== 'object') {
      return 'a save is an object';
    }
    if (saved.seed !== seed) {
      return 'the save is of a tick seeded ' + String(saved.seed) + ', and this tick is seeded ' + seed;
    }
    if (!Number.isInteger(saved.tick) || saved.tick < 0) {
      return 'the tick is a whole number';
    }
    if (!Array.isArray(saved.lanes) || saved.lanes.length !== 2 || !saved.lanes.every((/** @type {unknown} */ lane) => Number.isInteger(lane) && /** @type {number} */ (lane) >= 0 && /** @type {number} */ (lane) <= 0xffffffff)) {
      return 'the lanes are two whole numbers from 0 through 2^32 - 1';
    }
    if (!saved.frame || typeof saved.frame !== 'object' || saved.frame.tick !== saved.tick || typeof saved.frame.hash !== 'string' || !Array.isArray(saved.frame.bodies)) {
      return 'the frame is the committed frame at the saved tick';
    }
    if (!Array.isArray(saved.actions) || !saved.actions.every((/** @type {any} */ entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && world.body(entry[0]) !== undefined && isAction(entry[1]))
      || new Set(saved.actions.map((/** @type {any[]} */ entry) => entry[0])).size !== saved.actions.length) {
      return 'the actions are actor ids, each with an action and its quanta still to run';
    }
    if (!Number.isInteger(saved.pending) || saved.pending < 0) {
      return 'the quanta owed are a whole number';
    }
    const minds = mindsSaveProblem(world, saved.minds);
    if (minds !== null) {
      return minds;
    }
    const kept = memorySaveProblem(saved.memory);
    if (kept !== null) {
      return kept;
    }
    if (!Array.isArray(saved.log) || !saved.log.every((/** @type {any} */ entry) => entry && Number.isInteger(entry.tick) && typeof entry.hash === 'string' && entry.proposal && typeof entry.proposal === 'object')) {
      return 'the log is entries with a tick, a hash, and a proposal';
    }
    // After the log's shape: the log says which bodies were drafted since the
    // frame was committed.
    const framed = frameProblem(saved);
    if (framed !== null) {
      return framed;
    }
    const cited = logProvenanceProblem(saved.log);
    if (cited !== null) {
      return cited;
    }
    const windowed = windowProblem(saved);
    if (windowed !== null) {
      return windowed;
    }
    const budgeted = admissionsProblem(saved);
    if (budgeted !== null) {
      return budgeted;
    }
    return world.restoreProblem(saved.world);
  }

  /**
   * Puts back a save this tick, or one built from the same world file and
   * seed, took. The whole save is checked first, every field restore reads,
   * the world's included; then the world is restored, which refuses an image
   * of another binary or one whose bytes do not match its digest before it
   * writes anything. A refused restore changes nothing, and past the world's
   * restore nothing can fail, so no restore stops halfway. After it, the tick
   * is where it was when saved: its next quantum hashes on from the saved
   * lanes, its actions resume with the quanta they had left, it owes the
   * quanta it owed, and its log is the saved log. The restore does not draw:
   * the attached hosts see the next committed frame. With a role catalog, the
   * gate reads the saved window and admission ticks, so a proposal built
   * before the save and offered after it, or one over its budget, is admitted
   * or refused as it would have been without the restore.
   * @param {TickSave} saved
   */
  function restore(saved) {
    const why = saveProblem(saved);
    if (why !== null) {
      throw new Error('restore refused: ' + why);
    }
    world.restore(saved.world);
    tick = saved.tick;
    hasher.resume(saved.lanes);
    current = saved.frame;
    actions.clear();
    for (const [id, action] of saved.actions) {
      actions.set(id, { ...action });
    }
    pending = saved.pending;
    restoreMinds(world, saved.minds);
    memory.restore(saved.memory);
    inputLog.length = 0;
    for (const entry of saved.log) {
      inputLog.push(entry);
    }
    frames.length = 0;
    for (const frame of saved.window) {
      frames.push(copyFrame(frame));
    }
    admissions.clear();
    for (const [key, ticks] of saved.admissions) {
      admissions.set(key, ticks.slice());
    }
  }

  return {
    tick: {
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
    },
    save,
    restore,
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
