// T7a pins 3, 4, 5, 8, and 10: the role gate in the tick. Every role here is
// test-only, built in memory and checked by the same loader as the catalog on
// disk. Each refusal is shown against a proposal the gate would otherwise
// admit, so each test fails without the rail it checks. Run from the
// repository root.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beliefRefusal } from './beliefs.js';
import { FIXTURE_SEED, fixtureWorld } from './fixture.js';
import { beliefLabel } from './gate.js';
import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { replay } from './replay.js';
import { catalogFromLog, catalogOf } from './roles.js';
import { createTick, settle } from './tick.js';
import { createWorld } from './world.js';

const PIN = '845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e';

/**
 * @typedef {import('./roles.js').RoleEntry} RoleEntry
 * @typedef {import('../frame/types.js').Provenance} Provenance
 * @typedef {import('../frame/types.js').Proposal} Proposal
 */

/** @param {string} text */
function sha(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * A thawed test-only role in a scratch world, reading only trusted sources.
 * @param {Record<string, unknown>} [patch]
 * @returns {any}
 */
function manifest(patch) {
  return {
    role: 'tester',
    purpose: 'A test-only role for the gate\'s tests.',
    status: 'thawed',
    decision: { by: 'the coordinator', on: '2026-09-25' },
    adversarialRun: 'fixtures/sessions/probe-steer',
    world: 'scratch',
    inputs: [{ name: 'dispatch', source: 'dispatch' }, { name: 'world', source: 'world' }, { name: 'feedback', source: 'feedback' }],
    outputs: { classes: ['intent'], verbs: 'catalog', actors: 'world' },
    model: { name: 'qwen2.5:7b', digest: PIN, quantization: 'Q4_K_M', options: { seed: 1, temperature: 0, top_k: 1, top_p: 1, num_ctx: 8192, stop: [] } },
    prompt: { template: 'tester.txt', sha256: sha('tester') },
    schema: 'role-proposal',
    budget: { callsPerSession: 8, outputTokens: 64, secondsPerCall: 10, freeSpanChars: 100, maxProposalsPerWindow: 4, windowQuanta: 64, maxAgeQuanta: 64 },
    ...patch,
  };
}

/** A live role that reads player text and speaks for its own mind. */
function hearer() {
  return manifest({
    role: 'hearer',
    world: 'live',
    inputs: [{ name: 'player', source: 'player-text' }, { name: 'sight', source: 'frame-in-sight' }],
    outputs: { classes: ['belief'], verbs: [], actors: 'own-body' },
  });
}

/** A live role whose own sources are trusted, and which reads its own mind. */
function reader() {
  return manifest({
    role: 'reader',
    world: 'live',
    inputs: [{ name: 'mind', source: 'mind' }, { name: 'sight', source: 'frame-in-sight' }],
    outputs: { classes: ['belief', 'intent'], verbs: 'catalog', actors: 'own-body' },
  });
}

/** Two bodies with minds on a floor, split into two zones. */
function mindsWorld() {
  return {
    name: 'pair',
    bodies: [
      { id: 'watcher', x: 0, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'walker', x: 1, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
    ],
    colliders: [{ id: 'floor', minX: -2, maxX: 4, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }],
    zones: [
      { id: 'west', minX: -2, maxX: 0.5, minY: -1, maxY: 3, minZ: -2, maxZ: 2 },
      { id: 'east', minX: 0.5, maxX: 4, minY: -1, maxY: 3, minZ: -2, maxZ: 2 },
    ],
    minds: [
      { body: 'watcher', sight: 5, goals: [], beliefs: [{ subject: { body: 'walker' }, key: 'at', value: 'east', confidence: 1, source: 'e1' }] },
      { body: 'walker', sight: 5, goals: [], beliefs: [] },
    ],
  };
}

/** The fixture room with a crate beside the walker. */
function crateWorld() {
  const room = fixtureWorld();
  return { ...room, bodies: [...room.bodies, { id: 'crate', x: 3, y: 1, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.2, hy: 0.2, hz: 0.2 }] };
}

/**
 * A tick with a catalog of the given manifests.
 * @param {unknown[]} manifests
 * @param {Parameters<typeof createWorld>[0]} [init]
 */
function roleTick(manifests, init) {
  const made = catalogOf(manifests);
  if (!made.ok) {
    throw new Error(made.reason);
  }
  const rules = loadIntentRules();
  const memory = createMemory();
  const world = createWorld(init || fixtureWorld(), 'reference');
  const tick = createTick({ seed: FIXTURE_SEED, world, rules: rules.rules, retired: rules.retired, memory, roles: made.catalog });
  /** @param {string} name */
  const entry = (name) => /** @type {RoleEntry} */ (made.catalog.byName.get(name));
  return { tick, memory, world, catalog: made.catalog, entry };
}

/**
 * Provenance for a proposal built from `builtAt`.
 * @param {RoleEntry} entry
 * @param {{ tick: number, hash: string }} builtAt
 * @param {Partial<Provenance>} [patch]
 * @returns {Provenance}
 */
function provenance(entry, builtAt, patch) {
  return {
    role: entry.manifest.role,
    instance: 'session-1',
    manifest: entry.hash,
    model: PIN,
    prompt: sha('prompt'),
    schema: sha('schema'),
    record: sha('record'),
    output: sha('output'),
    builtAt: { tick: builtAt.tick, hash: builtAt.hash },
    inputs: entry.derived.inputs.map((input) => ({ source: input.source, trust: input.trust })),
    ...patch,
  };
}

/**
 * @param {{ tick: number, hash: string }} frame
 * @param {number} x
 * @param {string} [actor]
 * @param {string} [verb]
 * @returns {Proposal}
 */
function moveTo(frame, x, actor, verb) {
  return { kind: 'intent', verb: verb || 'move', actor: actor || 'walker', target: { x, z: 0 }, frameHash: frame.hash };
}

/**
 * @param {import('../frame/types.js').Admission} admission
 */
function reason(admission) {
  assert.equal(admission.admitted, false, 'admitted');
  return admission.admitted ? '' : admission.reason;
}

/** @param {number} n */
function quanta(n) {
  return (/** @type {{ advance: () => unknown }} */ tick) => {
    for (let i = 0; i < n; i = i + 1) {
      tick.advance();
    }
  };
}

test('a proposal without provenance is the host\'s: admitted exactly as before, with the same hashes and log form', () => {
  const rules = loadIntentRules();
  const plain = createTick({ seed: FIXTURE_SEED, world: createWorld(fixtureWorld(), 'reference'), rules: rules.rules, retired: rules.retired, memory: createMemory() });
  const gated = roleTick([manifest()]).tick;
  for (const t of [plain, gated]) {
    assert.ok(t.submit(moveTo(t.frame(), 2.5)).admitted);
    settle(t);
    quanta(2)(t);
    assert.ok(t.submit({ kind: 'belief', subject: 'walker', key: 'goal', value: 'east', confidence: 0.8, source: 'e1' }).admitted);
    settle(t);
    const stale = t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 1, z: 0 }, frameHash: 'an older frame' });
    assert.match(reason(stale), /stale frame/, 'the host\'s rule, the newest frame, is unchanged');
    assert.ok(t.submit(moveTo(t.frame(), 1.5)).admitted);
    settle(t);
  }
  assert.equal(gated.frame().hash, plain.frame().hash);
  assert.equal(JSON.stringify(gated.log()), JSON.stringify(plain.log()), 'the log is the same bytes');
  for (const entry of gated.log()) {
    assert.deepEqual(Object.keys(entry), ['tick', 'proposal', 'hash']);
  }
});

