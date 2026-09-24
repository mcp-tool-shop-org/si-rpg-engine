'use strict';

// Slice 1. One body, one static floor, 10000 quanta.
// Arithmetic is add, subtract, multiply, divide, and square root.
// Every quantum is mixed into the hash. A NaN prints NAN and is not a hash.

var STEPS = 10000;
var DT = 1 / 64;
var G = -8;
var MAX = 2;

var buf = new ArrayBuffer(8);
var f64 = new Float64Array(buf);
var u32 = new Uint32Array(buf);
var h0 = 0x811c9dc5;
var h1 = 0x811c9dc5;

function out(line) {
  if (typeof print === 'function') {
    print(line);
  } else {
    console.log(line);
  }
}

function mixWord(word, which) {
  var i;
  var b;
  var h = which === 0 ? h0 : h1;
  for (i = 0; i < 4; i = i + 1) {
    b = (word >>> (i * 8)) & 255;
    h = Math.imul(h ^ b, 0x01000193) >>> 0;
  }
  if (which === 0) {
    h0 = h;
  } else {
    h1 = h;
  }
}

function mixFloat(x) {
  if (x !== x) {
    return false;
  }
  f64[0] = x;
  mixWord(u32[0], 0);
  mixWord(u32[1], 1);
  return true;
}

function hex(n) {
  var s = (n >>> 0).toString(16);
  while (s.length < 8) {
    s = '0' + s;
  }
  return s;
}

var x = 0;
var y = 1;
var vx = 0.3;
var vy = 0;
var i;
var speed2;
var speed;
var scale;
var ok = true;

for (i = 0; i < STEPS; i = i + 1) {
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
  speed2 = vx * vx + vy * vy;
  if (speed2 > MAX * MAX) {
    speed = Math.sqrt(speed2);
    scale = MAX / speed;
    vx = vx * scale;
    vy = vy * scale;
  }
  if (!mixFloat(x) || !mixFloat(y) || !mixFloat(vx) || !mixFloat(vy)) {
    ok = false;
    break;
  }
}

if (!ok) {
  out('NAN');
} else {
  out(hex(h0) + hex(h1));
}
