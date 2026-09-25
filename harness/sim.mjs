// The product harness. It steps the solver play steps, for ten thousand
// quanta, and prints one digest. fixtures/golden.txt is that digest.
// The arithmetic contract is harness/arith.mjs.
//
// Run as a module: `v8 --module`, `spidermonkey -m`, `javascriptcore -m`, or node.

import { createHasher } from '../packages/frame/hash.js';
import { instantiate } from '../solver/dist/solver.mjs';
import { createProductWorld, productDriven } from './product-scene.mjs';

const STEPS = 10000;

/** @param {string} line */
function out(line) {
  // @ts-ignore the shells define print; node does not
  if (typeof print === 'function') {
    // @ts-ignore
    print(line);
  } else {
    console.log(line);
  }
}

instantiate();
const world = createProductWorld();
const driven = new Set(productDriven);
const h = createHasher();
let ok = true;

try {
  world.mixLoad(h, driven);
} catch {
  ok = false;
}

for (let i = 0; ok && i < STEPS; i = i + 1) {
  try {
    world.step(driven);
  } catch {
    ok = false;
    break;
  }
  for (let b = 0; b < world.bodies.length; b = b + 1) {
    const body = world.bodies[b];
    if (!h.float(body.x) || !h.float(body.y) || !h.float(body.z) || !h.float(body.vx) || !h.float(body.vy) || !h.float(body.vz)) {
      ok = false;
      break;
    }
    if (!h.float(body.qx) || !h.float(body.qy) || !h.float(body.qz) || !h.float(body.qw) || !h.float(body.wx) || !h.float(body.wy) || !h.float(body.wz)) {
      ok = false;
      break;
    }
  }
  const snap = world.snapshot();
  if (snap) {
    h.u32(snap.length);
    for (let s = 0; s < snap.length; s = s + 1) {
      h.u32(snap[s]);
    }
  }
  if (!ok) {
    break;
  }
}

if (!ok) {
  out('NAN');
} else {
  out(h.digest());
}