test('the gate refuses a role the catalog does not hold, a manifest hash that does not match, and a frozen role', () => {
  const run = roleTick([manifest(), manifest({ role: 'sleeper', status: 'frozen', adversarialRun: null })]);
  const t = run.tick;
  const entry = run.entry('tester');
  const frame = t.frame();
  assert.match(reason(t.submit(moveTo(frame, 2), provenance(entry, frame, { role: 'nobody' }))), /^role nobody is not in the catalog$/);
  assert.match(reason(t.submit(moveTo(frame, 2), provenance(entry, frame, { manifest: sha('an older manifest') }))), /^role tester cites manifest [0-9a-f]{64}, and the catalog holds [0-9a-f]{64}$/);
  const sleeper = run.entry('sleeper');
  assert.match(reason(t.submit(moveTo(frame, 2), provenance(sleeper, frame))), /^role sleeper is frozen$/);
  const rules = loadIntentRules();
  const bare = createTick({ seed: FIXTURE_SEED, world: createWorld(fixtureWorld(), 'reference'), rules: rules.rules, retired: rules.retired, memory: createMemory() });
  assert.match(reason(bare.submit(moveTo(bare.frame(), 2), provenance(entry, bare.frame()))), /needs a role catalog/);
  assert.equal(t.log().length, 0, 'no refusal is recorded');
  assert.ok(t.submit(moveTo(frame, 2), provenance(entry, frame)).admitted, 'the same proposal with its own provenance is admitted');
});

