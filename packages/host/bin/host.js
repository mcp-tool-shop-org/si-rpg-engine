#!/usr/bin/env node
// host: pump the fixture room at one quantum per timer fire and serve a page.
//
//   host [--port N] [--world file] [--log file]
//
// The page draws boxes. Clicks and arrow keys become move intents.
// P pushes the nearest body. The process stamps the newest committed hash.
// Bind is loopback only. --log writes when the goal is first reached, and again on exit.

import { readFileSync, writeFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession, startPump } from '../session.js';
import { createHostServer } from '../server.js';
import { loadScene } from '../../tick/scene.js';
import { indexReason } from '../../tick/admit-world.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
chdir(root);

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;
const sceneIndex = args.indexOf('--world');
const logIndex = args.indexOf('--log');
const logPath = logIndex >= 0 ? args[logIndex + 1] : null;

/** @type {import('../../tick/scene.js').Scene | undefined} */
let scene;
if (sceneIndex >= 0) {
  const loaded = loadScene(args[sceneIndex + 1]);
  if (!loaded.ok) {
    process.stderr.write(loaded.reason + '\n');
    process.exit(1);
  }
  scene = loaded.scene;
  const index = JSON.parse(readFileSync('worlds/index.json', 'utf8'));
  const reason = indexReason(scene, index);
  if (reason) {
    process.stderr.write(reason + '\n');
    process.exit(1);
  }
}

const session = createSession(scene);

/**
 * @param {string} when
 */
function saveLog(when) {
  if (!logPath || !scene) {
    return;
  }
  writeFileSync(logPath, JSON.stringify({
    seed: scene.seed,
    world: scene,
    when,
    log: session.log(),
  }, null, 2) + '\n');
}

let reached = false;
session.watch((frame) => {
  if (!reached && session.doorTick(frame) !== null) {
    reached = true;
    saveLog('goal');
  }
});
const server = createHostServer(session);
const pump = startPump(session, {
  every: (ms, fn) => setInterval(fn, ms),
  cancel: (timer) => clearInterval(/** @type {ReturnType<typeof setInterval>} */ (timer)),
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  const bound = address && typeof address === 'object' ? address.port : port;
  process.stdout.write('host http://127.0.0.1:' + bound + '\n');
});

function stop() {
  saveLog('exit');
  pump.stop();
  server.close();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
