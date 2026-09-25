// The tick's heightfield surface against the physics. Parry cuts each cell
// into two triangles; supportAt must read the same surface the law collides
// with. The oracle is the product law itself: a small box dropped on the
// field comes to rest on the solver's surface, and supportAt under the box's
// lowest corners must be where the box sits.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../packages/tick/world.js';

// The law's contact skin (SKIN in solver/src/rapier_law.rs). A resting box
// penetrates its support by Rapier's allowed linear error (0.001) at most, so
// a reading within the skin is the solver's surface; a bilinear reading at a
// cell centre of these fields is off by 0.05, five skins.
const TOLERANCE = 0.01;
const HALF = 0.02;
const RAISE = 0.2;
const MAX_QUANTA = 640;
const MAX_DRIFT = 0.1;

/**
 * Cell fractions (tx along x, tz along z) sampled in the middle cell: the
 * centre, points on the diagonal tx + tz = 1, off-centre points on both sides
 * of the diagonal that are not symmetric in tx and tz (a swapped tx and tz
 * reads them wrongly), and midpoints of the four cell edges.
 */
const FRACTIONS = [
  [0.5, 0.5],
  [0.25, 0.75], [0.75, 0.25],
  [0.2, 0.5], [0.5, 0.2], [0.3, 0.1],
  [0.8, 0.5], [0.5, 0.8], [0.9, 0.6],
  [0.5, 0], [0, 0.5], [1, 0.5], [0.5, 1],
];

/**
 * A field of 4 x 4 vertices, cell 1, flat at 0 but for one corner of the
 * middle cell (rows 1..2, columns 1..2). Rows advance z, columns advance x.
 * @param {number} row
 * @param {number} col
 */
function raisedField(row, col) {
  const heights = new Array(16).fill(0);
  heights[row * 4 + col] = RAISE;
  return { rows: 4, cols: 4, cell: 1, heights };
}

/** A fixed-seed field of 5 x 5 vertices with heights in [0, RAISE). */
function randomField() {
  let state = 0x5eed2;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const heights = [];
  for (let i = 0; i < 25; i = i + 1) {
    heights.push(Math.round(next() * RAISE * 1000) / 1000);
  }
  return { rows: 5, cols: 5, cell: 1, heights };
}

/**
 * World position of cell (row, col) at fractions (tx, tz). The field is
 * centred on the origin.
 * @param {{ rows: number, cols: number, cell: number }} field
 * @param {number} row
 * @param {number} col
 * @param {number} tx
 * @param {number} tz
 */
function pointIn(field, row, col, tx, tz) {
  const x0 = -((field.cols - 1) * field.cell) / 2;
  const z0 = -((field.rows - 1) * field.cell) / 2;
  return { x: x0 + (col + tx) * field.cell, z: z0 + (row + tz) * field.cell };
}

/**
 * @param {number} qx
 * @param {number} qy
 * @param {number} qz
 * @param {number} qw
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function rotate(qx, qy, qz, qw, x, y, z) {
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return {
    x: x + qw * tx + (qy * tz - qz * ty),
    y: y + qw * ty + (qz * tx - qx * tz),
    z: z + qw * tz + (qx * ty - qy * tx),
  };
}

/**
 * Drops one small box above each point on the product law, steps until every
 * box sleeps, and returns, per point, the smallest gap between a corner of
 * the box and supportAt under that corner. A box resting on the surface has
 * a corner on it, so the gap is zero within the skin when supportAt reads
 * the solver's surface. The queries go to a world holding only the field, so
 * a resting box never answers for its own support.
 * @param {{ rows: number, cols: number, cell: number, heights: number[] }} field
 * @param {Array<{ x: number, z: number, label: string }>} points
 */
