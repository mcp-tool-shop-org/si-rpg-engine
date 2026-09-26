#!/usr/bin/env node
// propose: the seat's command (T7a). Runs from the repository root.
//
//   propose [--catalog <dir>]
//   propose --role <name> [--catalog <dir>] --spec <session>/spec.json
//   propose --drift <session dir>
//
// Without --role it lists the roles in the catalog, predicates/roles unless
// --catalog names another, each with its status, its world, the Rule of Two
// properties the loader derived, and its trust label. With --role it refuses
// a frozen role, or one that acts in a live world, with exit 2 before any
// model call: the model's client is not even loaded. For a thawed scratch role
// it runs the session the spec names through the local Ollama at
// 127.0.0.1:11434 and writes session.json and one record per call beside the
// spec. --drift reissues a session's recorded calls and reports how far the
// new outputs drift from the recorded ones. It runs only by hand, on a GPU, and
// never blocks: it exits 0 whatever it finds. Neither CI nor npm test runs a
// model; CI checks the records (packages/propose/record.test.js).

import { readFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoles, propertiesText } from '../../tick/roles.js';
import { createMemory } from '../../tick/memory.js';
import { loadIntentRules } from '../../tick/predicates.js';
import { createTick, settle } from '../../tick/tick.js';
import { createWorld } from '../../tick/world.js';
import { guard } from '../../tool/guard.js';
import { driftOf, readSession, writeSession } from '../record.js';
import { askWithin, runSession, scratchWorld } from '../seat.js';

const USAGE = 'propose [--catalog <dir>] | propose --role <name> [--catalog <dir>] --spec <spec.json> | propose --drift <session>';
guard(USAGE);

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const here = process.cwd();
chdir(root);

