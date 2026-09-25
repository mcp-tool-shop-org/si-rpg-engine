// The spatial law: bodies, static colliders, one fixed-timestep quantum.
// The product step is the WASM binary. The JavaScript below it is the reference.

import { imageRefusal, imageSolver, loadSolver, restoreImage, snapshotBytes, stepBodies, stepSolver } from '../../solver/dist/solver.mjs';
import { subjectText } from './subject.js';
import { goalsOf as goalsOfMind } from './minds.js';

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
 * @param {{ bodies: Array<Body | (Omit<Body, 'qx' | 'qy' | 'qz' | 'qw' | 'wx' | 'wy' | 'wz'> & Partial<Pick<Body, 'qx' | 'qy' | 'qz' | 'qw' | 'wx' | 'wy' | 'wz'>>)>; colliders: StaticCollider[]; zones?: import('../frame/types.js').Zone[]; heightfield?: Heightfield | null; shape?: 'box' | 'capsule'; name?: string; minds?: import('./minds.js').Mind[] }} init
 * @param {'product' | 'box' | 'reference'} [law] product is the Rapier step; box is the E1 binary; reference is the JavaScript kernel
 */
export function createWorld(init, law) {
  const chosen = law || 'product';
  // A restore adopts the saved world's id, so the solver's signature matches.
  let productId = chosen === 'product' ? nextProductId++ : 0;
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
  /** @type {Array<StaticCollider & { qx: number, qy: number, qz: number, qw: number }>} */
  const colliders = init.colliders.map((c) => ({
    id: c.id, minX: c.minX, maxX: c.maxX, minY: c.minY, maxY: c.maxY, minZ: c.minZ, maxZ: c.maxZ,
    qx: typeof c.qx === 'number' ? c.qx : 0,
    qy: typeof c.qy === 'number' ? c.qy : 0,
    qz: typeof c.qz === 'number' ? c.qz : 0,
    qw: typeof c.qw === 'number' ? c.qw : 1,
  }));
  const name = typeof init.name === 'string' ? init.name : '';
  /** @type {import('./minds.js').Mind[]} */
  const minds = Array.isArray(init.minds) ? init.minds.map((mind) => ({
    body: mind.body,
    sight: mind.sight,
    goals: (mind.goals || []).map((goal) => (
      goal.kind === 'reach'
        ? { kind: /** @type {'reach'} */ ('reach'), zone: goal.zone }
        : { kind: /** @type {'use'} */ ('use'), target: goal.target }
    )),
    beliefs: (mind.beliefs || []).map((belief) => ({
      subject: belief.subject,
      key: belief.key,
      value: belief.value,
      confidence: belief.confidence,
      source: belief.source,
    })),
  })) : [];
  const zones = Array.isArray(init.zones) ? init.zones.map((z) => ({
    id: z.id, minX: z.minX, maxX: z.maxX, minY: z.minY, maxY: z.maxY, minZ: z.minZ, maxZ: z.maxZ,
  })) : [];
  if ((chosen === 'reference' || chosen === 'box') && colliders.some((c) => c.qx !== 0 || c.qy !== 0 || c.qz !== 0 || c.qw !== 1)) {
    throw new Error('a rotated collider is refused: the reference kernel does not grow');
  }
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
  /** Body ids whose kinematic step is lifted: the record's vertical velocity, no gravity, no snap. */
  const lifted = new Set();
  /** @type {Map<string, string>} actor id to the one body it carries */
  const carrying = new Map();
  /** @type {Map<string, string>} carried body id to the actor */
  const carriedBy = new Map();

  /**
   * @param {ReadonlySet<string>} driving
   */
  function solverModes(driving) {
    for (let i = 0; i < bodies.length; i = i + 1) {
      const tagged = /** @type {Body & { solverMode?: number }} */ (bodies[i]);
      if (carriedBy.has(tagged.id)) {
        tagged.solverMode = 3;
      } else if (driving.has(tagged.id) && lifted.has(tagged.id)) {
        tagged.solverMode = 2;
      } else if (driving.has(tagged.id)) {
        tagged.solverMode = 1;
      } else {
        tagged.solverMode = 0;
      }
    }
  }

  function pinCarried() {
    for (const [bodyId, actorId] of carriedBy) {
      const actor = body(actorId);
      const carried = body(bodyId);
      if (!actor || !carried) {
        continue;
      }
      carried.x = actor.x;
      carried.y = actor.y + actor.hy + carried.hy;
      carried.z = actor.z;
      carried.vx = 0;
      carried.vy = 0;
      carried.vz = 0;
      carried.qx = 0;
      carried.qy = 0;
      carried.qz = 0;
      carried.qw = 1;
      carried.wx = 0;
      carried.wy = 0;
      carried.wz = 0;
    }
  }

  /**
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
      solverModes(driving);
      if (!stepSolver(productId, bodies, colliders, heightfield, driving, shapeId)) {
        throw new Error('NaN');
      }
      pinCarried();
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
   * Inverse of a unit quaternion, applied to a vector.
   * @param {number} qx @param {number} qy @param {number} qz @param {number} qw
   * @param {number} x @param {number} y @param {number} z
   */
  function localOf(qx, qy, qz, qw, x, y, z) {
    const tx = 2 * ((0 - qy) * z - (0 - qz) * y);
    const ty = 2 * ((0 - qz) * x - (0 - qx) * z);
    const tz = 2 * ((0 - qx) * y - (0 - qy) * x);
    return {
      x: x + qw * tx + ((0 - qy) * tz - (0 - qz) * ty),
      y: y + qw * ty + ((0 - qz) * tx - (0 - qx) * tz),
      z: z + qw * tz + ((0 - qx) * ty - (0 - qy) * tx),
    };
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
      const rotated = stored.qx !== 0 || stored.qy !== 0 || stored.qz !== 0 || stored.qw !== 1;
      if (!rotated) {
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
        continue;
      }
      const cx = (stored.minX + stored.maxX) / 2;
      const cy = (stored.minY + stored.maxY) / 2;
      const cz = (stored.minZ + stored.maxZ) / 2;
      const halfX = (stored.maxX - stored.minX) / 2;
      const halfY = (stored.maxY - stored.minY) / 2;
      const halfZ = (stored.maxZ - stored.minZ) / 2;
      const a = localOf(stored.qx, stored.qy, stored.qz, stored.qw, x0 - cx, y0 - cy, z0 - cz);
      const b = localOf(stored.qx, stored.qy, stored.qz, stored.qw, x1 - cx, y1 - cy, z1 - cz);
      const box = {
        id: stored.id,
        minX: 0 - halfX - hx,
        maxX: halfX + hx,
        minY: 0 - halfY - hy,
        maxY: halfY + hy,
        minZ: 0 - halfZ - hz,
        maxZ: halfZ + hz,
      };
      if (segmentHitsBox(a.x, a.y, a.z, b.x, b.y, b.z, box)) {
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
      const rotated = c.qx !== 0 || c.qy !== 0 || c.qz !== 0 || c.qw !== 1;
      if (!rotated) {
        if (!(maxX <= c.minX || minX >= c.maxX || maxY <= c.minY || minY >= c.maxY || maxZ <= c.minZ || minZ >= c.maxZ)) {
          return c.id;
        }
        continue;
      }
      if (orientedOverlap(box, c)) {
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
    if (zones.length > 0) {
      hasher.u32(zones.length);
      for (let i = 0; i < zones.length; i = i + 1) {
        const zone = zones[i];
        hasher.text(zone.id);
        if (!hasher.float(zone.minX) || !hasher.float(zone.maxX) || !hasher.float(zone.minY) || !hasher.float(zone.maxY) || !hasher.float(zone.minZ) || !hasher.float(zone.maxZ)) {
          throw new Error('NaN');
        }
      }
    }
    if (minds.length > 0) {
      hasher.u32(minds.length);
      for (let i = 0; i < minds.length; i = i + 1) {
        const mind = minds[i];
        hasher.text(mind.body);
        if (!hasher.float(mind.sight)) {
          throw new Error('NaN');
        }
        hasher.u32(mind.goals.length);
        for (let g = 0; g < mind.goals.length; g = g + 1) {
          const goal = mind.goals[g];
          hasher.text(goal.kind);
          hasher.text(goal.kind === 'reach' ? goal.zone : goal.target);
        }
        hasher.u32(mind.beliefs.length);
        for (let b = 0; b < mind.beliefs.length; b = b + 1) {
          const belief = mind.beliefs[b];
          hasher.text(subjectText(belief.subject));
          hasher.text(belief.key);
          hasher.text(String(belief.value));
          if (!hasher.float(belief.confidence)) {
            throw new Error('NaN');
          }
          hasher.text(belief.source);
        }
      }
    }
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

  /**
   * @typedef {{ id: string, x: number, y: number, z: number, vx: number, vy: number, vz: number, qx: number, qy: number, qz: number, qw: number, wx: number, wy: number, wz: number, solverMode: number | null }} SavedBody
   * @typedef {{ binary: string, digest: string, bytes: Uint8Array }} SolverImage
   * @typedef {{ worldId: number, bodies: SavedBody[], lifted: string[], carried: Array<[string, string]>, image: SolverImage | null }} WorldSave
   */

  /**
   * The solver half of a save: the body records as plain numbers, the lifted
   * and carried sets as arrays, and for the product law an image of the
   * solver's whole linear memory, which holds Rapier's running world. The
   * reference and box laws keep no state between quanta, so their image is
   * null. The tick's memory, minds, actions, and log are T5's bundle.
   * @returns {WorldSave}
   */
  function save() {
    /** @type {SolverImage | null} */
    let image = null;
    if (chosen === 'product') {
      image = imageSolver();
      if (!image) {
        throw new Error('save refused: ' + imageRefusal());
      }
    }
    return {
      worldId: productId,
      bodies: bodies.map((b) => {
        const tagged = /** @type {Body & { solverMode?: number }} */ (b);
        return {
          id: b.id, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz,
          qx: b.qx, qy: b.qy, qz: b.qz, qw: b.qw, wx: b.wx, wy: b.wy, wz: b.wz,
          solverMode: typeof tagged.solverMode === 'number' ? tagged.solverMode : null,
        };
      }),
      lifted: Array.from(lifted),
      carried: Array.from(carrying),
      image,
    };
  }

  /**
   * Puts a save back: the solver image first, then the records and the sets.
   * Throws with the reason when the save is not of this world or the image is
   * refused; nothing has changed then.
   * @param {WorldSave} saved
   */
  function restore(saved) {
    if (!saved || !Array.isArray(saved.bodies) || saved.bodies.length !== bodies.length) {
      throw new Error('restore refused: the save does not have the ' + bodies.length + ' bodies of this world');
    }
    for (let i = 0; i < bodies.length; i = i + 1) {
      if (saved.bodies[i].id !== bodies[i].id) {
        throw new Error('restore refused: body ' + i + ' is ' + saved.bodies[i].id + ' in the save and ' + bodies[i].id + ' here');
      }
    }
    if (chosen === 'product') {
      if (!saved.image || !restoreImage(saved.image)) {
        throw new Error('restore refused: ' + (saved.image ? imageRefusal() : 'a product world restores from an image'));
      }
      productId = saved.worldId;
    }
    for (let i = 0; i < bodies.length; i = i + 1) {
      const from = saved.bodies[i];
      const b = /** @type {Body & { solverMode?: number }} */ (bodies[i]);
      b.x = from.x; b.y = from.y; b.z = from.z;
      b.vx = from.vx; b.vy = from.vy; b.vz = from.vz;
      b.qx = from.qx; b.qy = from.qy; b.qz = from.qz; b.qw = from.qw;
      b.wx = from.wx; b.wy = from.wy; b.wz = from.wz;
      if (typeof from.solverMode === 'number') {
        b.solverMode = from.solverMode;
      } else {
        delete b.solverMode;
      }
    }
    lifted.clear();
    for (const id of saved.lifted) {
      lifted.add(id);
    }
    carrying.clear();
    carriedBy.clear();
    for (const [actorId, bodyId] of saved.carried) {
      carrying.set(actorId, bodyId);
      carriedBy.set(bodyId, actorId);
    }
  }

  /** Canonical solver snapshot, or null when this world is not the product law. */
  function snapshot() {
    if (chosen !== 'product') {
      return null;
    }
    return snapshotBytes();
  }

  /**
   * The zone whose half-open box contains the body's centre, or null.
   * @param {string} id
   * @returns {string | null}
   */
  function zoneOf(id) {
    if (zones.length === 0) {
      return null;
    }
    const found = body(id);
    if (!found) {
      return null;
    }
    for (let i = 0; i < zones.length; i = i + 1) {
      const zone = zones[i];
      if (found.x >= zone.minX && found.x < zone.maxX && found.y >= zone.minY && found.y < zone.maxY && found.z >= zone.minZ && found.z < zone.maxZ) {
        return zone.id;
      }
    }
    return null;
  }

  /**
   * @param {string} id
   * @returns {number | null} file order, or null when the centre is in no zone
   */
  function zoneIndex(id) {
    const name = zoneOf(id);
    if (name === null) {
      return null;
    }
    for (let i = 0; i < zones.length; i = i + 1) {
      if (zones[i].id === name) {
        return i;
      }
    }
    return null;
  }

  /**
   * Highest surface at or below fromY under (x, z). A rotated collider is
   * tested in its local frame. A resting body is one whose velocity is zero.
   * @param {number} x
   * @param {number} z
   * @param {number} fromY
   * @returns {number | null}
   */
  function supportAt(x, z, fromY) {
    /** @type {number | null} */
    let best = null;
    /**
     * @param {number | null} y
     */
    function consider(y) {
      if (y !== null && y <= fromY && (best === null || y > best)) {
        best = y;
      }
    }
    for (let j = 0; j < colliders.length; j = j + 1) {
      consider(colliderSupport(colliders[j], x, z, fromY));
    }
    if (heightfield) {
      consider(heightfieldSupport(heightfield, x, z));
    }
    for (let i = 0; i < bodies.length; i = i + 1) {
      const b = bodies[i];
      if (carriedBy.has(b.id) || b.vx !== 0 || b.vy !== 0 || b.vz !== 0) {
        continue;
      }
      if (x < b.x - b.hx || x > b.x + b.hx || z < b.z - b.hz || z > b.z + b.hz) {
        continue;
      }
      consider(b.y + b.hy);
    }
    return best;
  }

  /**
   * @param {StaticCollider & { qx: number, qy: number, qz: number, qw: number }} collider
   * @param {number} x
   * @param {number} z
   * @param {number} fromY
   * @returns {number | null}
   */
  function colliderSupport(collider, x, z, fromY) {
    const cx = (collider.minX + collider.maxX) / 2;
    const cy = (collider.minY + collider.maxY) / 2;
    const cz = (collider.minZ + collider.maxZ) / 2;
    const hx = (collider.maxX - collider.minX) / 2;
    const hy = (collider.maxY - collider.minY) / 2;
    const hz = (collider.maxZ - collider.minZ) / 2;
    const o = localOf(collider.qx, collider.qy, collider.qz, collider.qw, x - cx, fromY - cy, z - cz);
    const d = localOf(collider.qx, collider.qy, collider.qz, collider.qw, 0, -1, 0);
    const min = [-hx, -hy, -hz];
    const max = [hx, hy, hz];
    const origin = [o.x, o.y, o.z];
    const dir = [d.x, d.y, d.z];
    let t0 = 0;
    let t1 = 1e12;
    for (let a = 0; a < 3; a = a + 1) {
      if (Math.abs(dir[a]) < 1e-15) {
        if (origin[a] < min[a] || origin[a] > max[a]) {
          return null;
        }
        continue;
      }
      let near = (min[a] - origin[a]) / dir[a];
      let far = (max[a] - origin[a]) / dir[a];
      if (near > far) {
        const swap = near;
        near = far;
        far = swap;
      }
      if (near > t0) {
        t0 = near;
      }
      if (far < t1) {
        t1 = far;
      }
      if (t0 > t1) {
        return null;
      }
    }
    if (t0 === 0) {
      const inside = origin[0] > min[0] && origin[0] < max[0] && origin[1] > min[1] && origin[1] < max[1] && origin[2] > min[2] && origin[2] < max[2];
      return inside ? null : fromY;
    }
    if (!(t0 > 0) || !(t0 < 1e12)) {
      return null;
    }
    return fromY - t0;
  }

  /**
   * The heightfield is centred on the origin, matching the solver, and has
   * the solver's surface: two triangles per cell, not a bilinear patch.
   * Parry's HeightField::triangles_at (parry3d-f64 0.30.2,
   * src/shape/heightfield3.rs) builds cell (i, j) with no status flag as
   * (p00, p10, p01) and (p10, p11, p01), where p10 is row i + 1 (+z) and p01
   * is column j + 1 (+x), so the cell is cut from (x0, z1) to (x1, z0). The
   * law builds the field with no subdivision flag (build_world in
   * solver/src/rapier_law.rs); if a later slice sets ZIGZAG_SUBDIVISION, the
   * diagonal flips and this function changes with it. The field's one flag,
   * FIX_INTERNAL_EDGES (T4), corrects contact normals at the triangles' shared
   * edges and leaves the triangles, and so this function, as they were.
   * @param {Heightfield} field
   * @param {number} x
   * @param {number} z
   * @returns {number | null}
   */
  function heightfieldSupport(field, x, z) {
    const scaleX = (field.cols - 1) * field.cell;
    const scaleZ = (field.rows - 1) * field.cell;
    if (!(scaleX > 0) || !(scaleZ > 0)) {
      return null;
    }
    const u = x / scaleX + 0.5;
    const v = z / scaleZ + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      return null;
    }
    const fj = u * (field.cols - 1);
    const fi = v * (field.rows - 1);
    // The far edge belongs to the last cell, at fraction 1.
    const j0 = Math.min(field.cols - 2, Math.floor(fj));
    const i0 = Math.min(field.rows - 2, Math.floor(fi));
    const tx = fj - j0;
    const tz = fi - i0;
    /**
     * @param {number} row
     * @param {number} col
     */
    const at = (row, col) => field.heights[row * field.cols + col];
    const y00 = at(i0, j0);
    const y10 = at(i0 + 1, j0);
    const y01 = at(i0, j0 + 1);
    const y11 = at(i0 + 1, j0 + 1);
    if (tx + tz <= 1) {
      return y00 + tx * (y01 - y00) + tz * (y10 - y00);
    }
    return y11 + (1 - tx) * (y10 - y11) + (1 - tz) * (y01 - y11);
  }

  /**
   * Asleep in the solver snapshot. A reference world has no snapshot.
   * @param {string} id
   */
  function sleeping(id) {
    if (chosen !== 'product' || carriedBy.has(id) || !snapshot) {
      return false;
    }
    const snap = snapshot();
    if (!snap) {
      return false;
    }
    const view = new DataView(snap.buffer, snap.byteOffset, snap.byteLength);
    let slot = 0;
    for (let i = 0; i < bodies.length; i = i + 1) {
      if (carriedBy.has(bodies[i].id)) {
        continue;
      }
      if (bodies[i].id === id) {
        const word = (slot * 15 + 14) * 8;
        if (word + 8 > snap.length) {
          return false;
        }
        return view.getFloat64(word, true) === 1;
      }
      slot = slot + 1;
    }
    return false;
  }

  /**
   * @param {string} actorId
   * @param {string} bodyId
   */
  function carry(actorId, bodyId) {
    if (actorId === bodyId || carrying.has(actorId) || carriedBy.has(bodyId) || !body(actorId) || !body(bodyId)) {
      return false;
    }
    carrying.set(actorId, bodyId);
    carriedBy.set(bodyId, actorId);
    return true;
  }

  /**
   * Puts the carried body back in the solver, awake, just above the support.
   * A bottom that starts exactly on a surface falls through the discrete step.
   * @param {string} actorId
   * @param {number} x
   * @param {number} z
   */
  function release(actorId, x, z) {
    const bodyId = carrying.get(actorId);
    const actor = body(actorId);
    const carried = bodyId ? body(bodyId) : undefined;
    if (!bodyId || !actor || !carried) {
      return false;
    }
    const support = supportAt(x, z, actor.y + 8);
    if (support === null) {
      return false;
    }
    carried.x = x;
    carried.y = support + carried.hy + 0.05;
    carried.z = z;
    carried.vx = 0;
    carried.vy = 0;
    carried.vz = 0;
    carried.qx = 0;
    carried.qy = 0;
    carried.qz = 0;
    carried.qw = 1;
    carried.wx = 0;
    carried.wy = 0;
    carried.wz = 0;
    carrying.delete(actorId);
    carriedBy.delete(bodyId);
    return true;
  }

  /**
   * @param {string | null | undefined} id
   */
  function linkIndex(id) {
    if (!id) {
      return 0xffffffff;
    }
    for (let i = 0; i < bodies.length; i = i + 1) {
      if (bodies[i].id === id) {
        return i;
      }
    }
    return 0xffffffff;
  }

  const api = {
    mindsInstalled: false,
    minds,
    name,
    bodies, colliders, heightfield, zones, body, step, segmentHits, overlaps, mixLoad, snapshot, save, restore, zoneOf, zoneIndex, law: chosen,
    lifted, carry, release, sleeping, supportAt, linkIndex,
    /**
     * @param {string} mind
     */
    goalsOf(mind) {
      return goalsOfMind(/** @type {ReturnType<typeof createWorld>} */ (api), mind);
    },
    anyCarried() {
      return carriedBy.size > 0;
    },
    /**
     * @param {string} id
     */
    carryingOf(id) {
      return carrying.get(id) || null;
    },
    /**
     * @param {string} id
     */
    carriedByOf(id) {
      return carriedBy.get(id) || null;
    },
  };
  return api;
}

/**
 * True when an axis-aligned body overlaps a rotated collider. Touching a face is not an overlap.
 * @param {{ x: number, y: number, z: number, hx: number, hy: number, hz: number }} box
 * @param {{ minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, qx: number, qy: number, qz: number, qw: number }} collider
 */
function orientedOverlap(box, collider) {
  const cx = (collider.minX + collider.maxX) / 2;
  const cy = (collider.minY + collider.maxY) / 2;
  const cz = (collider.minZ + collider.maxZ) / 2;
  const b = [(collider.maxX - collider.minX) / 2, (collider.maxY - collider.minY) / 2, (collider.maxZ - collider.minZ) / 2];
  const a = [box.hx, box.hy, box.hz];
  const qx = collider.qx;
  const qy = collider.qy;
  const qz = collider.qz;
  const qw = collider.qw;
  const xx = qx * qx;
  const yy = qy * qy;
  const zz = qz * qz;
  const xy = qx * qy;
  const xz = qx * qz;
  const yz = qy * qz;
  const wx = qw * qx;
  const wy = qw * qy;
  const wz = qw * qz;
  const r = [
    [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
    [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
    [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
  ];
  const t = [box.x - cx, box.y - cy, box.z - cz];
  const abs = r.map((row) => row.map((value) => Math.abs(value)));
  for (let i = 0; i < 3; i = i + 1) {
    const rb = b[0] * abs[i][0] + b[1] * abs[i][1] + b[2] * abs[i][2];
    if (Math.abs(t[i]) >= a[i] + rb) {
      return false;
    }
  }
  for (let i = 0; i < 3; i = i + 1) {
    const ra = a[0] * abs[0][i] + a[1] * abs[1][i] + a[2] * abs[2][i];
    const along = t[0] * r[0][i] + t[1] * r[1][i] + t[2] * r[2][i];
    if (Math.abs(along) >= ra + b[i]) {
      return false;
    }
  }
  for (let i = 0; i < 3; i = i + 1) {
    for (let j = 0; j < 3; j = j + 1) {
      const i1 = (i + 1) % 3;
      const i2 = (i + 2) % 3;
      const j1 = (j + 1) % 3;
      const j2 = (j + 2) % 3;
      const ra = a[i1] * abs[i2][j] + a[i2] * abs[i1][j];
      const rb = b[j1] * abs[i][j2] + b[j2] * abs[i][j1];
      const along = t[i1] * r[i2][j] - t[i2] * r[i1][j];
      if (Math.abs(along) >= ra + rb) {
        return false;
      }
    }
  }
  return true;
}

/** The fixture room: a floor and two walls, extruded through z. */
export function fixtureColliders() {
  return [
    { id: 'floor', minX: -1, maxX: 5, minY: -1, maxY: 0, minZ: -2, maxZ: 2 },
    { id: 'wall-left', minX: -1, maxX: 0, minY: 0, maxY: 8, minZ: -2, maxZ: 2 },
    { id: 'wall-right', minX: 4, maxX: 5, minY: 0, maxY: 8, minZ: -2, maxZ: 2 },
  ];
}
