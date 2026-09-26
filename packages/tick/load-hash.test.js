// The load hash covers everything a world file holds but its name (#76).
// worlds/index.json files each admitted world under its load hash, and the
// host refuses a world file that no longer hashes to its entry (indexReason).
// The hash reached a static collider only through a contact at load, so a
// wall nothing touched at load was outside it: fixtures/sweep/walled.json and
// walled-open.json, one wall apart, hashed alike, and a wall added to an
// admitted file passed the host. A body's id and half-extents, the goal, the
// minds, and the seed past its low 32 bits were outside it as well. These
// tests hold every field of a world file to the hash, the name to the index's
// key, and a -0.0 to the +0.0 the law builds from it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHasher } from '../frame/hash.js';
import { indexReason, loadHash } from './admit-world.js';
import { loadScene, validateScene } from './scene.js';
import { createWorld } from './world.js';

/** A post in crate-and-door's far corner, clear of both bodies at load and of the door. */
const POST = { id: 'post', minX: 3.5, maxX: 3.75, minY: 0, maxY: 2, minZ: 1, maxZ: 1.25 };

// Rotations about y, as literals: a world file holds literals, and the last
// bit of a sine is the host's to choose.
/** 30 degrees: the sine and cosine of 15 degrees. */
const TURN_30 = { qy: 0.25881904510252074, qw: 0.9659258262890683 };
/** 0.2 radians: the sine and cosine of 0.1. */
const TURN_POINT_2 = { qy: 0.09983341664682815, qw: 0.9950041652780257 };
/** 0.1 radians: the sine and cosine of 0.05. */
const TURN_POINT_1 = { qy: 0.04997916927067833, qw: 0.9987502603949663 };

/**
 * @param {string} path
 * @returns {any}
 */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * A world file's scene, as load world and the host read it.
 * @param {unknown} value
 */
function sceneOf(value) {
  const checked = validateScene(value);
  if (!checked.ok) {
    throw new Error('the world is refused: ' + checked.reason);
  }
  return checked.scene;
}

/**
 * The solver's snapshot after load, the part of the load hash the law writes,
 * taken as loadHash takes it.
 * @param {import('./scene.js').Scene} scene
 */
function snapshotAtLoad(scene) {
  const world = createWorld({ bodies: scene.bodies, colliders: scene.colliders, zones: scene.zones, heightfield: scene.heightfield }, 'product');
  world.mixLoad(createHasher(), new Set());
  const snap = world.snapshot();
  assert.ok(snap, 'a product world has a snapshot');
  return Buffer.from(snap).toString('hex');
}

/**
 * crate-and-door with every kind of record a world file can hold: a turned
 * post, a body with a rotation and a spin, a heightfield, and a mind with
 * both kinds of goal and a belief about a body and one about a zone.
 * @returns {any}
 */
function everything() {
  const world = readJson('worlds/crate-and-door.json');
  world.colliders.push({ ...POST, qx: 0, qz: 0, ...TURN_POINT_2 });
  Object.assign(world.bodies[1], { qx: 0, qz: 0, ...TURN_POINT_1, wx: 0, wy: 0.5, wz: 0 });
  world.heightfield = { rows: 2, cols: 3, cell: 0.5, heights: [-2, -2.25, -2, -2.5, -2, -2.75] };
  world.minds = [{
    body: 'walker',
    sight: 3,
    goals: [{ kind: 'reach', zone: 'door' }, { kind: 'use', target: 'crate' }],
    beliefs: [
      { subject: { body: 'crate' }, key: 'at', value: 'door', confidence: 0.5, source: 'e1' },
      { subject: { zone: 'door' }, key: 'visited', value: 3, confidence: 1, source: 'e1' },
    ],
  }];
  return world;
}

/**
 * The path to every number and text a record holds.
 * @param {any} value
 * @param {Array<string | number>} [path]
 * @returns {Array<Array<string | number>>}
 */
