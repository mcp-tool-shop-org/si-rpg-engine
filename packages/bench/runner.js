// The bench's runner (T7b pin 2): the code each process runs, one process per
// tree. The orchestrator pipes this file's text to `node --input-type=module -`
// with the tree's root as the working directory, and talks to it over the IPC
// channel, one message at a time. It imports nothing but Node's own modules;
// the tree's packages it imports by absolute paths into the tree, and a
// resolve hook refuses any module that lies outside the tree or under a
// node_modules directory, so no process loads two trees' modules or anything
// the engine does not ship. A process never changes its working directory,
// and every message checks that it has not.
//
// What a process does:
//   - init: binds it to one tree and one build (the product binary, the
//     coverage build, a mutant's), starts V8's precise block coverage when it
//     measures reach, imports the tree's modules, and reports the load window:
//     each process's coverage of its own module loading, before any candidate.
//   - candidate: one candidate's run, the whole of it, from the load through
//     the witness to the intent and on until the world settles, each intent
//     citing this tree's own newest frame; the window around its intent and the
//     quanta after it; its rung-3 failures; and rung 0, a second run from the
//     load with a save and a restore at its midpoint, in a window of its own.
//   - control: a play, product, or log bundle's run, whose window is the run.
//   - suite: the hazard suite, each hazard in a window of its own.
//   - sweep, grammar: the proposers, in the sweep's process on the head.
// Each tick's trace line is built from the tick's committed frame, never from
// the live bodies after a submission, and a check holds each line to its
// frame. A process holds one live world at a time: a run begins only when the
// last has finished or been restored. The first time a process reaches a
// witness's state it stores that prefix's trace and a save of the state, and a
// later candidate from the same witness may restore it and prepend the prefix,
// so the trace it reports always runs from the load. A save carries the tag of
// the process that took it, and a save with any other tag is refused before
// any restore is attempted.

import { Session } from 'node:inspector';
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The quanta a world has to settle in after an action ends, the load hazard's (T6). */
const SETTLE_QUANTA = 512;
/** Speed and spin at rest, the load hazard's. */
const AT_REST = 1e-2;
/** The most witness saves a process keeps; the oldest used goes first. */
const SAVE_CAP = 48;
/**
 * The most quanta a run may take past its last intent before it is stopped
 * as a world that does not settle: an action lasts at most a rule's
 * maxQuanta (256 in every rule today) and settling 512 more, so a run past
 * this has an action that never ends or a tick that does not count.
 */
const RUNAWAY = 4096;

/**
 * @typedef {{ tick: number, proposal: any }} Entry
 * @typedef {{ kind: 'throws' | 'leaves' | 'unsettled', tick: number, detail: string, body: string | null }} Failure
 * @typedef {{ index: number, tick: number, admitted: boolean, reason: string }} Admission
 * @typedef {{ counts: number[][], counters: { index: Uint32Array, value: Float64Array } | null, quanta: number, threw: boolean }} Window
 * @typedef {{ process: string, tree: string, build: string }} Tag
 * @typedef {{
 *   processId: string, tree: string, build: string, coverage: boolean,
 *   redirect: { from: string, to: string } | null,
 *   counters: { addr: number, size: number } | null,
 *   probes: Array<{ file: string, offsets: number[] }>,
 *   modules: string[],
 *   plant: Record<string, unknown>
 * }} Config
 */

/** @type {Config | null} */
let config = null;
/** @type {Session | null} */
let session = null;
/** @type {Record<string, any>} */
const mods = {};
/** @type {string[]} */
const loadedModules = [];
/** @type {string[]} */
const refusedModules = [];
/** @type {Map<string, any>} */
const saves = new Map();
/** @type {string | null} */
let live = null;
/** @type {{ lines: string[], restored: string[] | null } | null} */
let last = null;
/** @type {any} */
let grammar = null;

/** A refusal: the bench stops with its reason, and never guesses. */
class Refusal extends Error {}

/**
 * @param {string} a
 * @param {string} b
 */
