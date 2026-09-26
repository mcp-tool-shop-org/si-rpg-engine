// The reachability sweep, T6 (docs/dispatch-t6-reachability-sweep.md). It
// explores the states a world can reach with its admitted verbs, through the
// checker and the pinned binary, returning to a state by restoring the tick's
// save (T6 pins 1 and 2), and compares where bodies got with the zones the file
// authored. Every claim comes with a witness: the log of admitted intents from
// the load that reaches it, which `replay` reproduces hash for hash.
//
// Actors (pin 4). The goal's actor, every body with a mind, and for a fixture
// every body its log drives. One actor is swept at a time while the other
// bodies take no action; a zone counts as reached when any actor's sweep
// reaches it. A world with no actor has nothing to sweep.
//
// Cells (pin 3). The archive maps a cell to the first settled state that
// reached it. The cell key is the string
//
//   <actor> <ix>,<iy>,<iz> carries <body or -> <body>:<zone index or -> ...
//
// where ix, iy, iz are Math.floor of the actor's centre over the pitch on each
// axis, the pitch is the actor's smaller horizontal full extent (2 * min(hx, hz),
// 0.5 for the walker of worlds/crate-and-door.json), the carried body is the one
// the actor carries, and the list names every other body not carried, in body
// order, with the index of the zone that holds its centre. A change to this key
// is named in the pull request that makes it.
//
// Settled (pin 3). A state is archived only when nothing is scheduled and the
// world has settled within SETTLE_QUANTA (512) quanta of the action ending. The
// sweep stops at the first quantum at which every body is asleep in the solver
// (a carried body, which has left the solver and cannot sleep, counts as
// settled while carried). It waits for sleep rather than for rest because rest
// is a velocity at one quantum and sleep is the solver's own word that nothing
// will change while nothing acts: when an action ends the actor stands still a
// controller's skin above where it will come to rest, and a body at rest but
// awake still changes state when it falls asleep, which pick-up reads, since
// it refuses a body that is awake. The sweep has no action that waits, so a
// state it archives must be one that waiting would not change. When
// SETTLE_QUANTA pass without that, the load hazard's own criterion decides at
// the last of them: every body asleep or at rest (speed and spin at most
// AT_REST, 1e-2) is settled, anything else is a finding.
//
// Actions (pin 5), tried in this order from each archived cell, one at a time,
// each citing the newest frame's hash and going through submit. The verbs are
// the admitted ones in predicates/intents/index.json order; a retired verb is
// never proposed. By effect:
//   drive, point target (move): the centres of the 8 neighbouring cells, in
//     DIRECTIONS order (+x, then counter-clockwise about y);
//   drive, body target (push), and carry (pick-up): each other body not
//     carried, in body order;
//   climb, and release (drop) while the actor carries a body: the centres of
//     the cells REACHES (1, 2, 3) out in each direction, reach by reach;
//   episode (use): not swept, since it changes nothing in the world.
// The checker is the only judge: a target past a rule's maxDistance is proposed
// and refused like any other refusal, which costs nothing more. An admitted
// action runs to completion and then to settled. This is the whole action set.
// A route that needs anything else (two actors at once, a target off the grid,
// a wait before acting) is not explored, and every report names the action set,
// so an unreached zone reads as "not reached by these actions".
//
// Order and determinism (pin 6). The frontier is breadth-first in the order
// cells were archived. Sweeping a world twice gives the same archive, the same
// witnesses, and the same verdicts.
//
// Findings (pin 7). An admitted action after which a body's centre is below
// the lowest collider's minimum, a heightfield's lowest sample counted as a
// collider (it left the world), after which the tick
// throws, or after which the world does not settle within SETTLE_QUANTA. Each
// is written as a T5 bundle, a `log` bundle whose log is the witness plus the
// action and whose length runs to the quantum it was found at, which `replay`
// reproduces. The first finding of each kind for each body and actor writes a
// bundle; the rest are counted.
//
// Budget (pin 9). A sweep may run budget.quanta quanta and make
// budget.restores restores. The actors share it: each may spend an equal part
// of what the actors before it left, so an actor that finishes early passes
// the rest on and a large one cannot starve those after it. An actor stops
// when its part is spent, checked before each proposal, so it may overrun by
// one action and its settle. A sweep with any actor stopped is deferred:
// whatever it has found stands, and no zone is refused as unreached.
//
// Watching (T7b pin 5). The instrument's bench runs this sweep as its aimed
// proposer and takes each action's reach around it. A caller that passes
// `watch` is told of every proposal, in the order the sweep makes them: open()
// just before it is submitted, then refused() with the checker's reason, or,
// once an admitted action has run out and settled or been found, admitted()
// with the witness of the cell it was taken from, its log entry, and how it
// ended. Between open() and admitted() only the submission and its quanta run:
// no restore, no save, and no zone or cell bookkeeping. The watch reads what
// it is handed and returns nothing the sweep reads, so a sweep with one
// explores, and reports, exactly as a sweep without.