test('the gate refuses provenance that is not the pinned shape, a model that is not the pin, and inputs that are not the manifest\'s', () => {
  const run = roleTick([manifest()]);
  const t = run.tick;
  const entry = run.entry('tester');
  const frame = t.frame();
  const good = provenance(entry, frame);
  assert.match(reason(t.submit(moveTo(frame, 2), /** @type {any} */ ({ ...good, extra: 1 }))), /unknown field in provenance: extra/);
  const missing = /** @type {any} */ ({ ...good });
  delete missing.builtAt;
  assert.match(reason(t.submit(moveTo(frame, 2), missing)), /provenance names no builtAt/);
  assert.match(reason(t.submit(moveTo(frame, 2), { ...good, output: 'not a hash' })), /provenance output is a SHA-256/);
  assert.match(reason(t.submit(moveTo(frame, 2), /** @type {any} */ (null))), /provenance is an object/);
  assert.match(reason(t.submit(moveTo(frame, 2), { ...good, model: sha('another model') })), /is not role tester's pin/);
  const claimed = provenance(entry, frame, { inputs: [...good.inputs.slice(0, 2)] });
  assert.match(reason(t.submit(moveTo(frame, 2), claimed)), /provenance inputs are not the manifest's/);
  const relabelled = provenance(entry, frame, { inputs: good.inputs.map((input) => ({ source: input.source, trust: /** @type {const} */ ('labelled') })) });
  assert.match(reason(t.submit(moveTo(frame, 2), relabelled)), /provenance inputs are not the manifest's/);
  assert.ok(t.submit(moveTo(frame, 2), good).admitted);
});

test('the gate refuses a class, a verb, or an actor outside the role\'s outputs, and a body that is not the instance\'s', () => {
  const run = roleTick([
    manifest({ outputs: { classes: ['intent'], verbs: ['move'], actors: 'world' } }),
    manifest({ role: 'mover', outputs: { classes: ['intent'], verbs: 'catalog', actors: 'own-body' } }),
  ], crateWorld());
  const t = run.tick;
  settle(t);
  const frame = t.frame();
  const tester = run.entry('tester');
  const belief = { kind: 'belief', mind: 'walker', subject: { body: 'walker' }, key: 'at', value: 'none', confidence: 1, source: 'e1' };
  assert.match(reason(t.submit(/** @type {Proposal} */ (belief), provenance(tester, frame))), /^role tester does not propose belief$/);
  assert.match(reason(t.submit({ kind: 'body', id: 'box', x: 2, y: 2, z: 0, hx: 0.2, hy: 0.2, hz: 0.2 }, provenance(tester, frame))), /does not propose body/);
  assert.match(reason(t.submit(moveTo(frame, 2, 'walker', 'push'), provenance(tester, frame))), /may not propose verb push/);
  const mover = run.entry('mover');
  assert.match(reason(t.submit(moveTo(frame, 2.5, 'crate'), provenance(mover, frame, { instance: 'walker' }))), /^role mover speaks for walker, not crate$/);
  assert.ok(t.submit(moveTo(frame, 2, 'walker'), provenance(mover, frame, { instance: 'walker' })).admitted, 'its own body is admitted');
  settle(t);
  const later = t.frame();
  assert.ok(t.submit(moveTo(later, 2.5, 'crate'), provenance(tester, later)).admitted, 'a world role may move any body in the world');
});

test('a field the class does not have is refused, a trust label among them, and a role\'s belief names its mind', () => {
  const run = roleTick([reader()], mindsWorld());
  const t = run.tick;
  const entry = run.entry('reader');
  const frame = t.frame();
  const belief = { kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'at', value: 'west', confidence: 0.5, source: 'e1' };
  const own = provenance(entry, frame, { instance: 'watcher' });
  assert.match(reason(t.submit(/** @type {Proposal} */ ({ ...belief, label: 'authored' }), own)), /^unknown field: label$/);
  assert.match(reason(t.submit(/** @type {Proposal} */ ({ ...belief, heard: 'the world file' }), own)), /^unknown field: heard$/);
  const unscoped = /** @type {any} */ ({ ...belief });
  delete unscoped.mind;
  assert.match(reason(t.submit(unscoped, own)), /names the mind it writes/);
  assert.match(reason(t.submit(/** @type {Proposal} */ ({ ...belief, subject: 'walker' }), own)), /subject is exactly \{ body \} or \{ zone \}/);
  assert.match(reason(t.submit(/** @type {Proposal} */ ({ ...belief, mind: 'walker' }), own)), /^role reader writes the mind of watcher, not walker$/);
  const intent = moveTo(frame, 0.5, 'watcher');
  assert.match(reason(t.submit(/** @type {any} */ ({ ...intent, priority: 1 }), own)), /^unknown field: priority$/);
  assert.match(reason(t.submit(/** @type {any} */ ({ ...intent, frameHash: 'another' }), own)), /the intent names frame another, not the frame it was built from/);
  assert.ok(t.submit(/** @type {Proposal} */ (belief), own).admitted, 'the same belief without the extra field is admitted');
});

test('a proposal is admitted several quanta after the frame it was built from, while it is still valid', () => {
  const run = roleTick([manifest()]);
  const t = run.tick;
  const entry = run.entry('tester');
  const built = t.frame();
  quanta(12)(t);
  const admission = t.submit(moveTo(built, 2), provenance(entry, built));
  assert.ok(admission.admitted, JSON.stringify(admission));
  const logged = t.log()[0];
  assert.equal(logged.tick, 12, 'admitted at the current tick');
  assert.deepEqual(logged.provenance && logged.provenance.builtAt, { tick: 0, hash: built.hash }, 'built from tick 0');
  assert.equal(admission.hash, t.frame().hash, 'the admission names the current frame\'s hash');
});

test('a proposal past its role\'s maxAgeQuanta, or citing a frame the tick did not commit, is refused as stale', () => {
  const run = roleTick([manifest({ budget: { ...manifest().budget, maxAgeQuanta: 4 } })]);
  const t = run.tick;
  const entry = run.entry('tester');
  const built = t.frame();
  quanta(4)(t);
  const at4 = t.frame();
  quanta(1)(t);
  assert.match(reason(t.submit(moveTo(built, 2), provenance(entry, built))), /^stale: built at tick 0, 5 quanta ago, past role tester's maxAgeQuanta of 4$/);
  assert.match(reason(t.submit(moveTo(at4, 2), provenance(entry, { tick: 4, hash: 'ffffffffffffffff' }, {}))), /the intent names frame/);
  const forged = { tick: 4, hash: 'ffffffffffffffff' };
  assert.match(reason(t.submit(moveTo(forged, 2), provenance(entry, forged))), /^stale: built at tick 4 from hash ffffffffffffffff, but the tick committed [0-9a-f]{16} there$/);
  const ahead = { tick: 9, hash: at4.hash };
  assert.match(reason(t.submit(moveTo(ahead, 2), provenance(entry, ahead))), /which the tick has not committed/);
  assert.ok(t.submit(moveTo(at4, 2), provenance(entry, at4)).admitted, 'one quantum old, it is inside the window');
});

test('a proposal is refused when the world has changed so that it no longer passes on the current state', () => {
  const run = roleTick([manifest({ budget: { ...manifest().budget, maxAgeQuanta: 400 } })]);
  const t = run.tick;
  const entry = run.entry('tester');
  quanta(64)(t);
  const built = t.frame();
  const late = moveTo(built, 0.3);
  assert.ok(t.submit(moveTo(t.frame(), 3.5)).admitted, 'the host moves the walker away');
  t.advance();
  assert.match(reason(t.submit(late, provenance(entry, built))), /^walker is mid-action; \d+ quanta remain$/, 'while the host\'s move runs, the walker is busy');
  settle(t);
  assert.ok(t.frame().tick - built.tick <= 400, 'still inside the window');
  assert.match(reason(t.submit(late, provenance(entry, built))), /^target is beyond move range 3$/, 'checked where the walker is now, not where it was built');
  const fresh = t.frame();
  assert.ok(t.submit(moveTo(fresh, 2.9), provenance(entry, fresh)).admitted, 'a proposal built from the world as it is passes');
});

test('an instance over its admission budget is refused until its window passes, and each instance has its own', () => {
  const run = roleTick([manifest({ budget: { ...manifest().budget, maxProposalsPerWindow: 2, windowQuanta: 64 } })]);
  const t = run.tick;
  const entry = run.entry('tester');
  /**
   * @param {number} x
   * @param {string} [instance]
   */
  const propose = (x, instance) => {
    const frame = t.frame();
    const admission = t.submit(moveTo(frame, x), provenance(entry, frame, { instance: instance || 'session-1' }));
    settle(t);
    return admission;
  };
  assert.ok(propose(1.2).admitted);
  assert.ok(propose(1.4).admitted);
  const start = t.log()[0].tick;
  assert.ok(t.frame().tick - start < 64, 'both inside one window');
  assert.match(reason(propose(1.6)), /^over budget: 2 admissions in the last 64 quanta, and role tester allows 2$/);
  assert.ok(propose(1.6, 'session-2').admitted, 'another instance has its own budget');
  while (t.frame().tick <= start + 64) {
    t.advance();
  }
  assert.ok(propose(1.8).admitted, 'admitted again once the first admission left the window');
});

test('a belief formed from player text is labelled hearsay, naming its source, and keeps the label in the mind', () => {
  const run = roleTick([hearer(), reader()], mindsWorld());
  const t = run.tick;
  t.advance();
  const heard = t.frame();
  const belief = { kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'at', value: 'west', confidence: 0.5, source: 'e1' };
  const admission = t.submit(/** @type {Proposal} */ (belief), provenance(run.entry('hearer'), heard, { instance: 'watcher' }));
  assert.ok(admission.admitted, JSON.stringify(admission));
  settle(t);
  quanta(30)(t);
  const list = run.memory.mindBeliefs('watcher');
  const formed = list.find((item) => item.value === 'west');
  assert.ok(formed);
  assert.equal(formed && formed.label, 'hearsay');
  assert.equal(formed && formed.heard, 'player-text', 'the label names its source');
  assert.deepEqual(run.memory.leastLabel('watcher'), { label: 'hearsay', heard: 'player-text' }, 'the mind now holds hearsay');
});

test('a role whose own sources are trusted produces hearsay once it reads a mind holding hearsay, and never authored or observed', () => {
  const run = roleTick([hearer(), reader()], mindsWorld());
  const t = run.tick;
  const reads = run.entry('reader');
  const before = t.frame();
  t.advance();
  const heard = t.frame();
  assert.ok(t.submit(/** @type {Proposal} */ ({ kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'at', value: 'west', confidence: 0.5, source: 'e1' }), provenance(run.entry('hearer'), heard, { instance: 'watcher' })).admitted);
  const same = t.submit(/** @type {Proposal} */ ({ kind: 'belief', mind: 'watcher', subject: { zone: 'west' }, key: 'contains', value: 'watcher', confidence: 0.9, source: 'e1' }), provenance(reads, heard, { instance: 'watcher' }));
  assert.ok(same.admitted, JSON.stringify(same));
  const listed = run.memory.mindBeliefs('watcher');
  assert.equal(listed[listed.length - 1].label, 'hearsay', 'a prompt built from the frame the hearsay was admitted in could read it, so it counts');
  settle(t);
  const after = t.frame();
  /**
   * @param {{ tick: number, hash: string }} built
   * @param {string} mind
   */
  const formed = (built, mind) => {
    const admission = t.submit(/** @type {Proposal} */ ({ kind: 'belief', mind, subject: { zone: 'east' }, key: 'contains', value: 'walker', confidence: 0.9, source: 'e1' }), provenance(reads, built, { instance: mind }));
    assert.ok(admission.admitted, JSON.stringify(admission));
    settle(t);
    const list = run.memory.mindBeliefs(mind);
    const last = list[list.length - 1];
    return last.label + (last.heard ? ' ' + last.heard : '');
  };
  assert.equal(formed(after, 'watcher'), 'hearsay player-text', 'the join reads the hearsay in the mind at builtAt');
  assert.equal(formed(before, 'watcher'), 'role', 'built before the hearsay was admitted, the mind held only an authored belief, and the label is role, not authored');
  assert.equal(formed(t.frame(), 'walker'), 'role', 'a mind of observed beliefs gives role, not observed');
  assert.equal(beliefLabel(reads, 'watcher', { tick: 0, hash: '', minds: [['watcher', { label: 'untrusted' }], ['walker', { label: 'hearsay', heard: 'player-text' }]] }).label, 'untrusted', 'a role that reads its own mind joins its own mind only');
  const gossip = /** @type {RoleEntry} */ ({ ...reads, manifest: { ...reads.manifest, inputs: [{ name: 'others', source: 'other-minds' }] } });
  assert.equal(beliefLabel(gossip, 'watcher', { tick: 0, hash: '', minds: [['watcher', { label: 'untrusted' }], ['walker', { label: 'hearsay', heard: 'player-text' }]] }).label, 'hearsay', 'other minds join every mind but the instance\'s own');
});

test('the mind\'s accessor returns every belief with its label, and replay rebuilds the labels', () => {
  const run = roleTick([hearer(), reader()], mindsWorld());
  const t = run.tick;
  t.advance();
  const heard = t.frame();
  assert.ok(t.submit(/** @type {Proposal} */ ({ kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'at', value: 'west', confidence: 0.5, source: 'e1' }), provenance(run.entry('hearer'), heard, { instance: 'watcher' })).admitted);
  settle(t);
  assert.ok(t.submit({ kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'seen', value: 1, confidence: 1, source: 'e1' }).admitted, 'the host\'s belief');
  settle(t);
  const later = t.frame();
  assert.ok(t.submit(/** @type {Proposal} */ ({ kind: 'belief', mind: 'walker', subject: { body: 'watcher' }, key: 'at', value: 'west', confidence: 1, source: 'e1' }), provenance(run.entry('reader'), later, { instance: 'walker' })).admitted);
  settle(t);
  /** @param {ReturnType<typeof createMemory>} memory */
  const labels = (memory) => ['watcher', 'walker'].map((mind) => memory.mindBeliefs(mind).map((item) => item.label + (item.heard ? ':' + item.heard : '')));
  const seen = labels(run.memory);
  assert.deepEqual(seen[0], ['authored', 'observed', 'observed', 'hearsay:player-text', 'authored']);
  assert.deepEqual(seen[1], ['observed', 'observed', 'role']);
  for (const item of [...run.memory.mindBeliefs('watcher'), ...run.memory.mindBeliefs('walker')]) {
    assert.ok(typeof item.label === 'string', 'every belief carries a label');
  }
  const manifests = Object.fromEntries([run.entry('hearer'), run.entry('reader')].map((entry) => [entry.hash, entry.manifest]));
  const carried = catalogFromLog(JSON.parse(JSON.stringify(manifests)));
  assert.ok(carried.ok);
  if (!carried.ok) {
    return;
  }
  const rules = loadIntentRules();
  const memory = createMemory();
  const again = createTick({ seed: FIXTURE_SEED, world: createWorld(mindsWorld(), 'reference'), rules: rules.rules, retired: rules.retired, memory, roles: carried.catalog });
  for (const entry of JSON.parse(JSON.stringify(t.log()))) {
    while (again.frame().tick < entry.tick) {
      again.advance();
    }
    const admission = again.submit(entry.proposal, entry.provenance);
    assert.ok(admission.admitted && admission.hash === entry.hash, JSON.stringify(admission));
  }
  settle(again);
  assert.deepEqual(labels(memory), seen, 'replay rebuilds every label from the log');
  assert.equal(again.frame().hash, t.frame().hash);
});

test('a log recorded under a thawed role replays to the same hashes after the role is frozen, against its own manifests', () => {
  const thawed = manifest();
  const run = roleTick([thawed]);
  const t = run.tick;
  const entry = run.entry('tester');
  const first = t.frame();
  quanta(3)(t);
  assert.ok(t.submit(moveTo(first, 2), provenance(entry, first)).admitted);
  settle(t);
  const second = t.frame();
  quanta(5)(t);
  assert.ok(t.submit(moveTo(second, 1.2), provenance(entry, second)).admitted);
  settle(t);
  const log = JSON.parse(JSON.stringify(t.log()));
  const manifests = { [entry.hash]: entry.manifest };
  const end = { tick: t.frame().tick, hash: t.frame().hash };

  const frozen = roleTick([{ ...thawed, status: 'frozen' }]);
  const now = frozen.tick.frame();
  assert.match(reason(frozen.tick.submit(moveTo(now, 2), provenance(frozen.entry('tester'), now))), /is frozen/, 'today the catalog holds the role frozen');

  const rules = loadIntentRules();
  const again = replay({ seed: FIXTURE_SEED, world: fixtureWorld(), rules: rules.rules, retired: rules.retired, log, manifests, end, law: 'reference' });
  assert.ok(again.ok, JSON.stringify(again));
  assert.deepEqual(again.ok ? again.hashes : [], log.map((/** @type {{ hash: string }} */ e) => e.hash));
  assert.equal(again.ok ? again.final : '', t.frame().hash);
  const today = { [frozen.entry('tester').hash]: frozen.entry('tester').manifest };
  const refused = replay({ seed: FIXTURE_SEED, world: fixtureWorld(), rules: rules.rules, retired: rules.retired, log, manifests: today, end, law: 'reference' });
  assert.equal(refused.ok, false, 'replay does not read today\'s catalog');
  assert.match(refused.ok ? '' : refused.reason, /the log carries no manifest/);
  const without = replay({ seed: FIXTURE_SEED, world: fixtureWorld(), rules: rules.rules, retired: rules.retired, log, law: 'reference' });
  assert.match(without.ok ? '' : without.reason, /needs a role catalog/, 'a role\'s entry is never replayed as the host\'s');

  const dir = mkdtempSync(join(tmpdir(), 'role-log-'));
  const file = join(dir, 'log.json');
  writeFileSync(file, JSON.stringify({ seed: FIXTURE_SEED, world: fixtureWorld(), law: 'reference', log, manifests, end }, null, 2));
  const command = spawnSync(process.execPath, ['packages/tick/bin/replay.js', file], { encoding: 'utf8' });
  assert.equal(command.status, 0, command.stderr);
  assert.equal(command.stdout.trim(), 'replay ok: 2 hashes');
});

test('a role\'s provenance is mixed into the running hash, and a role log carries its last frame, so replay alone refuses an edit to its last entry\'s provenance', () => {
  const run = roleTick([manifest()]);
  const t = run.tick;
  const entry = run.entry('tester');
  const built = t.frame();
  assert.ok(t.submit(moveTo(built, 2), provenance(entry, built)).admitted);
  settle(t);
  const host = roleTick([manifest()]).tick;
  assert.ok(host.submit(moveTo(host.frame(), 2)).admitted);
  settle(host);
  assert.notEqual(t.frame().hash, host.frame().hash, 'the same intent under a role hashes apart from the host\'s');
  const second = t.frame();
  assert.ok(t.submit(moveTo(second, 1.2), provenance(entry, second)).admitted);
  settle(t);
  quanta(3)(t);
  const end = { tick: t.frame().tick, hash: t.frame().hash };
  const log = JSON.parse(JSON.stringify(t.log()));
  const manifests = { [entry.hash]: entry.manifest };
  const rules = loadIntentRules();
  const base = { seed: FIXTURE_SEED, world: fixtureWorld(), rules: rules.rules, retired: rules.retired, manifests, law: /** @type {const} */ ('reference') };
  /** @param {ReturnType<typeof replay>} result */
  const why = (result) => (result.ok ? '' : result.reason);
  assert.ok(replay({ ...base, log, end }).ok, 'the log as recorded replays to its end');

  // The last entry's hash is the frame it was admitted against, taken before
  // its provenance is mixed: only a later frame shows the edit, and the end is one.
  const edited = JSON.parse(JSON.stringify(log));
  edited[1].provenance.record = sha('another record');
  const refused = replay({ ...base, log: edited, end });
  assert.equal(refused.ok ? -1 : refused.at, 2, 'every entry is admitted at its own hash, and the end is where it fails');
  assert.match(why(refused), new RegExp('^the log ends at tick ' + end.tick + ' with hash ' + end.hash + ', and the replay reached [0-9a-f]{16} there$'));
  assert.match(why(replay({ ...base, log: edited })), /^a log that carries manifests carries its end/, 'an end left out is refused, not skipped');
  assert.match(why(replay({ ...base, log: edited, end: { tick: edited[1].tick, hash: edited[1].hash } })), /its end is a frame after its last entry/, 'an end at the last admission\'s own frame holds no frame after it');
  assert.match(why(replay({ ...base, log, end: { tick: end.tick } })), /^a log's end is \{ tick, hash \}/);

  const dir = mkdtempSync(join(tmpdir(), 'role-log-'));
  const file = join(dir, 'log.json');
  writeFileSync(file, JSON.stringify({ seed: FIXTURE_SEED, world: fixtureWorld(), law: 'reference', log: edited, manifests, end }, null, 2));
  const command = spawnSync(process.execPath, ['packages/tick/bin/replay.js', file], { encoding: 'utf8' });
  assert.equal(command.status, 1, 'the replay command refuses it from the file alone');
  assert.match(command.stderr.trim(), new RegExp('^replay failed at entry 2: the log ends at tick ' + end.tick + ' with hash ' + end.hash));
});

test('a belief\'s strings are bounded by its key\'s maxLength, or by 120 characters, for the host and for a role', () => {
  const rules = loadIntentRules();
  const t = createTick({ seed: FIXTURE_SEED, world: createWorld(fixtureWorld(), 'reference'), rules: rules.rules, retired: rules.retired, memory: createMemory() });
  assert.ok(t.submit(moveTo(t.frame(), 2)).admitted);
  settle(t);
  const long = 'w'.repeat(121);
  assert.match(reason(t.submit({ kind: 'belief', subject: 'walker', key: 'note', value: long, confidence: 1, source: 'e1' })), /^belief value is 121 characters, over the bound of 120$/);
  assert.match(reason(t.submit({ kind: 'belief', subject: long, key: 'note', value: 'v', confidence: 1, source: 'e1' })), /belief subject is 121 characters/);
  assert.ok(t.submit({ kind: 'belief', subject: 'walker', key: 'note', value: 'w'.repeat(120), confidence: 1, source: 'e1' }).admitted, '120 characters are inside the bound');
  const world = createWorld(mindsWorld(), 'reference');
  const table = { at: { subject: /** @type {const} */ ('body'), value: /** @type {const} */ ('zone'), maxLength: 3 } };
  assert.equal(beliefRefusal(world, { subject: { body: 'walker' }, key: 'at', value: 'east' }, table), 'belief at subject is 6 characters, over the bound of 3');
  const wide = { at: { subject: /** @type {const} */ ('body'), value: /** @type {const} */ ('zone'), maxLength: 8 } };
  assert.equal(beliefRefusal(world, { subject: { body: 'walker' }, key: 'at', value: 'east' }, wide), null);
  const named = createWorld({ ...mindsWorld(), bodies: [...mindsWorld().bodies, { id: 'x'.repeat(121), x: 3, y: 0.25, z: 1, vx: 0, vy: 0, vz: 0, hx: 0.1, hy: 0.1, hz: 0.1 }] }, 'reference');
  assert.match(String(beliefRefusal(named, { subject: { body: 'x'.repeat(121) }, key: 'at', value: 'east' })), /over the bound of 120/);
});
