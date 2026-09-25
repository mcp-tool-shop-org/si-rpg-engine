#!/usr/bin/env node
// Every failure writes a bundle, T5 pin 3 (docs/dispatch-t5-replay-corpus.md).
// The bundle itself, its format, reading, writing, and replay, is
// packages/tick/bundle.js, which the replay command uses; the tick never
// imports the harness. This is the harness's side:
//
//   bundleDir     where failures write: $SI_RPG_BUNDLES, or a directory under
//                 the temporary one; CI sets it and uploads it on failure
//   makeBundle    a bundle of a run, with the product scene's own records when
//                 a product spec names none
//   recordRun, withBundles, bundleFailure, expectIdentical   the hooks a test
//                 uses to write a bundle of each run it made when it fails,
//                 and print the path
//
// As a command, `node harness/bundle.mjs --from-trace <file.trace> [--name n]`
// writes a bundle of the product scene carrying that trace's hashes, so a
// trace from another engine or host replays here to its first differing tick.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { captureBundle, traceDifference, writeBundle } from '../packages/tick/bundle.js';
import { withRecords } from './replay-to.mjs';

export { traceDifference };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {import('./replay-to.mjs').ReplaySpec} ReplaySpec
 * @typedef {import('../packages/tick/bundle.js').Bundle} Bundle
 * @typedef {import('../packages/tick/bundle.js').DenseImage} DenseImage
 * @typedef {import('../packages/tick/bundle.js').Failure} Failure
 */

/** Where failures write bundles: $SI_RPG_BUNDLES, or a directory under the temporary one. */
export function bundleDir() {
  return process.env.SI_RPG_BUNDLES || join(tmpdir(), 'si-rpg-bundles');
}

/**
 * A bundle of the spec's run (packages/tick/bundle.js captureBundle), with the
 * product scene's own records when a product spec names none.
 * @param {ReplaySpec} spec
 * @param {{ name: string, note?: string, tick?: number, image?: boolean | DenseImage, hashes?: string[], failure?: Failure }} options
 * @returns {Bundle}
 */
export function makeBundle(spec, options) {
  return captureBundle(withRecords(spec), options);
}

// ---------------------------------------------------------------------------
// Every failure writes one (pin 3).

/** @type {Array<{ spec: ReplaySpec, tick?: number }> | null} */
let recording = null;

/**
 * Called by a test's run as it starts: a run of this spec, to `tick` or its
 * end. Nothing happens outside withBundles.
 * @param {ReplaySpec} spec
 * @param {number} [tick]
 */
export function recordRun(spec, tick) {
  if (recording) {
    recording.push({ spec, tick });
  }
}

const MOST = 16;

/**
 * Writes one bundle per run and reports the paths on stderr, one line each.
 * @param {string} test
 * @param {Array<{ spec: ReplaySpec, tick?: number, image?: boolean | DenseImage, hashes?: string[] }>} runs
 * @param {string} block the failure's first-difference block, or its message
 * @param {string} [dir]
 */
export function bundleFailure(test, runs, block, dir) {
  /** @type {string[]} */
  const paths = [];
  for (let i = 0; i < runs.length && i < MOST; i = i + 1) {
    const item = runs[i];
    try {
      const bundle = makeBundle(item.spec, { name: test + (runs.length > 1 ? ' run ' + (i + 1) : ''), tick: item.tick, image: item.image === undefined ? true : item.image, hashes: item.hashes, failure: { test, block } });
      const path = writeBundle(bundle, dir || bundleDir());
      paths.push(path);
      process.stderr.write('bundle: ' + path + '\n');
    } catch (error) {
      process.stderr.write('no bundle for ' + test + ' run ' + (i + 1) + ': ' + /** @type {Error} */ (error).message + '\n');
    }
  }
  return paths;
}

/**
 * Fails unless the two traces agree: the T1 block, one bundle per run
 * (written as bundleFailure writes them), and each path, in the message.
 * @param {string} test
 * @param {string[]} whole the uninterrupted run's lines, without the end line
 * @param {string[]} restored the restored run's, spliced after the whole run's lines before it
 * @param {Array<{ spec: ReplaySpec, tick?: number, image?: boolean | DenseImage, hashes?: string[] }>} runs
 * @param {string} [dir]
 */
export function expectIdentical(test, whole, restored, runs, dir) {
  const block = traceDifference(whole, restored);
  if (block === 'identical\n') {
    return;
  }
  const paths = bundleFailure(test, runs, block, dir);
  assert.fail(test + '\n' + block + paths.map((path) => 'bundle: ' + path + '\n').join(''));
}

/**
 * A test body that, when it throws, writes a bundle of each run it recorded
 * with recordRun, prints each path, adds them to the error, and rethrows.
 * @param {string} name
 * @param {(t: import('node:test').TestContext) => void | Promise<void>} body
 * @returns {(t: import('node:test').TestContext) => Promise<void>}
 */
export function withBundles(name, body) {
  return async (t) => {
    /** @type {Array<{ spec: ReplaySpec, tick?: number }>} */
    const runs = [];
    const outer = recording;
    recording = runs;
    try {
      await body(t);
    } catch (error) {
      recording = outer;
      const message = error instanceof Error ? error.message : String(error);
      const paths = bundleFailure(name, runs, message);
      for (const path of paths) {
        t.diagnostic('bundle: ' + path);
      }
      if (error instanceof Error && paths.length > 0) {
        error.message = error.message + '\n' + paths.map((path) => 'bundle: ' + path).join('\n');
      }
      throw error;
    } finally {
      recording = outer;
    }
  };
}

// ---------------------------------------------------------------------------
// The command.

/**
 * The product scene's hashes read from a T1 trace.
 * @param {string} text
 */
export function traceHashes(text) {
  /** @type {string[]} */
  const hashes = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === '' || line.startsWith('end ')) {
      break;
    }
    const tokens = line.split(' ');
    if (Number(tokens[0]) !== hashes.length) {
      throw new Error('the trace skips from tick ' + (hashes.length - 1) + ' to ' + tokens[0]);
    }
    hashes.push(tokens[1]);
  }
  return hashes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const from = args.indexOf('--from-trace');
  if (from < 0 || !args[from + 1] || args.includes('--help')) {
    process.stdout.write('usage: node harness/bundle.mjs --from-trace <file.trace> [--name <name>]\n');
    process.exit(args.includes('--help') ? 0 : 2);
  }
  const at = args.indexOf('--name');
  const file = resolve(args[from + 1]);
  process.chdir(root);
  const hashes = traceHashes(readFileSync(file, 'utf8'));
  const name = at >= 0 && args[at + 1] ? args[at + 1] : 'product-scene from ' + file.replace(/^.*[\\/]/, '');
  // The chain stops where the trace does; a thrown step ends it early.
  const tick = hashes.length - 1;
  const path = writeBundle(makeBundle({ scene: 'product' }, { name, tick, image: false, hashes, note: 'the product scene with the hashes of ' + file }), bundleDir());
  process.stdout.write(path + '\n');
}