import { worldFloor } from '../tick/admit-world.js';
import { bundleFrom, captureBundle, writeBundle } from '../tick/bundle.js';
import { createMemory } from '../tick/memory.js';
import { loadIntentRules } from '../tick/predicates.js';
import { replayTo } from '../tick/runs.js';
import { createRestorableTick } from '../tick/tick.js';
import { createWorld } from '../tick/world.js';

/** The quanta a world has to settle in after an action ends: the load hazard's. */
export const SETTLE_QUANTA = 512;
/** The load hazard's speed and spin at rest. */
export const AT_REST = 1e-2;
/** The eight directions on the ground plane, +x first, then counter-clockwise about y. */
export const DIRECTIONS = /** @type {ReadonlyArray<readonly [number, number]>} */ ([[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]);
/** How many cells out a climb or a drop aims: a ledge's edge need not fall on the next cell. */
export const REACHES = /** @type {ReadonlyArray<number>} */ ([1, 2, 3]);

/**
 * @typedef {import('../tick/runs.js').WorldInit} WorldInit
 * @typedef {import('../tick/runs.js').LogEntry} LogEntry
 * @typedef {import('../tick/tick.js').TickSave} TickSave
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {{ name: string, seed: number, world: WorldInit, actors: string[] }} SweepInput
 * @typedef {{ quanta: number, restores: number }} Budget
 * @typedef {{ tick: number, hash: string }} PathPoint
 * @typedef {{ actor: string, log: LogEntry[], tick: number, hash: string, path: PathPoint[] }} Witness
 * @typedef {{ key: string, actor: string, parent: Cell | null, entry: LogEntry | null, tick: number, hash: string, state: TickSave | null }} Cell
 * @typedef {{ verb: string, target: { x: number, z: number } | { body: string } }} Action
 * @typedef {'leaves' | 'throws' | 'unsettled'} FindingKind
 * @typedef {{ kind: FindingKind, actor: string, body: string | null, action: Action | null, from: string | null, tick: number, hash: string, detail: string, witness: Witness, count: number, bundle: string | null }} Finding
 * @typedef {{ id: string, reached: boolean, body: string | null, actor: string | null, witness: Witness | null }} ZoneVerdict
 * @typedef {{ actor: string, pitch: number, cells: number, tried: number, admitted: number, quanta: number, restores: number, complete: boolean, frontier: number }} ActorCosts
 * @typedef {{
 *   open: () => void,
 *   refused: (made: { actor: string, cell: string, action: Action, reason: string }) => void,
 *   admitted: (made: { actor: string, cell: string, witness: Witness, action: Action, entry: LogEntry, end: 'settled' | FindingKind, tick: number, hash: string }) => void,
 * }} SweepWatch
 * @typedef {{
 *   name: string, actors: string[], actionSet: string, complete: boolean, settledAtLoad: boolean,
 *   zones: ZoneVerdict[], findings: Finding[],
 *   cells: number, tried: number, admitted: number, refused: number, quanta: number, restores: number, saves: number, frontier: number,
 *   ms: number, restoreMs: number, saveMs: number, budget: Budget, perActor: ActorCosts[],
 *   archive: Array<{ actor: string, cells: Array<{ key: string, tick: number, hash: string, witness: () => Witness }> }>
 * }} SweepReport
 */

/**
 * The sweep's input for a world file: the goal's actor, then every body with
 * a mind in file order, each once.
 * @param {import('../tick/scene.js').Scene} scene
 * @returns {SweepInput}
 */
export function sceneInput(scene) {
  /** @type {string[]} */
  const actors = [];
  if (scene.goal) {
    actors.push(scene.goal.actor);
  }
  for (const mind of scene.minds || []) {
    if (!actors.includes(mind.body)) {
      actors.push(mind.body);
    }
  }
  return {
    name: scene.name,
    seed: scene.seed,
    world: {
      bodies: scene.bodies,
      colliders: scene.colliders,
      zones: scene.zones,
      heightfield: scene.heightfield,
      name: scene.name,
      minds: scene.minds,
    },
    actors,
  };
}

/**
 * The action set in words, for every report: a refusal reads as "not reached
 * by these actions", never as a proof of the impossible.
 * @param {Map<string, IntentRule>} rules
 */
export function actionSet(rules) {
  /** @type {string[]} */
  const parts = [];
  for (const rule of rules.values()) {
    const effect = rule.effect || 'drive';
    if (effect === 'drive' && (rule.targetKind ?? 'point') === 'point') {
      parts.push(rule.verb + ' to the centres of the 8 neighbouring cells');
    } else if (effect === 'drive' || effect === 'carry') {
      parts.push(rule.verb + ' at each body not carried');
    } else if (effect === 'climb') {
      parts.push(rule.verb + ' ' + REACHES.join(', ') + ' cells out in 8 directions');
    } else if (effect === 'release') {
      parts.push(rule.verb + ', while carrying, ' + REACHES.join(', ') + ' cells out in 8 directions');
    } else {
      parts.push(rule.verb + ' not swept');
    }
  }
  return parts.join('; ') + '; one actor at a time, the others taking no action, from settled states only';
}

/**
 * The pitch of an actor's grid: its smaller horizontal full extent.
 * @param {{ hx: number, hz: number }} actor
 */
export function pitchOf(actor) {
  return 2 * Math.min(actor.hx, actor.hz);
}

/**
 * The cell key of the world's current state for one actor (see the top of this file).
 * @param {ReturnType<typeof createWorld>} world
 * @param {string} actorId
 * @param {number} pitch
 */
export function cellKey(world, actorId, pitch) {
  const actor = world.body(actorId);
  if (!actor) {
    throw new Error('no body named ' + actorId);
  }
  const carried = world.carryingOf(actorId);
  const parts = [actorId, Math.floor(actor.x / pitch) + ',' + Math.floor(actor.y / pitch) + ',' + Math.floor(actor.z / pitch), 'carries', carried || '-'];
  for (const body of world.bodies) {
    if (body.id === actorId || body.id === carried) {
      continue;
    }
    const zone = world.zoneIndex(body.id);
    parts.push(body.id + ':' + (zone === null ? '-' : String(zone)));
  }
  return parts.join(' ');
}

/**
 * Which collider's footprint, on the ground plane, holds a point, or null
 * when none does. A rotated collider's footprint is the box around its eight
 * corners, so a point near one reads as under it; a heightfield's is its
 * extent, centred on the origin as the solver centres it. It says whether a
 * body that left the world went past an edge or fell through something.
 * @param {ReturnType<typeof createWorld>} world
 * @param {number} x
 * @param {number} z
 * @returns {string | null}
 */
export function footprintAt(world, x, z) {
  for (const box of world.colliders) {
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const hx = (box.maxX - box.minX) / 2;
    const hy = (box.maxY - box.minY) / 2;
    const hz = (box.maxZ - box.minZ) / 2;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = sx * hx;
          const py = sy * hy;
          const pz = sz * hz;
          const tx = 2 * (box.qy * pz - box.qz * py);
          const ty = 2 * (box.qz * px - box.qx * pz);
          const tz = 2 * (box.qx * py - box.qy * px);
          const wx = cx + px + box.qw * tx + (box.qy * tz - box.qz * ty);
          const wz = cz + pz + box.qw * tz + (box.qx * ty - box.qy * tx);
          minX = Math.min(minX, wx);
          maxX = Math.max(maxX, wx);
          minZ = Math.min(minZ, wz);
          maxZ = Math.max(maxZ, wz);
        }
      }
    }
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
      return box.id;
    }
  }
  const field = world.heightfield;
  if (field) {
    const halfX = ((field.cols - 1) * field.cell) / 2;
    const halfZ = ((field.rows - 1) * field.cell) / 2;
    if (x >= -halfX && x <= halfX && z >= -halfZ && z <= halfZ) {
      return 'heightfield';
    }
  }
  return null;
}

