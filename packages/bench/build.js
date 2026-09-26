// The builds (T7b pins 2, 3, and 7).
//
// The product build. When solver/ has no diff, every tree runs the head's
// product binary file, copied byte for byte into its solver/dist/, and the
// report says so. When solver/ differs, each tree builds its own binary from
// its own source with its own solver/build.mjs, which puts cargo's output in
// solver/target inside the tree; CARGO_TARGET_DIR is cleared for the build, so
// two trees' artifacts never mix. A tree whose own build fails stops the bench
// with the reason. A digest is never taken to mean "the same law", since a
// build's digest can carry its host and its path.
//
// The coverage build (pin 3), made only when the head has a law anchor: the
// pinned rustc, with -C instrument-coverage -Z no-profiler-runtime under
// RUSTC_BOOTSTRAP=1, --cfg law_coverage, and -C link-arg=--no-gc-sections,
// beside the product's own flags, into a target directory of its own,
// solver/target/coverage inside the tree. RUSTC_BOOTSTRAP is set in cargo's
// own environment and nowhere else. The flags carry the product's cargo-home
// remap but not its tree remaps, so the mapping names each source by its path
// in the tree and llvm-cov finds it there. The build's glue is the product
// glue with its bytes read from the coverage build's .wasm, so the tick runs
// it unchanged; a process of the coverage build loads it in place of
// solver/dist/solver.mjs. A build that fails stops the bench with its reason.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The flags the coverage build adds to the product's (pin 3). */
export const COVERAGE_FLAGS = ['-C', 'instrument-coverage', '-Z', 'no-profiler-runtime', '--cfg', 'law_coverage', '-C', 'link-arg=--no-gc-sections'];

/** A build that failed: the bench stops with its reason. */
export class BuildFailure extends Error {}

/**
 * The product binary file of a tree.
 * @param {string} tree
 */
export function productGlue(tree) {
  return join(tree, 'solver', 'dist', 'solver.mjs');
}

/**
 * The SHA-256 of the binary a glue file embeds or reads.
 * @param {string} gluePath
 */
export function glueBytes(gluePath) {
  const text = readFileSync(gluePath, 'utf8');
  const start = text.indexOf('export const bytes = new Uint8Array([');
  if (start >= 0) {
    const end = text.indexOf('\n]);', start);
    const body = text.slice(start + 'export const bytes = new Uint8Array(['.length, end);
    return Uint8Array.from(body.split(/[,\s]+/).filter((part) => part !== '').map(Number));
  }
  const read = /readFileSync\(new URL\('([^']+)', import\.meta\.url\)\)/.exec(text);
  if (read) {
    return new Uint8Array(readFileSync(join(gluePath, '..', read[1])));
  }
  throw new Error(gluePath + ' is not a solver glue the bench can read');
}

/**
 * @param {Uint8Array} bytes
 */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Builds a tree's product binary with the tree's own build script. Throws a
 * BuildFailure with cargo's words when it fails.
 * @param {string} tree
 * @param {string} name the tree's name in the reason
 * @returns {{ digest: string, ms: number }}
 */
export function buildProduct(tree, name) {
  const t0 = performance.now();
  const env = { ...process.env };
  delete env.CARGO_TARGET_DIR;
  delete env.RUSTFLAGS;
  delete env.CARGO_ENCODED_RUSTFLAGS;
  delete env.RUSTC_BOOTSTRAP;
  const run = spawnSync(process.execPath, ['solver/build.mjs'], { cwd: tree, encoding: 'utf8', env, maxBuffer: 1 << 26 });
  if (run.status !== 0 || !existsSync(productGlue(tree))) {
    const words = (run.stderr || run.stdout || '').trim().split('\n').filter((line) => /error|refused|failed/i.test(line)).slice(0, 12).join('\n');
    throw new BuildFailure('the ' + name + ' tree\'s own build of solver/ failed (status ' + run.status + '): ' + (words || (run.stderr || '').trim().split('\n').slice(-12).join('\n')));
  }
  return { digest: sha256(glueBytes(productGlue(tree))), ms: performance.now() - t0 };
}

/**
 * Copies the head's product binary file into another tree, byte for byte.
 * @param {string} head
 * @param {string} tree
 */
export function copyProduct(head, tree) {
  mkdirSync(join(tree, 'solver', 'dist'), { recursive: true });
  copyFileSync(productGlue(head), productGlue(tree));
}

/**
 * Where a tree's coverage build lives.
 * @param {string} tree
 */
export function coverageDir(tree) {
  return join(tree, 'solver', 'target', 'coverage');
}

/**
 * Starts a law tree's coverage target as a copy of the head's, leaving out
 * every file of the law crate itself (pin 7). Cargo then builds the law crate
 * from the law tree's own sources, in the law tree's own target directory,
 * and takes the dependencies' artifacts as they are: the coverage flags name
 * no tree, so those are the same build's in any tree. The caller checks that
 * the reference it builds is not the head's bytes: the mapping names each
 * source by its path, so a law crate built in the law tree differs.
 * @param {string} from
 * @param {string} to
 * @returns {boolean} whether there was a target to copy
 */
