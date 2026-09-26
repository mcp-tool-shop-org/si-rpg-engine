// T7a: the seat. It is the only code that calls a model, it reaches the tick
// only through submitAsRole, and every call is recorded. No test here calls a
// model: each fake one returns what its test needs, and the command's tests
// replace fetch so that any call to a model would fail them. Run from the
// repository root.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMemory } from '../tick/memory.js';
import { loadIntentRules } from '../tick/predicates.js';
import { catalogOf, loadRoles, manifestHash, sha256, templateHash } from '../tick/roles.js';
import { FIXTURE_SEED } from '../tick/fixture.js';
import { createTick, settle } from '../tick/tick.js';
import { createWorld } from '../tick/world.js';
import { readRoleOutput, stampProposal } from './parse.js';
import { npcMindPrompt, npcMindState, renderTemplate } from './prompt.js';
import { cutOffTiming, driftOf, verifySession, writeSession } from './record.js';
import { buildSchema, roleProposalSchema } from './schema.js';
import { runSession, scratchWorld, sessionRefusal, submitAsRole } from './seat.js';

/**
 * @typedef {import('../tick/roles.js').RoleEntry} RoleEntry
 * @typedef {import('./ollama.js').ChatRequest} ChatRequest
 * @typedef {import('./ollama.js').Observed} Observed
 * @typedef {import('./ollama.js').Reply} Reply
 * @typedef {import('./seat.js').Client} Client
 */

const root = process.cwd();

function probe() {
  const loaded = loadRoles('fixtures/roles');
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  return { catalog: loaded.catalog, entry: /** @type {RoleEntry} */ (loaded.catalog.byName.get('probe')) };
}

/**
 * What a fake client reads before a call: the server holds the pin.
 * @param {string} name
 * @param {string} pin
 * @returns {Observed}
 */
function observed(name, pin) {
  return {
    model: { name, digest: pin, quantization: 'Q4_K_M', format: 'gguf', family: 'qwen2', parameterSize: '7.6B' },
    server: { version: 'test', settings: {}, loaded: null, callsAtOnce: 1 },
    gpu: { names: ['test'], count: 1, driver: null },
  };
}

/**
 * A reply that came back within the budget, in `ms` milliseconds.
 * @param {string | null} output
 * @param {number} [ms]
 * @returns {Reply}
 */
function replied(output, ms) {
  return { output, timing: { ms: ms === undefined ? 5 : ms, timedOut: false, totalDuration: null, loadDuration: null, promptEvalCount: null, promptEvalDuration: null, evalCount: 20, evalDuration: null, doneReason: 'stop' } };
}

/**
 * A fake model: the server holds the pin, and each call returns the next output.
 * @param {Array<string | null>} outputs
 * @param {(request: ChatRequest) => void} [seen]
 * @returns {Client}
 */
function fakeClient(outputs, seen) {
  let n = 0;
  return {
    observe: async (name, pin) => observed(name, pin),
    ask: async (request) => {
      if (seen) {
        seen(request);
      }
      const output = outputs[n];
      n = n + 1;
      return replied(output);
    },
  };
}

/**
 * A scratch session of the probe role, or of `entry` in its place, in the crate-and-door world.
 * @param {{ client: Client, calls: number, entry?: RoleEntry, lateQuanta?: number, timer?: (ms: number) => Promise<void>, onTick?: (tick: ReturnType<typeof createTick>) => void }} options
 */
async function probeSession(options) {
  const { catalog, entry: probeEntry } = probe();
  const entry = options.entry || probeEntry;
  const built = await scratchWorld('worlds/crate-and-door.json', root);
  if (!built.ok) {
    throw new Error(built.reason);
  }
  const rules = loadIntentRules();
  const world = createWorld(built.world, 'product');
  const memory = createMemory();
  const tick = createTick({ seed: built.seed, world, rules: rules.rules, retired: rules.retired, memory, roles: catalog });
  /** @type {string[]} */
  const frames = [];
  tick.attach({ draw: (frame) => void frames.push(frame.hash) });
  if (options.onTick) {
    options.onTick(tick);
  }
  const lateQuanta = options.lateQuanta === undefined ? 8 : options.lateQuanta;
  const result = await runSession({
    entry,
    session: 'test-session',
    instance: 'test-session',
    tick,
    world,
    memory,
    rules: rules.rules,
    inputs: { dispatch: 'A change to the push verb.', diff: '--- a/predicates/intents/push.json\n+++ b/predicates/intents/push.json\n', access: { 'admitIntent in packages/tick/predicates.js': ['move', 'push'] } },
    calls: options.calls,
    lateQuanta,
    client: options.client,
    timer: options.timer,
  });
  settle(tick);
  const dir = mkdtempSync(join(tmpdir(), 'session-'));
  writeSession(dir, {
    session: 'test-session', role: 'probe', catalog: 'fixtures/roles', instance: 'test-session', worldFrom: built.from, lateQuanta,
    seed: built.seed, law: 'product', world: built.world, calls: result.calls, refused: result.refused,
    log: tick.log().slice(), manifests: { [entry.hash]: entry.manifest }, end: { tick: tick.frame().tick, hash: tick.frame().hash }, frames,
  }, result.records);
  return { result, tick, dir, entry };
}

// ---------------------------------------------------------------------------
// The one way in (pin 3).

