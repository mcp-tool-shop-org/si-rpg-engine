// Slice 1 harness. One body, one static floor, two walls, 10000 quanta.
// Arithmetic is add, subtract, multiply, divide, and square root.
// Every quantum is mixed into the hash. A NaN prints NAN and is not a hash.
//
// Slice 2: the hash function moved to packages/frame/hash.js. This file
// imports it, and the golden hash did not change. The integrator below is
// disposable and stays here; the tick has its own.
//
// Run as a module: `v8 --module`, `spidermonkey -m`, `javascriptcore -m`, or node.

import { createHasher } from '../packages/frame/hash.js';

const STEPS = 10000;
const DT = 1 / 64;
const G = -8;
const MAX = 2;

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

const h = createHasher();

let x = 0;
let y = 1;
let vx = 0.3;
let vy = 0;
let ok = true;

for (let i = 0; i < STEPS; i = i + 1) {
  vy = vy + G * DT;
  x = x + vx * DT;
  y = y + vy * DT;
  if (y < 0) {
    y = 0 - y;
    vy = 0 - vy;
  }
  if (x > 4) {
    x = 8 - x;
    vx = 0 - vx;
  }
  if (x < 0) {
    x = 0 - x;
    vx = 0 - vx;
  }
  const speed2 = vx * vx + vy * vy;
  if (speed2 > MAX * MAX) {
    const speed = Math.sqrt(speed2);
    const scale = MAX / speed;
    vx = vx * scale;
    vy = vy * scale;
  }
  if (!h.float(x) || !h.float(y) || !h.float(vx) || !h.float(vy)) {
    ok = false;
    break;
  }
}

if (!ok) {
  out('NAN');
} else {
  out(h.digest());
}