const args = process.argv.slice(2);
/** @param {string} name */
function value(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * A path the person typed, from where they typed it, as a path from the root.
 * @param {string} path
 */
function fromRoot(path) {
  return relative(root, resolve(here, path)).split('\\').join('/');
}

/** @param {string} line */
function refuse(line) {
  process.stderr.write(line + '\n');
  process.exit(2);
}

const drift = value('--drift');
if (drift !== undefined) {
  await driftReport(fromRoot(drift));
  process.exit(0);
}

const catalogDir = value('--catalog') === undefined ? 'predicates/roles' : fromRoot(/** @type {string} */ (value('--catalog')));
const loaded = loadRoles(catalogDir);
if (!loaded.ok) {
  process.stderr.write('refused: ' + loaded.reason + '\n');
  process.exit(1);
}
const catalog = loaded.catalog;

const roleName = value('--role');
if (roleName === undefined) {
  for (const [name, entry] of catalog.byName) {
    const m = entry.manifest;
    const decided = m.decision === null ? 'no decision recorded' : 'decided by ' + m.decision.by + ' on ' + m.decision.on;
    process.stdout.write(name + ' ' + m.status + ' ' + m.world + ' properties ' + propertiesText(entry.derived) + ' label ' + entry.derived.label.label + ' ' + decided + '\n');
  }
  process.exit(0);
}

const entry = catalog.byName.get(roleName);
if (!entry) {
  refuse('refusing to run: ' + catalogDir + ' holds no role named ' + roleName);
}
const role = /** @type {import('../../tick/roles.js').RoleEntry} */ (entry);
if (role.manifest.status !== 'thawed') {
  refuse('refusing to run: role ' + roleName + ' is frozen');
}
if (role.manifest.world !== 'scratch') {
  refuse('refusing to run: role ' + roleName + ' acts in a live world, and the seat runs only scratch sessions');
}

const specArg = value('--spec');
if (specArg === undefined) {
  refuse('usage: ' + USAGE);
}
const specPath = fromRoot(/** @type {string} */ (specArg));
const dir = dirname(specPath);
const spec = readSpec(specPath);
if (spec.role !== roleName) {
  refuse('refusing to run: the spec is for role ' + spec.role + ', not ' + roleName);
}
const built = await scratchWorld(spec.world, root);
if (!built.ok) {
  refuse('refusing to run: ' + built.reason);
}
const scratch = /** @type {Extract<typeof built, { ok: true }>} */ (built);

const rules = loadIntentRules();
const world = createWorld(scratch.world, spec.law);
const memory = createMemory();
const tick = createTick({ seed: scratch.seed, world, rules: rules.rules, retired: rules.retired, memory, roles: catalog });
/** @type {string[]} */
const frames = [];
tick.attach({
  draw(frame) {
    frames.push(frame.hash);
  },
});
// The world may settle before the first call, so its first prompt shows it at rest.
for (let i = 0; i < spec.startQuanta; i = i + 1) {
  tick.advance();
}

// Only now, past every refusal, is the model's client loaded.
const { askOllama, observeOllama } = await import('../ollama.js');
const result = await runSession({
  entry: role,
  session: spec.session,
  instance: spec.instance,
  tick,
  world,
  memory,
  rules: rules.rules,
  inputs: { dispatch: readInput(dir, spec.dispatch), diff: readInput(dir, spec.diff), access: spec.access },
  calls: spec.calls,
  lateQuanta: spec.lateQuanta,
  client: { observe: observeOllama, ask: askOllama },
});
settle(tick);

/** @type {Record<string, import('../../frame/types.js').RoleManifest>} */
const manifests = { [role.hash]: role.manifest };
// The last frame the session reached, whose hash holds every admission's provenance.
const last = tick.frame();
writeSession(dir, {
  session: spec.session,
  role: roleName,
  catalog: catalogDir,
  instance: spec.instance,
  worldFrom: scratch.from,
  lateQuanta: spec.lateQuanta,
  seed: scratch.seed,
  law: spec.law,
  world: scratch.world,
  calls: result.calls,
  refused: result.refused,
  log: tick.log().slice(),
  manifests,
  end: { tick: last.tick, hash: last.hash },
  frames,
}, result.records);
for (const line of result.calls) {
  process.stdout.write('call ' + line.call + ' built at ' + line.builtAt.tick + ': ' + line.read + (line.admitted ? ', admitted at ' + line.at : ', ' + String(line.reason)) + '\n');
}
if (result.refused) {
  process.stdout.write('stopped: ' + result.refused + '\n');
}
process.stdout.write('wrote ' + dir + '/session.json and ' + result.records.length + ' records\n');

/**
 * @param {string} path
 * @returns {{ session: string, role: string, world: string, instance: string, calls: number, startQuanta: number, lateQuanta: number, law: 'product' | 'reference', dispatch: string, diff: string, access: Record<string, string[]> }}
 */
function readSpec(path) {
  /** @type {any} */
  let spec;
  try {
    spec = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    refuse('refusing to run: the spec did not read: ' + (error instanceof Error ? error.message : String(error)));
  }
  const allowed = ['session', 'role', 'world', 'instance', 'calls', 'startQuanta', 'lateQuanta', 'law', 'dispatch', 'diff', 'access'];
  for (const key of Object.keys(spec || {})) {
    if (!allowed.includes(key)) {
      refuse('refusing to run: unknown field in the spec: ' + key);
    }
  }
  const ok = spec
    && typeof spec.session === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(spec.session)
    && typeof spec.role === 'string'
    && typeof spec.world === 'string'
    && typeof spec.instance === 'string' && spec.instance.length > 0 && spec.instance.length <= 120
    && Number.isInteger(spec.calls) && spec.calls >= 1 && spec.calls <= 1000
    && Number.isInteger(spec.startQuanta) && spec.startQuanta >= 0 && spec.startQuanta <= 38400
    && Number.isInteger(spec.lateQuanta) && spec.lateQuanta >= 0 && spec.lateQuanta <= 38400
    && (spec.law === 'product' || spec.law === 'reference')
    && typeof spec.dispatch === 'string' && typeof spec.diff === 'string'
    && spec.access && typeof spec.access === 'object' && !Array.isArray(spec.access)
    && Object.values(spec.access).every((verbs) => Array.isArray(verbs) && verbs.every((verb) => typeof verb === 'string'));
  if (!ok) {
    refuse('refusing to run: a spec names its session, role, world, instance, calls, startQuanta, lateQuanta, law, dispatch and diff files, and access');
  }
  return spec;
}

/**
 * An input file beside the spec, and nowhere else.
 * @param {string} folder
 * @param {string} name
 */
function readInput(folder, name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    refuse('refusing to run: an input file is named beside the spec, and ' + name + ' is not');
  }
  return readFileSync(join(folder, name), 'utf8');
}

/**
 * Reissues each recorded call and prints how far the new output drifts.
 * @param {string} folder
 */
async function driftReport(folder) {
  try {
    const { session, records } = readSession(folder);
    const { askOllama, observeOllama } = await import('../ollama.js');
    const client = { observe: observeOllama, ask: askOllama };
    /** @type {object[]} */
    const report = [];
    for (const [key, record] of records) {
      if (record.output === null) {
        continue;
      }
      const manifest = session.manifests[record.manifest];
      const pin = manifest && manifest.model ? manifest.model.digest : record.model.digest;
      // The seat's one deadline, as the session's own calls had.
      const { reply } = await askWithin(client, record.request, pin, record.timeoutMs);
      report.push(driftOf(key, record, reply === null ? null : reply.output, manifest));
    }
    process.stdout.write(JSON.stringify({ session: session.session, calls: report }, null, 2) + '\n');
  } catch (error) {
    process.stdout.write('drift not measured: ' + (error instanceof Error ? error.message : String(error)) + '\n');
  }
}