function leaves(value, path = []) {
  if (value === null || typeof value !== 'object') {
    return [path];
  }
  return Object.keys(value).flatMap((key) => leaves(value[key], path.concat(Array.isArray(value) ? Number(key) : key)));
}

/**
 * @param {any} root
 * @param {Array<string | number>} path
 * @returns {any}
 */
function at(root, path) {
  let node = root;
  for (const key of path) {
    node = node[key];
  }
  return node;
}

/**
 * The next double away from zero: the least change a number can take.
 * @param {number} x
 */
function next(x) {
  if (x === 0) {
    return Number.MIN_VALUE;
  }
  const f = new Float64Array([x]);
  const u = new BigUint64Array(f.buffer);
  u[0] = u[0] + 1n;
  return f[0];
}

/**
 * The scene with the least edit to one field: the next double for a number
 * and one more character for a text. A grid's rows and columns are edited by
 * swapping them, and a mind goal's kind by turning the goal into the other
 * kind with the same name, so the solver still loads what the hash reads.
 * @param {import('./scene.js').Scene} scene
 * @param {Array<string | number>} path
 */
function edited(scene, path) {
  const copy = structuredClone(scene);
  const key = path[path.length - 1];
  const parent = at(copy, path.slice(0, -1));
  if (path[0] === 'heightfield' && (key === 'rows' || key === 'cols')) {
    const rows = parent.rows;
    parent.rows = parent.cols;
    parent.cols = rows;
  } else if (path[0] === 'minds' && path[2] === 'goals' && key === 'kind') {
    const name = parent.kind === 'reach' ? parent.zone : parent.target;
    at(copy, path.slice(0, 3))[path[3]] = parent.kind === 'reach' ? { kind: 'use', target: name } : { kind: 'reach', zone: name };
  } else if (typeof parent[key] === 'number') {
    parent[key] = next(parent[key]);
  } else {
    parent[key] = parent[key] + '2';
  }
  return copy;
}

test('two worlds that differ only by a wall nothing touches at load have different load hashes', () => {
  const walled = readJson('fixtures/sweep/walled.json');
  const open = readJson('fixtures/sweep/walled-open.json');
  const crate = readJson('worlds/crate-and-door.json');
  /** @type {Array<{ name: string, with: any, without: any, wall: string }>} */
  const cases = [
    // T6's pair: the vault walled on four sides, and the same with its west
    // wall gone. The name is the index's key and not in the hash, so under
    // one name the wall is the whole difference.
    { name: 'walled and walled-open under one name', with: walled, without: { ...open, name: walled.name }, wall: 'vault-west' },
    { name: 'crate-and-door and the same with a post in a corner', with: { ...crate, colliders: crate.colliders.concat(POST) }, without: crate, wall: 'post' },
    { name: 'crate-and-door and the same with the post turned 30 degrees about y', with: { ...crate, colliders: crate.colliders.concat({ ...POST, ...TURN_30 }) }, without: crate, wall: 'post' },
  ];
  for (const each of cases) {
    assert.deepEqual({ ...each.with, colliders: each.with.colliders.filter((/** @type {{ id: string }} */ box) => box.id !== each.wall) }, each.without, each.name + ': the files are one wall apart and nothing else');
    const a = sceneOf(each.with);
    const b = sceneOf(each.without);
    assert.equal(snapshotAtLoad(a), snapshotAtLoad(b), each.name + ': nothing touches the wall at load, so the snapshot after load is the same byte for byte');
    assert.notEqual(loadHash(a), loadHash(b), each.name);
  }
  assert.notEqual(loadHash(sceneOf(walled)), loadHash(sceneOf(open)), 'walled and walled-open under their own names');
});

test('every world worlds/index.json lists hashes to its entry', () => {
  const index = readJson('worlds/index.json');
  const names = Object.keys(index.worlds);
  assert.ok(names.length > 0);
  for (const name of names) {
    const loaded = loadScene('worlds/' + name + '.json');
    assert.ok(loaded.ok, name);
    if (loaded.ok) {
      assert.equal(indexReason(loaded.scene, index), null, name);
    }
  }
});