test('the seat reaches the tick only through submitAsRole, which refuses to submit without provenance', () => {
  let calls = 0;
  const tick = {
    /** @returns {import('../frame/types.js').Admission} */
    submit() {
      calls = calls + 1;
      return { admitted: true, quanta: 1, hash: 'h' };
    },
  };
  const intent = /** @type {import('../frame/types.js').Proposal} */ ({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2, z: 0 }, frameHash: 'h' });
  const bare = submitAsRole(tick, intent, /** @type {any} */ (undefined));
  assert.equal(bare.admitted, false);
  assert.match(bare.admitted ? '' : bare.reason, /only with its provenance/);
  assert.equal(submitAsRole(tick, intent, /** @type {any} */ (null)).admitted, false);
  assert.equal(calls, 0, 'the tick was never reached');
  assert.equal(submitAsRole(tick, intent, /** @type {any} */ ({ role: 'probe' })).admitted, true);
  assert.equal(calls, 1, 'with provenance it reaches the tick, whose gate checks it');
});

/** Keywords after which an expression begins, so a slash there begins a regex literal. */
const BEFORE_EXPRESSION = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await', 'extends']);

/** Keywords whose parenthesized head a statement follows, so a slash after its `)` begins a regex literal. */
const HEADS = new Set(['if', 'while', 'for', 'with']);

/** A character of a word: an identifier, a private name, a keyword, or a number. */
const WORD = /[\w$#\\\u0080-￿]/;

/**
 * The source with comments blanked out, line and column kept. Strings,
 * template literals with their substitutions, and regex literals are read as
 * the language reads them and kept as they are, so a `//`, a `/*`, or a quote
 * inside one opens nothing. A slash begins a regex literal where an
 * expression may begin: at the start, after an operator or an opening
 * bracket, after a keyword that takes an expression, after a block's closing
 * brace, and after the parenthesis that closes an if, while, for, or with
 * head. Anywhere else it divides.
 * @param {string} source
 */
function withoutComments(source) {
  let out = '';
  let i = 0;
  /** Whether a slash here begins a regex literal. */
  let regexNext = true;
  /** The word just read, when the last token was a word that is not a property name. */
  let word = '';
  /** Whether the last token was a member dot, so a word after it is a property name. */
  let dotted = false;
  /** @type {boolean[]} for each open parenthesis, whether it opened an if, while, for, or with head */
  const parens = [];
  /** @type {boolean[]} for each open brace, whether it opened a template literal's substitution */
  const braces = [];

  /** @param {number} to copies the source up to `to` as it is */
  const keep = (to) => {
    out = out + source.slice(i, to);
    i = Math.min(to, source.length);
  };
  /** @param {number} to blanks the source up to `to`, keeping its line breaks */
  const blank = (to) => {
    out = out + source.slice(i, to).replace(/[^\n]/g, ' ');
    i = Math.min(to, source.length);
  };
  /** Past a backslash and what it escapes, a CRLF line continuation whole. */
  const escaped = () => keep(i + (source[i + 1] === '\r' && source[i + 2] === '\n' ? 3 : 2));
  /** A template literal's text, up to its closing backtick or its next substitution. */
  const templateText = () => {
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') {
        escaped();
      } else if (c === '`') {
        keep(i + 1);
        regexNext = false;
        return;
      } else if (c === '$' && source[i + 1] === '{') {
        keep(i + 2);
        braces.push(true);
        regexNext = true;
        return;
      } else {
        keep(i + 1);
      }
    }
  };

  if (source.startsWith('#!')) {
    const end = source.indexOf('\n');
    blank(end < 0 ? source.length : end);
  }
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      blank(end < 0 ? source.length : end);
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      blank(end < 0 ? source.length : end + 2);
      continue;
    }
    if (/\s/.test(c)) {
      keep(i + 1);
      continue;
    }
    const before = word;
    const property = dotted;
    word = '';
    dotted = false;
    if (c === '\'' || c === '"') {
      keep(i + 1);
      while (i < source.length && source[i] !== c && source[i] !== '\n') {
        if (source[i] === '\\') {
          escaped();
        } else {
          keep(i + 1);
        }
      }
      if (source[i] === c) {
        keep(i + 1);
      }
      regexNext = false;
    } else if (c === '`') {
      keep(i + 1);
      templateText();
    } else if (c === '/' && regexNext) {
      keep(i + 1);
      let inClass = false;
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') {
        const r = source[i];
        if (r === '\\') {
          escaped();
          continue;
        }
        keep(i + 1);
        if (inClass) {
          inClass = r !== ']';
        } else if (r === '[') {
          inClass = true;
        } else if (r === '/') {
          break;
        }
      }
      while (i < source.length && /[\w$]/.test(source[i])) {
        keep(i + 1);
      }
      regexNext = false;
    } else if (WORD.test(c)) {
      let end = i + 1;
      while (end < source.length && WORD.test(source[end])) {
        end = end + 1;
      }
      const text = source.slice(i, end);
      keep(end);
      word = property ? '' : text;
      regexNext = !property && BEFORE_EXPRESSION.has(text);
    } else if (c === '(') {
      keep(i + 1);
      parens.push(HEADS.has(before));
      regexNext = true;
    } else if (c === ')') {
      keep(i + 1);
      regexNext = parens.pop() === true;
    } else if (c === '{') {
      keep(i + 1);
      braces.push(false);
      regexNext = true;
    } else if (c === '}') {
      keep(i + 1);
      if (braces.pop() === true) {
        templateText();
      } else {
        regexNext = true;
      }
    } else if (c === ']') {
      keep(i + 1);
      regexNext = false;
    } else if (c === '.' && next === '.' && source[i + 2] === '.') {
      keep(i + 3);
      regexNext = true;
    } else if (c === '.') {
      keep(i + 1);
      dotted = true;
      regexNext = false;
    } else if ((c === '+' || c === '-') && next === c) {
      keep(i + 2);
      regexNext = false;
    } else {
      keep(i + 1);
      regexNext = true;
    }
  }
  return out;
}

