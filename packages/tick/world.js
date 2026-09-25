// The spatial law: bodies, static colliders, one fixed-timestep quantum.
// The product step is the WASM binary. The JavaScript below it is the reference.

import { clearWarmstart, loadSolver, snapshotBytes, stepBodies, stepSolver } from '../../solver/dist/solver.mjs';

export const DT = 1 / 64;
export const G = -8;
export const MAX_SPEED = 2;
// One multiply per quantum, on vx and on vz, for a body with no scheduled
// action. Zero stops a pushed body. A driven body is left alone.
export const UNDRIVEN_DRAG = 0;

/**
 * @typedef {import('../frame/types.js').Body} Body
 * @typedef {import('../frame/types.js').StaticCollider} StaticCollider
 */

/**
 * @typedef {{ rows: number, cols: number, cell: number, heights: number[] }} Heightfield
 */

let nextProductId = 1;

/**
 * @param {{ bodies: Array<Body | (Omit<Body, 'qx' | 'qy' | 'qz' | 'qw' | 'wx' | 'wy' | 'wz'> & Partial<Pick<Body, 'qx' | 'qy' | 'qz' | 'qw' | 'wx' | 'wy' | 'wz'>>)>; colliders: StaticCollider[]; heightfield?: Heightfield | null; shape?: 'box' | 'capsule' }} init
 * @param {'product' | 'box' | 'reference'} [law] product is the Rapier step; box is the E1 binary; reference is the JavaScript kernel
 */
