// Sight writes a mind. Goals are marked met. Nothing here plans or speaks.

import { subjectText } from './subject.js';

/**
 * @typedef {import('../frame/types.js').Belief} Belief
 * @typedef {{ kind: 'reach', zone: string, metTick?: number } | { kind: 'use', target: string, metTick?: number }} MindGoal
 * @typedef {{ body: string, sight: number, goals: MindGoal[], beliefs: Array<{ subject: { body?: string, zone?: string }, key: string, value: string | number | boolean, confidence: number, source: string }> }} Mind
 */

/** @type {WeakMap<object, Map<string, Map<string, { inSight: boolean, zone: string | null }>>>} */
const sightState = new WeakMap();

/**
 * @param {object} world
 */
function states(world) {
  let found = sightState.get(world);
  if (!found) {
    found = new Map();
    sightState.set(world, found);
  }
  return found;
}

/**
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {ReturnType<import('./memory.js').createMemory>} memory
 */
export function installMinds(world, memory) {
  const minds = world.minds || [];
  if (minds.length === 0 || world.mindsInstalled) {
    return;
  }
  world.mindsInstalled = true;
  const load = memory.recordEpisode(0, 'load', 'load ' + (world.name || 'world'));
  for (const mind of minds) {
    for (const authored of mind.beliefs) {
      memory.admitMindBelief(mind.body, {
        kind: 'belief',
        mind: mind.body,
        subject: /** @type {import('../frame/types.js').BeliefWrite['subject']} */ (authored.subject),
        key: authored.key,
        value: authored.value,
        confidence: authored.confidence,
        source: load.id,
      });
    }
  }
}

/**
 * @param {{ x: number, y: number, z: number }} a
 * @param {{ x: number, y: number, z: number }} b
 */
function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * After the step, before the hash. One see episode per mind and body per quantum.
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {ReturnType<import('./memory.js').createMemory>} memory
 * @param {number} tick
 */
export function observeMinds(world, memory, tick) {
  const minds = world.minds || [];
  if (minds.length === 0) {
    return;
  }
  const remembered = states(world);
  for (const mind of minds) {
    const eye = world.body(mind.body);
    if (!eye) {
      continue;
    }
    let perBody = remembered.get(mind.body);
    if (!perBody) {
      perBody = new Map();
      remembered.set(mind.body, perBody);
    }
    for (const other of world.bodies) {
      if (other.id === mind.body) {
        continue;
      }
      const inSight = distance(eye, other) <= mind.sight
        && world.segmentHits(eye.x, eye.y, eye.z, other.x, other.y, other.z) === null;
      const zone = inSight ? world.zoneOf(other.id) : null;
      const previous = perBody.get(other.id);
      const entered = inSight && (!previous || !previous.inSight);
      const left = !inSight && previous && previous.inSight;
      const moved = inSight && previous && previous.inSight && previous.zone !== zone;
      if (entered || left || moved) {
        const label = inSight ? (zone || 'none') : 'none';
        const episode = memory.recordEpisode(tick, 'see', 'see ' + mind.body + ' ' + other.id + ' ' + label);
        writeSight(world, memory, mind.body, other.id, label, tick, episode.id);
      }
      perBody.set(other.id, { inSight, zone: inSight ? zone : (previous ? previous.zone : null) });
    }
    for (let i = 0; i < mind.goals.length; i = i + 1) {
      const goal = mind.goals[i];
      if (goal.metTick !== undefined) {
        continue;
      }
      const met = goal.kind === 'reach'
        ? world.zoneOf(mind.body) === goal.zone
        : memory.episodes.some((episode) => episode.detail === 'use ' + mind.body + ' ' + goal.target && episode.tick >= 0);
      if (met) {
        goal.metTick = tick;
        memory.recordEpisode(tick, 'goal-met', 'goal-met ' + mind.body + ' ' + i);
      }
    }
  }
}

/**
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {ReturnType<import('./memory.js').createMemory>} memory
 * @param {string} mind
 * @param {string} bodyId
 * @param {string} zone
 * @param {number} tick
 * @param {string} episodeId
 */
function writeSight(world, memory, mind, bodyId, zone, tick, episodeId) {
  const list = memory.mindBeliefs(mind);
  const atOld = unsurpassed(list, 'body:' + bodyId, 'at');
  const seenOld = unsurpassed(list, 'body:' + bodyId, 'seen');
  memory.admitMindBelief(mind, {
    kind: 'belief',
    mind,
    subject: { body: bodyId },
    key: 'at',
    value: zone,
    confidence: 1,
    source: episodeId,
    ...(atOld ? { supersedes: atOld.id, withdrawnBy: episodeId } : {}),
  });
  memory.admitMindBelief(mind, {
    kind: 'belief',
    mind,
    subject: { body: bodyId },
    key: 'seen',
    value: tick,
    confidence: 1,
    source: episodeId,
    ...(seenOld ? { supersedes: seenOld.id, withdrawnBy: episodeId } : {}),
  });
}

