// A scene is a file. The tick has no goals. reachedGoal reads a committed frame.

import { readFileSync } from 'node:fs';
import { createWorld } from './world.js';

/**
 * @typedef {import('../frame/types.js').Body} Body
 * @typedef {import('../frame/types.js').StaticCollider} StaticCollider
 * @typedef {import('../frame/types.js').Frame} Frame
 * @typedef {{ minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }} Zone
 * @typedef {{
 *   name: string,
 *   seed: number,
 *   bodies: Body[],
 *   colliders: StaticCollider[],
 *   goal: { actor: string, zone: Zone },
 * }} Scene
 */

const SCENE_KEYS = ['name', 'seed', 'bodies', 'colliders', 'goal'];
const BODY_KEYS = ['id', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'hx', 'hy', 'hz'];
const COLLIDER_KEYS = ['id', 'minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'];
const GOAL_KEYS = ['actor', 'zone'];
const ZONE_KEYS = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'];

/**
 * @param {Record<string, unknown>} obj
 * @param {string[]} allowed
 */
function unknown(obj, allowed) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      return key;
    }
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, scene: Scene } | { ok: false, reason: string }}
 */
export function validateScene(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'a scene is an object' };
  }
  const raw = /** @type {Record<string, unknown>} */ (value);
  const extra = unknown(raw, SCENE_KEYS);
  if (extra) {
    return { ok: false, reason: 'unknown field: ' + extra };
  }
  for (const key of SCENE_KEYS) {
    if (!Object.hasOwn(raw, key)) {
      return { ok: false, reason: 'missing field: ' + key };
    }
  }
  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    return { ok: false, reason: 'name must be a string' };
  }
  if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) {
    return { ok: false, reason: 'seed must be a finite number' };
  }
  if (!Array.isArray(raw.bodies) || raw.bodies.length === 0) {
    return { ok: false, reason: 'bodies must be a non-empty list' };
  }
  if (!Array.isArray(raw.colliders) || raw.colliders.length === 0) {
    return { ok: false, reason: 'colliders must be a non-empty list' };
  }
  /** @type {Body[]} */
  const bodies = [];
  for (const item of raw.bodies) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, reason: 'a body is an object' };
    }
    const body = /** @type {Record<string, unknown>} */ (item);
    if (body.hw !== undefined || body.hh !== undefined) {
      return { ok: false, reason: 'a body record is three-dimensional' };
    }
    const bodyExtra = unknown(body, BODY_KEYS);
    if (bodyExtra) {
      return { ok: false, reason: 'unknown field: ' + bodyExtra };
    }
    if (typeof body.id !== 'string') {
      return { ok: false, reason: 'a body needs an id' };
    }
    for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'hx', 'hy', 'hz']) {
      if (typeof body[key] !== 'number' || !Number.isFinite(/** @type {number} */ (body[key]))) {
        return { ok: false, reason: 'body ' + body.id + ' needs a finite ' + key };
      }
    }
    bodies.push(/** @type {Body} */ (/** @type {unknown} */ (body)));
  }
  /** @type {StaticCollider[]} */
  const colliders = [];
  for (const item of raw.colliders) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, reason: 'a collider is an object' };
    }
    const box = /** @type {Record<string, unknown>} */ (item);
    const boxExtra = unknown(box, COLLIDER_KEYS);
    if (boxExtra) {
      return { ok: false, reason: 'unknown field: ' + boxExtra };
    }
    if (typeof box.id !== 'string') {
      return { ok: false, reason: 'a collider needs an id' };
    }
    for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ']) {
      if (typeof box[key] !== 'number' || !Number.isFinite(/** @type {number} */ (box[key]))) {
        return { ok: false, reason: 'collider ' + box.id + ' needs a finite ' + key };
      }
    }
    colliders.push(/** @type {StaticCollider} */ (/** @type {unknown} */ (box)));
  }
  if (!raw.goal || typeof raw.goal !== 'object' || Array.isArray(raw.goal)) {
    return { ok: false, reason: 'goal must be an object' };
  }
  const goal = /** @type {Record<string, unknown>} */ (raw.goal);
  const goalExtra = unknown(goal, GOAL_KEYS);
  if (goalExtra) {
    return { ok: false, reason: 'unknown field: ' + goalExtra };
  }
  if (typeof goal.actor !== 'string' || !bodies.some((body) => body.id === goal.actor)) {
    return { ok: false, reason: 'goal actor is not a body' };
  }
  if (!goal.zone || typeof goal.zone !== 'object' || Array.isArray(goal.zone)) {
    return { ok: false, reason: 'goal zone must be an object' };
  }
  const zone = /** @type {Record<string, unknown>} */ (goal.zone);
  const zoneExtra = unknown(zone, ZONE_KEYS);
  if (zoneExtra) {
    return { ok: false, reason: 'unknown field: ' + zoneExtra };
  }
  for (const key of ZONE_KEYS) {
    if (typeof zone[key] !== 'number' || !Number.isFinite(/** @type {number} */ (zone[key]))) {
      return { ok: false, reason: 'goal zone needs a finite ' + key };
    }
  }
  const typedZone = /** @type {Zone} */ (zone);
  let extMinX = Infinity;
  let extMaxX = -Infinity;
  let extMinY = Infinity;
  let extMaxY = -Infinity;
  for (const box of colliders) {
    extMinX = Math.min(extMinX, box.minX);
    extMaxX = Math.max(extMaxX, box.maxX);
    extMinY = Math.min(extMinY, box.minY);
    extMaxY = Math.max(extMaxY, box.maxY);
  }
  let extMinZ = Infinity;
  let extMaxZ = -Infinity;
  for (const box of colliders) {
    extMinZ = Math.min(extMinZ, box.minZ);
    extMaxZ = Math.max(extMaxZ, box.maxZ);
  }
  if (typedZone.minX < extMinX || typedZone.maxX > extMaxX || typedZone.minY < extMinY || typedZone.maxY > extMaxY || typedZone.minZ < extMinZ || typedZone.maxZ > extMaxZ) {
    return { ok: false, reason: 'goal zone is outside the colliders' };
  }
  for (let i = 0; i < bodies.length; i = i + 1) {
    const others = bodies.filter((_, index) => index !== i);
    const hit = createWorld({ bodies: others, colliders }).overlaps(bodies[i]);
    if (hit !== null) {
      return { ok: false, reason: 'body ' + bodies[i].id + ' overlaps ' + hit };
    }
  }
  return {
    ok: true,
    scene: {
      name: raw.name,
      seed: raw.seed,
      bodies,
      colliders,
      goal: { actor: goal.actor, zone: typedZone },
    },
  };
}

/**
 * @param {string} path
 */
export function loadScene(path) {
  return validateScene(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * The crate's box is inside the zone. The tick does not know this.
 * @param {Scene} scene
 * @param {Frame} frame
 */
export function reachedGoal(scene, frame) {
  const body = frame.bodies.find((item) => item.id === scene.goal.actor);
  if (!body) {
    return false;
  }
  const zone = scene.goal.zone;
  return body.x - body.hx >= zone.minX
    && body.x + body.hx <= zone.maxX
    && body.y - body.hy >= zone.minY
    && body.y + body.hy <= zone.maxY
    && body.z - body.hz >= zone.minZ
    && body.z + body.hz <= zone.maxZ;
}
