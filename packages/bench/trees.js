// Trees (T7b pin 1). The bench works on directory trees, so a test can plant a
// change in a copy without a commit. A tree is a git worktree the helper makes
// from a revision, or a copy the bench makes of one (a mutant's tree, and the
// law tree). Its files are those git lists, tracked and untracked but not
// ignored, that exist; a copy keeps the list it was made from. The report
// records each tree's commit, and a digest of those files: SHA-256 over each
// path and the SHA-256 of its bytes, in path order, so an edited file and a
// new untracked one both move it.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * Runs git in a directory. Throws with git's own words when it fails.
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
export function git(cwd, args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (run.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' in ' + cwd + ' failed: ' + (run.stderr || run.stdout || 'status ' + run.status).trim());
  }
  return run.stdout;
}

/**
 * Makes a detached git worktree of a revision at a path. The path must not
 * exist yet.
 * @param {string} repo a checkout of the repository
 * @param {string} rev
 * @param {string} path
 * @returns {string} the tree's absolute path
 */
export function makeWorktree(repo, rev, path) {
  const at = resolve(path);
  if (existsSync(at)) {
    throw new Error('a tree is made at a new path; ' + at + ' exists');
  }
  mkdirSync(dirname(at), { recursive: true });
  git(repo, ['worktree', 'add', '--detach', at, rev]);
  return at;
}

/**
 * Removes a worktree the helper made, with its files.
 * @param {string} repo
 * @param {string} path
 */
export function removeWorktree(repo, path) {
  const at = resolve(path);
  const run = spawnSync('git', ['worktree', 'remove', '--force', at], { cwd: repo, encoding: 'utf8' });
  if (existsSync(at)) {
    rmSync(at, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  if (run.status !== 0) {
    spawnSync('git', ['worktree', 'prune'], { cwd: repo, encoding: 'utf8' });
  }
}

/** The file that lists a copied tree's files, since a copy is not a git tree. */
export const MANIFEST = '.bench-files';

/**
 * Whether a directory is a git tree.
 * @param {string} tree
 */
export function isGitTree(tree) {
  return existsSync(join(tree, '.git'));
}

/**
 * The tree's files, tracked and untracked but not ignored, that exist, as
 * paths with forward slashes, sorted. A copied tree lists those it was made
 * with.
 * @param {string} tree
 * @returns {string[]}
 */
export function listFiles(tree) {
  if (!isGitTree(tree)) {
    const manifest = join(tree, MANIFEST);
    if (!existsSync(manifest)) {
      throw new Error(tree + ' is neither a git tree nor a copy the bench made');
    }
    return readFileSync(manifest, 'utf8').split('\n').filter((line) => line !== '');
  }
  const out = git(tree, ['ls-files', '-co', '--exclude-standard', '-z']);
  const files = new Set(out.split('\0').filter((path) => path !== ''));
  return Array.from(files).filter((path) => {
    try {
      return statSync(join(tree, path)).isFile();
    } catch {
      return false;
    }
  }).sort();
}

/**
 * The tree's commit, or null for a copy.
 * @param {string} tree
 */
export function treeCommit(tree) {
  if (!isGitTree(tree)) {
    const commitFile = join(tree, MANIFEST + '-commit');
    return existsSync(commitFile) ? readFileSync(commitFile, 'utf8').trim() : null;
  }
  return git(tree, ['rev-parse', 'HEAD']).trim();
}

/**
 * The digest of a tree's files: SHA-256 over each path, a zero byte, the
 * SHA-256 of its bytes, and a newline, in path order.
 * @param {string} tree
 * @param {string[]} [files] the list, when it is already read
 */
export function treeDigest(tree, files) {
  const list = files || listFiles(tree);
  const hash = createHash('sha256');
  for (const path of list) {
    const bytes = readFileSync(join(tree, path));
    hash.update(path + '\0' + createHash('sha256').update(bytes).digest('hex') + '\n');
  }
  return hash.digest('hex');
}

/**
 * Copies a tree's files into a new directory, writes the list the copy was
 * made from, and returns the copy's path. `edit` may replace a file's text
 * on the way.
 * @param {string} from
 * @param {string} to
 * @param {{ files?: string[], commit?: string | null }} [options]
 */
export function copyTree(from, to, options) {
  const files = (options && options.files) || listFiles(from);
  mkdirSync(to, { recursive: true });
  for (const path of files) {
    const target = join(to, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(from, path), target);
  }
  writeFileSync(join(to, MANIFEST), files.join('\n') + '\n');
  const commit = options && options.commit !== undefined ? options.commit : treeCommit(from);
  if (commit) {
    writeFileSync(join(to, MANIFEST + '-commit'), commit + '\n');
  }
  return resolve(to);
}

/**
 * Brings a copy's files in line with another tree's: every listed file is
 * written where it differs, and a file the copy lists that the tree does not
 * is removed. Its build output, which no list names, is kept, so a copy
 * brought up to date rebuilds only what changed.
 * @param {string} from
 * @param {string} to
 * @returns {number} the files written or removed
 */
export function syncTree(from, to) {
  const files = listFiles(from);
  const had = existsSync(join(to, MANIFEST)) ? listFiles(to) : [];
  let changed = 0;
  const keep = new Set(files);
  for (const path of had) {
    if (!keep.has(path)) {
      rmSync(join(to, path), { force: true });
      changed = changed + 1;
    }
  }
  for (const path of files) {
    const source = readFileSync(join(from, path));
    const target = join(to, path);
    if (existsSync(target) && readFileSync(target).equals(source)) {
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
    changed = changed + 1;
  }
  writeFileSync(join(to, MANIFEST), files.join('\n') + '\n');
  const commit = treeCommit(from);
  if (commit) {
    writeFileSync(join(to, MANIFEST + '-commit'), commit + '\n');
  }
  return changed;
}

/**
 * Whether a path lies inside a tree: the tree itself or below it.
 * @param {string} tree
 * @param {string} path
 */
export function inside(tree, path) {
  const root = resolve(tree).toLowerCase();
  const at = resolve(path).toLowerCase();
  return at === root || at.startsWith(root.endsWith(sep) ? root : root + sep);
}
