import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blendBody, canvasToWorld, fit, worldToCanvas } from './view.js';
import { createSession, startPump } from './session.js';
import { loadScene } from '../tick/scene.js';
import { createHostServer } from './server.js';

test('the blend cuts a jump and slides an ordinary step', () => {
  const dt = 1 / 64;
  const slide = blendBody({ x: 1, y: 1 }, { x: 1 + dt, y: 1, vx: 1, vy: 0 }, 0.5, dt);
  assert.equal(slide.cut, false);
  assert.ok(Math.abs(slide.x - (1 + dt / 2)) < 1e-9);
  const cut = blendBody({ x: 1, y: 1 }, { x: 3, y: 1, vx: 0, vy: 0 }, 0.5, dt);
  assert.equal(cut.cut, true);
  assert.equal(cut.x, 3);
  const first = blendBody(null, { x: 1, y: 1, vx: 0, vy: 0 }, 0, dt);
  assert.equal(first.cut, true);
});

test('canvas coordinates round-trip inside the room', () => {
  const view = fit(600, 400);
  const canvas = worldToCanvas(view, 1, 1);
  const world = canvasToWorld(view, canvas.x, canvas.y);
  assert.ok(Math.abs(world.x - 1) < 1e-9);
  assert.ok(Math.abs(world.y - 1) < 1e-9);
});

test('an intent is stamped with the newest hash, and a second one waits', () => {
  const session = createSession();
  const stale = session.frame().hash;
  session.advance();
  session.advance();
  const admitted = session.intent({
    verb: 'move',
    actor: 'walker',
    target: { x: 2, y: 1 },
    frameHash: stale,
  });
  assert.equal(admitted.admitted, true);
  assert.equal(admitted.hash, session.frame().hash);
  assert.notEqual(admitted.hash, stale);
  assert.equal(session.log()[0].hash, session.frame().hash);
  const again = session.intent({ direction: 'right', actor: 'walker' });
  assert.equal(again.admitted, false);
  assert.match(/** @type {{ reason: string }} */ (again).reason, /quanta remain/);
  session.advance();
  assert.equal(session.idle(), false);
});

test('a direction is taken from the newest body, and the pump fires once per tick', () => {
  const session = createSession();
  for (let i = 0; i < 20; i = i + 1) {
    session.advance();
  }
  const body = session.frame().bodies[0];
  const admitted = session.intent({ direction: 'right' });
  assert.equal(admitted.admitted, true);
  const target = session.log()[0].proposal;
  assert.equal(target.kind, 'intent');
  if (target.kind === 'intent' && 'x' in target.target) {
    assert.ok(Math.abs(target.target.x - (body.x + 1)) < 1e-9);
    assert.ok(Math.abs(target.target.y - body.y) < 1e-9);
  }
  /** @type {Array<() => void>} */
  const fires = [];
  const pump = startPump(session, {
    every(_ms, fn) {
      fires.push(fn);
      return 1;
    },
    cancel() {},
  });
  const before = session.frame().tick;
  fires[0]();
  assert.equal(session.frame().tick, before + 1);
  pump.stop();
});

test('up and down are refused, and a click above the floor is still a target', () => {
  const session = createSession();
  const x = session.frame().bodies[0].x;
  const up = session.intent({ direction: 'up' });
  assert.equal(up.admitted, false);
  assert.match(/** @type {{ reason: string }} */ (up).reason, /no vertical/);
  const down = session.intent({ direction: 'down' });
  assert.equal(down.admitted, false);
  assert.equal(session.log().length, 0);
  assert.equal(session.frame().bodies[0].x, x);
  const click = session.intent({ verb: 'move', actor: 'walker', target: { x: 2, y: 2 } });
  assert.equal(click.admitted, true);
  const proposal = session.log()[0].proposal;
  assert.equal(proposal.kind, 'intent');
  if (proposal.kind === 'intent' && 'x' in proposal.target) {
    assert.equal(proposal.target.x, 2);
    assert.equal(proposal.target.y, 2);
  }
});

test('the page stream is a world line, then frames, and a posted intent is admitted', async () => {
  const session = createSession();
  const server = createHostServer(session);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  const frames = await fetch('http://127.0.0.1:' + port + '/frames');
  if (!frames.body) {
    throw new Error('frame stream has no body');
  }
  const reader = frames.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (text.split('\n').filter((line) => line.length > 0).length < 2) {
    const chunk = await reader.read();
    text += decoder.decode(chunk.value, { stream: true });
  }
  const lines = text.split('\n').filter((line) => line.length > 0);
  const world = JSON.parse(lines[0]);
  const frame = JSON.parse(lines[1]);
  assert.equal(world.kind, 'world');
  assert.equal(world.colliders.length, 3);
  assert.equal(frame.kind, 'frame');
  assert.equal(frame.tick, 0);
  assert.equal(frame.bodies[0].id, 'walker');
  const posted = await fetch('http://127.0.0.1:' + port + '/intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verb: 'move', actor: 'walker', target: { x: 2, y: 1 }, frameHash: 'displayed' }),
  });
  const result = await posted.json();
  assert.equal(result.admitted, true);
  assert.equal(result.hash, frame.hash);
  const page = readFileSync(new URL('./page.html', import.meta.url), 'utf8');
  assert.equal(page.includes('node:fs'), false);
  assert.equal(page.includes('packages/tick'), false);
  await reader.cancel();
  await new Promise((resolve) => server.close(resolve));
});

test('P pushes the nearest body on the newest frame', () => {
  const loaded = loadScene('scenes/crate-and-door.json');
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  const session = createSession(loaded.scene);
  const stale = 'displayed';
  const result = session.intent({ verb: 'push', actor: 'walker', frameHash: stale });
  assert.equal(result.admitted, true);
  assert.equal(result.hash, session.frame().hash);
  assert.notEqual(result.hash, stale);
  const proposal = session.log()[0].proposal;
  assert.equal(proposal.kind, 'intent');
  if (proposal.kind === 'intent' && 'body' in proposal.target) {
    assert.equal(proposal.target.body, 'crate');
  }
  const world = session.worldRecord();
  assert.ok(world.goal);
  assert.equal(world.goal.minX, 3.3);
});