/**
 * Every place the source names the tick's submit outside submitAsRole's body,
 * as `line:column`, and how many calls to it that body makes.
 * @param {string} source
 * @returns {{ stray: string[], inside: number }}
 */
export function submitUses(source) {
  const code = withoutComments(source);
  let from = -1;
  let to = -1;
  const head = /function\s+submitAsRole\s*\(/.exec(code);
  if (head) {
    const open = code.indexOf('{', code.indexOf(')', head.index));
    let depth = 0;
    for (let i = open; i < code.length; i = i + 1) {
      if (code[i] === '{') {
        depth = depth + 1;
      } else if (code[i] === '}') {
        depth = depth - 1;
        if (depth === 0) {
          from = open;
          to = i;
          break;
        }
      }
    }
  }
  /** @type {string[]} */
  const stray = [];
  let inside = 0;
  for (const match of code.matchAll(/\bsubmit\b/g)) {
    const at = match.index || 0;
    if (at > from && at < to) {
      if (/^submit\s*\(/.test(code.slice(at)) && code[at - 1] === '.') {
        inside = inside + 1;
      }
      continue;
    }
    const before = code.slice(0, at).split('\n');
    stray.push(before.length + ':' + (before[before.length - 1].length + 1));
  }
  return { stray, inside };
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function sources(dir) {
  /** @type {string[]} */
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = dir + '/' + name;
    if (statSync(path).isDirectory()) {
      found.push(...sources(path));
    } else if ((name.endsWith('.js') || name.endsWith('.mjs')) && !name.endsWith('.test.js')) {
      found.push(path);
    }
  }
  return found.sort();
}

test('nothing in packages/propose names the tick\'s submit but submitAsRole, which calls it once', () => {
  const files = sources('packages/propose');
  assert.ok(files.includes('packages/propose/seat.js') && files.includes('packages/propose/bin/propose.js'));
  let calls = 0;
  for (const file of files) {
    const uses = submitUses(readFileSync(file, 'utf8'));
    assert.deepEqual(uses.stray, [], file);
    calls = calls + uses.inside;
  }
  assert.equal(calls, 1, 'one call, in seat.js');
});

test('the source check goes red on a second way into the tick, however it is spelled', () => {
  const seat = readFileSync('packages/propose/seat.js', 'utf8');
  assert.deepEqual(submitUses(seat).stray, []);
  const planted = [
    'export function quick(tick, proposal) {\n  return tick.submit(proposal);\n}\n',
    'export function quick(tick, proposal) {\n  return tick[\'submit\'](proposal);\n}\n',
    'export function quick(tick, proposal) {\n  const { submit } = tick;\n  return submit(proposal);\n}\n',
    'export const quick = (tick, p) => tick\n  .submit(p);\n',
  ];
  for (const extra of planted) {
    assert.notDeepEqual(submitUses(seat + extra).stray, [], extra);
  }
  assert.deepEqual(submitUses(seat + '// a comment may say tick.submit(proposal)\n/* and tick.submit here */\n').stray, [], 'comments are not calls');
  const url = 'const base = \'http://127.0.0.1:11434\'; export const quick = (tick, p) => tick.submit(p);\n';
  assert.deepEqual(submitUses(url).stray, ['1:' + (url.indexOf('submit') + 1)], 'a URL does not hide the rest of its line');
  // A regex literal, or a template literal inside another's substitution,
  // is read as the language reads it: a slash, a comment opener, or a quote
  // inside one hides nothing after it.
  const hidden = [
    'export const quick = (tick, p) => /a\\//.test(p.verb) && tick.submit(p);\n',
    'export const quick = (tick, p) => /[/*]/.test(p.verb) && tick.submit(p);\n',
    'export const quick = (tick, p) => /[/]*\\//.test(p.verb) && tick.submit(p);\n',
    'export const quick = (tick, p) => /\'/.test(p.verb) && p.url !== \'http://x\' && tick.submit(p);\n',
    'export function quick(tick, p) {\n  if (p) /a\\//.test(p.verb) && tick.submit(p);\n}\n',
    'export const quick = (tick, p) => `${`//`}` && tick.submit(p);\n',
  ];
  for (const extra of hidden) {
    const lines = extra.split('\n');
    const row = lines.findIndex((line) => line.includes('submit'));
    assert.deepEqual(submitUses(extra).stray, [(row + 1) + ':' + (lines[row].indexOf('submit') + 1)], extra);
    assert.notDeepEqual(submitUses(seat + extra).stray, [], extra);
  }
  const divided = 'export const half = (total) => total / 2; // tick.submit(p) is only named here\nconst third = (a, b) => a / b / 3; /* nor tick.submit here */\n';
  assert.deepEqual(submitUses(divided).stray, [], 'a slash that divides begins no regex literal, and a comment after it is still a comment');
});

// ---------------------------------------------------------------------------
// The parser (pins 7 and 9).

test('the parser reads only the proposal: notes over the bound are refused, and a proposal inside the notes is not acted on', () => {
  const { entry } = probe();
  const manifest = entry.manifest;
  const move = { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2, z: 0 } };
  const read = readRoleOutput(JSON.stringify({ notes: 'aim at the push rule', proposal: move }), manifest);
  assert.deepEqual(read, { verdict: 'ok', notes: 'aim at the push rule', proposal: move });
  const hidden = { kind: 'intent', verb: 'push', actor: 'crate', target: { body: 'walker' } };
  const inside = readRoleOutput(JSON.stringify({ notes: JSON.stringify({ proposal: hidden }), proposal: move }), manifest);
  assert.equal(inside.verdict, 'ok');
  assert.deepEqual(inside.verdict === 'ok' ? inside.proposal : null, move, 'the notes are never parsed for an action');
  const only = readRoleOutput(JSON.stringify({ notes: JSON.stringify(hidden) }), manifest);
  assert.equal(only.verdict, 'wrong-shape', 'notes alone are not a proposal');
  const long = readRoleOutput(JSON.stringify({ notes: 'n'.repeat(manifest.budget.freeSpanChars + 1), proposal: move }), manifest);
  assert.equal(long.verdict, 'notes-over-bound');
  assert.match('reason' in long ? long.reason : '', /the notes are 401 characters, over role probe's freeSpanChars of 400/);
  assert.equal(readRoleOutput(JSON.stringify({ notes: 'n'.repeat(400), proposal: move }), manifest).verdict, 'ok');
});

test('the parser trusts no decoder: it refuses what is not one object, an unknown field, a label, a frame hash, and a class the role does not make', () => {
  const { entry } = probe();
  const manifest = entry.manifest;
  /** @type {import('./parse.js').RoleProposal} */
  const move = { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2, z: 0 } };
  assert.equal(readRoleOutput('Here is my answer: ' + JSON.stringify({ proposal: move }), manifest).verdict, 'not-json', 'no JSON is dug out of prose');
  assert.equal(readRoleOutput('[' + JSON.stringify({ proposal: move }) + ']', manifest).verdict, 'not-json');
  /**
   * @param {unknown} output
   */
  const why = (output) => {
    const read = readRoleOutput(JSON.stringify(output), manifest);
    return read.verdict + (read.verdict === 'ok' ? '' : ': ' + read.reason);
  };
  assert.equal(why({ proposal: move, verdict: 'pass' }), 'wrong-shape: unknown field: verdict');
  assert.equal(why({ proposal: { ...move, frameHash: 'f0fa75010a65e41b' } }), 'wrong-shape: unknown field: frameHash');
  assert.equal(why({ proposal: { ...move, label: 'authored' } }), 'wrong-shape: unknown field: label');
  assert.equal(why({ proposal: { ...move, target: { x: 2, y: 1, z: 0 } } }), 'wrong-shape: an intent is a verb, an actor, and a target of { x, z }, { body }, or { zone }');
  assert.equal(why({ proposal: { kind: 'body', id: 'ghost', x: 2, y: 1, z: 0, hx: 0.2, hy: 0.2, hz: 0.2 } }), 'class-not-allowed: role probe does not propose body');
  assert.equal(why({ proposal: { kind: 'belief', mind: 'walker', subject: { body: 'crate' }, key: 'at', value: 'door', confidence: 1, source: 'e1' } }), 'class-not-allowed: role probe does not propose belief');
  const believer = { ...manifest, outputs: { classes: /** @type {Array<'intent' | 'belief'>} */ (['belief']), verbs: [], actors: /** @type {const} */ ('own-body') } };
  const belief = { kind: 'belief', mind: 'walker', subject: { body: 'crate' }, key: 'at', value: 'door', confidence: 1, source: 'e1' };
  assert.equal(readRoleOutput(JSON.stringify({ proposal: belief }), believer).verdict, 'ok');
  assert.equal(readRoleOutput(JSON.stringify({ proposal: { ...belief, label: 'observed' } }), believer).verdict, 'wrong-shape', 'a model cannot set a label');
  assert.deepEqual(stampProposal(move, { tick: 4, hash: 'abcd' }), { ...move, frameHash: 'abcd' }, 'the seat stamps the frame the proposal was built from');
});

test('the schema is the manifest\'s: notes before the proposal and bounded, enums from the catalog and the world, and no label on a belief', () => {
  const { entry } = probe();
  const context = { verbs: ['move', 'push'], actors: ['walker', 'crate'], bodies: ['walker', 'crate'], zones: ['door'], minds: ['walker'], keys: ['at'], sources: ['e1'] };
  const schema = /** @type {any} */ (buildSchema(entry.manifest, context));
  assert.deepEqual(Object.keys(schema.properties), ['notes', 'proposal']);
  assert.deepEqual(schema.required, ['notes', 'proposal'], 'required, so the grammar writes the free span first');
  assert.equal(schema.properties.notes.maxLength, 400);
  assert.equal(schema.additionalProperties, false);
  const intent = schema.properties.proposal;
  assert.equal(intent.properties.kind.const, 'intent', 'the probe makes intents only');
  assert.deepEqual(intent.properties.verb.enum, ['move', 'push']);
  assert.deepEqual(intent.properties.actor.enum, ['walker', 'crate']);
  assert.equal(intent.properties.frameHash, undefined, 'the model does not name the frame');
  const both = /** @type {any} */ (roleProposalSchema({ ...entry.manifest, outputs: { classes: ['intent', 'belief'], verbs: 'catalog', actors: 'own-body' } }, context));
  const belief = both.properties.proposal.oneOf.find((/** @type {any} */ branch) => branch.properties.kind.const === 'belief');
  assert.ok(belief);
  assert.deepEqual(Object.keys(belief.properties).sort(), ['confidence', 'key', 'kind', 'mind', 'source', 'subject', 'supersedes', 'value', 'withdrawnBy']);
  assert.equal(belief.properties.label, undefined, 'a belief has no label field');
  assert.equal(roleProposalSchema(entry.manifest, { ...context, verbs: [] }), null, 'nothing to propose, no schema');
  const silent = /** @type {any} */ (roleProposalSchema({ ...entry.manifest, budget: { ...entry.manifest.budget, freeSpanChars: 0 } }, context));
  assert.deepEqual(Object.keys(silent.properties), ['proposal'], 'no free span when the bound is 0');
  assert.throws(() => buildSchema({ ...entry.manifest, schema: 'free-text' }, context), /no schema builder named free-text/);
});

// ---------------------------------------------------------------------------
// Sessions (pins 6, 8, and 10).

test('a session records every call, admits late proposals with provenance, and verifies without a model', async () => {
  /** @type {ChatRequest[]} */
  const requests = [];
  const { result, tick, dir, entry } = await probeSession({
    calls: 3,
    client: fakeClient([
      JSON.stringify({ notes: 'toward the door', proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2, z: 0 } } }),
      'the model wandered off',
      JSON.stringify({ notes: '', proposal: { kind: 'intent', verb: 'move', actor: 'crate', target: { x: 2.4, z: 1 } } }),
    ], (request) => void requests.push(request)),
  });
  assert.equal(result.records.length, 3, 'every call is recorded, the unreadable one too');
  assert.deepEqual(result.calls.map((line) => line.read), ['ok', 'not-json', 'ok']);
  const first = result.calls[0];
  assert.equal(first.admitted, true, String(first.reason));
  assert.equal(first.at, first.builtAt.tick + 8, 'admitted the session\'s lateQuanta after the frame it was built from');
  const log = tick.log();
  assert.ok(log.length >= 1);
  const provenance = log[0].provenance;
  assert.ok(provenance);
  assert.equal(provenance && provenance.record, first.record);
  assert.equal(provenance && provenance.manifest, entry.hash);
  assert.deepEqual(provenance && provenance.builtAt, first.builtAt);
  assert.match(requests[1].messages[0].content, /Call 1 proposed \{"kind":"intent","verb":"move","actor":"walker","target":\{"x":2,"z":0\}\}, and the checker admitted it at tick 8\./, 'each call is told what the last did');
  assert.match(requests[2].messages[0].content, /Call 2: the reply could not be read \(not-json: the output is not one JSON object\)\./);
  for (const request of requests) {
    assert.equal(request.options.num_predict, entry.manifest.budget.outputTokens, 'outputTokens is num_predict');
    assert.equal(request.options.temperature, 0);
    assert.equal(request.options.seed, 1);
    assert.equal(request.stream, false);
  }
  const verified = verifySession(dir);
  assert.deepEqual(verified.failures, []);
  assert.equal(verified.records, 3);
});

