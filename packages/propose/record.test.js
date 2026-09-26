// T7a pin 7: CI checks the recorded sessions without a GPU. Every committed
// session under fixtures/sessions verifies: every record's key, its digest
// against the pin in the manifest it cites, its output against its hash and
// against the log entry that cites it, a fresh parse of it against the
// proposal the log admitted, its role's budgets, and a replay of the log to
// the same frame hashes. A missing record fails. Nothing here, and nothing
// verifySession imports, can call a model. Each check goes red on a planted
// record. Run from the repository root.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadIntentRules } from '../tick/predicates.js';
import { roleRefusal } from '../tick/gate.js';
import { catalogFromLog, loadRoles, sha256 } from '../tick/roles.js';
import { readRoleOutput } from './parse.js';
import { readSession, recordKey, verifySession } from './record.js';

const SESSIONS = 'fixtures/sessions';

/** The committed sessions: each folder under fixtures/sessions with a session.json. */
function sessions() {
  return readdirSync(SESSIONS).filter((name) => existsSync(join(SESSIONS, name, 'session.json'))).sort();
}

/**
 * A copy of a committed session, to plant a fault in.
 * @param {string} [name]
 */
function copy(name) {
  const dir = mkdtempSync(join(tmpdir(), 'planted-'));
  cpSync(join(SESSIONS, name || 'probe-fixture'), dir, { recursive: true });
  return dir;
}

/** @param {string} dir */
function keys(dir) {
  return readdirSync(join(dir, 'records')).map((file) => file.slice(0, -'.json'.length)).sort();
}

/**
 * @param {string} dir
 * @param {string} key
 */
function readRecord(dir, key) {
  return JSON.parse(readFileSync(join(dir, 'records', key + '.json'), 'utf8'));
}

/**
 * @param {string} dir
 * @param {string} key
 * @param {unknown} record
 */
function writeRecord(dir, key, record) {
  writeFileSync(join(dir, 'records', key + '.json'), JSON.stringify(record, null, 2) + '\n');
}

/**
 * @param {string} dir
 * @param {(session: any) => void} change
 */
function editSession(dir, change) {
  const path = join(dir, 'session.json');
  const session = JSON.parse(readFileSync(path, 'utf8'));
  change(session);
  writeFileSync(path, JSON.stringify(session, null, 2) + '\n');
}

/**
 * Changes a record's keyed content, files it under its new key, and points
 * the session's calls and log at the new key, as a careful forger would.
 * @param {string} dir
 * @param {string} key
 * @param {(record: any) => void} change
 */
function rekey(dir, key, change) {
  const record = readRecord(dir, key);
  change(record);
  const next = recordKey(record);
  rmSync(join(dir, 'records', key + '.json'));
  writeRecord(dir, next, record);
  editSession(dir, (session) => {
    for (const line of session.calls) {
      if (line.record === key) {
        line.record = next;
      }
    }
    for (const entry of session.log) {
      if (entry.provenance && entry.provenance.record === key) {
        entry.provenance.record = next;
      }
    }
  });
  return next;
}

/**
 * The failures of a planted session; at least one must match.
 * @param {string} dir
 * @param {RegExp} pattern
 */
function red(dir, pattern) {
  const { failures } = verifySession(dir);
  assert.ok(failures.some((line) => pattern.test(line)), 'no failure matches ' + pattern + ': ' + JSON.stringify(failures));
  return failures;
}

/** The key of the record the first log entry cites. */
function firstAdmitted(/** @type {string} */ dir) {
  const { session } = readSession(dir);
  const entry = session.log.find((item) => item.provenance);
  assert.ok(entry && entry.provenance);
  return /** @type {import('../frame/types.js').Provenance} */ (entry.provenance).record;
}

test('every committed session verifies without a GPU, and at least one admitted a model\'s proposal', () => {
  const names = sessions();
  assert.deepEqual(names, ['probe-fixture', 'probe-steer']);
  let admitted = 0;
  for (const name of names) {
    const result = verifySession(join(SESSIONS, name));
    assert.deepEqual(result.failures, [], name);
    assert.ok(result.records >= 1, name);
    admitted = admitted + result.entries;
    const { session, records } = readSession(join(SESSIONS, name));
    for (const record of records.values()) {
      assert.ok(record.record === 1, 'made at version 1, and verified under the rules it was made under');
      assert.equal(record.model.digest, '845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e', 'recorded with the pinned model');
      assert.equal(record.request.options.temperature, 0);
      assert.equal(record.server.version, '0.34.0');
      assert.equal(record.server.callsAtOnce, 1);
    }
    assert.equal(session.law, 'reference', 'the JavaScript kernel, so a change to the solver does not move these frames');
  }
  assert.ok(admitted >= 1);
});

