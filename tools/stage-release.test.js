import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageRelease } from './stage-release.mjs';

const root = join(import.meta.dirname, '..');

test('the four package versions match the root', () => {
  const rootVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  for (const name of ['frame', 'tick', 'host', 'load']) {
    const manifest = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'));
    assert.equal(manifest.version, rootVersion);
    assert.equal(manifest.private, undefined);
    assert.equal(manifest.name, '@si-rpg-engine/' + name);
  }
});

test('the stage keeps the relative layout and leaves tests out', () => {
  const dest = mkdtempSync(join(tmpdir(), 'si-stage-'));
  try {
    stageRelease(root, dest, { requireSolver: false });
    const frame = JSON.parse(readFileSync(join(dest, 'frame', 'package.json'), 'utf8'));
    assert.equal(frame.name, '@si-rpg-engine/frame');
    assert.equal(existsSync(join(dest, 'frame', 'packages', 'frame', 'hash.js')), true);
    assert.equal(existsSync(join(dest, 'frame', 'README.md')), true);
    assert.equal(existsSync(join(dest, 'frame', 'LICENSE')), true);
    assert.equal(existsSync(join(dest, 'tick', 'packages', 'frame', 'hash.js')), true);
    assert.equal(existsSync(join(dest, 'tick', 'packages', 'tool', 'guard.js')), true);
    assert.equal(existsSync(join(dest, 'tick', 'predicates', 'intents', 'index.json')), true);
    assert.equal(existsSync(join(dest, 'host', 'packages', 'host', 'session.js')), true);
    assert.equal(existsSync(join(dest, 'host', 'packages', 'host', 'page.html')), true);
    assert.equal(existsSync(join(dest, 'host', 'packages', 'host', 'view.js')), true);
    assert.equal(existsSync(join(dest, 'host', 'worlds', 'index.json')), true);
    assert.equal(existsSync(join(dest, 'host', 'worlds', 'crate-and-door.json')), true);
    assert.equal(existsSync(join(dest, 'load', 'packages', 'load', 'world.js')), true);
    assert.equal(existsSync(join(dest, 'load', 'worlds', 'index.json')), true);
    assert.equal(walk(dest).some((path) => path.endsWith('.test.js')), false);
    for (const name of ['frame', 'tick', 'host', 'load']) {
      const manifest = JSON.parse(readFileSync(join(dest, name, 'package.json'), 'utf8'));
      assert.equal(manifest.files, undefined, name);
      assert.equal(typeof manifest.exports['.'], 'string', name);
      assert.equal(existsSync(join(dest, name, '.npmignore')), true, name);
    }
    const tick = JSON.parse(readFileSync(join(dest, 'tick', 'package.json'), 'utf8'));
    assert.equal(tick.bin.play, './packages/tick/bin/play.js');
    const host = JSON.parse(readFileSync(join(dest, 'host', 'package.json'), 'utf8'));
    assert.equal(host.bin.host, './packages/host/bin/host.js');
    const load = JSON.parse(readFileSync(join(dest, 'load', 'package.json'), 'utf8'));
    assert.equal(load.bin.load, './packages/load/bin/load.js');
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('a physics package refuses to stage without the solver', () => {
  const dest = mkdtempSync(join(tmpdir(), 'si-stage-'));
  const fake = mkdtempSync(join(tmpdir(), 'si-root-'));
  try {
    writeFileSync(join(fake, 'LICENSE'), 'MIT\n');
    mkdirSync(join(fake, 'predicates', 'intents'), { recursive: true });
    writeFileSync(join(fake, 'predicates', 'intents', 'index.json'), '{}\n');
    mkdirSync(join(fake, 'packages', 'tool'), { recursive: true });
    writeFileSync(join(fake, 'packages', 'tool', 'guard.js'), 'export {}\n');
    for (const name of ['frame', 'tick', 'host', 'load']) {
      const dir = join(fake, 'packages', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), readFileSync(join(root, 'packages', name, 'package.json')));
      writeFileSync(join(dir, 'README.md'), '# ' + name + '\n');
    }
    assert.throws(() => stageRelease(fake, dest), /solver\/dist\/solver\.mjs is missing/);
  } finally {
    rmSync(dest, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('the frame stage packs the hash, the readme, and the license', () => {
  const dest = mkdtempSync(join(tmpdir(), 'si-stage-'));
  try {
    stageRelease(root, dest, { requireSolver: false });
    const files = pack(join(dest, 'frame'))[0].files.map((/** @type {{ path: string }} */ file) => file.path);
    assert.equal(files.includes('README.md'), true);
    assert.equal(files.includes('LICENSE'), true);
    assert.equal(files.includes('packages/frame/hash.js'), true);
    assert.equal(files.some((/** @type {string} */ path) => path.endsWith('.test.js')), false);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('the tick stage packed inside this repo keeps the solver', () => {
  const solver = join(root, 'solver', 'dist', 'solver.mjs');
  assert.equal(existsSync(solver), true, 'solver/dist/solver.mjs is missing; npm test builds it first');
  const dest = join(root, '.release');
  try {
    stageRelease(root, dest);
    const manifest = JSON.parse(readFileSync(join(dest, 'tick', 'package.json'), 'utf8'));
    assert.equal(manifest.exports['.'], './packages/tick/tick.js');
    assert.equal(manifest.bin.play, './packages/tick/bin/play.js');
    assert.equal(manifest.files, undefined);
    const packed = pack(join(dest, 'tick'));
    const files = packed[0].files.map((/** @type {{ path: string }} */ file) => file.path);
    assert.equal(files.includes('solver/dist/solver.mjs'), true);
    assert.equal(files.includes('packages/tick/tick.js'), true);
    assert.equal(files.includes('packages/frame/hash.js'), true);
    assert.equal(files.includes('packages/tool/guard.js'), true);
    assert.equal(files.includes('predicates/intents/index.json'), true);
    assert.equal(files.some((/** @type {string} */ path) => path.endsWith('.test.js')), false);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

/**
 * @param {string} cwd
 * @returns {Array<{ files: Array<{ path: string }> }>}
 */
function pack(cwd) {
  const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(packed.status, 0, packed.stderr);
  const start = packed.stdout.indexOf('[');
  assert.notEqual(start, -1, packed.stdout);
  return JSON.parse(packed.stdout.slice(start));
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(path));
    } else {
      found.push(path);
    }
  }
  return found;
}
