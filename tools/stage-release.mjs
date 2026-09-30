// Builds a publishable tree for each workspace. The modules import siblings
// and the solver by relative path, so packing the package directory alone
// leaves those files out. The stage keeps the repository layout those imports
// use, and the release workflow publishes the stage.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** @typedef {{ name: string, version: string, description: string, license: string, author: string, private?: boolean, bin?: Record<string, string>, repository: { type: string, url: string, directory: string }, homepage: string, bugs: { url: string }, engines: { node: string } }} Manifest */

export const PACKAGES = ['frame', 'tick', 'host', 'load'];

/** @type {Record<string, string[]>} */
const CLOSURE = {
  frame: ['frame'],
  tick: ['tick', 'frame', 'tool'],
  host: ['host', 'tick', 'frame', 'tool'],
  load: ['load', 'tick', 'frame', 'tool'],
};

const WITH_PHYSICS = new Set(['tick', 'host', 'load']);

// The bins chdir three levels up from packages/<name>/bin, which is the stage
// root. host --world reads worlds/index.json there. load world writes it.
const WITH_WORLDS = new Set(['host', 'load']);

/** @type {Record<string, Record<string, string>>} */
const EXPORTS = {
  frame: { '.': './packages/frame/hash.js', './hash.js': './packages/frame/hash.js', './frame.js': './packages/frame/frame.js' },
  tick: { '.': './packages/tick/tick.js', './tick.js': './packages/tick/tick.js', './world.js': './packages/tick/world.js' },
  host: { '.': './packages/host/session.js', './session.js': './packages/host/session.js', './server.js': './packages/host/server.js' },
  load: { '.': './packages/load/world.js', './world.js': './packages/load/world.js', './admit.js': './packages/load/admit.js' },
};

/**
 * @param {string} root
 * @param {string} dest
 * @param {{ requireSolver?: boolean }} [options]
 */
export function stageRelease(root, dest, options = {}) {
  const requireSolver = options.requireSolver !== false;
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const name of PACKAGES) {
    stageOne(root, join(dest, name), name, requireSolver);
  }
}

/**
 * @param {string} root
 * @param {string} dest
 * @param {string} name
 * @param {boolean} requireSolver
 */
function stageOne(root, dest, name, requireSolver) {
  mkdirSync(dest, { recursive: true });
  const manifest = /** @type {Manifest} */ (JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8')));
  if (manifest.private === true) {
    throw new Error(name + ' is private');
  }
  /** @type {Record<string, unknown>} */
  const staged = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    type: 'module',
    license: manifest.license,
    author: manifest.author,
    repository: manifest.repository,
    homepage: manifest.homepage,
    bugs: manifest.bugs,
    engines: manifest.engines,
    exports: EXPORTS[name],
  };
  if (manifest.bin) {
    /** @type {Record<string, string>} */
    const bin = {};
    for (const [command, path] of Object.entries(manifest.bin)) {
      bin[command] = './packages/' + name + '/' + path.replace(/^\.\//, '');
    }
    staged.bin = bin;
  }
  writeFileSync(join(dest, 'package.json'), JSON.stringify(staged, null, 2) + '\n');
  cpSync(join(root, 'packages', name, 'README.md'), join(dest, 'README.md'));
  cpSync(join(root, 'LICENSE'), join(dest, 'LICENSE'));
  // A package inside this repository otherwise inherits .gitignore, which drops solver/dist.
  writeFileSync(join(dest, '.npmignore'), '# The stage is the package.\n');
  for (const dir of CLOSURE[name]) {
    copyRuntime(join(root, 'packages', dir), join(dest, 'packages', dir));
  }
  if (WITH_PHYSICS.has(name)) {
    cpSync(join(root, 'predicates'), join(dest, 'predicates'), { recursive: true });
    const solver = join(root, 'solver', 'dist', 'solver.mjs');
    if (!existsSync(solver)) {
      if (requireSolver) {
        throw new Error('solver/dist/solver.mjs is missing');
      }
    } else {
      cpSync(join(root, 'solver', 'dist'), join(dest, 'solver', 'dist'), { recursive: true });
    }
  }
  if (WITH_WORLDS.has(name)) {
    cpSync(join(root, 'worlds'), join(dest, 'worlds'), { recursive: true });
  }
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyRuntime(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules') {
      continue;
    }
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRuntime(from, to);
      continue;
    }
    if (entry.name.endsWith('.test.js')) {
      continue;
    }
    if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs') || entry.name.endsWith('.html') || entry.name.endsWith('.d.ts')) {
      cpSync(from, to);
    }
  }
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invoked) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  stageRelease(root, join(root, '.release'));
}