function dropAll(field, points) {
  const surface = createWorld({ bodies: [], colliders: [], heightfield: field }, 'reference');
  const bodies = points.map((point, index) => {
    const start = surface.supportAt(point.x, point.z, 1e9);
    return {
      id: 'box' + index, x: point.x, y: (start === null ? 0 : start) + HALF + 0.08, z: point.z,
      vx: 0, vy: 0, vz: 0, hx: HALF, hy: HALF, hz: HALF,
    };
  });
  const world = createWorld({ bodies, colliders: [], heightfield: field }, 'product');
  // The solver snapshot is the last world stepped, so sleep is read only
  // after this world has stepped at least once.
  let quanta = 0;
  do {
    world.step(new Set());
    quanta = quanta + 1;
  } while (quanta < MAX_QUANTA && !bodies.every((b) => world.sleeping(b.id)));
  return points.map((point, index) => {
    const b = world.body('box' + index);
    if (!b) {
      throw new Error('box' + index + ' is missing');
    }
    let gap = Infinity;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const r = rotate(b.qx, b.qy, b.qz, b.qw, sx * b.hx, sy * b.hy, sz * b.hz);
          const cx = b.x + r.x;
          const cy = b.y + r.y;
          const cz = b.z + r.z;
          const under = surface.supportAt(cx, cz, 1e9);
          if (under !== null && cy - under < gap) {
            gap = cy - under;
          }
        }
      }
    }
    return {
      label: point.label,
      asleep: world.sleeping('box' + index),
      quanta,
      gap,
      drift: Math.hypot(b.x - point.x, b.z - point.z),
    };
  });
}

/**
 * @param {string} name
 * @param {{ rows: number, cols: number, cell: number, heights: number[] }} field
 * @param {Array<[number, number]>} cells
 */
function assertOracle(name, field, cells) {
  /** @type {Array<{ x: number, z: number, label: string }>} */
  const points = [];
  for (const [row, col] of cells) {
    for (const [tx, tz] of FRACTIONS) {
      const p = pointIn(field, row, col, tx, tz);
      // Neighbouring cells share an edge midpoint; one box stands there.
      if (points.some((q) => q.x === p.x && q.z === p.z)) {
        continue;
      }
      points.push({ x: p.x, z: p.z, label: 'cell ' + row + ',' + col + ' tx ' + tx + ' tz ' + tz });
    }
  }
  const results = dropAll(field, points);
  if (process.env.SURFACE_REPORT) {
    for (const r of results) {
      console.log(name + ' | ' + r.label + ' | quanta ' + r.quanta + ' | asleep ' + r.asleep + ' | drift ' + r.drift.toFixed(4) + ' | gap ' + r.gap.toFixed(6));
    }
  }
  const failures = [];
  for (const r of results) {
    if (!r.asleep) {
      failures.push(r.label + ' did not sleep in ' + MAX_QUANTA + ' quanta');
    }
    // A box dropped on a crease settles a little to one side; the gap is
    // measured where it rests, and a tenth of a cell keeps it at the point.
    if (!(r.drift < MAX_DRIFT)) {
      failures.push(r.label + ' drifted ' + r.drift.toFixed(6));
    }
    if (!(Math.abs(r.gap) <= TOLERANCE)) {
      failures.push(r.label + ' gap ' + r.gap.toFixed(6));
    }
  }
  assert.deepEqual(failures, [], name + ': supportAt is the solver surface within ' + TOLERANCE);
}

// Middle cell rows 1..2, columns 1..2: p00 = (1, 1), p10 = (2, 1) (+z),
// p01 = (1, 2) (+x), p11 = (2, 2). p00 and p11 are off the diagonal.
for (const [name, row, col] of /** @type {Array<[string, number, number]>} */ ([
  ['p00 raised', 1, 1],
  ['p10 raised', 2, 1],
  ['p01 raised', 1, 2],
  ['p11 raised', 2, 2],
])) {
  test('the physics is the oracle: ' + name + ' in the middle cell', () => {
    assertOracle(name, raisedField(row, col), [[1, 1]]);
  });
}

test('the physics is the oracle: a fixed-seed random field', () => {
  const field = randomField();
  assertOracle('random', field, [[1, 1], [1, 2], [2, 1], [2, 2]]);
});

/**
 * The function on main before S2, kept here as the reference for the edges.
 * @param {{ rows: number, cols: number, cell: number, heights: number[] }} field
 * @param {number} x
 * @param {number} z
 */