/**
 * Every settled state along a cell's path from the load, the load's first.
 * @param {Cell} cell
 * @returns {PathPoint[]}
 */
function pathOf(cell) {
  /** @type {PathPoint[]} */
  const path = [];
  for (let at = /** @type {Cell | null} */ (cell); at; at = at.parent) {
    path.push({ tick: at.tick, hash: at.hash });
  }
  return path.reverse();
}

/**
 * The admitted intents from the load that reach a cell.
 * @param {Cell} cell
 * @returns {LogEntry[]}
 */
function logOf(cell) {
  /** @type {LogEntry[]} */
  const log = [];
  for (let at = /** @type {Cell | null} */ (cell); at; at = at.parent) {
    if (at.entry) {
      log.push(at.entry);
    }
  }
  return log.reverse();
}

/**
 * @param {Cell} cell
 * @returns {Witness}
 */
function witnessOf(cell) {
  return { actor: cell.actor, log: logOf(cell), tick: cell.tick, hash: cell.hash, path: pathOf(cell) };
}

/**
 * The run a witness names: its log from the load, on to the witness's quantum.
 * @param {SweepInput} input
 * @param {Witness} witness
 * @returns {import('../tick/runs.js').LogSpec}
 */
export function witnessSpec(input, witness) {
  return { seed: input.seed, world: input.world, log: witness.log, law: 'product', quanta: witness.tick };
}