test('the tick advances while a slow call is outstanding, and the proposal is checked when it arrives', async () => {
  /** @type {ReturnType<typeof createTick> | null} */
  let held = null;
  /** @type {number[]} */
  const asked = [];
  const reply = fakeClient([JSON.stringify({ notes: '', proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2, z: 0 } } })]);
  const { result } = await probeSession({
    calls: 1,
    lateQuanta: 20,
    onTick: (tick) => {
      held = tick;
    },
    client: {
      observe: reply.observe,
      ask: (request, signal) => {
        const tick = /** @type {ReturnType<typeof createTick>} */ (/** @type {unknown} */ (held));
        const start = tick.frame().tick;
        asked.push(start);
        // The reply comes only once the tick has run on 20 quanta: a seat that
        // waited on the model before stepping the tick would never get it.
        return new Promise((resolve) => {
          const poll = () => {
            if (tick.frame().tick >= start + 20) {
              resolve(reply.ask(request, signal));
            } else {
              setImmediate(poll);
            }
          };
          poll();
        });
      },
    },
  });
  assert.deepEqual(asked, [0]);
  assert.equal(result.calls[0].admitted, true, String(result.calls[0].reason));
  assert.equal(result.calls[0].builtAt.tick, 0);
  assert.equal(result.calls[0].at, 20);
});

