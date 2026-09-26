// Planting, for the bench's own tests (T7b pin 9). A planted change is made in
// a copy of the checkout, never in the checkout: copies are made under a
// scratch directory of the test's own, which the test removes when it ends.
// Each plant names the exact text it replaces and refuses when the text is not
// there, so a change to the engine fails the test instead of planting nothing.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { copyProduct } from './build.js';
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