function bilinear(field, x, z) {
  const fj = (x / ((field.cols - 1) * field.cell) + 0.5) * (field.cols - 1);
  const fi = (z / ((field.rows - 1) * field.cell) + 0.5) * (field.rows - 1);
  const j0 = Math.min(field.cols - 2, Math.floor(fj));
  const i0 = Math.min(field.rows - 2, Math.floor(fi));
  const tx = fj - j0;
  const tz = fi - i0;
  /** @param {number} r @param {number} c */
  const at = (r, c) => field.heights[r * field.cols + c];
  return at(i0, j0) * (1 - tx) * (1 - tz) + at(i0, j0 + 1) * tx * (1 - tz) + at(i0 + 1, j0) * (1 - tx) * tz + at(i0 + 1, j0 + 1) * tx * tz;
}

test('the exact cases: the diagonal runs from (x0, z1) to (x1, z0)', () => {
  /**
   * @param {number} row
   * @param {number} col
   */
  const one = (row, col) => {
    const heights = [0, 0, 0, 0];
    heights[row * 2 + col] = 1;
    return { rows: 2, cols: 2, cell: 1, heights };
  };
  /**
   * @param {{ rows: number, cols: number, cell: number, heights: number[] }} field
   * @param {number} x
   * @param {number} z
   */
  const read = (field, x, z) => createWorld({ bodies: [], colliders: [], heightfield: field }, 'reference').supportAt(x, z, 1e9);
  // Off-diagonal corners p00 (row 0 col 0) and p11 (row 1 col 1): the centre reads 0.
  assert.equal(read(one(0, 0), 0, 0), 0);
  assert.equal(read(one(1, 1), 0, 0), 0);
  // On-diagonal corners p10 (row 1 col 0, +z) and p01 (row 0 col 1, +x): the centre reads 0.5.
  assert.equal(read(one(1, 0), 0, 0), 0.5);
  assert.equal(read(one(0, 1), 0, 0), 0.5);
  // tx is along x and tz along z. With p10 (+z) raised, a point at tx 0.1,
  // tz 0.3 is in the first triangle and reads tz; swapped it would read 0.1.
  const p10 = read(one(1, 0), -0.4, -0.2);
  assert.ok(p10 !== null && Math.abs(p10 - 0.3) < 1e-12, 'p10 raised reads tz, not tx: ' + p10);
  const p01 = read(one(0, 1), -0.4, -0.2);
  assert.ok(p01 !== null && Math.abs(p01 - 0.1) < 1e-12, 'p01 raised reads tx, not tz: ' + p01);
  // In the second triangle (tx + tz > 1): tx 0.9, tz 0.6 with p11 raised reads 0.5.
  const p11 = read(one(1, 1), 0.4, 0.1);
  assert.ok(p11 !== null && Math.abs(p11 - 0.5) < 1e-12, 'p11 raised in the second triangle: ' + p11);
});

test('the exact cases: a cell edge reads the linear interpolation along it in both functions', () => {
  const field = { rows: 2, cols: 2, cell: 1, heights: [0.1, 0.7, 0.4, 1.3] };
  const world = createWorld({ bodies: [], colliders: [], heightfield: field }, 'reference');
  // y00 = 0.1, y01 = 0.7 (+x), y10 = 0.4 (+z), y11 = 1.3.
  const edges = [
    { x: -0.5 + 0.3, z: -0.5, want: 0.1 + 0.3 * (0.7 - 0.1) },
    { x: -0.5 + 0.3, z: 0.5, want: 0.4 + 0.3 * (1.3 - 0.4) },
    { x: -0.5, z: -0.5 + 0.3, want: 0.1 + 0.3 * (0.4 - 0.1) },
    { x: 0.5, z: -0.5 + 0.3, want: 0.7 + 0.3 * (1.3 - 0.7) },
  ];
  for (const edge of edges) {
    const triangle = world.supportAt(edge.x, edge.z, 1e9);
    assert.ok(triangle !== null && Math.abs(triangle - edge.want) < 1e-12, 'triangle ' + edge.x + ',' + edge.z + ' ' + triangle);
    const reference = bilinear(field, edge.x, edge.z);
    assert.ok(Math.abs(reference - edge.want) < 1e-12, 'bilinear ' + edge.x + ',' + edge.z + ' ' + reference);
  }
});
