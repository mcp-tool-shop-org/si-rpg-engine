// A world is a file. The tick answers zones. The host alone reads the goal.

import { readFileSync } from 'node:fs';
import { createWorld } from './world.js';

/**
 * @typedef {import('../frame/types.js').Body} Body
 * @typedef {import('../frame/types.js').StaticCollider} StaticCollider
 * @typedef {import('../frame/types.js').Frame} Frame
 * @typedef {import('../frame/types.js').Zone} Zone
 * @typedef {{
 *   name: string,
 *   seed: number,
 *   bodies: Body[],
 *   colliders: StaticCollider[],
 *   zones: Zone[],
 *   goal?: { actor: string, zone: string },
 *   heightfield?: { rows: number, cols: number, cell: number, heights: number[] },
 * }} Scene
 */

const SCENE_KEYS = ['name', 'seed', 'bodies', 'colliders', 'zones'];
const SCENE_ALLOWED = ['name', 'seed', 'bodies', 'colliders', 'zones', 'goal', 'heightfield'];
const HEIGHTFIELD_KEYS = ['rows', 'cols', 'cell', 'heights'];
const BODY_KEYS = ['id', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'qx', 'qy', 'qz', 'qw', 'wx', 'wy', 'wz', 'hx', 'hy', 'hz'];
const BODY_OPTIONAL = ['qx', 'qy', 'qz', 'qw', 'wx', 'wy', 'wz'];
const COLLIDER_KEYS = ['id', 'minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ', 'qx', 'qy', 'qz', 'qw'];
const COLLIDER_OPTIONAL = ['qx', 'qy', 'qz', 'qw'];
const GOAL_KEYS = ['actor', 'zone'];
const ZONE_KEYS = ['id', 'minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'];

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
  const extra = unknown(raw, SCENE_ALLOWED);
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
    if (typeof body.id !== 'string' || body.id.length === 0) {
      return { ok: false, reason: 'an id must be a non-empty string' };
    }
    if (bodies.some((kept) => kept.id === body.id)) {
      return { ok: false, reason: 'duplicate id: ' + body.id };
    }
    for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'hx', 'hy', 'hz']) {
      if (typeof body[key] !== 'number' || !Number.isFinite(/** @type {number} */ (body[key]))) {
        return { ok: false, reason: 'body ' + body.id + ' needs a finite ' + key };
      }
    }
    for (const key of BODY_OPTIONAL) {
      if (body[key] !== undefined && (typeof body[key] !== 'number' || !Number.isFinite(/** @type {number} */ (body[key])))) {
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
    if (typeof box.id !== 'string' || box.id.length === 0) {
      return { ok: false, reason: 'an id must be a non-empty string' };
    }
    if (colliders.some((kept) => kept.id === box.id)) {
      return { ok: false, reason: 'duplicate id: ' + box.id };
    }
    for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ']) {
      if (typeof box[key] !== 'number' || !Number.isFinite(/** @type {number} */ (box[key]))) {
        return { ok: false, reason: 'collider ' + box.id + ' needs a finite ' + key };
      }
    }
    for (const key of COLLIDER_OPTIONAL) {
      if (box[key] !== undefined && (typeof box[key] !== 'number' || !Number.isFinite(/** @type {number} */ (box[key])))) {
        return { ok: false, reason: 'collider ' + box.id + ' needs a finite ' + key };
      }
    }
    const qx = typeof box.qx === 'number' ? box.qx : 0;
    const qy = typeof box.qy === 'number' ? box.qy : 0;
    const qz = typeof box.qz === 'number' ? box.qz : 0;
    const qw = typeof box.qw === 'number' ? box.qw : 1;
    const anyQuat = box.qx !== undefined || box.qy !== undefined || box.qz !== undefined || box.qw !== undefined;
    if (anyQuat && Math.abs(Math.hypot(qx, qy, qz, qw) - 1) > 1e-9) {
      return { ok: false, reason: 'collider ' + box.id + ' quaternion is not unit' };
    }
    colliders.push(/** @type {StaticCollider} */ ({
      id: box.id,
      minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY, minZ: box.minZ, maxZ: box.maxZ,
      qx, qy, qz, qw,
    }));
  }
  if (!Array.isArray(raw.zones)) {
    return { ok: false, reason: 'zones must be a list' };
  }
  /** @type {Zone[]} */
  const zones = [];
  for (const item of raw.zones) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, reason: 'a zone is an object' };
    }
    const zone = /** @type {Record<string, unknown>} */ (item);
    const zoneExtra = unknown(zone, ZONE_KEYS);
    if (zoneExtra) {
      return { ok: false, reason: 'unknown field: ' + zoneExtra };
    }
    if (typeof zone.id !== 'string' || zone.id.length === 0) {
      return { ok: false, reason: 'an id must be a non-empty string' };
    }
    if (zones.some((kept) => kept.id === zone.id)) {
      return { ok: false, reason: 'duplicate id: ' + zone.id };
    }
    for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ']) {
      if (typeof zone[key] !== 'number' || !Number.isFinite(/** @type {number} */ (zone[key]))) {
        return { ok: false, reason: 'zone ' + zone.id + ' needs a finite ' + key };
      }
    }
    const typed = /** @type {Zone} */ (/** @type {unknown} */ (zone));
    if (typed.minX >= typed.maxX || typed.minY >= typed.maxY || typed.minZ >= typed.maxZ) {
      return { ok: false, reason: 'zone ' + typed.id + ' is degenerate' };
    }
    zones.push({
      id: typed.id, minX: typed.minX, maxX: typed.maxX, minY: typed.minY, maxY: typed.maxY, minZ: typed.minZ, maxZ: typed.maxZ,
    });
  }
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
  for (let i = 0; i < zones.length; i = i + 1) {
    const zone = zones[i];
    if (zone.minX < extMinX || zone.maxX > extMaxX || zone.minY < extMinY || zone.maxY > extMaxY || zone.minZ < extMinZ || zone.maxZ > extMaxZ) {
      return { ok: false, reason: 'zone ' + zone.id + ' is outside the colliders' };
    }
    for (let j = 0; j < i; j = j + 1) {
      const other = zones[j];
      if (zone.minX < other.maxX && other.minX < zone.maxX && zone.minY < other.maxY && other.minY < zone.maxY && zone.minZ < other.maxZ && other.minZ < zone.maxZ) {
        return { ok: false, reason: 'zones overlap: ' + zone.id + ' and ' + other.id };
      }
    }
    for (const box of colliders) {
      if (zoneInsideCollider(zone, box)) {
        return { ok: false, reason: 'zone ' + zone.id + ' lies inside collider ' + box.id };
      }
    }
  }
  /** @type {{ actor: string, zone: string } | undefined} */
  let goal;
  if (Object.hasOwn(raw, 'goal')) {
    if (!raw.goal || typeof raw.goal !== 'object' || Array.isArray(raw.goal)) {
      return { ok: false, reason: 'goal must be an object' };
    }
    const goalRaw = /** @type {Record<string, unknown>} */ (raw.goal);
    const goalExtra = unknown(goalRaw, GOAL_KEYS);
    if (goalExtra) {
      return { ok: false, reason: 'unknown field: ' + goalExtra };
    }
    if (typeof goalRaw.actor !== 'string' || !bodies.some((body) => body.id === goalRaw.actor)) {
      return { ok: false, reason: 'goal actor is not a body' };
    }
    if (typeof goalRaw.zone !== 'string' || !zones.some((zone) => zone.id === goalRaw.zone)) {
      return { ok: false, reason: 'goal zone does not exist' };
    }
    goal = { actor: goalRaw.actor, zone: goalRaw.zone };
  }
  for (let i = 0; i < bodies.length; i = i + 1) {
    const others = bodies.filter((_, index) => index !== i);
    const hit = createWorld({ bodies: others, colliders }).overlaps(bodies[i]);
    if (hit !== null) {
      return { ok: false, reason: 'body ' + bodies[i].id + ' overlaps ' + hit };
    }
  }
  /** @type {Scene['heightfield']} */
  let heightfield;
  if (Object.hasOwn(raw, 'heightfield')) {
    const checked = validateHeightfield(raw.heightfield);
    if (!checked.ok) {
      return checked;
    }
    heightfield = checked.heightfield;
  }
  return {
    ok: true,
    scene: {
      name: /** @type {string} */ (raw.name),
      seed: /** @type {number} */ (raw.seed),
      bodies,
      colliders,
      zones,
      ...(goal ? { goal } : {}),
      ...(heightfield ? { heightfield } : {}),
    },
  };
}