test('a session whose last call is refused verifies: its frames start at tick 0, and replay steps on past its last admission to its end', async () => {
  const { result, dir } = await probeSession({
    calls: 2,
    client: fakeClient([
      JSON.stringify({ notes: '', proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2, z: 0 } } }),
      JSON.stringify({ notes: '', proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 50, z: 0 } } }),
    ]),
  });
  assert.deepEqual(result.calls.map((line) => [line.admitted, line.at]), [[true, 8], [false, null]]);
  assert.match(String(result.calls[1].reason), /^target is beyond move range \d+$/);
  const session = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
  assert.equal(session.log.length, 1);
  assert.equal(session.frames.length - 1, session.end.tick, 'the frames start at tick 0, which attach draws');
  assert.equal(session.end.tick, result.calls[1].builtAt.tick + 8, 'the session stepped on while the refused call was out');
  assert.ok(session.end.tick > session.log[0].tick + 8, 'its end is past its only admission');
  assert.deepEqual(verifySession(dir).failures, []);
});

test('the seat keeps its call budgets: callsPerSession, outputTokens, and secondsPerCall', async () => {
  let asks = 0;
  const move = JSON.stringify({ notes: '', proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 1.2, z: 0 } } });
  const counted = fakeClient([move, move, move, move, move]);
  const over = await probeSession({
    calls: 5,
    client: {
      observe: counted.observe,
      ask: (request, signal) => {
        asks = asks + 1;
        return counted.ask(request, signal);
      },
    },
  });
  assert.equal(asks, 3, 'the probe allows 3 calls a session, and a fourth is never made');
  assert.equal(over.result.records.length, 3);
  assert.match(String(over.result.refused), /the session asks for 5 calls, and role probe allows 3 a session/);
  /** @type {number[]} */
  const waited = [];
  const slow = await probeSession({
    calls: 1,
    client: { observe: counted.observe, ask: () => new Promise(() => {}) },
    timer: (ms) => {
      waited.push(ms);
      return Promise.resolve();
    },
  });
  assert.deepEqual(waited, [120000], 'secondsPerCall is the call\'s timeout');
  assert.equal(slow.result.calls[0].read, 'timed-out');
  assert.equal(slow.result.records[0].output, null);
  assert.equal(slow.result.records[0].timing.timedOut, true);
  assert.equal(slow.tick.log().length, 0, 'a call that timed out proposes nothing');
});

