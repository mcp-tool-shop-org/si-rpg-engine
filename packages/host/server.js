// Serves the page, a newline-delimited frame stream, and the intent door.
// A slow client misses frames. The pump does not wait for it.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * @param {ReturnType<import('./session.js').createSession>} session
 */
export function createHostServer(session) {
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set();

  session.watch((frame) => {
    const line = JSON.stringify(session.frameRecord(frame)) + '\n';
    for (const res of clients) {
      if (res.destroyed || res.writableEnded) {
        clients.delete(res);
        continue;
      }
      if (res.writableNeedDrain) {
        continue;
      }
      res.write(line);
    }
  });

  return createServer((req, res) => {
    const url = req.url || '/';
    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(readFileSync(join(here, 'page.html')));
      return;
    }
    if (req.method === 'GET' && url === '/view.js') {
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(readFileSync(join(here, 'view.js')));
      return;
    }
    if (req.method === 'GET' && url === '/frames') {
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache',
      });
      res.write(JSON.stringify(session.worldRecord()) + '\n');
      res.write(JSON.stringify(session.frameRecord(session.frame())) + '\n');
      clients.add(res);
      res.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && url === '/intent') {
      /** @type {Buffer[]} */
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size = size + chunk.length;
        if (size > 4096) {
          res.writeHead(413);
          res.end();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (res.writableEnded) {
          return;
        }
        /** @type {object} */
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ admitted: false, reason: 'not json' }));
          return;
        }
        const result = session.intent(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
}
