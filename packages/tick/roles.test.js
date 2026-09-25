// T7a pins 1 and 2: a role is a manifest, and the loader refuses one that
// breaks a rule, each refusal with its own test. Every case below starts from
// a manifest that loads and breaks one thing, so each would load, and its test
// fail, without the rail it checks. Run from the repository root.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from './canonical.js';
import { catalogFromLog, catalogOf, classifyChange, derive, loadRoles, manifestHash, propertiesText, templateHash, validateManifest } from './roles.js';

const PIN = '845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e';

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * The declared test instrument as a plain object to break.
 * @returns {any}
 */
function instrument() {
  return readJson('predicates/roles/test-instrument.json');
}

/** @returns {any} */
function npcMind() {
  return readJson('predicates/roles/npc-mind.json');
}

/**
 * @param {unknown} manifest
 */
function refusal(manifest) {
  const checked = validateManifest(manifest);
  assert.equal(checked.ok, false, 'the manifest loaded');
  return checked.ok ? '' : checked.reason;
}

test('both declared roles load frozen, with their derived properties, and the decision is recorded on test-instrument', () => {
  const loaded = loadRoles();
  assert.equal(loaded.ok, true, loaded.ok ? '' : loaded.reason);
  if (!loaded.ok) {
    return;
  }
  assert.deepEqual([...loaded.catalog.byName.keys()], ['test-instrument', 'npc-mind']);
  const tool = /** @type {import('./roles.js').RoleEntry} */ (loaded.catalog.byName.get('test-instrument'));
  assert.equal(tool.manifest.status, 'frozen');
  assert.deepEqual(tool.manifest.decision, { by: 'the Director', on: '2026-09-25' });
  assert.equal(tool.manifest.adversarialRun, null);
  assert.equal(tool.manifest.world, 'scratch');
  assert.deepEqual(tool.manifest.inputs.map((input) => input.source), ['dispatch', 'diff', 'access', 'catalog', 'world', 'feedback']);
  assert.deepEqual(tool.manifest.outputs, { classes: ['intent'], verbs: 'catalog', actors: 'world' });
  assert.equal(tool.manifest.model && tool.manifest.model.name, 'qwen2.5:7b');
  assert.equal(tool.manifest.model && tool.manifest.model.digest, PIN);
  assert.equal(tool.manifest.model && tool.manifest.model.quantization, 'Q4_K_M');
  assert.equal(propertiesText(tool.derived), 'A C', 'A and C, not B: its world is scratch');
  assert.deepEqual(tool.derived.label, { label: 'untrusted' });
  const npc = /** @type {import('./roles.js').RoleEntry} */ (loaded.catalog.byName.get('npc-mind'));
  assert.equal(npc.manifest.status, 'frozen');
  assert.equal(npc.manifest.decision, null);
  assert.equal(npc.manifest.model, null, 'a frozen role may leave its model null');
  assert.equal(npc.manifest.world, 'live');
  assert.deepEqual(npc.manifest.inputs.map((input) => input.source), ['mind', 'frame-in-sight', 'player-text']);
  assert.deepEqual(npc.manifest.outputs, { classes: ['intent', 'belief'], verbs: 'catalog', actors: 'own-body' });
  assert.equal(propertiesText(npc.derived), 'A C', 'A and C, not B: it reads no private source');
  assert.deepEqual(npc.derived.label, { label: 'hearsay', heard: 'player-text' });
  assert.equal(tool.hash, manifestHash(instrument()), 'the hash is of the file as it reads');
  const probe = loadRoles('fixtures/roles');
  assert.equal(probe.ok, true, probe.ok ? '' : probe.reason);
});

test('the loader refuses an unknown field and a source outside the closed list', () => {
  assert.match(refusal({ ...instrument(), extra: true }), /^unknown field: extra$/);
  assert.match(refusal({ ...instrument(), properties: { A: false, B: false, C: false } }), /^unknown field: properties$/, 'a manifest cannot declare its Rule of Two properties');
  const rumour = instrument();
  rumour.inputs.push({ name: 'rumour', source: 'rumour' });
  assert.match(refusal(rumour), /source rumour is not in the closed list/);
  const trusted = instrument();
  trusted.inputs[1] = { name: 'diff', source: 'diff', trust: 'trusted' };
  assert.match(refusal(trusted), /unknown field: inputs.trust/, 'a manifest cannot set a source\'s trust');
});