/**
 * Replays a witness through the ordinary replay path (packages/tick/runs.js,
 * which `replay` uses for a bundle): each intent is submitted at its tick and
 * its admission hash checked, and every settled state on the path, and the
 * witness's own quantum, must hash as the sweep recorded. Null when it does,
 * else what differed.
 * @param {SweepInput} input
 * @param {Witness} witness
 * @returns {string | null}
 */
export function replayWitness(input, witness) {
  let run;
  try {
    run = replayTo(witnessSpec(input, witness), 0);
  } catch (error) {
    return 'the witness does not load: ' + /** @type {Error} */ (error).message;
  }
  const points = witness.path.concat([{ tick: witness.tick, hash: witness.hash }]);
  let next = 0;
  for (;;) {
    while (next < points.length && points[next].tick === run.tick) {
      if (points[next].hash !== run.hash) {
        return 'at tick ' + run.tick + ' the replay hashes ' + run.hash + ', and the sweep recorded ' + points[next].hash;
      }
      next = next + 1;
    }
    if (next >= points.length) {
      return null;
    }
    try {
      if (!run.advance()) {
        return 'the replay ends at ' + run.tick + ', before ' + points[next].tick;
      }
    } catch (error) {
      return 'the replay threw at ' + (run.tick + 1) + ': ' + /** @type {Error} */ (error).message;
    }
  }
}

/**
 * Sweeps a world.
 * @param {SweepInput} input
 * @param {{
 *   budget: Budget,
 *   bundles?: string | null,
 *   restore?: (tick: ReturnType<typeof createRestorableTick>, saved: TickSave) => void,
 *   say?: (line: string) => void,
 *   watch?: SweepWatch,
 * }} options bundles: the directory findings write their bundles into, or null
 *   for none; restore: how a state is put back, the tick's own restore unless a
 *   test plants another; watch: told of every proposal (see Watching, above)
 * @returns {SweepReport}
 */