export function createWorld(init, law) {
  const chosen = law || 'product';
  const productId = chosen === 'product' ? nextProductId++ : 0;
  /** @type {Body[]} */
  const bodies = init.bodies.map((b) => ({
    id: b.id, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz,
    qx: typeof b.qx === 'number' ? b.qx : 0,
    qy: typeof b.qy === 'number' ? b.qy : 0,
    qz: typeof b.qz === 'number' ? b.qz : 0,
    qw: typeof b.qw === 'number' ? b.qw : 1,
    wx: typeof b.wx === 'number' ? b.wx : 0,
    wy: typeof b.wy === 'number' ? b.wy : 0,
    wz: typeof b.wz === 'number' ? b.wz : 0,
    hx: b.hx, hy: b.hy, hz: b.hz,
  }));
  const shapeId = init.shape === 'capsule' ? 1 : 0;
  /** @type {StaticCollider[]} */
  const colliders = init.colliders.map((c) => ({
    id: c.id, minX: c.minX, maxX: c.maxX, minY: c.minY, maxY: c.maxY, minZ: c.minZ, maxZ: c.maxZ,
  }));
  /** @type {Heightfield | null} */
  const heightfield = init.heightfield ? {
    rows: init.heightfield.rows,
    cols: init.heightfield.cols,
    cell: init.heightfield.cell,
    heights: init.heightfield.heights.slice(),
  } : null;

  /** @param {string} id */
  function body(id) {
    for (let i = 0; i < bodies.length; i = i + 1) {
      if (bodies[i].id === id) {
        return bodies[i];
      }
    }
    return undefined;
  }

  /**
   * One quantum. An undriven body damps vx and vz, then gravity, integrate,
   * static colliders, and the speed clamp. Dynamic pairs are i < j.
   * @param {ReadonlySet<string>} [driven] body ids with a scheduled action
   */
  function step(driven) {
    const driving = driven || new Set();
    if (chosen === 'box') {
      if (!stepBodies(bodies, colliders, driving)) {
        throw new Error('NaN');
      }
      return;
    }
    if (chosen === 'product') {
      if (!stepSolver(productId, bodies, colliders, heightfield, driving, shapeId)) {
        throw new Error('NaN');
      }
      return;
    }
    for (let i = 0; i < bodies.length; i = i + 1) {
      const b = bodies[i];
      if (!driving.has(b.id)) {
        b.vx = b.vx * UNDRIVEN_DRAG;
        b.vz = b.vz * UNDRIVEN_DRAG;
      }
      b.vy = b.vy + G * DT;
      b.x = b.x + b.vx * DT;
      b.y = b.y + b.vy * DT;
      b.z = b.z + b.vz * DT;
      for (let j = 0; j < colliders.length; j = j + 1) {
        const c = colliders[j];
        const bMinX = b.x - b.hx;
        const bMaxX = b.x + b.hx;
        const bMinY = b.y - b.hy;
        const bMaxY = b.y + b.hy;
        const bMinZ = b.z - b.hz;
        const bMaxZ = b.z + b.hz;
        if (bMaxX <= c.minX || bMinX >= c.maxX || bMaxY <= c.minY || bMinY >= c.maxY || bMaxZ <= c.minZ || bMinZ >= c.maxZ) {
          continue;
        }
        const faces = [
          { axis: 'x', pen: bMaxX - c.minX, dir: -1 },
          { axis: 'x', pen: c.maxX - bMinX, dir: 1 },
          { axis: 'y', pen: bMaxY - c.minY, dir: -1 },
          { axis: 'y', pen: c.maxY - bMinY, dir: 1 },
          { axis: 'z', pen: bMaxZ - c.minZ, dir: -1 },
          { axis: 'z', pen: c.maxZ - bMinZ, dir: 1 },
        ];
        let best = faces[0];
        for (let f = 1; f < faces.length; f = f + 1) {
          const face = faces[f];
          const faceRank = face.axis === 'y' ? 0 : face.axis === 'x' ? 1 : 2;
          const bestRank = best.axis === 'y' ? 0 : best.axis === 'x' ? 1 : 2;
          if (face.pen < best.pen || (face.pen === best.pen && faceRank < bestRank)) {
            best = face;
          }
        }
        if (best.axis === 'x') {
          b.x = b.x + best.dir * best.pen;
          b.vx = 0 - b.vx;
        } else if (best.axis === 'y') {
          b.y = b.y + best.dir * best.pen;
          b.vy = 0 - b.vy;
        } else {
          b.z = b.z + best.dir * best.pen;
          b.vz = 0 - b.vz;
        }
      }
      const speed2 = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (speed2 > MAX_SPEED * MAX_SPEED) {
        const speed = Math.sqrt(speed2);
        const scale = MAX_SPEED / speed;
        b.vx = b.vx * scale;
        b.vy = b.vy * scale;
        b.vz = b.vz * scale;
      }
    }
    for (let i = 0; i < bodies.length; i = i + 1) {
      for (let j = i + 1; j < bodies.length; j = j + 1) {
        resolvePair(bodies[i], bodies[j], i, j, driving);
      }
    }
  }

  /**
   * @param {Body} a
   * @param {Body} b
   * @param {number} i
   * @param {number} j
   * @param {ReadonlySet<string>} driving
   */
  function resolvePair(a, b, i, j, driving) {
    const overlapX = Math.min(a.x + a.hx, b.x + b.hx) - Math.max(a.x - a.hx, b.x - b.hx);
    const overlapY = Math.min(a.y + a.hy, b.y + b.hy) - Math.max(a.y - a.hy, b.y - b.hy);
    const overlapZ = Math.min(a.z + a.hz, b.z + b.hz) - Math.max(a.z - a.hz, b.z - b.hz);
    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) {
      return;
    }
    const aDriven = driving.has(a.id);
    const bDriven = driving.has(b.id);
    if (aDriven && bDriven) {
      return;
    }
    const axes = [
      { axis: 'x', amount: overlapX },
      { axis: 'y', amount: overlapY },
      { axis: 'z', amount: overlapZ },
    ];
    let chosen = axes[0];
    for (let n = 1; n < axes.length; n = n + 1) {
      const axis = axes[n];
      const rank = axis.axis === 'y' ? 0 : axis.axis === 'x' ? 1 : 2;
      const chosenRank = chosen.axis === 'y' ? 0 : chosen.axis === 'x' ? 1 : 2;
      if (axis.amount < chosen.amount || (axis.amount === chosen.amount && rank < chosenRank)) {
        chosen = axis;
      }
    }
    const horizontal = chosen.axis === 'x';
    const depth = chosen.axis === 'z';
    if (aDriven !== bDriven) {
      const driver = aDriven ? a : b;
      const other = aDriven ? b : a;
      if (horizontal) {
        const dir = other.x > driver.x || (other.x === driver.x && (aDriven ? j > i : i > j)) ? 1 : -1;
        other.x = other.x + dir * overlapX;
        other.vx = driver.vx;
      } else if (!depth) {
        const dir = other.y > driver.y || (other.y === driver.y && (aDriven ? j > i : i > j)) ? 1 : -1;
        other.y = other.y + dir * overlapY;
        other.vy = driver.vy;
      } else {
        const dir = other.z > driver.z || (other.z === driver.z && (aDriven ? j > i : i > j)) ? 1 : -1;
        other.z = other.z + dir * overlapZ;
        other.vz = driver.vz;
      }
      return;
    }
    if (depth) {
      const half = overlapZ / 2;
      const aNear = a.z < b.z || (a.z === b.z && i < j);
      a.z = a.z + (aNear ? 0 - half : half);
      b.z = b.z + (aNear ? half : 0 - half);
      a.vz = 0;
      b.vz = 0;
      return;
    }
    if (horizontal) {
      const half = overlapX / 2;
      const aLeft = a.x < b.x || (a.x === b.x && i < j);
      a.x = a.x + (aLeft ? 0 - half : half);
      b.x = b.x + (aLeft ? half : 0 - half);
      a.vx = 0;
      b.vx = 0;
    } else {
      const half = overlapY / 2;
      const aBelow = a.y < b.y || (a.y === b.y && i < j);
      a.y = a.y + (aBelow ? 0 - half : half);
      b.y = b.y + (aBelow ? half : 0 - half);
      a.vy = 0;
      b.vy = 0;
    }
  }

  /**
   * Liang-Barsky clip of the segment against one box. True when the segment
   * enters the box's interior. A segment that only touches a face or a corner
   * is clear: a body resting on the floor has its centre on the swept floor's
   * top face, and it must still be able to walk along it.
   * @param {number} x0 @param {number} y0 @param {number} z0
   * @param {number} x1 @param {number} y1 @param {number} z1
   * @param {StaticCollider} c
   */
  function segmentHitsBox(x0, y0, z0, x1, y1, z1, c) {
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const p = [0 - dx, dx, 0 - dy, dy, 0 - dz, dz];
    const q = [x0 - c.minX, c.maxX - x0, y0 - c.minY, c.maxY - y0, z0 - c.minZ, c.maxZ - z0];
    for (let i = 0; i < 6; i = i + 1) {
      if (p[i] === 0) {
        if (q[i] <= 0) {
          return false;
        }
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) {
            return false;
          }
          if (t > t0) {
            t0 = t;
          }
        } else {
          if (t < t0) {
            return false;
          }
          if (t < t1) {
            t1 = t;
          }
        }
      }
    }
    return t0 < t1;
  }

  /**
   * The collider query the intent predicate uses for reachability.
   * A pad expands every box by the actor's half-extents, which is the
   * swept test for an axis-aligned body. The stored colliders do not change.
   * @param {number} x0 @param {number} y0 @param {number} z0
   * @param {number} x1 @param {number} y1 @param {number} z1
   * @param {{ hx: number, hy: number, hz: number }} [pad]
   * @returns {string | null} the id of the first collider the segment crosses
   */
  function segmentHits(x0, y0, z0, x1, y1, z1, pad) {
    const hx = pad ? pad.hx : 0;
    const hy = pad ? pad.hy : 0;
    const hz = pad ? pad.hz : 0;
    for (let j = 0; j < colliders.length; j = j + 1) {
      const stored = colliders[j];
      const box = hx === 0 && hy === 0 && hz === 0 ? stored : {
        id: stored.id,
        minX: stored.minX - hx,
        maxX: stored.maxX + hx,
        minY: stored.minY - hy,
        maxY: stored.maxY + hy,
        minZ: stored.minZ - hz,
        maxZ: stored.maxZ + hz,
      };
      if (segmentHitsBox(x0, y0, z0, x1, y1, z1, box)) {
        return stored.id;
      }
    }
    return null;
  }

  /**
   * The collider query a body draft is checked with.
   * @param {{ x: number, y: number, z: number, hx: number, hy: number, hz: number }} box
   * @returns {string | null} the id of the first collider or body the box overlaps
   */
  function overlaps(box) {
    const minX = box.x - box.hx;
    const maxX = box.x + box.hx;
    const minY = box.y - box.hy;
    const maxY = box.y + box.hy;
    const minZ = box.z - box.hz;
    const maxZ = box.z + box.hz;
    for (let j = 0; j < colliders.length; j = j + 1) {
      const c = colliders[j];
      if (!(maxX <= c.minX || minX >= c.maxX || maxY <= c.minY || minY >= c.maxY || maxZ <= c.minZ || minZ >= c.maxZ)) {
        return c.id;
      }
    }
    for (let i = 0; i < bodies.length; i = i + 1) {
      const b = bodies[i];
      if (!(maxX <= b.x - b.hx || minX >= b.x + b.hx || maxY <= b.y - b.hy || minY >= b.y + b.hy || maxZ <= b.z - b.hz || minZ >= b.z + b.hz)) {
        return b.id;
      }
    }
    return null;
  }

  /**
   * Heights enter the hash once, in record order, before the first frame.
   * @param {import('../frame/types.js').Hasher} hasher
   * @param {ReadonlySet<string>} [driven]
   */
  function mixLoad(hasher, driven) {
    if (heightfield) {
      hasher.u32(heightfield.rows);
      hasher.u32(heightfield.cols);
      if (!hasher.float(heightfield.cell)) {
        throw new Error('NaN');
      }
      for (let i = 0; i < heightfield.heights.length; i = i + 1) {
        if (!hasher.float(heightfield.heights[i])) {
          throw new Error('NaN');
        }
      }
    }
    if (chosen === 'product') {
      if (!loadSolver(productId, bodies, colliders, heightfield, driven || new Set(), shapeId)) {
        throw new Error('NaN');
      }
    }
  }

  /** Canonical solver snapshot, or null when this world is not the product law. */
  function snapshot() {
    if (chosen !== 'product') {
      return null;
    }
    return snapshotBytes();
  }

  return { bodies, colliders, heightfield, body, step, segmentHits, overlaps, mixLoad, snapshot, clearWarmstart, law: chosen };
}

/** The fixture room: a floor and two walls, extruded through z. */
export function fixtureColliders() {
  return [
    { id: 'floor', minX: -1, maxX: 5, minY: -1, maxY: 0, minZ: -2, maxZ: 2 },
    { id: 'wall-left', minX: -1, maxX: 0, minY: 0, maxY: 8, minZ: -2, maxZ: 2 },
    { id: 'wall-right', minX: 4, maxX: 5, minY: 0, maxY: 8, minZ: -2, maxZ: 2 },
  ];
}