test('a call that never returns is cut off at the seat\'s one deadline and recorded from what was read before it, and it verifies; a call that returned over its budget does not', async () => {
  const move = JSON.stringify({ notes: '', proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 1.2, z: 0 } } });
  const reads = fakeClient([]);
  /** @type {AbortSignal[]} */
  const signals = [];
  /** @type {number[]} */
  const waited = [];
  const silent = await probeSession({
    calls: 1,
    client: {
      observe: reads.observe,
      ask: (_request, signal) => {
        signals.push(signal);
        return new Promise(() => {});
      },
    },
    timer: (ms) => {
      waited.push(ms);
      return Promise.resolve();
    },
  });
  const pin = /** @type {NonNullable<RoleEntry['manifest']['model']>} */ (silent.entry.manifest.model).digest;
  const cut = silent.result.records[0];
  const key = silent.result.calls[0].record;
  assert.deepEqual(waited, [120000], 'secondsPerCall is the one deadline');
  assert.equal(signals.length === 1 && signals[0].aborted, true, 'the seat aborts the call it cut off');
  assert.deepEqual({ model: cut.model, server: cut.server, gpu: cut.gpu }, observed('qwen2.5:7b', pin), 'what was read before the call, never a placeholder');
  assert.equal(cut.output, null);
  assert.equal(cut.outputSha256, null);
  assert.deepEqual(cut.timing, cutOffTiming(120000), 'no output, and the budget as its time');
  assert.equal(silent.result.calls[0].read, 'timed-out');
  assert.deepEqual(verifySession(silent.dir).failures, [], 'a call the seat cut off at its budget verifies');

  // A reply that comes back only after the budget is not taken, and its
  // record is the same bytes as that of a call that never returned.
  const late = await probeSession({
    calls: 1,
    client: { observe: reads.observe, ask: async () => replied(move, 120001) },
  });
  assert.equal(JSON.stringify(late.result.records[0]), JSON.stringify(cut), 'the same record whichever clock would have fired first');
  assert.equal(late.tick.log().length, 0, 'nothing is admitted from a reply past the deadline');
  assert.deepEqual(verifySession(late.dir).failures, []);

  // Planted in the session: a call that returned over its budget still
  // fails, and so does a cut-off record out of its one form.
  const file = join(silent.dir, 'records', key + '.json');
  /** @param {object} record */
  const plant = (record) => {
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    return verifySession(silent.dir).failures;
  };
  assert.deepEqual(plant({ ...cut, output: move, outputSha256: sha256(move), timing: replied(move, 120001).timing }), ['record ' + key + ': took 120001 ms, over the budget of 120 s']);
  assert.deepEqual(plant({ ...cut, timing: { ...cut.timing, ms: 120001 } }), ['record ' + key + ': a call cut off at its budget is recorded at the budget of 120000 ms, with nothing the server reported']);
  assert.deepEqual(plant({ ...cut, timing: { ...cut.timing, evalCount: 3 } }), ['record ' + key + ': a call cut off at its budget is recorded at the budget of 120000 ms, with nothing the server reported']);
  assert.deepEqual(plant({ ...cut, output: move, outputSha256: sha256(move) }), ['record ' + key + ': a call cut off at its budget holds no output, and this one holds one']);
  assert.deepEqual(plant(cut), [], 'the record as the seat wrote it verifies again');
});

test('a scratch world is built only from files under fixtures/ or worlds/, or the product scene', async () => {
  for (const spec of ['worlds/crate-and-door.json', 'fixtures/behavior-minds.json', 'product']) {
    const built = await scratchWorld(spec, root);
    assert.equal(built.ok, true, spec + ': ' + (built.ok ? '' : built.reason));
  }
  const refused = [
    'site/src/content/docs/index.json',
    'predicates/intents/move.json',
    '../worlds/crate-and-door.json',
    'worlds/../predicates/intents/move.json',
    './worlds/crate-and-door.json',
    'worlds\\crate-and-door.json',
    'D:/saves/slot-1.json',
    join(root, 'worlds', 'crate-and-door.json'),
    'fixtures/golden.txt',
    'worlds',
    'a player typed this',
  ];
  for (const spec of refused) {
    const built = await scratchWorld(spec, root);
    assert.equal(built.ok, false, spec);
    assert.match(built.ok ? '' : built.reason, /a scratch world is built only from a file under fixtures\/ or worlds\/, or the product scene/, spec);
  }
  const index = await scratchWorld('worlds/index.json', root);
  assert.match(index.ok ? '' : index.reason, /holds no world/);
});