export function sweep(input, options) {
  const t0 = performance.now();
  const say = options.say || (() => {});
  const watch = options.watch || null;
  const catalog = loadIntentRules();
  const rules = catalog.rules;
  const set = actionSet(rules);
  const world = createWorld(input.world, 'product');
  const tick = createRestorableTick({ seed: input.seed, world, rules, retired: catalog.retired, memory: createMemory() });
  const floor = worldFloor(world.colliders, world.heightfield);
  const put = options.restore || ((t, saved) => t.restore(saved));
  const budget = options.budget;
  const counts = { tried: 0, admitted: 0, refused: 0, quanta: 0, restores: 0, saves: 0, restoreMs: 0, saveMs: 0 };

  /** @type {ZoneVerdict[]} */
  const zones = world.zones.map((zone) => ({ id: zone.id, reached: false, body: null, actor: null, witness: null }));
  /** @type {Map<string, Finding>} */
  const found = new Map();
  /** @type {SweepReport['archive']} */
  const archives = [];
  /** @type {ActorCosts[]} */
  const perActor = [];

  /**
   * Where a body that left the world is, in words: its ground-plane point, and
   * whether that point is past every collider's edge or under one's footprint.
   * @param {string} id
   */
  function whereLeft(id) {
    const body = /** @type {import('../frame/types.js').Body} */ (world.body(id));
    const under = footprintAt(world, body.x, body.z);
    return ' at (x, z) (' + body.x.toFixed(3) + ', ' + body.z.toFixed(3) + '), ' + (under === null ? 'past the edge of every collider' : 'under the footprint of ' + under + ', so it fell through');
  }

  /** @returns {'ok' | { kind: 'throws', message: string } | { kind: 'leaves', body: string, y: number }} */
  function step() {
    try {
      tick.advance();
    } catch (error) {
      counts.quanta = counts.quanta + 1;
      return { kind: 'throws', message: error instanceof Error ? error.message : String(error) };
    }
    counts.quanta = counts.quanta + 1;
    for (const body of world.bodies) {
      if (body.y < floor) {
        return { kind: 'leaves', body: body.id, y: body.y };
      }
    }
    return 'ok';
  }

  function allAsleep() {
    return world.bodies.every((body) => world.carriedByOf(body.id) !== null || world.sleeping(body.id));
  }

  /** The bodies neither asleep nor at rest, the load hazard's criterion. */
  function restless() {
    return world.bodies.filter((body) => {
      if (world.carriedByOf(body.id) !== null || world.sleeping(body.id)) {
        return false;
      }
      return Math.hypot(body.vx, body.vy, body.vz) > AT_REST || Math.hypot(body.wx, body.wy, body.wz) > AT_REST;
    }).map((body) => body.id);
  }

  /**
   * Runs what is scheduled to its end, then waits for the world to settle.
   * @returns {{ kind: 'settled' } | { kind: 'throws', message: string } | { kind: 'leaves', body: string, y: number } | { kind: 'unsettled', bodies: string[] }}
   */
  function runOut() {
    while (!tick.idle()) {
      const got = step();
      if (got !== 'ok') {
        return got;
      }
    }
    for (let n = 0; ; n = n + 1) {
      if (allAsleep()) {
        return { kind: 'settled' };
      }
      if (n === SETTLE_QUANTA) {
        const moving = restless();
        return moving.length === 0 ? { kind: 'settled' } : { kind: 'unsettled', bodies: moving };
      }
      const got = step();
      if (got !== 'ok') {
        return got;
      }
    }
  }

  /** Marks every zone a body's centre is in as reached, with the witness to here. */
  /**
   * @param {() => Witness} witness
   * @param {string} actor
   */
  function seeZones(witness, actor) {
    for (const body of world.bodies) {
      const index = world.zoneIndex(body.id);
      if (index !== null && !zones[index].reached) {
        zones[index].reached = true;
        zones[index].body = body.id;
        zones[index].actor = actor;
        zones[index].witness = witness();
        say('zone ' + zones[index].id + ' reached by ' + body.id + ' at tick ' + tick.frame().tick + ' (' + actor + ' sweeping)');
      }
    }
  }

  /**
   * Records a finding; the first of each kind for each body and actor keeps its witness.
   * @param {FindingKind} kind
   * @param {string} actor
   * @param {string | null} body
   * @param {Action | null} action
   * @param {string | null} from
   * @param {Witness} witness
   * @param {string} detail
   */
  function note(kind, actor, body, action, from, witness, detail) {
    const key = kind + ' ' + actor + ' ' + (body || '-');
    const known = found.get(key);
    if (known) {
      known.count = known.count + 1;
      return;
    }
    found.set(key, { kind, actor, body, action, from, tick: witness.tick, hash: witness.hash, detail, witness, count: 1, bundle: null });
    say('finding: ' + detail);
  }

  /**
   * The actions from the current state for one actor, in the stated order.
   * @param {string} actorId
   * @param {number} pitch
   * @returns {Action[]}
   */
  function actionsFor(actorId, pitch) {
    const actor = /** @type {import('../frame/types.js').Body} */ (world.body(actorId));
    const ix = Math.floor(actor.x / pitch);
    const iz = Math.floor(actor.z / pitch);
    /** @param {number} i */
    const centre = (i) => (i + 0.5) * pitch;
    const carrying = world.carryingOf(actorId);
    const others = world.bodies.filter((body) => body.id !== actorId && world.carriedByOf(body.id) === null).map((body) => body.id);
    /** @type {Action[]} */
    const out = [];
    for (const rule of rules.values()) {
      const effect = rule.effect || 'drive';
      if (effect === 'drive' && (rule.targetKind ?? 'point') === 'point') {
        for (const [dx, dz] of DIRECTIONS) {
          out.push({ verb: rule.verb, target: { x: centre(ix + dx), z: centre(iz + dz) } });
        }
      } else if (effect === 'drive' || effect === 'carry') {
        for (const id of others) {
          out.push({ verb: rule.verb, target: { body: id } });
        }
      } else if (effect === 'climb' || (effect === 'release' && carrying)) {
        for (const reach of REACHES) {
          for (const [dx, dz] of DIRECTIONS) {
            out.push({ verb: rule.verb, target: { x: centre(ix + reach * dx), z: centre(iz + reach * dz) } });
          }
        }
      }
    }
    return out;
  }

  /** @param {TickSave} saved */
  function restoreTo(saved) {
    const r0 = performance.now();
    put(tick, saved);
    counts.restoreMs = counts.restoreMs + performance.now() - r0;
    counts.restores = counts.restores + 1;
  }

  function save() {
    const s0 = performance.now();
    const saved = tick.save();
    counts.saveMs = counts.saveMs + performance.now() - s0;
    counts.saves = counts.saves + 1;
    return saved;
  }

  /** @param {Action} action */
  function describe(action) {
    const target = 'body' in action.target ? action.target.body : '(' + action.target.x + ', ' + action.target.z + ')';
    return action.verb + ' ' + target;
  }

  // The load, settled: the root every actor's sweep starts from.
  const loadEnd = runOut();
  const rootWitness = () => ({ actor: input.actors[0] || '-', log: [], tick: tick.frame().tick, hash: tick.frame().hash, path: [] });
  let complete = true;
  let settledAtLoad = false;
  if (loadEnd.kind !== 'settled') {
    complete = false;
    const actor = input.actors[0] || '-';
    if (loadEnd.kind === 'leaves') {
      note('leaves', actor, loadEnd.body, null, null, rootWitness(), loadEnd.body + ' leaves the world after the load, below ' + floor + ' at tick ' + tick.frame().tick + whereLeft(loadEnd.body));
    } else if (loadEnd.kind === 'throws') {
      note('throws', actor, null, null, null, { ...rootWitness(), tick: tick.frame().tick + 1, hash: 'NAN' }, 'the tick throws after the load at tick ' + (tick.frame().tick + 1) + ': ' + loadEnd.message);
    } else {
      note('unsettled', actor, loadEnd.bodies[0], null, null, rootWitness(), 'the world does not settle within ' + SETTLE_QUANTA + ' quanta of its load: ' + loadEnd.bodies.join(', ') + ' still moving at tick ' + tick.frame().tick);
    }
  } else {
    settledAtLoad = true;
  }
  const rootTick = tick.frame().tick;
  const rootHash = tick.frame().hash;
  const root = settledAtLoad ? save() : null;
  if (root) {
    seeZones(() => ({ actor: input.actors[0] || '-', log: [], tick: rootTick, hash: rootHash, path: [{ tick: rootTick, hash: rootHash }] }), input.actors[0] || '-');
  }
  /** The key of the archived state the tick is exactly at, or null. */
  let at = /** @type {string | null} */ (null);

  for (const actorId of root ? input.actors : []) {
    const actorBody = world.body(actorId);
    if (!actorBody) {
      throw new Error('the sweep of ' + input.name + ' names ' + actorId + ', which is not a body');
    }
    const pitch = pitchOf(actorBody);
    const before = { ...counts };
    const left = input.actors.length - input.actors.indexOf(actorId);
    const share = {
      quanta: before.quanta + (budget.quanta - before.quanta) / left,
      restores: before.restores + (budget.restores - before.restores) / left,
    };
    restoreTo(/** @type {TickSave} */ (root));
    /** @type {Map<string, Cell>} */
    const archive = new Map();
    /** @type {Cell[]} */
    const order = [];
    const first = /** @type {Cell} */ ({ key: cellKey(world, actorId, pitch), actor: actorId, parent: null, entry: null, tick: rootTick, hash: rootHash, state: root });
    archive.set(first.key, first);
    order.push(first);
    at = first.key;
    let next = 0;
    let stopped = false;
    while (next < order.length && !stopped) {
      const cell = order[next];
      next = next + 1;
      if (at !== cell.key) {
        restoreTo(/** @type {TickSave} */ (cell.state));
        at = cell.key;
      }
      const actions = actionsFor(actorId, pitch);
      for (const action of actions) {
        if (counts.quanta >= share.quanta || counts.restores >= share.restores) {
          stopped = true;
          next = next - 1;
          break;
        }
        if (at !== cell.key) {
          restoreTo(/** @type {TickSave} */ (cell.state));
          at = cell.key;
        }
        counts.tried = counts.tried + 1;
        if (watch) {
          watch.open();
        }
        const result = tick.submit({ kind: 'intent', verb: action.verb, actor: actorId, target: action.target, frameHash: tick.frame().hash });
        if (!result.admitted) {
          counts.refused = counts.refused + 1;
          if (watch) {
            watch.refused({ actor: actorId, cell: cell.key, action, reason: result.reason });
          }
          continue;
        }
        counts.admitted = counts.admitted + 1;
        at = null;
        const log = tick.log();
        const entry = log[log.length - 1];
        const end = runOut();
        const now = tick.frame();
        if (watch) {
          watch.admitted({ actor: actorId, cell: cell.key, witness: witnessOf(cell), action, entry, end: end.kind, tick: now.tick, hash: now.hash });
        }
        /** @returns {Witness} */
        const here = () => {
          const path = pathOf(cell);
          return { actor: actorId, log: logOf(cell).concat([entry]), tick: now.tick, hash: now.hash, path };
        };
        if (end.kind === 'leaves') {
          note('leaves', actorId, end.body, action, cell.key, here(), end.body + ' leaves the world after ' + describe(action) + ' by ' + actorId + ': its centre is at y ' + end.y + ', below the lowest collider minimum ' + floor + ', at tick ' + now.tick + whereLeft(end.body));
          continue;
        }
        if (end.kind === 'throws') {
          note('throws', actorId, null, action, cell.key, { ...here(), tick: now.tick + 1, hash: 'NAN' }, 'the tick throws after ' + describe(action) + ' by ' + actorId + ', producing tick ' + (now.tick + 1) + ': ' + end.message);
          continue;
        }
        if (end.kind === 'unsettled') {
          const moving = /** @type {import('../frame/types.js').Body} */ (world.body(end.bodies[0]));
          note('unsettled', actorId, end.bodies[0], action, cell.key, here(), 'the world does not settle within ' + SETTLE_QUANTA + ' quanta after ' + describe(action) + ' by ' + actorId + ': ' + end.bodies.join(', ') + ' still moving at tick ' + now.tick
            + ', ' + moving.id + ' at (' + moving.x.toFixed(3) + ', ' + moving.y.toFixed(3) + ', ' + moving.z.toFixed(3) + ') moving at ' + Math.hypot(moving.vx, moving.vy, moving.vz).toFixed(3) + ' and turning at ' + Math.hypot(moving.wx, moving.wy, moving.wz).toFixed(3));
          continue;
        }
        seeZones(() => ({ ...here(), path: here().path.concat([{ tick: now.tick, hash: now.hash }]) }), actorId);
        const key = cellKey(world, actorId, pitch);
        if (!archive.has(key)) {
          const made = /** @type {Cell} */ ({ key, actor: actorId, parent: cell, entry, tick: now.tick, hash: now.hash, state: save() });
          archive.set(key, made);
          order.push(made);
          at = key;
        }
      }
      if (!stopped && cell !== first) {
        // Explored: its state is no longer needed, only its path.
        cell.state = null;
      }
    }
    const unexplored = order.length - next;
    if (unexplored > 0) {
      complete = false;
    }
    for (const cell of order.slice(0, next)) {
      if (cell !== first) {
        cell.state = null;
      }
    }
    perActor.push({
      actor: actorId,
      pitch,
      cells: order.length,
      tried: counts.tried - before.tried,
      admitted: counts.admitted - before.admitted,
      quanta: counts.quanta - before.quanta,
      restores: counts.restores - before.restores,
      complete: unexplored === 0,
      frontier: unexplored,
    });
    archives.push({ actor: actorId, cells: order.map((cell) => ({ key: cell.key, tick: cell.tick, hash: cell.hash, witness: () => witnessOf(cell) })) });
    say(actorId + ': ' + order.length + ' cells, ' + (counts.tried - before.tried) + ' actions tried, ' + (counts.admitted - before.admitted) + ' admitted' + (unexplored > 0 ? ', ' + unexplored + ' left in the frontier' : ''));
  }

  const findings = Array.from(found.values());
  if (options.bundles) {
    for (const finding of findings) {
      finding.bundle = findingBundle(input, finding, options.bundles);
    }
  }
  const frontier = perActor.reduce((sum, costs) => sum + costs.frontier, 0);
  return {
    name: input.name,
    actors: input.actors.slice(),
    actionSet: set,
    complete: complete && settledAtLoad,
    settledAtLoad,
    zones,
    findings,
    cells: perActor.reduce((sum, costs) => sum + costs.cells, 0),
    tried: counts.tried,
    admitted: counts.admitted,
    refused: counts.refused,
    quanta: counts.quanta,
    restores: counts.restores,
    saves: counts.saves,
    frontier,
    ms: performance.now() - t0,
    restoreMs: counts.restoreMs,
    saveMs: counts.saveMs,
    budget,
    perActor,
    archive: archives,
  };
}