test('a world file edited after admission by adding a wall nothing touches at load is refused by indexReason, and the host refuses it before its first frame', (t) => {
  const index = readJson('worlds/index.json');
  const admitted = loadScene('worlds/crate-and-door.json');
  assert.ok(admitted.ok);
  if (!admitted.ok) {
    return;
  }
  assert.equal(indexReason(admitted.scene, index), null, 'the file as admitted matches its entry');
  // The plant: the admitted file with the post added, written as a world file
  // and read back the way the host reads one.
  const file = readJson('worlds/crate-and-door.json');
  file.colliders.push(POST);
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-load-hash-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'crate-and-door.json');
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
  const planted = loadScene(path);
  assert.ok(planted.ok, planted.ok ? '' : planted.reason);
  if (!planted.ok) {
    return;
  }
  assert.equal(planted.scene.name, 'crate-and-door');
  assert.equal(snapshotAtLoad(planted.scene), snapshotAtLoad(admitted.scene), 'nothing touches the post at load');
  assert.equal(indexReason(planted.scene, index), 'world does not match the index');
  // A host that served the file would run until the timeout ends it.
  const host = spawnSync(process.execPath, ['packages/host/bin/host.js', '--world', path, '--port', '0'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(host.status, 1, host.stdout + host.stderr);
  assert.equal(host.stdout, '');
  assert.equal(host.stderr, 'world does not match the index\n');
});

test('the least edit to any field a world file holds but its name moves the load hash, and so does dropping any record', () => {
  const scene = sceneOf(everything());
  assert.deepEqual(Object.keys(scene).sort(), ['bodies', 'colliders', 'goal', 'heightfield', 'minds', 'name', 'seed', 'zones'], 'the world holds every kind of record a world file can');
  const hash = loadHash(scene);
  const paths = leaves(scene).filter((path) => path[0] !== 'name');
  assert.ok(paths.length > 100, paths.length + ' fields');
  /** @type {string[]} */
  const unmoved = [];
  for (const path of paths) {
    if (loadHash(edited(scene, path)) === hash) {
      unmoved.push(path.join('.'));
    }
  }
  /** @type {Array<[string, (world: any) => void]>} */
  const drops = [
    ['the goal', (world) => { delete world.goal; }],
    ['the minds', (world) => { delete world.minds; }],
    ['the heightfield', (world) => { delete world.heightfield; }],
    ['the post', (world) => { world.colliders.pop(); }],
    ['a zone', (world) => { world.zones.pop(); }],
    ['a body', (world) => { world.bodies.pop(); }],
    ['a mind goal', (world) => { world.minds[0].goals.pop(); }],
    ['a belief', (world) => { world.minds[0].beliefs.pop(); }],
  ];
  for (const [name, drop] of drops) {
    const copy = structuredClone(scene);
    drop(copy);
    if (loadHash(copy) === hash) {
      unmoved.push('drop ' + name);
    }
  }
  assert.deepEqual(unmoved, [], 'edits the load hash does not see');
});

test('the name is the one field outside the load hash, and a -0.0 in a collider or a body hashes as the +0.0 the law builds from it', () => {
  const scene = sceneOf(everything());
  const hash = loadHash(scene);
  // The index files the hash under the name, so indexReason reads it first.
  assert.equal(loadHash({ ...scene, name: 'crate-and-door-renamed' }), hash);
  // S1 pin 4, for every zero a collider or a body holds.
  let zeros = 0;
  for (const path of leaves(scene)) {
    if ((path[0] === 'colliders' || path[0] === 'bodies') && at(scene, path) === 0) {
      const flipped = structuredClone(scene);
      at(flipped, path.slice(0, -1))[path[path.length - 1]] = -0;
      assert.ok(Object.is(at(flipped, path), -0));
      assert.equal(loadHash(flipped), hash, path.join('.'));
      zeros = zeros + 1;
    }
  }
  assert.ok(zeros >= 20, zeros + ' zeros');
});
