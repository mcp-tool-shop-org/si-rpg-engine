import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSession } from '../packages/host/session.js';
import { createHostServer } from '../packages/host/server.js';
import { loadScene, validateScene } from '../packages/tick/scene.js';
import { fixtureColliders } from '../packages/tick/world.js';

const contract = readFileSync(new URL('../docs/host-binding.md', import.meta.url), 'utf8');

const porter = {
  name: 'porter-yard',
  seed: 7,
  bodies: [{ id: 'porter', x: 1, y: 1, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }],
  colliders: [{ id: 'floor', minX: -1, maxX: 5, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }],
  zones: [{ id: 'yard', minX: 0, maxX: 3, minY: 0, maxY: 2, minZ: -1, maxZ: 1 }],
  goal: { actor: 'porter', zone: 'yard' },
};

/**
 * @param {string} name
 */
function fence(name) {
  const marker = '```contract ' + name + '\n';
  const start = contract.indexOf(marker);
  assert.notEqual(start, -1, name);
  const body = contract.slice(start + marker.length);
  const end = body.indexOf('```');
  return body.slice(0, end).split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

/**
 * @param {string} line
 * @param {{ children: Record<string, Spec>, either: Array<[string, string]> }} node
 * @typedef {{ optional: boolean, children: Record<string, Spec>, either: Array<[string, string]> }} Spec
 */
function addSpec(line, node) {
  const optional = line.endsWith('?');
  const text = optional ? line.slice(0, -1) : line;
  if (text.includes('|')) {
    const parts = text.split('|').map((part) => part.trim());
    const left = parts[0].split('.');
    const keyA = left.pop() || '';
    const keyB = parts[1].includes('.') ? parts[1].split('.').pop() || '' : parts[1];
    let at = node;
    for (const seg of left) {
      if (!at.children[seg]) {
        at.children[seg] = { optional: false, children: {}, either: [] };
      }
      at = at.children[seg];
    }
    at.either.push([keyA, keyB]);
    return;
  }
  const segs = text.split('.');
  let at = node;
  for (let i = 0; i < segs.length; i = i + 1) {
    const seg = segs[i];
    if (!at.children[seg]) {
      at.children[seg] = { optional: false, children: {}, either: [] };
    }
    if (i === segs.length - 1 && optional) {
      at.children[seg].optional = true;
    }
    at = at.children[seg];
  }
}

/**
 * @param {unknown} value
 * @param {Spec} spec
 * @param {string} path
 * @param {string[]} problems
 */
function checkNode(value, spec, path, problems) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i = i + 1) {
      checkNode(value[i], spec, path + '[' + i + ']', problems);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  const found = /** @type {Record<string, unknown>} */ (value);
  const eitherKeys = new Set(spec.either.flat());
  for (const key of Object.keys(found)) {
    if (!spec.children[key] && !eitherKeys.has(key)) {
      problems.push(path + '.' + key);
    }
  }
  for (const [key, child] of Object.entries(spec.children)) {
    if (eitherKeys.has(key)) {
      continue;
    }
    if (!Object.hasOwn(found, key)) {
      if (!child.optional) {
        problems.push(path + '.' + key);
      }
      continue;
    }
    if (Object.keys(child.children).length > 0 || child.either.length > 0) {
      checkNode(found[key], child, path + '.' + key, problems);
    }
  }
  for (const [a, b] of spec.either) {
    const hasA = Object.hasOwn(found, a);
    const hasB = Object.hasOwn(found, b);
    if (hasA === hasB) {
      problems.push(path + '.' + a + '|' + b);
    }
  }
}

/**
 * @param {Record<string, unknown>} record
 * @param {{ colliders?: Array<Record<string, unknown>>, goal?: { zone?: string } | null, zones?: Array<{ id: string }>, minds?: unknown[] }} raw
 * @param {string[]} problems
 */