/**
 * Writes a finding's bundle and returns its path: a `log` bundle whose log is
 * the witness plus the action, replayed from the load to the quantum it was
 * found at through the ordinary replay path. A step that throws ends the
 * bundle's hashes with NAN, the trace's mark for it. Throws when the replay
 * does not hash as the sweep recorded: then the restore drifted from the run
 * it restores, and no witness of this sweep is a proof.
 * @param {SweepInput} input
 * @param {Finding} finding
 * @param {string} dir
 */
export function findingBundle(input, finding, dir) {
  const spec = witnessSpec(input, finding.witness);
  const name = 'sweep ' + input.name + ' ' + finding.kind + ' ' + (finding.body || '') + ' by ' + finding.actor;
  const failure = { test: 'sweep', block: finding.detail + '\n' };
  const note = 'A reachability sweep finding (T6): ' + finding.detail + '. Replay reproduces it from the load.';
  if (finding.kind === 'throws') {
    const run = replayTo(spec, 0);
    const hashes = [run.hash];
    for (;;) {
      try {
        if (!run.advance()) {
          break;
        }
      } catch {
        hashes.push('NAN');
        break;
      }
      hashes.push(run.hash);
    }
    if (hashes.length !== finding.tick + 1 || hashes[hashes.length - 1] !== 'NAN') {
      throw new Error('the sweep found a throw at tick ' + finding.tick + ', and its replay ' + (hashes[hashes.length - 1] === 'NAN' ? 'threw at ' + (hashes.length - 1) : 'did not throw'));
    }
    return writeBundle(bundleFrom(spec, { name, note, hashes, failure }), dir);
  }
  const bundle = captureBundle(spec, { name, note, tick: finding.tick, image: false, failure });
  if (bundle.hashes[finding.tick] !== finding.hash) {
    throw new Error('the sweep recorded ' + finding.hash + ' at tick ' + finding.tick + ', and its replay hashes ' + bundle.hashes[finding.tick]);
  }
  return writeBundle(bundle, dir);
}