function samePath(a, b) {
  const x = resolve(a);
  const y = resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/**
 * @param {string} tree
 * @param {string} path
 */
function inside(tree, path) {
  const root = process.platform === 'win32' ? resolve(tree).toLowerCase() : resolve(tree);
  const at = process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  return at === root || at.startsWith(root.endsWith(sep) ? root : root + sep);
}

function cfg() {
  if (!config) {
    throw new Refusal('the process has no tree: init first');
  }
  return config;
}

/** Refuses when the working directory is not the tree's root. */
function checkCwd() {
  const c = cfg();
  if (!samePath(process.cwd(), c.tree)) {
    throw new Refusal('the working directory ' + process.cwd() + ' is not this process\'s tree ' + c.tree + ': a process never switches trees, and never by its working directory');
  }
}

/**
 * Begins a run: refused while another is live.
 * @param {string} name
 */
function begin(name) {
  if (live !== null) {
    throw new Refusal('a run is live in this process (' + live + '); ' + name + ' may begin only when it has finished or been restored: one live world at a time');
  }
  live = name;
}

function end() {
  live = null;
}

// ---------------------------------------------------------------------------
// Coverage.

/** @returns {any} */
function take() {
  /** @type {any} */
  let result = null;
  /** @type {any} */
  let failed = null;
  /** @type {Session} */ (session).post('Profiler.takePreciseCoverage', (error, value) => {
    failed = error;
    result = value;
  });
  if (failed) {
    throw failed;
  }
  return result;
}

/**
 * V8's count at each probe offset: the count of the innermost range around it.
 * @param {any} coverage
 * @returns {number[][]}
 */
function probeCounts(coverage) {
  const c = cfg();
  /** @type {Map<string, Array<{ startOffset: number, endOffset: number, count: number }>>} */
  const byUrl = new Map();
  for (const script of coverage.result) {
    byUrl.set(script.url, script.functions.flatMap((/** @type {any} */ fn) => fn.ranges));
  }
  return c.probes.map((probe) => {
    const ranges = byUrl.get(pathToFileURL(resolve(c.tree, probe.file)).href) || [];
    return probe.offsets.map((offset) => {
      /** @type {{ startOffset: number, endOffset: number, count: number } | null} */
      let best = null;
      for (const r of ranges) {
        if (r.startOffset <= offset && offset < r.endOffset && (best === null || r.endOffset - r.startOffset < best.endOffset - best.startOffset)) {
          best = r;
        }
      }
      return best === null ? 0 : best.count;
    });
  });
}

/** The solver instance's memory, the one every call now uses. */
function memory() {
  return mods.glue.instantiate().exports.memory;
}

function zeroCounters() {
  const c = cfg();
  if (c.counters) {
    new Uint8Array(memory().buffer, c.counters.addr, c.counters.size).fill(0);
  }
}

/** The counters that are not zero, by index. */
function readCounters() {
  const c = cfg();
  if (!c.counters) {
    return null;
  }
  const words = new BigUint64Array(memory().buffer, c.counters.addr, c.counters.size / 8);
  /** @type {number[]} */
  const index = [];
  /** @type {number[]} */
  const value = [];
  for (let i = 0; i < words.length; i = i + 1) {
    if (words[i] !== 0n) {
      index.push(i);
      value.push(Number(words[i]));
    }
  }
  return { index: Uint32Array.from(index), value: Float64Array.from(value) };
}

/** Opens a window: the V8 delta and the law's counters start here. */
function openWindow() {
  if (session) {
    take();
  }
  zeroCounters();
}

/**
 * Closes a window: its V8 counts at every probe, the law's counters, the
 * quanta it ran, and whether its last quantum threw, which may stop before
 * the step or after it.
 * @param {number} quanta
 * @param {boolean} [threw]
 * @returns {Window}
 */
function closeWindow(quanta, threw) {
  return { counts: session ? probeCounts(take()) : [], counters: readCounters(), quanta, threw: Boolean(threw) };
}

// ---------------------------------------------------------------------------
// The trace.

/**
 * @param {string} line
 */
function digest(line) {
  return createHash('sha1').update(line).digest('hex').slice(0, 20);
}

/**
 * A tick's trace line from its committed frame: the frame's bodies, and the
 * world's zones, links, snapshot, and minds, which nothing after the commit
 * changes.
 * @param {any} tick
 * @param {any} world
 * @param {any} memoryOfRun
 */
function frameLine(tick, world, memoryOfRun) {
  const frame = tick.frame();
  const view = { ...world, bodies: frame.bodies };
  return mods.traceLine.traceLine(frame.tick, frame.hash, view, memoryOfRun);
}

/**
 * The check on every line: its bodies' fields are the committed frame's.
 * @param {string} line
 * @param {any} frame
 */
function checkLine(line, frame) {
  const parts = line.split(' ');
  let i = 2;
  for (const body of frame.bodies) {
    if (parts[i] !== 'body' || parts[i + 1] !== body.id) {
      throw new Refusal('the trace line at tick ' + frame.tick + ' does not name the committed frame\'s body ' + body.id);
    }
    for (let f = 0; f < 13; f = f + 1) {
      const field = mods.traceLine.FIELDS[f];
      if (parts[i + 2 + f] !== mods.traceLine.bits(body[field])) {
        throw new Refusal('the trace line at tick ' + frame.tick + ' disagrees with the committed frame: body ' + body.id + ' field ' + field + ' is ' + parts[i + 2 + f] + ' in the line and ' + mods.traceLine.bits(body[field]) + ' in the frame');
      }
    }
    i = i + 17;
  }
}

// ---------------------------------------------------------------------------
// A log run: the tick, the world, and the entries submitted by tick.

/**
 * A fresh tick of the world, from the load.
 * @param {any} worldInit
 * @param {number} seed
 * @param {string} [law]
 * @param {boolean} [withRetired]
 */
function freshTick(worldInit, seed, law, withRetired) {
  if (!mods.catalog) {
    mods.catalog = mods.predicates.loadIntentRules();
  }
  const world = mods.world.createWorld(worldInit, law || 'product');
  const mem = mods.memory.createMemory();
  const tick = mods.tick.createRestorableTick({ seed, world, rules: mods.catalog.rules, retired: withRetired === false ? undefined : mods.catalog.retired, memory: mem });
  const floor = mods.admitWorld.worldFloor(world.colliders, world.heightfield);
  return { world, memory: mem, tick, floor };
}

/**
 * @param {any} run
 */
function allAsleep(run) {
  return run.world.bodies.every((/** @type {any} */ body) => run.world.carriedByOf(body.id) !== null || run.world.sleeping(body.id));
}

/**
 * @param {any} run
 */
function restless(run) {
  return run.world.bodies.filter((/** @type {any} */ body) => {
    if (run.world.carriedByOf(body.id) !== null || run.world.sleeping(body.id)) {
      return false;
    }
    return Math.hypot(body.vx, body.vy, body.vz) > AT_REST || Math.hypot(body.wx, body.wy, body.wz) > AT_REST;
  }).map((/** @type {any} */ body) => body.id);
}

/**
 * The state of a log run between two quanta.
 * @typedef {{
 *   world: any, memory: any, tick: any, floor: number, next: number,
 *   lines: string[], hashes: string[], admissions: Admission[],
 *   quanta: number, restores: number, failure: Failure | null, acted: boolean, settling: number
 * }} LogState
 */

/**
 * Submits every entry due at the current tick, each citing this tree's own
 * newest frame, and records its admission.
 * @param {LogState} s
 * @param {Entry[]} entries
 * @param {number} upTo submit entries with index below this only
 */
function submitDue(s, entries, upTo) {
  while (s.next < upTo && entries[s.next].tick === s.tick.frame().tick) {
    const entry = entries[s.next];
    const proposal = { ...entry.proposal, frameHash: s.tick.frame().hash };
    const result = s.tick.submit(proposal);
    s.admissions.push({ index: s.next, tick: entry.tick, admitted: result.admitted, reason: result.admitted ? '' : result.reason });
    s.acted = true;
    s.next = s.next + 1;
  }
}

/**
 * One quantum, its line, and the checks after it. False when the run stops.
 * @param {LogState} s
 */
function step(s) {
  try {
    s.tick.advance();
  } catch (error) {
    s.quanta = s.quanta + 1;
    const t = s.tick.frame().tick + 1;
    s.lines.push(t + ' NAN');
    s.hashes.push('NAN');
    s.failure = { kind: 'throws', tick: t, detail: 'the tick throws producing tick ' + t + ': ' + (error instanceof Error ? error.message : String(error)), body: null };
    return false;
  }
  s.quanta = s.quanta + 1;
  pushLine(s);
  for (const body of s.world.bodies) {
    if (body.y < s.floor) {
      s.failure = { kind: 'leaves', tick: s.tick.frame().tick, detail: body.id + ' leaves the world: its centre is at y ' + body.y + ', below the lowest collider minimum ' + s.floor + ', at tick ' + s.tick.frame().tick, body: body.id };
      return false;
    }
  }
  return true;
}

/**
 * The current tick's line, from its committed frame.
 * @param {LogState} s
 */
function pushLine(s) {
  const c = cfg();
  const line = c.plant.liveLine ? mods.traceLine.traceLine(s.tick.frame().tick, s.tick.frame().hash, s.world, s.memory) : frameLine(s.tick, s.world, s.memory);
  checkLine(line, s.tick.frame());
  s.lines.push(line);
  s.hashes.push(s.tick.frame().hash);
}

/**
 * Runs until every entry is submitted and nothing is scheduled, then, when
 * `settle` is set, until the world settles: every body asleep, or after
 * SETTLE_QUANTA quanta every body asleep or at rest. With `until` it runs to
 * that tick instead of settling.
 * @param {LogState} s
 * @param {Entry[]} entries
 * @param {{ settle: boolean, until?: number, liveAfterSubmit?: boolean }} how
 */
function runOut(s, entries, how) {
  const limit = s.tick.frame().tick + (entries.length > 0 ? Math.max(0, entries[entries.length - 1].tick - s.tick.frame().tick) : 0) + RUNAWAY;
  const start = s.quanta;
  for (;;) {
    if (s.failure) {
      return;
    }
    submitDue(s, entries, entries.length);
    if (runaway(s, entries, start, limit)) {
      return;
    }
    if (cfg().plant.liveLine && s.admissions.length > 0 && s.admissions[s.admissions.length - 1].tick === s.tick.frame().tick) {
      // The plant: the line rebuilt from the live bodies after the submission.
      s.lines[s.lines.length - 1] = mods.traceLine.traceLine(s.tick.frame().tick, s.tick.frame().hash, s.world, s.memory);
      checkLine(s.lines[s.lines.length - 1], s.tick.frame());
    }
    const pending = s.next < entries.length || !s.tick.idle();
    if (typeof how.until === 'number') {
      if (s.tick.frame().tick >= how.until) {
        return;
      }
    } else if (!pending) {
      break;
    }
    if (!step(s)) {
      return;
    }
  }
  if (!how.settle) {
    return;
  }
  for (let n = 0; ; n = n + 1) {
    if (allAsleep(s)) {
      return;
    }
    if (runaway(s, entries, start, limit)) {
      return;
    }
    if (n === SETTLE_QUANTA) {
      const moving = restless(s);
      if (moving.length > 0) {
        const body = s.world.body(moving[0]);
        s.failure = { kind: 'unsettled', tick: s.tick.frame().tick, detail: 'the world does not settle within ' + SETTLE_QUANTA + ' quanta after the action ends: ' + moving.join(', ') + ' still moving at tick ' + s.tick.frame().tick + ', ' + body.id + ' at speed ' + Math.hypot(body.vx, body.vy, body.vz).toFixed(3), body: moving[0] };
      }
      return;
    }
    if (!step(s)) {
      return;
    }
  }
}

/**
 * Stops a run that has passed an intent's tick without reaching it, or run
 * RUNAWAY quanta past what it was asked for: a tick that does not count one
 * quantum at a time, or an action that never ends. True when it stopped.
 * @param {LogState} s
 * @param {Entry[]} entries
 * @param {number} start the run's quanta when this stretch began
 * @param {number} limit
 */
function runaway(s, entries, start, limit) {
  const now = s.tick.frame().tick;
  if (s.next < entries.length && entries[s.next].tick < now) {
    s.failure = { kind: 'throws', tick: now, detail: 'the run passed tick ' + entries[s.next].tick + ' of intent ' + s.next + ' at tick ' + now + ' without submitting it: its tick does not count one quantum at a time', body: null };
    return true;
  }
  if (s.quanta - start > limit + RUNAWAY || now > limit) {
    s.failure = { kind: 'unsettled', tick: now, detail: 'the run did not end within ' + RUNAWAY + ' quanta after its last intent: an action does not end, or its tick does not count', body: null };
    return true;
  }
  return false;
}

/**
 * A new log run from the load.
 * @param {any} worldInit
 * @param {number} seed
 * @param {string} [law]
 * @param {boolean} [retired]
 * @returns {LogState}
 */
function fromLoad(worldInit, seed, law, retired) {
  const made = freshTick(worldInit, seed, law, retired);
  /** @type {LogState} */
  const s = { ...made, next: 0, lines: [], hashes: [], admissions: [], quanta: 0, restores: 0, failure: null, acted: false, settling: 0 };
  pushLine(s);
  return s;
}

/**
 * Advances a run to a tick, submitting what is due on the way; false when it
 * failed first.
 * @param {LogState} s
 * @param {Entry[]} entries
 * @param {number} upTo
 * @param {number} target
 */
function runTo(s, entries, upTo, target) {
  const start = s.quanta;
  for (;;) {
    submitDue(s, entries, upTo);
    if (s.tick.frame().tick >= target) {
      return true;
    }
    if (runaway(s, entries.slice(0, upTo), start, target)) {
      return false;
    }
    if (!step(s)) {
      return false;
    }
  }
}

/**
 * @param {Tag} tag
 */
function checkTag(tag) {
  const c = cfg();
  if (!tag || tag.process !== c.processId) {
    throw new Refusal('the save was taken in process ' + (tag ? tag.process + ' (tree ' + tag.tree + ', build ' + tag.build + ')' : 'unknown') + ', and this is process ' + c.processId + ' (tree ' + c.tree + ', build ' + c.build + '): a save is restored only in the process that took it, even when both run one binary file');
  }
}

/**
 * The state at a witness's end: restored from this process's own save when it
 * has one, else run from the load and saved.
 * @param {{ world: any, seed: number, law?: string, retired?: boolean, entries: Entry[], witness: number, witnessEnd: number, key: string | null }} spec
 * @returns {{ s: LogState, restored: boolean }}
 */
function reachWitness(spec) {
  const stored = spec.key !== null ? saves.get(spec.key) : undefined;
  if (stored) {
    checkTag(stored.tag);
    saves.delete(/** @type {string} */ (spec.key));
    saves.set(/** @type {string} */ (spec.key), stored);
    const made = freshTick(spec.world, spec.seed, spec.law, spec.retired);
    made.tick.restore(stored.save);
    /** @type {LogState} */
    const s = {
      ...made, next: stored.next, lines: stored.lines.slice(), hashes: stored.hashes.slice(), admissions: stored.admissions.map((/** @type {Admission} */ a) => ({ ...a })),
      quanta: 0, restores: 1, failure: null, acted: stored.acted, settling: 0,
    };
    return { s, restored: true };
  }
  const s = fromLoad(spec.world, spec.seed, spec.law, spec.retired);
  if (!runTo(s, spec.entries, spec.witness, spec.witnessEnd)) {
    return { s, restored: false };
  }
  submitDue(s, spec.entries, spec.witness);
  if (spec.key !== null && s.next === spec.witness) {
    saves.set(spec.key, {
      tag: { process: cfg().processId, tree: cfg().tree, build: cfg().build },
      save: s.tick.save(), next: s.next, lines: s.lines.slice(), hashes: s.hashes.slice(), admissions: s.admissions.map((a) => ({ ...a })), acted: s.acted,
    });
    while (saves.size > SAVE_CAP) {
      const oldest = saves.keys().next().value;
      saves.delete(/** @type {string} */ (oldest));
    }
  }
  return { s, restored: false };
}

/**
 * Rung 0's second run: from the load, with a save at the midpoint, run on to
 * the end, then the save restored and the second half run again. It must
 * trace as the first run did, and the restored half as the half it repeats.
 * @param {{ world: any, seed: number, law?: string, retired?: boolean, entries: Entry[], settle: boolean, until?: number }} spec
 * @param {string[]} first the first run's lines
 * @param {Failure | null} firstFailure
 */
function restoreCheck(spec, first, firstFailure) {
  const endTick = first.length - 1;
  const mid = Math.floor(endTick / 2);
  const s = fromLoad(spec.world, spec.seed, spec.law, spec.retired);
  let failed = !runTo(s, spec.entries, spec.entries.length, mid);
  /** @type {{ tick: any, next: number, lines: number } | null} */
  let saved = null;
  if (!failed) {
    submitDue(s, spec.entries, spec.entries.length);
    saved = { tick: s.tick.save(), next: s.next, lines: s.lines.length };
    runOut(s, spec.entries, { settle: spec.settle, until: spec.until });
  }
  const second = s.lines.slice();
  /** @type {string[] | null} */
  let restored = null;
  let restores = 0;
  if (saved) {
    s.tick.restore(saved.tick);
    restores = restores + 1;
    s.next = saved.next;
    s.lines = s.lines.slice(0, saved.lines);
    s.hashes = s.hashes.slice(0, saved.lines);
    s.failure = null;
    runOut(s, spec.entries, { settle: spec.settle, until: spec.until });
    restored = s.lines.slice();
  }
  const quanta = s.quanta;
  // The counters rewind with the image at the restore, and the second half
  // runs again, so a window around all of this counts one run from the load:
  // its quanta, the throwing one included when it threw.
  const oneRun = second.length - 1;
  /** @type {string | null} */
  let problem = null;
  const compare = mods.difference.compareLines;
  const endLine = mods.traceLine.endLine;
  if (failed && firstFailure === null) {
    problem = 'the second run from the load stopped at tick ' + (s.lines.length - 1) + ' before the midpoint ' + mid + ', and the first did not';
  } else {
    const twice = compare(first.concat([endLine(first.length)]), second.concat([endLine(second.length)]), 'first.trace', 'second.trace');
    if (twice !== 'identical\n') {
      problem = 'the candidate does not run twice to the same trace:\n' + twice;
    } else if (restored) {
      const again = compare(second.concat([endLine(second.length)]), restored.concat([endLine(restored.length)]), 'whole.trace', 'restored.trace');
      if (again !== 'identical\n') {
        problem = 'a save and restore at tick ' + mid + ' does not trace identically:\n' + again;
      }
    }
  }
  return { ok: problem === null, detail: problem, quanta, restores, mid, restored, oneRun, threw: second.length > 0 && second[second.length - 1].endsWith(' NAN') };
}

/**
 * One candidate on this tree.
 * @param {any} a
 */
function candidate(a) {
  begin('candidate ' + (a.name || ''));
  try {
    /** @type {Entry[]} */
    const entries = a.entries;
    const witness = a.witness;
    /** @type {{ s: LogState, restored: boolean }} */
    let reached;
    try {
      reached = reachWitness({ world: a.world, seed: a.seed, entries, witness, witnessEnd: a.witnessEnd, key: a.key });
    } catch (error) {
      if (error instanceof Refusal) {
        throw error;
      }
      // The load itself threw: this tree fails before the candidate acts.
      const failure = { kind: /** @type {'throws'} */ ('throws'), tick: 0, detail: 'the load throws: ' + (error instanceof Error ? error.message : String(error)), body: null };
      return {
        admissions: [], hashes: ['NAN'], digests: [digest('0 NAN')], end: 0, failure, failedBeforeActing: true, restoredWitness: false,
        window: null, rung0: null, restoreWindow: null, quanta: 0, restores: 0, witnessQuanta: 0,
      };
    }
    const s = reached.s;
    const witnessQuanta = s.quanta;
    /** @type {Window | null} */
    let win = null;
    /** @type {any} */
    let plantedSave = null;
    if (!s.failure) {
      if (a.window) {
        openWindow();
        if (cfg().plant.readAfterRestore) {
          plantedSave = s.tick.save();
        }
      }
      const q0 = s.quanta;
      runOut(s, entries, { settle: true });
      if (a.window) {
        if (plantedSave) {
          // The plant: the counters read after a restore the window does not account for.
          s.tick.restore(plantedSave);
        }
        const ended = /** @type {Failure | null} */ (s.failure);
        win = closeWindow(s.quanta - q0, Boolean(ended && ended.kind === 'throws'));
      }
    }
    const failedBeforeActing = s.failure !== null && !s.acted;
    last = { lines: s.lines, restored: null };
    /** @type {any} */
    let rung0 = null;
    /** @type {Window | null} */
    let restoreWindow = null;
    if (a.restoreCheck) {
      if (a.window) {
        openWindow();
      }
      rung0 = restoreCheck({ world: a.world, seed: a.seed, entries, settle: true }, s.lines, s.failure);
      if (a.window) {
        restoreWindow = closeWindow(rung0.oneRun, rung0.threw);
      }
      last.restored = rung0.restored;
    }
    return {
      admissions: s.admissions,
      hashes: s.hashes,
      digests: s.lines.map(digest),
      end: s.lines.length - 1,
      failure: s.failure,
      failedBeforeActing,
      restoredWitness: reached.restored,
      window: win,
      rung0: rung0 ? { ok: rung0.ok, detail: rung0.detail, mid: rung0.mid } : null,
      restoreWindow,
      quanta: s.quanta + (rung0 ? rung0.quanta : 0),
      restores: s.restores + (rung0 ? rung0.restores : 0),
      witnessQuanta,
    };
  } finally {
    end();
  }
}

// ---------------------------------------------------------------------------
// Control inputs: a play, product, or log bundle's own run.

/**
 * @param {any} spec
 */
function controlRun(spec) {
  const run = mods.runs.replayTo(spec, 0);
  const floor = mods.admitWorld.worldFloor(run.world.colliders, run.world.heightfield);
  return { run, floor };
}

/**
 * @param {any} a
 */
function control(a) {
  begin('control ' + a.name);
  try {
    if (a.spec.log) {
      const entries = a.spec.log.map((/** @type {any} */ e) => ({ tick: e.tick, proposal: e.proposal }));
      if (a.window) {
        openWindow();
      }
      const s = fromLoad(a.spec.world, a.spec.seed, a.spec.law, a.spec.retired);
      runOut(s, entries, { settle: false, until: a.spec.quanta });
      const win = a.window ? closeWindow(s.quanta, Boolean(s.failure && s.failure.kind === 'throws')) : null;
      last = { lines: s.lines, restored: null };
      let rung0 = null;
      let restoreWindow = null;
      if (a.restoreCheck) {
        if (a.window) {
          openWindow();
        }
        rung0 = restoreCheck({ world: a.spec.world, seed: a.spec.seed, law: a.spec.law, retired: a.spec.retired, entries, settle: false, until: a.spec.quanta }, s.lines, s.failure);
        if (a.window) {
          restoreWindow = closeWindow(rung0.oneRun, rung0.threw);
        }
        last.restored = rung0.restored;
      }
      return {
        admissions: s.admissions, hashes: s.hashes, digests: s.lines.map(digest), end: s.lines.length - 1, failure: s.failure,
        failedBeforeActing: s.failure !== null && !s.acted, window: win, rung0: rung0 ? { ok: rung0.ok, detail: rung0.detail, mid: rung0.mid } : null, restoreWindow,
        quanta: s.quanta + (rung0 ? rung0.quanta : 0), restores: s.restores + (rung0 ? rung0.restores : 0),
      };
    }
    if (a.window) {
      openWindow();
    }
    const first = sessionRun(a.spec);
    const win = a.window ? closeWindow(first.quanta, Boolean(first.failure && first.failure.kind === 'throws')) : null;
    last = { lines: first.lines, restored: null };
    let rung0 = null;
    let restoreWindow = null;
    if (a.restoreCheck) {
      if (a.window) {
        openWindow();
      }
      rung0 = sessionRestoreCheck(a.spec, first);
      if (a.window) {
        restoreWindow = closeWindow(rung0.oneRun, rung0.threw);
      }
      last.restored = rung0.restored;
    }
    return {
      admissions: [], hashes: first.hashes, digests: first.lines.map(digest), end: first.lines.length - 1, failure: first.failure,
      failedBeforeActing: first.failure !== null && first.lines.length <= 1, window: win, rung0: rung0 ? { ok: rung0.ok, detail: rung0.detail, mid: rung0.mid } : null, restoreWindow,
      quanta: first.quanta + (rung0 ? rung0.quanta : 0), restores: rung0 ? rung0.restores : 0,
    };
  } finally {
    end();
  }
}

/**
 * A play or product run from the load to its end.
 * @param {any} spec
 * @param {number} [stopAt] save at this tick and return the save
 */
function sessionRun(spec, stopAt) {
  const { run, floor } = controlRun(spec);
  /** @type {string[]} */
  const lines = [run.line()];
  /** @type {string[]} */
  const hashes = [run.hash];
  /** @type {Failure | null} */
  let failure = null;
  let quanta = 0;
  /** @type {any} */
  let saved = null;
  for (;;) {
    if (typeof stopAt === 'number' && run.tick === stopAt && saved === null) {
      saved = { save: run.save(), lines: lines.length };
    }
    const before = run.tick;
    let more;
    try {
      more = run.advance();
    } catch (error) {
      quanta = quanta + 1;
      lines.push((before + 1) + ' NAN');
      hashes.push('NAN');
      failure = { kind: 'throws', tick: before + 1, detail: 'the run throws producing tick ' + (before + 1) + ': ' + (error instanceof Error ? error.message : String(error)), body: null };
      break;
    }
    if (!more) {
      break;
    }
    quanta = quanta + 1;
    lines.push(run.line());
    hashes.push(run.hash);
    const low = run.world.bodies.find((/** @type {any} */ body) => body.y < floor);
    if (low) {
      failure = { kind: 'leaves', tick: run.tick, detail: low.id + ' leaves the world: its centre is at y ' + low.y + ', below the lowest collider minimum ' + floor + ', at tick ' + run.tick, body: low.id };
      break;
    }
  }
  return { run, lines, hashes, failure, quanta, saved };
}

/**
 * @param {any} spec
 * @param {{ lines: string[], failure: Failure | null }} first
 */
function sessionRestoreCheck(spec, first) {
  const mid = Math.floor((first.lines.length - 1) / 2);
  const second = sessionRun(spec, mid);
  let quanta = second.quanta;
  /** @type {string[] | null} */
  let restored = null;
  let restores = 0;
  if (second.saved) {
    second.run.restore(second.saved.save);
    restores = 1;
    restored = second.lines.slice(0, second.saved.lines);
    for (;;) {
      const before = second.run.tick;
      let more;
      try {
        more = second.run.advance();
      } catch {
        quanta = quanta + 1;
        restored.push((before + 1) + ' NAN');
        break;
      }
      if (!more) {
        break;
      }
      quanta = quanta + 1;
      restored.push(second.run.line());
      if (second.failure && second.run.tick >= second.failure.tick) {
        break;
      }
    }
  }
  const compare = mods.difference.compareLines;
  const endLine = mods.traceLine.endLine;
  /** @type {string | null} */
  let problem = null;
  const twice = compare(first.lines.concat([endLine(first.lines.length)]), second.lines.concat([endLine(second.lines.length)]), 'first.trace', 'second.trace');
  if (twice !== 'identical\n') {
    problem = 'the run does not run twice to the same trace:\n' + twice;
  } else if (restored) {
    const again = compare(second.lines.concat([endLine(second.lines.length)]), restored.concat([endLine(restored.length)]), 'whole.trace', 'restored.trace');
    if (again !== 'identical\n') {
      problem = 'a save and restore at tick ' + mid + ' does not trace identically:\n' + again;
    }
  }
  return { ok: problem === null, detail: problem, quanta, restores, mid, restored, oneRun: second.lines.length - 1, threw: Boolean(second.failure && second.failure.kind === 'throws') };
}

// ---------------------------------------------------------------------------
// The hazard suite (pin 4), each hazard in a window of its own.

/**
 * @param {any} a
 */
function suite(a) {
  begin('suite');
  try {
    const index = JSON.parse(readFileSync('predicates/hazards/index.json', 'utf8'));
    const files = index.scenarios.map((/** @type {any} */ entry) => (typeof entry === 'string' ? entry : entry.file));
    const scenarios = mods.suite.loadHazards();
    const rules = Array.from(mods.predicates.loadIntentRules().rules.values());
    /** @type {any[]} */
    const verdicts = [];
    /** @type {any[]} */
    const windows = [];
    for (let i = 0; i < scenarios.length; i = i + 1) {
      const scenario = scenarios[i];
      if (a.window) {
        openWindow();
      }
      for (const rule of rules) {
        if ((rule.effect || 'drive') !== (scenario.effect || 'drive')) {
          continue;
        }
        // The suite's verdict: whether the scenario's expectation holds. Then
        // what happened, with the checker's reason: the tree's own suite run
        // again with the expectation turned over names the admission or the
        // refusal and its reason, whichever it was.
        const failures = mods.suite.runHazards(rule, [scenario]);
        const text = failures.join('; ');
        const turned = mods.suite.runHazards(rule, [{ ...scenario, expect: scenario.expect === 'admit' ? 'refuse' : 'admit' }]).join('; ');
        const verdict = text === '' ? 'holds' : / was admitted$/.test(text) ? 'fails: admitted' : / was refused: /.test(text) ? 'fails: refused' : 'fails: ' + text;
        const outcome = / was admitted$/.test(text + turned) ? 'admitted' : / was refused: /.test(text + turned) ? 'refused' : 'neither';
        const said = text + turned;
        const reason = outcome === 'refused' ? said.slice(said.indexOf(' was refused: ') + ' was refused: '.length).split('; ')[0] : '';
        verdicts.push({ hazard: scenario.id, file: 'predicates/hazards/' + files[i], verb: rule.verb, verdict, outcome, reason });
      }
      if (a.window) {
        windows.push({ hazard: scenario.id, file: 'predicates/hazards/' + files[i], window: closeWindow(0) });
      }
    }
    return { verdicts, windows };
  } finally {
    end();
  }
}

// ---------------------------------------------------------------------------
// The sweep (pin 5): T6's own, with a window around each action.

/**
 * The sweep's input for a world: a file of the tree, validated as `load
 * world` validates one, or the product scene's records with its three actors.
 * @param {any} a
 */
function worldInput(a) {
  if (a.productScene) {
    return { input: { name: 'product scene', seed: 0, world: mods.productScene.productInit(), actors: ['lower', 'walker', 'climber'] } };
  }
  const loaded = mods.scene.loadScene(a.file);
  if (!loaded.ok) {
    return { problem: a.file + ' does not load: ' + loaded.reason };
  }
  return { input: { ...mods.sweep.sceneInput(loaded.scene), name: a.file } };
}

/**
 * @param {any} a
 */
function sweepWorld(a) {
  begin('sweep ' + a.input.name);
  try {
    /** @type {any[]} */
    const candidates = [];
    /** @type {any[]} */
    const refusals = [];
    const watch = {
      open() {
        openWindow();
      },
      /** @param {any} made */
      refused(made) {
        refusals.push({ actor: made.actor, cell: made.cell, verb: made.action.verb, target: made.action.target, reason: made.reason });
      },
      /** @param {any} made */
      admitted(made) {
        // A quantum that threw ended the action without a frame of its own.
        const win = closeWindow(made.tick - made.entry.tick + (made.end === 'throws' ? 1 : 0), made.end === 'throws');
        candidates.push({
          actor: made.actor,
          cell: made.cell,
          witness: made.witness.log.map((/** @type {any} */ e) => ({ tick: e.tick, proposal: e.proposal })),
          witnessEnd: made.witness.tick,
          intent: { tick: made.entry.tick, proposal: made.entry.proposal },
          end: made.end,
          endTick: made.tick,
          window: win,
        });
      },
    };
    const report = mods.sweep.sweep(a.input, { budget: a.budget, bundles: null, watch });
    return {
      candidates,
      refusals,
      summary: { cells: report.cells, tried: report.tried, admitted: report.admitted, refused: report.refused, quanta: report.quanta, restores: report.restores, complete: report.complete, actionSet: report.actionSet, ms: report.ms },
      archive: report.archive.map((/** @type {any} */ part) => ({ actor: part.actor, cells: part.cells.map((/** @type {any} */ cell) => { const w = cell.witness(); return { key: cell.key, tick: cell.tick, witness: w.log.map((/** @type {any} */ e) => ({ tick: e.tick, proposal: e.proposal })) }; }) })),
      findings: report.findings.map((/** @type {any} */ f) => ({ kind: f.kind, actor: f.actor, body: f.body, detail: f.detail, count: f.count })),
    };
  } finally {
    end();
  }
}

// ---------------------------------------------------------------------------
// The grammar (pin 5): seeded sequences of intents from the archived states.

/**
 * A small seeded generator: mulberry32.
 * @param {number} seed
 */
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = t ^ (t + Math.imul(t ^ (t >>> 7), t | 61));
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {any} a
 */
function grammarInit(a) {
  const index = JSON.parse(readFileSync('predicates/intents/index.json', 'utf8'));
  /** @type {any[]} */
  const table = [];
  for (const file of index.rules) {
    const rule = JSON.parse(readFileSync('predicates/intents/' + file, 'utf8'));
    table.push({ verb: rule.verb, effect: rule.effect || 'drive', targetKind: rule.targetKind || 'point', maxDistance: rule.maxDistance });
  }
  const reached = table.filter((rule) => a.reachedVerbs.includes(rule.verb));
  const unreached = table.filter((rule) => !a.reachedVerbs.includes(rule.verb));
  grammar = {
    random: rng(a.seed),
    share: a.share,
    pitch: a.pitch,
    steps: a.steps,
    cells: a.cells,
    input: a.input,
    reached,
    unreached,
    sequence: null,
  };
  return { verbs: table.map((rule) => rule.verb), reached: reached.map((r) => r.verb), unreached: unreached.map((r) => r.verb) };
}

/**
 * The key a witness's saves are stored under.
 * @param {Entry[]} witness
 * @param {number} witnessEnd
 */
function witnessKey(witness, witnessEnd) {
  return createHash('sha1').update(JSON.stringify([witness, witnessEnd])).digest('hex');
}

/**
 * The next grammar candidate, or null when there are no cells.
 */
function grammarNext() {
  const g = grammar;
  if (!g || g.cells.length === 0) {
    return null;
  }
  begin('grammar');
  try {
    if (g.sequence === null || g.sequence.step >= g.steps) {
      const cell = g.cells[Math.floor(g.random() * g.cells.length)];
      g.sequence = { cell, step: 0, witness: cell.witness.slice(), witnessEnd: cell.tick };
    }
    const q = g.sequence;
    const reached = reachWitness({ world: g.input.world, seed: g.input.seed, entries: q.witness, witness: q.witness.length, witnessEnd: q.witnessEnd, key: witnessKey(q.witness, q.witnessEnd) });
    const s = reached.s;
    if (s.failure) {
      g.sequence = null;
      return { skipped: 'the cell\'s witness does not run: ' + s.failure.detail };
    }
    const actor = s.world.body(q.cell.actor);
    // A share of draws takes a verb that reached an anchor and the rest a verb
    // that did not; when either set is empty every draw comes from the other.
    const pool = g.reached.length === 0 ? g.unreached : g.unreached.length === 0 ? g.reached : g.random() < g.share ? g.reached : g.unreached;
    const rule = pool[Math.floor(g.random() * pool.length)];
    /** @type {any} */
    let target;
    const others = s.world.bodies.filter((/** @type {any} */ body) => body.id !== actor.id);
    const zones = s.world.zones || [];
    if (rule.effect === 'carry' || (rule.effect === 'drive' && rule.targetKind === 'body')) {
      target = others.length > 0 ? { body: others[Math.floor(g.random() * others.length)].id } : { body: actor.id };
    } else if (rule.effect === 'episode') {
      if (zones.length > 0 && (others.length === 0 || g.random() < 0.5)) {
        target = { zone: zones[Math.floor(g.random() * zones.length)].id };
      } else {
        target = others.length > 0 ? { body: others[Math.floor(g.random() * others.length)].id } : { zone: '-' };
      }
    } else {
      // A grid finer than the sweep's, which refines it: the sweep aims at
      // cell centres, (i + 0.5) p; the grammar at every multiple of p times
      // its pitch, which holds those centres and the points between them.
      // It draws within a square of the rule's maxDistance about the actor,
      // so its corners lie past the rule's reach.
      const sweepPitch = 2 * Math.min(actor.hx, actor.hz);
      const fine = sweepPitch * g.pitch;
      const reach = typeof rule.maxDistance === 'number' ? rule.maxDistance : 3;
      const lo = Math.ceil((actor.x - reach) / fine);
      const hi = Math.floor((actor.x + reach) / fine);
      const loZ = Math.ceil((actor.z - reach) / fine);
      const hiZ = Math.floor((actor.z + reach) / fine);
      const i = lo + Math.floor(g.random() * (hi - lo + 1));
      const j = loZ + Math.floor(g.random() * (hiZ - loZ + 1));
      target = { x: i * fine, z: j * fine };
    }
    const proposal = { kind: 'intent', verb: rule.verb, actor: actor.id, target };
    const intent = { tick: s.tick.frame().tick, proposal };
    const entries = q.witness.concat([intent]);
    runOut(s, entries, { settle: true });
    const admission = s.admissions[s.admissions.length - 1];
    const made = {
      cell: q.cell.key,
      actor: actor.id,
      witness: q.witness.slice(),
      witnessEnd: q.witnessEnd,
      intent,
      step: q.step,
      pool: pool === g.reached ? 'reached' : 'other',
      admittedOnHead: Boolean(admission && admission.admitted),
      hashes: s.hashes,
      failure: s.failure,
    };
    q.step = q.step + 1;
    if (s.failure) {
      g.sequence = null;
    } else if (made.admittedOnHead) {
      // The state after the step is the next step's witness: saved now, the
      // first time the process reaches it.
      q.witness = entries;
      q.witnessEnd = s.tick.frame().tick;
      const key = witnessKey(q.witness, q.witnessEnd);
      if (!saves.has(key)) {
        saves.set(key, {
          tag: { process: cfg().processId, tree: cfg().tree, build: cfg().build },
          save: s.tick.save(), next: s.next, lines: s.lines.slice(), hashes: s.hashes.slice(), admissions: s.admissions.map((a) => ({ ...a })), acted: s.acted,
        });
      }
    }
    return { candidate: made };
  } finally {
    end();
  }
}

// ---------------------------------------------------------------------------
// Messages.

/**
 * @param {any} message
 */
async function handle(message) {
  const op = message.op;
  const a = message.args || {};
  if (op === 'init') {
    return init(a);
  }
  checkCwd();
  switch (op) {
    case 'candidate':
      return candidate(a);
    case 'control':
      return control(a);
    case 'line': {
      const lines = last ? (a.restored ? last.restored : last.lines) : null;
      return { line: lines && a.tick < lines.length ? lines[a.tick] : null, lines: a.all && lines ? lines : undefined };
    }
    case 'suite':
      return suite(a);
    case 'world-input':
      return worldInput(a);
    case 'sweep':
      return sweepWorld(a);
    case 'grammar-init':
      return grammarInit(a);
    case 'grammar-next':
      return grammarNext();
    case 'open-run':
      begin(a.name || 'a planted run');
      return { live };
    case 'export-save': {
      const stored = saves.get(a.key);
      return { save: stored || null };
    }
    case 'import-save': {
      const save = a.save;
      checkTag(save && save.tag);
      begin('restore of a save');
      try {
        const made = freshTick(a.world, a.seed);
        made.tick.restore(save.save);
        return { restored: true };
      } finally {
        end();
      }
    }
    case 'import-tree': {
      await import(pathToFileURL(resolve(a.tree, 'packages/tick/tick.js')).href);
      return { imported: true };
    }
    case 'chdir':
      process.chdir(a.dir);
      return { cwd: process.cwd() };
    case 'exit':
      setImmediate(() => process.exit(0));
      return {};
    default:
      throw new Refusal('unknown op ' + op);
  }
}

/**
 * Binds the process to its tree, starts coverage, imports the tree's modules,
 * and reports the load window.
 * @param {any} a
 */
async function init(a) {
  if (config) {
    throw new Refusal('the process is already bound to tree ' + config.tree + '; a process runs one tree');
  }
  config = {
    processId: a.processId, tree: resolve(a.tree), build: a.build, coverage: Boolean(a.coverage),
    redirect: a.redirect || null, counters: a.counters || null, probes: a.probes || [], modules: a.modules || [], plant: a.plant || {},
  };
  const c = config;
  checkCwd();
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const found = nextResolve(specifier, context);
      const url = found.url;
      if (url.startsWith('node:')) {
        return found;
      }
      if (url.startsWith('file:')) {
        const path = fileURLToPath(url);
        if (c.redirect && samePath(path, c.redirect.from)) {
          const to = pathToFileURL(c.redirect.to).href;
          loadedModules.push(to);
          return { ...found, url: to };
        }
        if (!inside(c.tree, path)) {
          refusedModules.push(url);
          throw new Refusal('refused: ' + url + ' lies outside this process\'s tree ' + c.tree + '; a process loads only its own tree\'s modules and Node\'s own');
        }
        if (/[\\/]node_modules[\\/]/.test(path)) {
          refusedModules.push(url);
          throw new Refusal('refused: ' + url + ' is under node_modules; the bench imports nothing from node_modules');
        }
        loadedModules.push(url);
        return found;
      }
      refusedModules.push(url);
      throw new Refusal('refused: ' + url + ' is neither a file of this process\'s tree nor one of Node\'s own modules');
    },
  });
  if (c.coverage) {
    session = new Session();
    session.connect();
    session.post('Profiler.enable');
    session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  }
  /** @param {string} rel */
  const load = (rel) => import(pathToFileURL(resolve(c.tree, rel)).href);
  mods.glue = await load('solver/dist/solver.mjs');
  mods.world = await load('packages/tick/world.js');
  mods.tick = await load('packages/tick/tick.js');
  mods.memory = await load('packages/tick/memory.js');
  mods.predicates = await load('packages/tick/predicates.js');
  mods.traceLine = await load('packages/tick/trace-line.js');
  mods.difference = await load('packages/tick/difference.js');
  mods.runs = await load('packages/tick/runs.js');
  mods.admitWorld = await load('packages/tick/admit-world.js');
  for (const extra of c.modules) {
    if (extra === 'sweep') {
      mods.sweep = await load('packages/load/sweep.js');
      mods.scene = await load('packages/tick/scene.js');
      mods.productScene = await load('harness/product-scene.mjs');
    } else if (extra === 'suite') {
      mods.suite = await load('packages/load/suite.js');
    } else if (extra.startsWith('file:')) {
      await import(extra);
    }
  }
  const loadWindow = session ? { counts: probeCounts(take()), counters: null, quanta: 0 } : null;
  if (c.counters) {
    // The coverage build's image must hold the counters the orchestrator names.
    const bytes = memory().buffer.byteLength;
    if (c.counters.addr + c.counters.size > bytes) {
      throw new Refusal('the counters at ' + c.counters.addr + ' of ' + c.counters.size + ' bytes lie outside the ' + bytes + ' bytes of the solver\'s memory');
    }
  }
  return { pid: process.pid, loaded: loadedModules.slice(), refused: refusedModules.slice(), load: loadWindow, binary: mods.glue.binaryDigest() };
}

/** @type {Promise<unknown>} */
let queue = Promise.resolve();
process.on('message', (/** @type {any} */ message) => {
  queue = queue.then(async () => {
    try {
      const value = await handle(message);
      process.send?.({ id: message.id, ok: true, value });
    } catch (error) {
      const refusal = error instanceof Refusal || (error instanceof Error && /^refused: /.test(error.message));
      process.send?.({ id: message.id, ok: false, refusal, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : '' });
    }
  });
});
process.on('disconnect', () => process.exit(0));