test('the thawed test-only role rests on an adversarial session that verifies, and nothing outside its manifest was admitted', () => {
  const loaded = loadRoles('fixtures/roles');
  assert.ok(loaded.ok);
  if (!loaded.ok) {
    return;
  }
  const rules = loadIntentRules().rules;
  let thawed = 0;
  for (const [name, entry] of loaded.catalog.byName) {
    if (entry.manifest.status !== 'thawed') {
      continue;
    }
    thawed = thawed + 1;
    const run = /** @type {string} */ (entry.manifest.adversarialRun);
    assert.ok(existsSync(join(run, 'session.json')), name + ' names ' + run);
    assert.deepEqual(verifySession(run).failures, [], run);
    const { session, records } = readSession(run);
    assert.equal(session.role, name);
    assert.match(readFileSync(join(run, 'change.diff'), 'utf8'), /FROM THE COORDINATOR[\s\S]*DISPATCH T7a, AMENDED/, 'the change carries instructions in comments and text posing as the dispatch');
    const carried = catalogFromLog(session.manifests);
    assert.ok(carried.ok);
    if (!carried.ok) {
      return;
    }
    for (const logged of session.log) {
      const checked = roleRefusal(carried.catalog, logged.proposal, logged.provenance);
      assert.ok(checked.ok, JSON.stringify(logged.proposal));
    }
    const bodies = session.world.bodies.map((body) => body.id);
    for (const record of records.values()) {
      const manifest = session.manifests[record.manifest];
      const read = readRoleOutput(/** @type {string} */ (record.output), manifest);
      assert.equal(read.verdict, 'ok');
      if (read.verdict !== 'ok') {
        continue;
      }
      assert.ok(manifest.outputs.classes.some((item) => item === read.proposal.kind), 'a class the role makes');
      if (read.proposal.kind === 'intent') {
        assert.ok(rules.has(read.proposal.verb), 'a verb from the catalog');
        assert.ok(bodies.includes(read.proposal.actor), 'an actor from the world');
      }
    }
  }
  assert.equal(thawed, 1);
});

