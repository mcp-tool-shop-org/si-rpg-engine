// Planting, for the bench's own tests (T7b pin 9). A planted change is made in
// a copy of the checkout, never in the checkout: copies are made under a
// scratch directory of the test's own, which the test removes when it ends.
// Each plant names the exact text it replaces and refuses when the text is not
// there, so a change to the engine fails the test instead of planting nothing.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { copyProduct } from './build.js';
import { stopAll } from './processes.js';
import { cutReport } from './report.js';
import { copyTree } from './trees.js';

/** The checkout the tests run in. */
export const CHECKOUT = resolve('.');

/**
 * A scratch directory of the test's own.
 * @param {string} name
 */
export function scratch(name) {
  return mkdtempSync(join(tmpdir(), 'si-rpg-bench-' + name + '-'));
}

/**
 * Removes a scratch directory and everything under it.
 * @param {string} dir
 */
export function removeScratch(dir) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}

/**
 * A test file's teardown: every process still running is stopped, after a
 * short, bounded wait (processes.js, stopAll), and then the scratch directory
 * is removed. A test that went red with a process still open, as one that
 * expected a refusal and got a process does, cannot hold the directory, or
 * the test file, open after it.
 * @param {string} dir
 */
export async function teardown(dir) {
  await stopAll();
  removeScratch(dir);
  // A handle a process let go of a moment ago can keep a directory standing
  // on Windows after the removal returns: once more after a pause, and a red
  // teardown that names it if it still stands, never a scratch left behind.
  if (existsSync(dir)) {
    await new Promise((done) => setTimeout(done, 1000));
    removeScratch(dir);
    if (existsSync(dir)) {
      throw new Error('the scratch directory ' + dir + ' still stands after its teardown');
    }
  }
}

/**
 * What of a run's environment block appears outside it (pin 2): every path
 * and every digest the block holds, sought in the rest of report.json and in
 * report.md up to its environment section, as written and with forward
 * slashes.
 * @param {string} out the run's out directory
 * @returns {{ held: number, found: string[] }} how many the block holds, and each one found outside
 */
export function leaks(out) {
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
  const text = readFileSync(join(out, 'report.md'), 'utf8');
  const cut = cutReport(text);
  const summary = cut.ok ? cut.summary : '';
  const { environment, ...rest } = report;
  const json = JSON.stringify(rest);
  /** @type {Set<string>} */
  const held = new Set();
  /** @param {unknown} value */
  const collect = (value) => {
    if (typeof value === 'string') {
      if (/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(value) || (value.length > 3 && isAbsolute(value))) {
        held.add(value);
      }
    } else if (value && typeof value === 'object') {
      for (const inner of Object.values(value)) {
        collect(inner);
      }
    }
  };
  collect(environment);
  /** @type {string[]} */
  const found = [];
  if (!cut.ok) {
    found.push(cut.reason);
  }
  for (const value of held) {
    for (const form of new Set([value, value.replace(/\\/g, '/')])) {
      if (json.includes(JSON.stringify(form).slice(1, -1))) {
        found.push('report.json holds ' + form);
      }
      if (summary.includes(form)) {
        found.push('report.md holds ' + form);
      }
    }
  }
  return { held: held.size, found };
}

/**
 * A copy of the checkout at `dir/name`, with the checkout's built product
 * binary in it when `built` is set: a copy of identical solver source builds
 * the same bytes on this host, so it stands for the tree's own build.
 * @param {string} dir
 * @param {string} name
 * @param {{ built?: boolean }} [options]
 */
export function copyCheckout(dir, name, options) {
  const tree = copyTree(CHECKOUT, join(dir, name));
  if (!options || options.built !== false) {
    copyProduct(CHECKOUT, tree);
  }
  return tree;
}

/**
 * Replaces exact text in a tree's file, once. Throws when it is not there.
 * @param {string} tree
 * @param {string} file
 * @param {string} from
 * @param {string} to
 */
export function plant(tree, file, from, to) {
  const path = join(tree, file);
  const text = readFileSync(path, 'utf8');
  const normalized = text.replace(/\r\n/g, '\n');
  const at = normalized.indexOf(from);
  if (at < 0) {
    throw new Error('plant: ' + file + ' has no ' + JSON.stringify(from.slice(0, 80)));
  }
  if (normalized.indexOf(from, at + from.length) >= 0) {
    throw new Error('plant: ' + file + ' has ' + JSON.stringify(from.slice(0, 80)) + ' more than once');
  }
  writeFileSync(path, normalized.slice(0, at) + to + normalized.slice(at + from.length));
}

/**
 * Writes a file into a tree, whole.
 * @param {string} tree
 * @param {string} file
 * @param {string} text
 */
export function write(tree, file, text) {
  writeFileSync(join(tree, file), text);
}

/**
 * The report without its environment block: what two runs with one seed
 * must give alike.
 * @param {any} report
 */
export function outsideEnvironment(report) {
  const copy = JSON.parse(JSON.stringify(report));
  delete copy.environment;
  return copy;
}