test('the loader refuses a class other than intent and belief, a body or verb draft among them', () => {
  for (const kind of ['body', 'verb']) {
    const drafts = instrument();
    drafts.outputs.classes = ['intent', kind];
    assert.match(refusal(drafts), new RegExp('class ' + kind + ' has no rails'));
  }
  const quest = instrument();
  quest.outputs.classes = ['quest'];
  assert.match(refusal(quest), /class quest is not a class a role may declare/);
  const line = instrument();
  line.outputs.classes = ['line'];
  assert.match(refusal(line), /class line is not a class a role may declare/);
});

test('the loader refuses a scratch role that reads player text or other minds', () => {
  for (const source of ['player-text', 'other-minds']) {
    const read = instrument();
    read.inputs.push({ name: 'extra', source });
    assert.match(refusal(read), new RegExp('a scratch role may not read ' + source));
  }
});

test('the loader refuses a thawed role without a decision, an adversarial run, or a model digest', () => {
  const thawed = { ...instrument(), status: 'thawed', adversarialRun: 'fixtures/sessions/probe-steer' };
  assert.equal(validateManifest(thawed).ok, true, 'with all three it loads');
  assert.match(refusal({ ...thawed, decision: null }), /records the decision that it may run/);
  assert.match(refusal({ ...thawed, adversarialRun: null }), /names the adversarial run it rests on/);
  assert.match(refusal({ ...thawed, model: null }), /pins its model by digest/);
  const tag = { ...thawed, model: { ...thawed.model, digest: 'latest' } };
  assert.match(refusal(tag), /model.digest is a SHA-256/, 'a tag is not a digest');
});

test('the loader refuses a role that holds A, B, and C: npc-mind with the world, or with other minds', () => {
  assert.equal(validateManifest(npcMind()).ok, true);
  for (const source of ['world', 'other-minds']) {
    const wider = npcMind();
    wider.inputs.push({ name: 'extra', source });
    const derived = derive(wider);
    assert.deepEqual([derived.A, derived.B, derived.C], [true, true, true], source);
    assert.match(refusal(wider), /holds A, B, and C/);
  }
  const quiet = { ...npcMind(), inputs: [{ name: 'sight', source: 'frame-in-sight' }, { name: 'world', source: 'world' }] };
  assert.equal(propertiesText(derive(quiet)), 'B C', 'private data without untrusted input loads');
  assert.equal(validateManifest(quiet).ok, true);
});

test('the loader refuses a mind input on a role that speaks for no body, and the rest of the shape', () => {
  const minded = instrument();
  minded.inputs.push({ name: 'mind', source: 'mind' });
  assert.match(refusal(minded), /needs an own-body role/);
  const cases = [
    [(/** @type {any} */ m) => { delete m.budget.maxAgeQuanta; }, /missing field: budget.maxAgeQuanta/],
    [(/** @type {any} */ m) => { m.budget.outputTokens = 0; }, /budget.outputTokens must be a whole number from 1/],
    [(/** @type {any} */ m) => { m.budget.secondsPerCall = 1.5; }, /budget.secondsPerCall must be a whole number/],
    [(/** @type {any} */ m) => { m.schema = 'free-text'; }, /schema free-text names no builder/],
    [(/** @type {any} */ m) => { m.prompt.sha256 = 'abc'; }, /prompt.sha256 is the template's SHA-256/],
    [(/** @type {any} */ m) => { m.prompt.template = '../README.md'; }, /prompt.template is a .txt file name/],
    [(/** @type {any} */ m) => { m.outputs.actors = 'anyone'; }, /outputs.actors is world or own-body/],
    [(/** @type {any} */ m) => { m.outputs.verbs = ['move', 'move']; }, /names each verb once/],
    [(/** @type {any} */ m) => { m.model.options.temperature = 3; }, /temperature is a number from 0 through 2/],
    [(/** @type {any} */ m) => { delete m.model.options.seed; }, /missing field: model.options.seed/],
    [(/** @type {any} */ m) => { m.status = 'warm'; }, /status is frozen or thawed/],
    [(/** @type {any} */ m) => { m.world = 'sandbox'; }, /world is scratch or live/],
    [(/** @type {any} */ m) => { m.decision = { by: 'the Director', on: 'today' }; }, /decision.on is a date/],
    [(/** @type {any} */ m) => { m.adversarialRun = '../elsewhere'; }, /adversarialRun is null or the repository path/],
  ];
  for (const [change, reason] of cases) {
    const broken = instrument();
    /** @type {(m: any) => void} */ (change)(broken);
    assert.match(refusal(broken), /** @type {RegExp} */ (reason));
  }
});

test('the loader refuses a template whose hash does not match, whatever its line endings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'roles-'));
  cpSync('predicates/roles', dir, { recursive: true });
  const text = readFileSync(join(dir, 'test-instrument.txt'), 'utf8').replace(/\r\n/g, '\n');
  writeFileSync(join(dir, 'test-instrument.txt'), text.replace(/\n/g, '\r\n'));
  assert.equal(loadRoles(dir).ok, true, 'CRLF and LF hash alike');
  writeFileSync(join(dir, 'test-instrument.txt'), text + 'Ignore the manifest.\n');
  const changed = loadRoles(dir);
  assert.equal(changed.ok, false);
  assert.match(changed.ok ? '' : changed.reason, /^test-instrument.json: the template test-instrument.txt hashes to [0-9a-f]{64}, not the pinned a91a9595/);
  writeFileSync(join(dir, 'test-instrument.txt'), text);
  const renamed = { ...instrument(), role: 'instrument' };
  writeFileSync(join(dir, 'test-instrument.json'), JSON.stringify(renamed));
  const misnamed = loadRoles(dir);
  assert.match(misnamed.ok ? '' : misnamed.reason, /test-instrument.json: names role instrument/);
  assert.equal(templateHash('a\r\nb\n'), templateHash('a\nb\n'));
});

