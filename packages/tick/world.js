// The spatial law: bodies, static colliders, one fixed-timestep quantum.
// Arithmetic is add, subtract, multiply, divide, and square root.

export const DT = 1 / 64;
export const G = -8;
export const MAX_SPEED = 2;

/**
 * @typedef {import('../frame/types.js').Body} Body
 * @typedef {import('../frame/types.js').StaticCollider} StaticCollider
 */

/**
 * @param {{ bodies: Body[]; colliders: StaticCollider[] }} init
 */
export function createWorld(init) {
  /** @type {Body[]} */
  const bodies = init.bodies.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, hw: b.hw, hh: b.hh }));
  /** @type {StaticCollider[]} */
  const colliders = init.colliders.map((c) => ({ id: c.id, minX: c.minX, maxX: c.maxX, minY: c.minY, maxY: c.maxY }));

  /** @param {string} id */
  function body(id) {
    for (let i = 0; i < bodies.length; i = i + 1) {
      if (bodies[i].id === id) {
        return bodies[i];
      }
    }
    return undefined;
  }

  /** One quantum. Gravity, integrate, resolve against every static collider, clamp speed. */
  function step() {
    for (let i = 0; i < bodies.length; i = i + 1) {
      const b = bodies[i];
      b.vy = b.vy + G * DT;
      b.x = b.x + b.vx * DT;
      b.y = b.y + b.vy * DT;
      for (let j = 0; j < colliders.length; j = j + 1) {
        const c = colliders[j];
        const bMinX = b.x - b.hw;
        const bMaxX = b.x + b.hw;
        const bMinY = b.y - b.hh;
        const bMaxY = b.y + b.hh;
        if (bMaxX <= c.minX || bMinX >= c.maxX || bMaxY <= c.minY || bMinY >= c.maxY) {
          continue;
        }
        const pushLeft = bMaxX - c.minX;
        const pushRight = c.maxX - bMinX;
        const pushDown = bMaxY - c.minY;
        const pushUp = c.maxY - bMinY;
        const px = pushLeft < pushRight ? pushLeft : pushRight;
        const py = pushDown < pushUp ? pushDown : pushUp;
        if (px < py) {
          b.x = pushLeft < pushRight ? b.x - px : b.x + px;
          b.vx = 0 - b.vx;
        } else {
          b.y = pushDown < pushUp ? b.y - py : b.y + py;
          b.vy = 0 - b.vy;
        }
      }
      const speed2 = b.vx * b.vx + b.vy * b.vy;
      if (speed2 > MAX_SPEED * MAX_SPEED) {
        const speed = Math.sqrt(speed2);
        const scale = MAX_SPEED / speed;
        b.vx = b.vx * scale;
        b.vy = b.vy * scale;
      }
    }
  }

  /**
   * Liang-Barsky clip of the segment against one box. True when they meet.
   * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
   * @param {StaticCollider} c
   */
  function segmentHitsBox(x0, y0, x1, y1, c) {
    let t0 = 0;
    let t1 = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const p = [0 - dx, dx, 0 - dy, dy];
    const q = [x0 - c.minX, c.maxX - x0, y0 - c.minY, c.maxY - y0];
    for (let i = 0; i < 4; i = i + 1) {
      if (p[i] === 0) {
        if (q[i] < 0) {
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
    return true;
  }

  /**
   * The collider query the intent predicate uses for reachability.
   * A pad expands every box by the actor's half-extents, which is the
   * swept test for an axis-aligned body. The stored colliders do not change.
   * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
   * @param {{ hw: number, hh: number }} [pad]
   * @returns {string | null} the id of the first collider the segment crosses
   */
  function segmentHits(x0, y0, x1, y1, pad) {
    const hw = pad ? pad.hw : 0;
    const hh = pad ? pad.hh : 0;
    for (let j = 0; j < colliders.length; j = j + 1) {
      const stored = colliders[j];
      const box = hw === 0 && hh === 0 ? stored : {
        id: stored.id,
        minX: stored.minX - hw,
        maxX: stored.maxX + hw,
        minY: stored.minY - hh,
        maxY: stored.maxY + hh,
      };
      if (segmentHitsBox(x0, y0, x1, y1, box)) {
        return stored.id;
      }
    }
    return null;
  }

  /**
   * The collider query a body draft is checked with.
   * @param {{ x: number; y: number; hw: number; hh: number }} box
   * @returns {string | null} the id of the first collider or body the box overlaps
   */
  function overlaps(box) {
    const minX = box.x - box.hw;
    const maxX = box.x + box.hw;
    const minY = box.y - box.hh;
    const maxY = box.y + box.hh;
    for (let j = 0; j < colliders.length; j = j + 1) {
      const c = colliders[j];
      if (!(maxX <= c.minX || minX >= c.maxX || maxY <= c.minY || minY >= c.maxY)) {
        return c.id;
      }
    }
    for (let i = 0; i < bodies.length; i = i + 1) {
      const b = bodies[i];
      if (!(maxX <= b.x - b.hw || minX >= b.x + b.hw || maxY <= b.y - b.hh || minY >= b.y + b.hh)) {
        return b.id;
      }
    }
    return null;
  }

  return { bodies, colliders, body, step, segmentHits, overlaps };
}

/** The slice 2 fixture room: a floor and two walls around a 4 by 4 box. */
export function fixtureColliders() {
  return [
    { id: 'floor', minX: -1, maxX: 5, minY: -1, maxY: 0 },
    { id: 'wall-left', minX: -1, maxX: 0, minY: 0, maxY: 8 },
    { id: 'wall-right', minX: 4, maxX: 5, minY: 0, maxY: 8 },
  ];
}