/**
 * What `load world` does with a report (pin 9). Refused: a body that leaves
 * the world, a throw, and, when the frontier emptied within the budget, an
 * authored zone no explored state reached. Admitted with a note: a world that
 * does not settle after an action, until the scheduled job shows how often it
 * happens, and a sweep the budget cut short. The scheduled job sweeps that
 * world again under its own, larger budget (SWEEP_BUDGET in
 * harness/corpus.mjs) and fails when the verdict differs from the one
 * fixtures/sweep/verdicts.json records; that budget may cut the sweep short
 * too, and then the record holds it deferred.
 * A leave or a throw found before the budget ran out is refused even so: its
 * bundle is a proof, which a cut-short sweep cannot take back.
 * @param {SweepReport} report
 * @returns {{ admitted: boolean, reasons: string[], notes: string[] }}
 */
export function sweepVerdict(report) {
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const notes = [];
  const bundle = (/** @type {Finding} */ finding) => (finding.bundle ? '; bundle ' + finding.bundle : '');
  const more = (/** @type {Finding} */ finding) => (finding.count > 1 ? ' (and ' + (finding.count - 1) + ' more like it)' : '');
  if (report.actors.length === 0) {
    notes.push('the world has no actor: nothing to sweep');
  }
  for (const finding of report.findings) {
    if (finding.kind === 'leaves') {
      reasons.push('a body leaves the world: ' + finding.detail + more(finding) + bundle(finding));
    } else if (finding.kind === 'throws') {
      reasons.push('the tick throws: ' + finding.detail + more(finding) + bundle(finding));
    } else {
      notes.push('not settled, admitted until the scheduled job shows how often it happens: ' + finding.detail + more(finding) + bundle(finding));
    }
  }
  if (report.complete && report.actors.length > 0) {
    for (const zone of report.zones) {
      if (!zone.reached) {
        reasons.push('zone ' + zone.id + ' is not reached: actors ' + report.actors.join(', ') + '; ' + report.cells + ' cells explored; ' + report.actionSet);
      }
    }
  } else if (report.actors.length > 0 && report.settledAtLoad) {
    notes.push('sweep deferred: the budget of ' + report.budget.quanta + ' quanta and ' + report.budget.restores + ' restores ran out with ' + report.cells + ' cells archived and ' + report.frontier + ' left in the frontier; the scheduled sweep finishes it');
  }
  return { admitted: reasons.length === 0, reasons, notes };
}

/**
 * One line of costs.
 * @param {SweepReport} report
 */
export function costLine(report) {
  const share = report.ms > 0 ? (100 * report.restoreMs) / report.ms : 0;
  return report.cells + ' cells, ' + report.tried + ' actions tried, ' + report.admitted + ' admitted, ' + report.quanta + ' quanta, '
    + report.restores + ' restores, ' + report.saves + ' saves, ' + (report.ms / 1000).toFixed(1) + ' s, '
    + share.toFixed(1) + '% restoring (' + (report.restoreMs / 1000).toFixed(1) + ' s), ' + (report.saveMs / 1000).toFixed(1) + ' s saving';
}