/**
 * @param {Belief[]} list
 * @param {string} subject
 * @param {string} key
 */
function unsurpassed(list, subject, key) {
  for (let i = list.length - 1; i >= 0; i = i - 1) {
    const belief = list[i];
    if (!belief.supersededBy && belief.key === key && subjectText(belief.subject) === subject) {
      return belief;
    }
  }
  return null;
}

/**
 * @param {import('../frame/types.js').Hasher} hasher
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {ReturnType<import('./memory.js').createMemory>} memory
 */
export function mixMinds(hasher, world, memory) {
  const minds = world.minds || [];
  if (minds.length === 0) {
    return;
  }
  for (const mind of minds) {
    hasher.u32(mind.goals.length);
    for (const goal of mind.goals) {
      hasher.u32(goal.metTick === undefined ? 0 : 1);
      hasher.u32(goal.metTick === undefined ? 0xffffffff : goal.metTick);
    }
    const list = memory.mindBeliefs(mind.body);
    hasher.u32(list.length);
    hasher.text(list.length === 0 ? '' : list[list.length - 1].id);
  }
}

/**
 * @typedef {{ met: Array<Array<number | null>>, sight: Array<[string, Array<[string, { inSight: boolean, zone: string | null }]>]> }} MindsSave
 */

/**
 * The minds' state that is not in the memory, for a tick's save (T6 pin 1):
 * the quantum each goal was met, or null, and what each mind last saw of
 * each body, which decides whether the next quantum's sight writes a belief.
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @returns {MindsSave}
 */
export function saveMinds(world) {
  const minds = world.minds || [];
  const remembered = sightState.get(world);
  return {
    met: minds.map((mind) => mind.goals.map((goal) => (goal.metTick === undefined ? null : goal.metTick))),
    sight: remembered
      ? Array.from(remembered, ([mind, perBody]) => /** @type {[string, Array<[string, { inSight: boolean, zone: string | null }]>]} */ ([mind, Array.from(perBody, ([body, seen]) => /** @type {[string, { inSight: boolean, zone: string | null }]} */ ([body, { ...seen }]))]))
      : [],
  };
}

/**
 * Why a value is not a save of these minds, or null.
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {any} saved
 * @returns {string | null}
 */
export function mindsSaveProblem(world, saved) {
  const minds = world.minds || [];
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.met) || !Array.isArray(saved.sight)) {
    return 'the minds are each goal\'s met quantum and what each mind saw';
  }
  if (saved.met.length !== minds.length || minds.some((mind, m) => !Array.isArray(saved.met[m]) || saved.met[m].length !== mind.goals.length)) {
    return 'the save has ' + saved.met.length + ' minds\' goals; this world has ' + minds.length + ' minds';
  }
  return null;
}

/**
 * Puts back what saveMinds took. The caller checks it with mindsSaveProblem first.
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {MindsSave} saved
 */
export function restoreMinds(world, saved) {
  const minds = world.minds || [];
  for (let m = 0; m < minds.length; m = m + 1) {
    const goals = minds[m].goals;
    for (let g = 0; g < goals.length; g = g + 1) {
      const met = saved.met[m][g];
      if (met === null) {
        delete goals[g].metTick;
      } else {
        goals[g].metTick = met;
      }
    }
  }
  if (minds.length === 0) {
    return;
  }
  const remembered = states(world);
  remembered.clear();
  for (const [mind, perBody] of saved.sight) {
    remembered.set(mind, new Map(perBody.map(([body, seen]) => /** @type {[string, { inSight: boolean, zone: string | null }]} */ ([body, { ...seen }]))));
  }
}

/**
 * @param {ReturnType<import('./world.js').createWorld>} world
 * @param {string} mind
 */
export function goalsOf(world, mind) {
  const found = (world.minds || []).find((item) => item.body === mind);
  if (!found) {
    return [];
  }
  return found.goals.map((goal, index) => ({
    index,
    kind: goal.kind,
    ...(goal.kind === 'reach' ? { zone: goal.zone } : { target: goal.target }),
    met: goal.metTick !== undefined,
    metTick: goal.metTick === undefined ? null : goal.metTick,
  }));
}