/**
 * @param {Zone} zone
 * @param {StaticCollider} box
 */
function zoneInsideCollider(zone, box) {
  const qx = box.qx ?? 0;
  const qy = box.qy ?? 0;
  const qz = box.qz ?? 0;
  const qw = box.qw ?? 1;
  const rotated = qx !== 0 || qy !== 0 || qz !== 0 || qw !== 1;
  if (!rotated) {
    return zone.minX >= box.minX && zone.maxX <= box.maxX && zone.minY >= box.minY && zone.maxY <= box.maxY && zone.minZ >= box.minZ && zone.maxZ <= box.maxZ;
  }
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const hx = (box.maxX - box.minX) / 2;
  const hy = (box.maxY - box.minY) / 2;
  const hz = (box.maxZ - box.minZ) / 2;
  for (const x of [zone.minX, zone.maxX]) {
    for (const y of [zone.minY, zone.maxY]) {
      for (const z of [zone.minZ, zone.maxZ]) {
        const tx = 2 * ((0 - qy) * (z - cz) - (0 - qz) * (y - cy));
        const ty = 2 * ((0 - qz) * (x - cx) - (0 - qx) * (z - cz));
        const tz = 2 * ((0 - qx) * (y - cy) - (0 - qy) * (x - cx));
        const lx = (x - cx) + qw * tx + ((0 - qy) * tz - (0 - qz) * ty);
        const ly = (y - cy) + qw * ty + ((0 - qz) * tx - (0 - qx) * tz);
        const lz = (z - cz) + qw * tz + ((0 - qx) * ty - (0 - qy) * tx);
        if (Math.abs(lx) > hx || Math.abs(ly) > hy || Math.abs(lz) > hz) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Rows, columns, cell size, and one finite height per cell. Content beyond that shape is E3.
 * @param {unknown} value
 * @returns {{ ok: true, heightfield: { rows: number, cols: number, cell: number, heights: number[] } } | { ok: false, reason: string }}
 */
export function validateHeightfield(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'heightfield must be an object' };
  }
  const raw = /** @type {Record<string, unknown>} */ (value);
  const extra = unknown(raw, HEIGHTFIELD_KEYS);
  if (extra) {
    return { ok: false, reason: 'unknown field: ' + extra };
  }
  for (const key of HEIGHTFIELD_KEYS) {
    if (!Object.hasOwn(raw, key)) {
      return { ok: false, reason: 'heightfield missing ' + key };
    }
  }
  const rows = raw.rows;
  const cols = raw.cols;
  const cell = raw.cell;
  const heights = raw.heights;
  if (!Number.isInteger(rows) || /** @type {number} */ (rows) < 2) {
    return { ok: false, reason: 'heightfield rows must be an integer of at least 2' };
  }
  if (!Number.isInteger(cols) || /** @type {number} */ (cols) < 2) {
    return { ok: false, reason: 'heightfield cols must be an integer of at least 2' };
  }
  if (typeof cell !== 'number' || !Number.isFinite(cell) || !(cell > 0)) {
    return { ok: false, reason: 'heightfield cell must be a finite number above 0' };
  }
  if (!Array.isArray(heights) || heights.length !== /** @type {number} */ (rows) * /** @type {number} */ (cols)) {
    return { ok: false, reason: 'heightfield heights must have rows * cols values' };
  }
  /** @type {number[]} */
  const copy = [];
  for (let i = 0; i < heights.length; i = i + 1) {
    const sample = heights[i];
    if (typeof sample !== 'number' || !Number.isFinite(sample)) {
      return { ok: false, reason: 'heightfield heights must be finite' };
    }
    copy.push(sample);
  }
  return {
    ok: true,
    heightfield: {
      rows: /** @type {number} */ (rows),
      cols: /** @type {number} */ (cols),
      cell,
      heights: copy,
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
 * The actor's centre is in the goal zone. The tick does not know the goal.
 * @param {Scene} scene
 * @param {Frame} frame
 */
export function reachedGoal(scene, frame) {
  const goal = scene.goal;
  if (!goal) {
    return false;
  }
  const body = frame.bodies.find((item) => item.id === goal.actor);
  if (!body) {
    return false;
  }
  const zone = scene.zones.find((item) => item.id === goal.zone);
  if (!zone) {
    return false;
  }
  return body.x >= zone.minX && body.x < zone.maxX
    && body.y >= zone.minY && body.y < zone.maxY
    && body.z >= zone.minZ && body.z < zone.maxZ;
}