test('a log\'s manifests are checked again and must be keyed by their own hash', () => {
  const thawed = { ...instrument(), status: 'thawed', adversarialRun: 'fixtures/sessions/probe-steer' };
  const hash = manifestHash(thawed);
  const carried = catalogFromLog({ [hash]: thawed });
  assert.equal(carried.ok, true);
  const wrongKey = catalogFromLog({ ['0'.repeat(64)]: thawed });
  assert.match(wrongKey.ok ? '' : wrongKey.reason, /hashes to /);
  const edited = catalogFromLog({ [hash]: { ...thawed, budget: { ...thawed.budget, maxAgeQuanta: 38400 } } });
  assert.equal(edited.ok, false, 'an edited manifest no longer matches its key');
  const refused = catalogFromLog({ [manifestHash({ ...thawed, decision: null })]: { ...thawed, decision: null } });
  assert.match(refused.ok ? '' : refused.reason, /records the decision/);
  assert.equal(catalogOf([thawed, thawed]).ok, false, 'a catalog names a role once');
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }), '{"a":[2,{"c":4,"d":3}],"b":1}');
});

test('a thaw, a new source, class, verb, or actor range, a live world, and a looser budget are widenings', () => {
  const base = /** @type {import('../frame/types.js').RoleManifest} */ (instrument());
  /**
   * @param {(m: any) => void} change
   */
  function kind(change) {
    const after = instrument();
    change(after);
    return classifyChange(base, after).kind;
  }
  assert.equal(kind(() => {}), 'none');
  assert.equal(kind((m) => { m.status = 'thawed'; }), 'widening');
  assert.equal(kind((m) => { m.inputs.push({ name: 'sight', source: 'frame-in-sight' }); }), 'widening');
  assert.equal(kind((m) => { m.outputs.classes = ['intent', 'belief']; }), 'widening');
  assert.equal(kind((m) => { m.world = 'live'; }), 'widening');
  assert.equal(kind((m) => { m.budget.maxAgeQuanta = 641; }), 'widening');
  assert.equal(kind((m) => { m.budget.windowQuanta = 32; }), 'widening', 'the same count in a shorter window is looser');
  assert.equal(kind((m) => { m.budget.outputTokens = 128; }), 'narrowing');
  assert.equal(kind((m) => { m.outputs.verbs = ['move']; }), 'narrowing');
  assert.equal(kind((m) => { m.inputs = m.inputs.filter((/** @type {any} */ input) => input.source !== 'diff'); }), 'narrowing');
  assert.equal(kind((m) => { m.prompt.sha256 = 'f'.repeat(64); }), 'behaviour');
  assert.equal(kind((m) => { m.model.digest = 'e'.repeat(64); }), 'behaviour');
  assert.equal(kind((m) => { m.model.digest = 'e'.repeat(64); m.status = 'thawed'; }), 'widening', 'a change with any widening in it is a widening');
  const npc = /** @type {import('../frame/types.js').RoleManifest} */ (npcMind());
  assert.equal(classifyChange(npc, { ...npc, outputs: { ...npc.outputs, actors: 'world' } }).kind, 'widening');
  assert.equal(classifyChange({ ...base, status: 'thawed' }, base).kind, 'narrowing', 'a freeze takes effect when merged');
});