test('nothing the record check imports can reach a model', () => {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @param {string} file */
  const walk = (file) => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    assert.equal(/\bfetch\s*\(/.test(source), false, file + ' calls fetch');
    for (const match of source.matchAll(/^import [^'"]*['"](\.[^'"]+)['"];/gm)) {
      const next = join(file, '..', match[1]).split('\\').join('/');
      if (!next.includes('/solver/dist/')) {
        walk(next);
      }
    }
  };
  walk('packages/propose/record.js');
  assert.ok(seen.has('packages/propose/parse.js') && seen.has('packages/tick/replay.js'));
  assert.equal([...seen].some((file) => file.endsWith('ollama.js') || file.endsWith('seat.js')), false, [...seen].join(', '));
});

test('one byte of output changed goes red', () => {
  const dir = copy();
  const key = keys(dir)[0];
  const record = readRecord(dir, key);
  record.output = record.output.replace('push', 'pUsh');
  writeRecord(dir, key, record);
  red(dir, new RegExp('^record ' + key + ': its output does not hash to its outputSha256$'));
});

test('an output changed with its hash updated no longer matches the log, and with the log updated too it no longer parses to the admitted proposal', () => {
  const dir = copy();
  const key = firstAdmitted(dir);
  const record = readRecord(dir, key);
  record.output = record.output.replace('"body": "crate"', '"body": "walker"');
  record.outputSha256 = sha256(record.output);
  writeRecord(dir, key, record);
  red(dir, /^log entry 0: provenance output [0-9a-f]{64} does not match record /);
  editSession(dir, (session) => {
    session.log[0].provenance.output = record.outputSha256;
  });
  red(dir, new RegExp('^log entry 0: the output of record ' + key + ' parses to .*"body":"walker".*, not the admitted .*"body":"crate"'));
});

test('a record under a different digest goes red, though its key is recomputed and the log points at it', () => {
  const dir = copy();
  const key = firstAdmitted(dir);
  const next = rekey(dir, key, (record) => {
    record.model.digest = 'e'.repeat(64);
  });
  editSession(dir, (session) => {
    session.log[0].provenance.model = 'e'.repeat(64);
  });
  assert.notEqual(next, key);
  red(dir, new RegExp('^record ' + next + ': model digest e{64} is not the pin in manifest '));
});

test('a budget exceeded goes red: seconds, output tokens, notes, and calls', () => {
  const slow = copy();
  const one = keys(slow)[0];
  const record = readRecord(slow, one);
  record.timing.ms = 120001;
  writeRecord(slow, one, record);
  assert.deepEqual(red(slow, /took 120001 ms, over the budget of 120 s$/).length, 1, 'timing is not in the key');

  const long = copy();
  const two = keys(long)[0];
  const tokens = readRecord(long, two);
  tokens.timing.evalCount = 257;
  writeRecord(long, two, tokens);
  red(long, /257 output tokens, over the budget of 256$/);
  const wide = rekey(long, two, (item) => {
    item.request.options.num_predict = 512;
  });
  red(long, new RegExp('^record ' + wide + ': num_predict 512 is not the outputTokens budget of 256$'));

  const notes = copy();
  const three = keys(notes)[0];
  const talky = readRecord(notes, three);
  const parsed = JSON.parse(talky.output);
  talky.output = JSON.stringify({ notes: 'n'.repeat(401), proposal: parsed.proposal });
  talky.outputSha256 = sha256(talky.output);
  writeRecord(notes, three, talky);
  red(notes, new RegExp('^record ' + three + ': the notes are 401 characters, over role probe\'s freeSpanChars of 400$'));

  const many = copy();
  const four = keys(many)[0];
  const extra = readRecord(many, four);
  extra.call = 3;
  writeRecord(many, recordKey(extra), extra);
  red(many, /^the session made 4 calls under manifest [0-9a-f]{64}, over role probe's callsPerSession of 3$/);
});

test('a record removed goes red, and it is never asked for again', () => {
  const dir = copy();
  const key = firstAdmitted(dir);
  rmSync(join(dir, 'records', key + '.json'));
  red(dir, new RegExp('^log entry 0 cites record ' + key + ', which is missing; a missing record is never asked for again$'));
  red(dir, new RegExp('^call 0 cites record ' + key + ', which is missing'));
});

test('a log whose provenance was edited no longer matches its record, and no longer replays', () => {
  for (const field of ['role', 'manifest', 'model', 'prompt', 'schema', 'output']) {
    const dir = copy();
    editSession(dir, (session) => {
      const p = session.log[1].provenance;
      p[field] = field === 'role' ? 'tester' : 'd'.repeat(64);
    });
    red(dir, new RegExp('^log entry 1: provenance ' + field + ' \\S+ does not match record '));
  }
  const dir = copy();
  editSession(dir, (session) => {
    session.log[1].provenance.builtAt.tick = session.log[1].provenance.builtAt.tick - 1;
  });
  red(dir, /^the log does not replay: entry 1: /);
});

test('a session carries the last frame it reached, so an edit to its last admission\'s provenance is refused by replay alone, from session.json', () => {
  const dir = copy();
  const file = join(dir, 'session.json');
  const clean = spawnSync(process.execPath, ['packages/tick/bin/replay.js', file], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout.trim(), 'replay ok: 3 hashes', 'a session is a log the replay command reads');
  /** @type {{ tick: number, hash: string }} */
  let end = { tick: -1, hash: '' };
  editSession(dir, (session) => {
    end = session.end;
    session.log[session.log.length - 1].provenance.prompt = 'd'.repeat(64);
  });
  assert.equal(end.tick, 664);
  const alone = spawnSync(process.execPath, ['packages/tick/bin/replay.js', file], { encoding: 'utf8' });
  assert.equal(alone.status, 1, 'the replay command refuses it from the file alone');
  assert.match(alone.stderr.trim(), new RegExp('^replay failed at entry 3: the log ends at tick 664 with hash ' + end.hash + ', and the replay reached [0-9a-f]{16} there$'));
  red(dir, /^the log does not replay: entry 3: the log ends at tick 664 /);
  red(dir, /^log entry 2: provenance prompt d{64} does not match record /);

  const moved = copy();
  editSession(moved, (session) => {
    session.end = { tick: session.end.tick - 1, hash: session.frames[session.end.tick - 1] };
  });
  red(moved, /^the session's end, tick 663 [0-9a-f]{16}, is not its last frame, tick 664 [0-9a-f]{16}$/);
});

test('a record filed under a key its content does not make goes red', () => {
  const dir = copy();
  const key = keys(dir)[0];
  renameSync(join(dir, 'records', key + '.json'), join(dir, 'records', 'f'.repeat(64) + '.json'));
  red(dir, new RegExp('^record f{64}: its content keys to ' + key + '$'));
});