export function seedCoverage(from, to) {
  const source = coverageDir(from);
  if (!existsSync(source) || existsSync(coverageDir(to))) {
    return false;
  }
  cpSync(source, coverageDir(to), { recursive: true, filter: (path) => !/[\\/](si[-_]solver[^\\/]*|solver\.mjs)$/.test(path) });
  return true;
}

/**
 * The cargo home, as solver/build.mjs finds it.
 */
function cargoHome() {
  return process.env.CARGO_HOME || join(process.env.HOME || process.env.USERPROFILE || '', '.cargo');
}

/**
 * Builds a tree's coverage build into its own target directory and writes its
 * glue beside it. The tree's product glue must exist: the coverage glue is it
 * with its bytes read from the coverage build.
 * @param {string} tree
 * @param {string} name
 * @param {{ extraFlags?: string[] }} [options] extraFlags: planted flags, for the test of a build that fails
 * @returns {{ wasm: string, glue: string, digest: string, ms: number }}
 */
export function buildCoverage(tree, name, options) {
  const t0 = performance.now();
  const target = coverageDir(tree);
  mkdirSync(target, { recursive: true });
  const flags = [
    '-C', 'target-feature=-relaxed-simd',
    '-C', 'link-arg=--export=__stack_pointer',
    '--remap-path-prefix=' + cargoHome() + '=/cargo',
    ...COVERAGE_FLAGS,
    ...((options && options.extraFlags) || []),
  ];
  /** @type {Record<string, string | undefined>} */
  const env = { ...process.env, CARGO_ENCODED_RUSTFLAGS: flags.join('\x1f'), RUSTC_BOOTSTRAP: '1', CARGO_TARGET_DIR: target };
  delete env.RUSTFLAGS;
  const cargo = process.env.CARGO || 'cargo';
  const run = spawnSync(cargo, ['build', '--release', '--locked', '--target', 'wasm32-unknown-unknown'], {
    cwd: join(tree, 'solver'),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env,
    maxBuffer: 1 << 26,
  });
  const wasm = join(target, 'wasm32-unknown-unknown', 'release', 'si_solver.wasm');
  if (run.status !== 0 || !existsSync(wasm)) {
    const lines = (run.stderr || run.stdout || '').trim().split('\n');
    const words = lines.filter((line) => /^error|error:|refused/i.test(line)).slice(0, 8).join('\n');
    throw new BuildFailure('the ' + name + ' coverage build failed (status ' + run.status + '): ' + (words || lines.slice(-8).join('\n')));
  }
  const product = productGlue(tree);
  if (!existsSync(product)) {
    throw new BuildFailure('the ' + name + ' tree has no product glue for the coverage build to take its code from');
  }
  const text = readFileSync(product, 'utf8');
  const start = text.indexOf('export const bytes = new Uint8Array([');
  const end = text.indexOf('\n]);', start);
  if (start < 0 || end < 0) {
    throw new BuildFailure('the ' + name + ' product glue has no bytes array to replace');
  }
  const glue = join(target, 'solver.mjs');
  writeFileSync(glue, text.slice(0, start)
    + '// The coverage build\'s glue (T7b pin 3): the product glue, its bytes read from the coverage build.\n'
    + 'import { readFileSync as readCoverageBytes } from \'node:fs\';\n'
    + 'export const bytes = new Uint8Array(readCoverageBytes(new URL(\'./wasm32-unknown-unknown/release/si_solver.wasm\', import.meta.url)));\n'
    + text.slice(end + 4));
  return { wasm, glue, digest: sha256(new Uint8Array(readFileSync(wasm))), ms: performance.now() - t0 };
}

/**
 * The pinned toolchain's llvm-profdata and llvm-cov: the llvm-tools component
 * of the toolchain solver/rust-toolchain.toml names, found through rustc run
 * in the solver directory. Null, with the reason, when either is missing.
 * @param {string} tree
 * @returns {{ profdata: string, cov: string } | { missing: string }}
 */
export function llvmTools(tree) {
  const solver = join(tree, 'solver');
  const sysroot = spawnSync('rustc', ['--print', 'sysroot'], { cwd: solver, encoding: 'utf8', shell: process.platform === 'win32' });
  const version = spawnSync('rustc', ['-vV'], { cwd: solver, encoding: 'utf8', shell: process.platform === 'win32' });
  const host = /host: (\S+)/.exec(version.stdout || '');
  if (sysroot.status !== 0 || !host) {
    return { missing: 'rustc in solver/ does not report its sysroot and host' };
  }
  const bin = join(sysroot.stdout.trim(), 'lib', 'rustlib', host[1], 'bin');
  const exe = process.platform === 'win32' ? '.exe' : '';
  const profdata = join(bin, 'llvm-profdata' + exe);
  const cov = join(bin, 'llvm-cov' + exe);
  if (!existsSync(profdata) || !existsSync(cov)) {
    return { missing: 'the pinned toolchain has no llvm-tools component (' + bin + ' holds no llvm-profdata and llvm-cov)' };
  }
  return { profdata, cov };
}
