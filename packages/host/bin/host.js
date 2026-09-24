#!/usr/bin/env node
// host: pump the fixture room at one quantum per timer fire and serve a page.
//
//   host [--port N]
//
// The page draws boxes. Clicks and arrow keys become move intents. The
// process stamps the newest committed hash. Bind is loopback only.

import { chdir } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession, startPump } from '../session.js';
import { createHostServer } from '../server.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
chdir(root);

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;

const session = createSession();
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
  pump.stop();
  server.close();
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