function sourceProblems(record, raw, problems) {
  if (record.kind === 'world' && Array.isArray(record.colliders)) {
    const named = raw.colliders || [];
    for (const collider of record.colliders) {
      const box = /** @type {Record<string, unknown>} */ (collider);
      const source = named.find((item) => item.id === box.id);
      for (const key of ['qx', 'qy', 'qz', 'qw']) {
        if (Object.hasOwn(box, key) && !(source && Object.hasOwn(source, key))) {
          problems.push(String(box.id) + '.' + key);
        }
      }
    }
    const goal = raw.goal;
    const zoneNamed = goal && (raw.zones || []).some((zone) => zone.id === goal.zone);
    if (Object.hasOwn(record, 'goal') && !zoneNamed) {
      problems.push('goal');
    }
  }
  if (record.kind === 'frame' && Object.hasOwn(record, 'minds') && !(raw.minds && raw.minds.length > 0)) {
    problems.push('minds');
  }
}

/**
 * @param {Record<string, unknown>} record
 * @param {string[]} lines
 * @param {{ colliders?: Array<Record<string, unknown>>, goal?: { zone?: string } | null, zones?: Array<{ id: string }>, minds?: unknown[] }} raw
 */
function diff(record, lines, raw) {
  /** @type {Spec} */
  const spec = { optional: false, children: {}, either: [] };
  for (const line of lines) {
    addSpec(line, spec);
  }
  /** @type {string[]} */
  const problems = [];
  checkNode(record, spec, String(record.kind), problems);
  sourceProblems(record, raw, problems);
  return problems;
}

/**
 * @param {ReturnType<typeof createSession>} session
 * @param {{ colliders?: Array<Record<string, unknown>>, goal?: { zone?: string } | null, zones?: Array<{ id: string }>, minds?: unknown[] }} raw
 */
function holds(session, raw) {
  const world = diff(/** @type {Record<string, unknown>} */ (session.worldRecord()), fence('world'), raw);
  const frame = diff(/** @type {Record<string, unknown>} */ (session.frameRecord(session.frame())), fence('frame'), raw);
  assert.deepEqual(world, [], world.join(', '));
  assert.deepEqual(frame, [], frame.join(', '));
}

/**
 * @param {import('node:http').Server} server
 */
function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

/**
 * The client. fetch only.
 * @param {ReadableStreamDefaultReader<Uint8Array>} reader
 * @param {TextDecoder} decoder
 * @param {number} want
 */
async function readLines(reader, decoder, want) {
  let text = '';
  /** @type {string[]} */
  const lines = [];
  while (lines.length < want) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    text += decoder.decode(chunk.value, { stream: true });
    const parts = text.split('\n');
    text = parts.pop() || '';
    for (const line of parts) {
      if (line.length > 0) {
        lines.push(line);
      }
    }
  }
  return lines;
}

/**
 * @param {number} port
 * @param {string} body
 */