test('the npc-mind prompt is built from typed state alone: the same state gives the same bytes', () => {
  const template = readFileSync('predicates/roles/npc-mind.txt', 'utf8');
  /** @param {number} steps */
  const stateAfter = (steps) => {
    const rules = loadIntentRules();
    const world = createWorld({
      name: 'pair',
      bodies: [
        { id: 'watcher', x: 0, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
        { id: 'walker', x: 1, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      ],
      colliders: [{ id: 'floor', minX: -2, maxX: 4, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }],
      zones: [{ id: 'east', minX: -2, maxX: 4, minY: -1, maxY: 3, minZ: -2, maxZ: 2 }],
      minds: [{ body: 'watcher', sight: 5, goals: [{ kind: 'reach', zone: 'east' }], beliefs: [] }],
    }, 'reference');
    const memory = createMemory();
    const tick = createTick({ seed: 3, world, rules: rules.rules, memory });
    for (let i = 0; i < steps; i = i + 1) {
      tick.advance();
    }
    return npcMindState(world, memory, 'watcher');
  };
  const once = npcMindPrompt(template, stateAfter(2));
  assert.equal(npcMindPrompt(template, stateAfter(2)), once, 'the same history gives the same bytes');
  assert.equal(npcMindPrompt(template, JSON.parse(JSON.stringify(stateAfter(2)))), once, 'typed state carried as data gives the same bytes');
  assert.equal(npcMindPrompt(template, stateAfter(9)), once, 'more quanta with nothing new seen is the same state, and the same bytes');
  assert.match(once, /^You are watcher, a character/);
  assert.match(once, /body:walker at east, confidence 1, observed\./);
  assert.match(once, /- reach east, done\./);
  assert.throws(() => npcMindPrompt(template, /** @type {any} */ ({ ...stateAfter(2), transcript: ['you said', 'I said'] })), /built from typed state alone, and transcript is not part of it/);
  assert.throws(() => renderTemplate(template, { body: 'watcher', beliefs: '', goals: '' }), /the template names \{\{sight\}\}, and no field fills it/);
  assert.throws(() => renderTemplate(template, { body: 'watcher', beliefs: '', goals: '', sight: '', player: 'hello' }), /field player fills no slot/, 'no text the template does not name');
});

test('a belief formed from player text is read back as hearsay when a later call\'s prompt is built', () => {
  const { entry } = probe();
  const hearer = {
    ...entry.manifest,
    role: 'hearer',
    world: 'live',
    inputs: [{ name: 'player', source: 'player-text' }, { name: 'sight', source: 'frame-in-sight' }],
    outputs: { classes: ['belief'], verbs: [], actors: 'own-body' },
  };
  const made = catalogOf([hearer]);
  assert.ok(made.ok);
  if (!made.ok) {
    return;
  }
  const role = /** @type {RoleEntry} */ (made.catalog.byName.get('hearer'));
  const rules = loadIntentRules();
  const world = createWorld({
    name: 'pair',
    bodies: [
      { id: 'watcher', x: 0, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'walker', x: 1, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
    ],
    colliders: [{ id: 'floor', minX: -2, maxX: 4, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }],
    zones: [{ id: 'west', minX: -2, maxX: 0.5, minY: -1, maxY: 3, minZ: -2, maxZ: 2 }, { id: 'east', minX: 0.5, maxX: 4, minY: -1, maxY: 3, minZ: -2, maxZ: 2 }],
    minds: [{ body: 'watcher', sight: 5, goals: [], beliefs: [] }],
  }, 'reference');
  const memory = createMemory();
  const tick = createTick({ seed: FIXTURE_SEED, world, rules: rules.rules, retired: rules.retired, memory, roles: made.catalog });
  tick.advance();
  const built = tick.frame();
  const hex = 'a'.repeat(64);
  const provenance = { role: 'hearer', instance: 'watcher', manifest: role.hash, model: /** @type {NonNullable<typeof entry.manifest.model>} */ (entry.manifest.model).digest, prompt: hex, schema: hex, record: hex, output: hex, builtAt: { tick: built.tick, hash: built.hash }, inputs: role.derived.inputs.map((input) => ({ ...input })) };
  const heard = submitAsRole(tick, { kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'at', value: 'west', confidence: 0.5, source: 'e1' }, provenance);
  assert.ok(heard.admitted, JSON.stringify(heard));
  settle(tick);
  const state = npcMindState(world, memory, 'watcher');
  const read = state.beliefs.find((item) => item.value === 'west');
  assert.deepEqual(read && [read.label, read.heard], ['hearsay', 'player-text'], 'the typed state a later call is built from keeps the label');
  const template = readFileSync('predicates/roles/npc-mind.txt', 'utf8');
  assert.match(npcMindPrompt(template, state), /- body:walker at west, confidence 0\.5, hearsay from player-text\./);
});

// ---------------------------------------------------------------------------
// The command (pin 11).

/** A module that fails the run if anything asks a model. */
function noModel() {
  const dir = mkdtempSync(join(tmpdir(), 'no-model-'));
  const file = join(dir, 'no-model.mjs');
  writeFileSync(file, 'globalThis.fetch = () => { process.stderr.write("a model was called\\n"); process.exit(9); };\n');
  return pathToFileURL(file).href;
}

test('propose lists the roles, their status, and their derived properties', () => {
  const listed = spawnSync(process.execPath, ['--import', noModel(), 'packages/propose/bin/propose.js'], { encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(listed.stdout.trim().split('\n'), [
    'test-instrument frozen scratch properties A C label untrusted decided by the Director on 2026-09-25',
    'npc-mind frozen live properties A C label hearsay no decision recorded',
  ]);
  const tests = spawnSync(process.execPath, ['--import', noModel(), 'packages/propose/bin/propose.js', '--catalog', 'fixtures/roles'], { encoding: 'utf8' });
  assert.equal(tests.stdout.trim(), 'probe thawed scratch properties A C label untrusted decided by the coordinator on 2026-09-25');
});

test('propose --role refuses a frozen role, and a live one, with exit 2 before any model call', () => {
  const hook = noModel();
  for (const role of ['test-instrument', 'npc-mind']) {
    const run = spawnSync(process.execPath, ['--import', hook, 'packages/propose/bin/propose.js', '--role', role, '--spec', 'fixtures/sessions/probe-fixture/spec.json'], { encoding: 'utf8' });
    assert.equal(run.status, 2, run.stderr);
    assert.equal(run.stderr.trim(), 'refusing to run: role ' + role + ' is frozen');
  }
  const dir = mkdtempSync(join(tmpdir(), 'live-roles-'));
  cpSync('predicates/roles', dir, { recursive: true });
  const npc = JSON.parse(readFileSync(join(dir, 'npc-mind.json'), 'utf8'));
  const live = { ...npc, status: 'thawed', decision: { by: 'the coordinator', on: '2026-09-25' }, adversarialRun: 'fixtures/sessions/probe-steer', model: probe().entry.manifest.model };
  writeFileSync(join(dir, 'npc-mind.json'), JSON.stringify(live));
  assert.equal(templateHash(readFileSync(join(dir, 'npc-mind.txt'), 'utf8')), live.prompt.sha256);
  const run = spawnSync(process.execPath, ['--import', hook, 'packages/propose/bin/propose.js', '--role', 'npc-mind', '--catalog', dir, '--spec', 'fixtures/sessions/probe-fixture/spec.json'], { encoding: 'utf8' });
  assert.equal(run.status, 2, run.stderr);
  assert.equal(run.stderr.trim(), 'refusing to run: role npc-mind acts in a live world, and the seat runs only scratch sessions');
  const none = spawnSync(process.execPath, ['--import', hook, 'packages/propose/bin/propose.js', '--role', 'nobody'], { encoding: 'utf8' });
  assert.equal(none.status, 2);
  assert.match(none.stderr, /holds no role named nobody/);
});

test('a thawed scratch role the loader admits and the seat cannot render is refused with its reason, before any call and before the model\'s client loads', async () => {
  const { entry } = probe();
  /**
   * The probe with other inputs and its own body as actor, as the loader
   * admits it, with the probe's template in hand.
   * @param {Array<{ name: string, source: import('../frame/types.js').RoleSource }>} inputs
   * @returns {RoleEntry}
   */
  const shaped = (inputs) => {
    const made = catalogOf([{ ...entry.manifest, inputs, outputs: { ...entry.manifest.outputs, actors: 'own-body' } }]);
    assert.ok(made.ok, made.ok ? '' : made.reason);
    const loaded = /** @type {RoleEntry} */ (made.ok ? made.catalog.byName.get('probe') : undefined);
    return { ...loaded, template: entry.template };
  };
  let reads = 0;
  let asks = 0;
  /** @type {Client} */
  const client = {
    observe: async (name, pin) => {
      reads = reads + 1;
      return observed(name, pin);
    },
    ask: async () => {
      asks = asks + 1;
      return replied(null);
    },
  };
  /** @type {Array<[Array<{ name: string, source: import('../frame/types.js').RoleSource }>, string]>} */
  const cases = [
    [[...entry.manifest.inputs, { name: 'own', source: 'mind' }], 'role probe reads mind as its input own, and the seat renders no mind in a scratch session'],
    [[...entry.manifest.inputs, { name: 'sight', source: 'frame-in-sight' }], 'role probe reads frame-in-sight as its input sight, and the seat renders no frame-in-sight in a scratch session'],
    [entry.manifest.inputs.map((input) => (input.name === 'feedback' ? { name: 'results', source: input.source } : input)), 'role probe\'s input results fills no slot in its template'],
    [entry.manifest.inputs.filter((input) => input.name !== 'feedback'), 'role probe\'s template names {{feedback}}, and no input fills it'],
  ];
  for (const [inputs, why] of cases) {
    const role = shaped(inputs);
    assert.equal(sessionRefusal(role), why);
    const { result } = await probeSession({ calls: 3, client, entry: role });
    assert.deepEqual(result, { records: [], calls: [], refused: why }, 'refused as a session, not thrown');
  }
  assert.equal(reads + asks, 0, 'nothing was read from the server and no call was made');
  assert.equal(sessionRefusal(entry), null, 'the probe as the catalog holds it runs');

  const dir = mkdtempSync(join(tmpdir(), 'mind-roles-'));
  cpSync('fixtures/roles', dir, { recursive: true });
  const probeFile = JSON.parse(readFileSync(join(dir, 'probe.json'), 'utf8'));
  writeFileSync(join(dir, 'probe.json'), JSON.stringify({ ...probeFile, inputs: [...probeFile.inputs, { name: 'own', source: 'mind' }], outputs: { ...probeFile.outputs, actors: 'own-body' } }));
  const run = spawnSync(process.execPath, ['--import', noModel(), 'packages/propose/bin/propose.js', '--role', 'probe', '--catalog', dir, '--spec', 'fixtures/sessions/probe-fixture/spec.json'], { encoding: 'utf8' });
  assert.equal(run.status, 2, run.stderr);
  assert.equal(run.stderr.trim(), 'refusing to run: role probe reads mind as its input own, and the seat renders no mind in a scratch session');
});

test('the drift report says whether a reissued output is the same bytes and the same proposal', () => {
  const { entry } = probe();
  const move = { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2, z: 0 } };
  const recorded = JSON.stringify({ notes: 'toward the door', proposal: move });
  const record = /** @type {import('./record.js').CallRecord} */ (/** @type {unknown} */ ({ call: 0, output: recorded }));
  assert.deepEqual(driftOf('k', record, recorded, entry.manifest), { record: 'k', call: 0, same: true, firstDifference: null, recordedLength: recorded.length, freshLength: recorded.length, sameProposal: true });
  const reworded = JSON.stringify({ notes: 'toward the exit', proposal: move });
  const drift = driftOf('k', record, reworded, entry.manifest);
  assert.equal(drift.same, false);
  assert.equal(drift.firstDifference, recorded.indexOf('door'));
  assert.equal(drift.sameProposal, true, 'the notes moved, the proposal did not');
  const elsewhere = JSON.stringify({ notes: 'toward the door', proposal: { ...move, target: { x: 3, z: 0 } } });
  assert.equal(driftOf('k', record, elsewhere, entry.manifest).sameProposal, false);
  assert.equal(driftOf('k', record, null, entry.manifest).same, false, 'no output is drift');
  assert.equal(manifestHash(entry.manifest), entry.hash);
  assert.ok(catalogOf([entry.manifest]).ok);
});
