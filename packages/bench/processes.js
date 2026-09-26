// One tree per process (T7b pin 2). The orchestrator starts a fresh node for
// each of the head, the base, the head's coverage build, the sweep, and every
// mutant, with the tree's root as its working directory, pipes it the runner's
// text (runner.js), and binds it to its tree and its build with one init
// message. A tree is bound to a process once: asking a process for a second
// tree, or asking for two trees in one process, is refused here before any
// module loads, and the runner's resolve hook refuses the rest.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOLD_CASE, pathKey } from './trees.js';

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), 'runner.js');

/** A refusal from a process, or from the process model itself. */
export class BenchRefusal extends Error {}

/**
 * @typedef {{
 *   name: string, tree: string, build: string, pid: number,
 *   call: (op: string, args?: any) => Promise<any>,
 *   close: () => Promise<void>,
 *   init: any, stderr: () => string
 * }} Proc
 */

let counter = 0;

/**
 * Every child started and not yet exited, with its name: what stopAll stops.
 * @type {Set<{ child: import('node:child_process').ChildProcess, name: string }>}
 */
const children = new Set();

/**
 * Stops every process still running. Each is let go first, its channel
 * closed, which a runner waiting for its next message exits on; one that has
 * not exited after a short, bounded wait is killed. A test's teardown calls
 * it before it removes its scratch directory, so a test that goes red with a
 * process still open, as one that expected a refusal and got a process does,
 * holds neither the directory nor the test file open. Resolves with the names
 * of the processes it killed.
 * @param {number} [wait] milliseconds to wait before killing, and again after
 * @returns {Promise<string[]>}
 */
export async function stopAll(wait = 2000) {
  /** @type {string[]} */
  const killed = [];
  /** @param {number} ms */
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  await Promise.all(Array.from(children).map(async (entry) => {
    const { child, name } = entry;
    const gone = () => child.exitCode !== null || child.signalCode !== null;
    const exited = new Promise((done) => {
      if (gone()) {
        done(undefined);
      } else {
        child.once('exit', () => done(undefined));
      }
    });
    if (child.connected) {
      child.disconnect();
    }
    await Promise.race([exited, pause(wait)]);
    if (!gone()) {
      killed.push(name);
      child.kill('SIGKILL');
      await Promise.race([exited, pause(wait)]);
    }
    children.delete(entry);
  }));
  return killed;
}

/**
 * Starts a process on a tree. Resolves when its tree's modules have loaded,
 * with what init reported; rejects with the reason when they did not.
 * @param {{
 *   name: string, tree: string, build: string, coverage?: boolean,
 *   redirect?: { from: string, to: string } | null,
 *   counters?: { addr: number, size: number } | null,
 *   probes?: Array<{ file: string, offsets: number[] }>,
 *   modules?: string[], plant?: Record<string, unknown>,
 *   cwd?: string, foldCase?: boolean
 * }} options cwd: a working directory other than the tree's root, which the
 *   process refuses; only a test asks for one. foldCase: the path rule the
 *   process applies, FOLD_CASE unless a test hands it the other
 * @returns {Promise<Proc>}
 */
export async function startProcess(options) {
  const tree = resolve(options.tree);
  if (!existsSync(join(tree, 'packages', 'tick', 'tick.js'))) {
    throw new BenchRefusal('the ' + options.name + ' tree ' + tree + ' has no packages/tick/tick.js');
  }
  counter = counter + 1;
  const processId = options.name + '#' + process.pid + '.' + counter;
  const child = spawn(process.execPath, ['--input-type=module', '-'], {
    cwd: options.cwd || tree,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    serialization: 'advanced',
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  const entry = { child, name: options.name };
  children.add(entry);
  child.once('exit', () => children.delete(entry));
  let stderr = '';
  /** @type {import('node:stream').Readable} */ (child.stderr).on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-20000);
  });
  /** @type {import('node:stream').Readable} */ (child.stdout).on('data', () => {});
  /** @type {import('node:stream').Writable} */ (child.stdin).end(readFileSync(RUNNER, 'utf8'));
  let next = 0;
  /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void, op: string }>} */
  const waiting = new Map();
  let exited = false;
  child.on('message', (/** @type {any} */ message) => {
    const pending = waiting.get(message.id);
    if (!pending) {
      return;
    }
    waiting.delete(message.id);
    if (message.ok) {
      pending.resolve(message.value);
    } else {
      const error = message.refusal ? new BenchRefusal(message.error) : new Error(options.name + ' ' + pending.op + ': ' + message.error + '\n' + (message.stack || ''));
      pending.reject(error);
    }
  });
  child.on('exit', (code) => {
    exited = true;
    for (const pending of waiting.values()) {
      pending.reject(new Error('the ' + options.name + ' process exited with ' + code + ' during ' + pending.op + ': ' + stderr.trim().split('\n').slice(-6).join('\n')));
    }
    waiting.clear();
  });
  /**
   * @param {string} op
   * @param {any} [args]
   * @returns {Promise<any>}
   */
  const call = (op, args) => new Promise((ok, fail) => {
    if (exited) {
      fail(new Error('the ' + options.name + ' process has exited: ' + stderr.trim().split('\n').slice(-6).join('\n')));
      return;
    }
    next = next + 1;
    waiting.set(next, { resolve: ok, reject: fail, op });
    child.send({ id: next, op, args });
  });
  /** @type {Proc} */
  const proc = {
    name: options.name,
    tree,
    build: options.build,
    pid: child.pid || 0,
    call,
    async close() {
      if (!exited) {
        child.disconnect();
        await new Promise((done) => {
          if (exited) {
            done(undefined);
            return;
          }
          child.once('exit', () => done(undefined));
          setTimeout(() => {
            if (!exited) {
              child.kill();
            }
          }, 5000);
        });
      }
    },
    init: null,
    stderr: () => stderr,
  };
  try {
    proc.init = await call('init', {
      processId,
      tree,
      build: options.build,
      coverage: Boolean(options.coverage),
      redirect: options.redirect || null,
      counters: options.counters || null,
      probes: options.probes || [],
      modules: options.modules || [],
      plant: options.plant || {},
      foldCase: typeof options.foldCase === 'boolean' ? options.foldCase : FOLD_CASE,
    });
  } catch (error) {
    await proc.close();
    throw error;
  }
  return proc;
}

/**
 * The process model's own refusal: two trees in one process. Two paths are
 * one tree when the path rule says they name one place.
 * @param {string[]} trees
 * @param {boolean} [fold]
 */
export function oneTreePerProcess(trees, fold = FOLD_CASE) {
  const distinct = Array.from(new Set(trees.map((tree) => pathKey(tree, fold))));
  if (distinct.length > 1) {
    throw new BenchRefusal('refused: ' + distinct.length + ' trees in one process; each tree runs in a fresh process of its own, with its root as the working directory (pin 2)');
  }
}