function postIntent(port, body) {
  return fetch('http://127.0.0.1:' + port + '/intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

test('the stream world record names version 1', async () => {
  const session = createSession();
  const server = createHostServer(session);
  await listen(server);
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  const frames = await fetch('http://127.0.0.1:' + port + '/frames');
  if (!frames.body) {
    throw new Error('frame stream has no body');
  }
  const reader = frames.body.getReader();
  try {
    const lines = await readLines(reader, new TextDecoder(), 1);
    const world = JSON.parse(lines[0]);
    assert.equal(world.version, 1);
  } finally {
    await reader.cancel();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('the driven actor is the world file goal actor', () => {
  const session = createSession(/** @type {import('../packages/tick/scene.js').Scene} */ (porter));
  assert.equal(session.frameRecord(session.frame()).zone, 'yard');
  const step = session.intent({ direction: 'right' });
  assert.equal(step.admitted, true);
  const proposal = session.log()[0].proposal;
  assert.equal(proposal.kind, 'intent');
  if (proposal.kind === 'intent') {
    assert.equal(proposal.actor, 'porter');
  }
});

test('the fixture, a minded world, and a named quaternion hold the contract', () => {
  holds(createSession(), { colliders: fixtureColliders(), zones: [] });

  const filed = JSON.parse(readFileSync('worlds/crate-and-door.json', 'utf8'));
  const loaded = loadScene('worlds/crate-and-door.json');
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  holds(createSession(loaded.scene), filed);

  const minded = structuredClone(filed);
  minded.minds = [{
    body: 'walker',
    sight: 3,
    goals: [
      { kind: 'reach', zone: 'door' },
      { kind: 'use', target: 'crate' },
    ],
    beliefs: [{ subject: { body: 'crate' }, key: 'at', value: 'door', confidence: 1, source: 'e1' }],
  }];
  const accepted = validateScene(minded);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) {
    return;
  }
  const session = createSession(accepted.scene);
  holds(session, minded);
  const minds = session.frameRecord(session.frame()).minds;
  assert.ok(minds && minds.length === 1);
  if (!minds) {
    return;
  }
  assert.equal(minds[0].beliefs.length, 1);
  assert.deepEqual(Object.keys(minds[0].beliefs[0]).sort(), ['key', 'subject', 'value']);

  const turned = structuredClone(filed);
  delete turned.minds;
  turned.colliders[0].qx = 0;
  turned.colliders[0].qy = 0;
  turned.colliders[0].qz = 0;
  turned.colliders[0].qw = 1;
  const validated = validateScene(turned);
  assert.equal(validated.ok, true);
  if (!validated.ok) {
    return;
  }
  holds(createSession(validated.scene), turned);
  const colliders = validated.scene.colliders;
  assert.equal(Object.hasOwn(colliders[0], 'qx'), true);
  assert.equal(Object.hasOwn(colliders[1], 'qx'), false);
});

test('a drifted field is named', () => {
  const session = createSession();
  const raw = { colliders: fixtureColliders(), zones: [] };
  const missing = /** @type {Record<string, unknown>} */ (structuredClone(session.worldRecord()));
  delete missing.dt;
  const missingProblems = diff(missing, fence('world'), raw);
  assert.ok(missingProblems.some((item) => item.endsWith('.dt')), missingProblems.join(', '));

  const extra = /** @type {Record<string, unknown>} */ (structuredClone(session.worldRecord()));
  extra.extra = true;
  const extraProblems = diff(extra, fence('world'), raw);
  assert.ok(extraProblems.some((item) => item.endsWith('.extra')), extraProblems.join(', '));

  const quat = /** @type {{ colliders: Array<Record<string, unknown>> }} */ (structuredClone(session.worldRecord()));
  quat.colliders[0].qx = 0;
  const quatProblems = diff(/** @type {Record<string, unknown>} */ (quat), fence('world'), raw);
  assert.ok(quatProblems.some((item) => item.endsWith('.qx')), quatProblems.join(', '));
});

test('a client that only fetches plays the fixture through the socket', async () => {
  const session = createSession();
  const server = createHostServer(session);
  await listen(server);
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  const frames = await fetch('http://127.0.0.1:' + port + '/frames');
  if (!frames.body) {
    throw new Error('frame stream has no body');
  }
  const reader = frames.body.getReader();
  const decoder = new TextDecoder();
  try {
    const head = await readLines(reader, decoder, 2);
    const world = JSON.parse(head[0]);
    const frame = JSON.parse(head[1]);
    assert.equal(world.kind, 'world');
    assert.equal(world.version, 1);
    assert.equal(frame.kind, 'frame');
    assert.equal(head[1], JSON.stringify(session.frameRecord(session.frame())));

    const posted = await postIntent(port, JSON.stringify({ verb: 'move', target: { x: 2, z: 0 } }));
    const admission = await posted.json();
    assert.equal(posted.status, 200);
    assert.equal(admission.admitted, true);
    assert.equal(admission.hash, session.frame().hash);

    const notJson = await postIntent(port, 'nope');
    assert.equal(notJson.status, 400);
    assert.deepEqual(await notJson.json(), { admitted: false, reason: 'not json' });

    const notObject = await postIntent(port, 'null');
    assert.equal(notObject.status, 200);
    assert.deepEqual(await notObject.json(), { admitted: false, reason: 'an intent is an object' });

    const noTarget = await postIntent(port, '{}');
    assert.equal(noTarget.status, 200);
    assert.deepEqual(await noTarget.json(), { admitted: false, reason: 'an intent needs a target or a direction' });

    const oversized = await postIntent(port, JSON.stringify({ pad: 'x'.repeat(5000) }));
    assert.equal(oversized.status, 413);
    assert.equal(await oversized.text(), '');

    const advanced = [session.advance(), session.advance()];
    const streamed = await readLines(reader, decoder, 2);
    assert.equal(streamed[0], JSON.stringify(session.frameRecord(advanced[0])));
    assert.equal(streamed[1], JSON.stringify(session.frameRecord(advanced[1])));
  } finally {
    await reader.cancel();
    await new Promise((resolve) => server.close(resolve));
  }
});
