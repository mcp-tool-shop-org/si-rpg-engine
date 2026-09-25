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
// writes geometry (packages/tick/tick.test.js, the host boundary).
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

import { createHasher } from '../frame/hash.js';
import { commitFrame } from '../frame/frame.js';
import { beliefRefusal, subjectText } from './beliefs.js';
import { canonical } from './canonical.js';
import { beliefLabel, budgetRefusal, freshnessRefusal, roleRefusal } from './gate.js';
import { memorySaveProblem } from './memory.js';
import { installMinds, mindsSaveProblem, mixMinds, observeMinds, restoreMinds, saveMinds } from './minds.js';
import { admitIntent } from './predicates.js';
import { AUTHORED } from './trust.js';

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
 *   log: LogEntry[], world: WorldSave
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
          memory.recordEpisode(tick, 'use', 'use ' + proposal.actor + ' ' + name);
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
      world: world.saveSparse(),
    };
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
   * save, the world's part with the world's own check, so restore changes
   * nothing until nothing it reads can fail.
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
   * the attached hosts see the next committed frame.
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
