// The instrument's bench, T7b (docs/dispatch-t7b-instrument-bench.md). It takes
// a change, the head, and the build before it, the base, and looks for inputs
// that reach the changed code, make the head's run differ from the base's, and
// make the head fail where the base does not. Every verdict comes from the
// engine: coverage, the step hash, the trace, and the findings the engine
// checks. It calls no model, and imports nothing from packages/propose.
//
// runBench is the whole of a run, in this order:
//   1. The anchors (anchors.js), and the trees' commits and digests.
//   2. The binaries (build.js): the head's product binary copied into every
//      tree when solver/ has no diff, each tree's own build when it has; the
//      head's coverage build when the head has a law anchor.
//   3. The processes (processes.js, runner.js), one per tree and build: the
//      head, the base, the head's coverage build, and the sweep. Each reports
//      the load window of its own module loading.
//   4. The coverage build's check: the product scene's trace equal to the head
//      product build's, frame for frame, and the canary's relation measured.
//   5. The hazard suite, on each tree, when a hazard changed.
//   6. Per scratch world: T6's sweep once, with each action's reach, as the
//      aimed proposer; its candidates through the ladder in two groups, those
//      that reached an anchor and then the rest; then the grammar's.
//   7. The control inputs, on every tree.
//   8. The mutants, one at a time, each in a process of its own.
//   9. The records, the access map, and the report.
//
// The ladder, on every candidate: rung 0 is a gate, run on every build; rungs 1
// to 3 are recorded for every candidate rung 0 passes on both trees it is
// compared on. Budgets are counted in quanta and restores on the head, per
// proposer and world, and nothing the bench decides depends on the time a run
// takes; wall time goes in the environment block with paths, digests, and the
// host. Two runs with one seed give the same report outside that block.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { readAnchors } from './anchors.js';
import { BuildFailure, buildCoverage, buildProduct, copyProduct, glueBytes, llvmTools, productGlue, seedCoverage, sha256 } from './build.js';
import { MUTANT_CAP, applyEdits, makeMutants } from './mutants.js';
import { BenchRefusal, oneTreePerProcess, startProcess } from './processes.js';
import { coverageInfo, lineStats, mapWindow, normalize, countAt, regionAt } from './profile.js';
import { lawSources, mappedLines, probeTable, reachOf } from './reach.js';
import { describeDifference, floods, lateGain, markdown } from './report.js';
import { copyTree, listFiles, syncTree, treeCommit, treeDigest } from './trees.js';

/**
 * The grammar's share of draws that take a verb that reached an anchor, and
 * its pitch, as a fraction of the sweep's. Measured defaults (pin 5): of the
 * shares 1/2, 3/4, and 1 and the pitches 1/2 and 1/4, the pair that found the
 * planted differences of pin 9 in the most runs, and of those at the lowest
 * budget, by packages/bench/measure.js over five seeds; the measurement is in
 * fixtures/bench/grammar.json. A share of 1 never draws a verb the sweep does
 * not run, so it never met the retired verb's difference; 1/2 found as many
 * as 3/4, sooner; and the pitch made no difference at a share of 1/2.
 */
export const GRAMMAR_SHARE = 0.5;
export const GRAMMAR_PITCH = 0.5;
/** Steps in a grammar sequence from an archived cell. */
export const GRAMMAR_STEPS = 3;

/** The file of the law's exported step function, whose count the canary reads. */
export const STEP_FILE = 'solver/src/rapier_law.rs';
export const STEP_FUNCTION = 'solver_step';

/**
 * The canary's relation (pin 3), measured on the product scene: the law's
 * exported step function runs once a quantum, so its count in a window equals
 * the quanta the window ran. `llvm-cov export` does not round.
 */
export const CANARY = 'equal';

export const DEFAULT_BUDGETS = {
  sweep: { quanta: 200000, restores: 2000 },
  ladder: { quanta: 4000000, restores: 40000 },
};

/**
 * @typedef {import('./anchors.js').Anchor} Anchor
 * @typedef {import('./report.js').CandidateRecord} CandidateRecord
 * @typedef {import('./report.js').Difference} Difference
 * @typedef {import('./processes.js').Proc} Proc
 * @typedef {{ quanta: number, restores: number }} Budget
 * @typedef {{ file?: string, productScene?: boolean }} WorldSpec
 * @typedef {{
 *   base: string, head: string, out: string, seed?: number,
 *   worlds?: WorldSpec[], controls?: WorldSpec[],
 *   budgets?: { sweep?: Budget, ladder?: Budget },
 *   grammar?: { share?: number, pitch?: number, steps?: number, enabled?: boolean },
 *   proposers?: { sweep?: boolean, grammar?: boolean },
 *   mutants?: { enabled?: boolean, cap?: number },
 *   work?: string,
 *   plant?: Record<string, any>,
 *   say?: (line: string) => void,
 * }} BenchOptions
 */

/**
 * A candidate as the ladder runs it.
 * @typedef {{
 *   id: string, proposer: string, world: string, worldInit: any, seed: number,
 *   witness: Array<{ tick: number, proposal: any }>, witnessEnd: number, intent: { tick: number, proposal: any },
 *   cell: string | null, actor: string | null, group: number | null, step: number | null
 * }} Candidate
 */

/**
 * The key a witness's save is stored under in a process.
 * @param {string} world
 * @param {Array<{ tick: number, proposal: any }>} witness
 * @param {number} witnessEnd
 */
export function witnessKey(world, witness, witnessEnd) {
  return createHash('sha1').update(JSON.stringify([world, witness, witnessEnd])).digest('hex');
}

/**
 * An intent as the access map names it: its tick, verb, actor, and target.
 * @param {{ tick: number, proposal: any }} entry
 */
function intentView(entry) {
  return { tick: entry.tick, verb: entry.proposal.verb, actor: entry.proposal.actor, target: entry.proposal.target };
}

/**
 * @param {Array<{ tick: number, proposal: any }>} entries
 */
function stripHashes(entries) {
  return entries.map((e) => {
    const proposal = { ...e.proposal };
    delete proposal.frameHash;
    return { tick: e.tick, proposal };
  });
}

/**
 * Runs the bench. Resolves with the report, which is also written to
 * `out/report.json` and `out/report.md`, beside `out/records.jsonl`,
 * `out/access.json`, and `out/bundles/`. A refusal resolves with a report
 * whose `refused` names the reason and whose other fields hold what was
 * measured before it.
 * @param {BenchOptions} options
 */
export async function runBench(options) {
  const say = options.say || (() => {});
  const plant = options.plant || {};
  const out = resolve(options.out);
  mkdirSync(join(out, 'bundles'), { recursive: true });
  const work = resolve(options.work || join(out, 'work'));
  mkdirSync(work, { recursive: true });
  const head = resolve(options.head);
  const base = resolve(options.base);
  const seed = options.seed === undefined ? 1 : options.seed;
  const budgets = {
    sweep: { ...DEFAULT_BUDGETS.sweep, ...((options.budgets && options.budgets.sweep) || {}) },
    ladder: { ...DEFAULT_BUDGETS.ladder, ...((options.budgets && options.budgets.ladder) || {}) },
  };
  const grammarOptions = {
    share: options.grammar && typeof options.grammar.share === 'number' ? options.grammar.share : GRAMMAR_SHARE,
    pitch: options.grammar && typeof options.grammar.pitch === 'number' ? options.grammar.pitch : GRAMMAR_PITCH,
    steps: options.grammar && typeof options.grammar.steps === 'number' ? options.grammar.steps : GRAMMAR_STEPS,
  };
  const useSweep = !options.proposers || options.proposers.sweep !== false;
  const useGrammar = !options.proposers || options.proposers.grammar !== false;
  const cap = options.mutants && typeof options.mutants.cap === 'number' ? options.mutants.cap : MUTANT_CAP;
  const mutantsOn = !options.mutants || options.mutants.enabled !== false;
  /** @type {Record<string, number>} */
  const times = {};
  let clock = performance.now();
  /** @param {string} phase */
  const lap = (phase) => {
    const now = performance.now();
    times[phase] = Math.round(now - clock);
    clock = now;
  };
  /** @type {any} */
  const environment = { trees: {}, binaries: {}, host: { platform: platform(), arch: arch(), cpus: cpus().length, node: process.version }, times, paths: { out, work }, processes: {} };
  /** @type {any} */
  const report = {
    bench: 1,
    seed,
    budgets,
    grammar: grammarOptions,
    refused: null,
    anchors: [],
    notAimed: [],
    worldsDiffer: [],
    binaries: { mode: '' },
    coverage: { made: false, why: '', productScene: '', canary: null },
    suite: { ran: false, differences: [] },
    worlds: [],
    proposers: {},
    controls: [],
    findings: { head: [], base: [] },
    spent: { quanta: 0, restores: 0 },
    mutants: { note: 'The mutants measure the candidates\' sensitivity at the change, not the aim, which is the access map\'s to measure.', cap, list: [], leftOut: [], byVerdict: {}, none: [] },
    notMeasured: {},
    environment,
  };
  /** @type {Proc[]} */
  const procs = [];
  /** @type {CandidateRecord[]} */
  const records = [];
  writeFileSync(join(out, 'records.jsonl'), '');
  try {
    // 1. Trees and anchors.
    if (head.toLowerCase() === base.toLowerCase()) {
      throw new BenchRefusal('the base and the head are one tree: ' + head);
    }
    if (plant.oneProcess) {
      oneTreePerProcess([head, base]);
    }
    const headFiles = listFiles(head);
    const baseFiles = listFiles(base);
    const set = readAnchors(base, head, { baseFiles, headFiles });
    environment.trees = {
      head: { path: head, commit: treeCommit(head), digest: treeDigest(head, headFiles) },
      base: { path: base, commit: treeCommit(base), digest: treeDigest(base, baseFiles) },
    };
    const anchors = set.anchors;
    report.notAimed = set.notAimed.map((n) => ({ id: n.id, reason: n.reason }));
    report.worldsDiffer = set.worlds;
    say('anchors: ' + anchors.length + ' aimed, ' + set.notAimed.length + ' not aimed, ' + set.worlds.length + ' worlds differ');
    lap('anchors');

    // 2. Binaries.
    const solverDiffers = set.changedFiles.some((file) => file.startsWith('solver/'));
    const lawAnchors = anchors.filter((a) => a.kind === 'law' || a.kind === 'law-top-level' || a.kind === 'law-deletion');
    if (!solverDiffers) {
      if (!existsSync(productGlue(head))) {
        buildProduct(head, 'head');
      }
      copyProduct(head, base);
      report.binaries.mode = 'solver/ has no diff: every tree runs the head\'s product binary file, copied byte for byte';
    } else {
      buildProduct(head, 'head');
      buildProduct(base, 'base');
      report.binaries.mode = 'solver/ differs: each tree built its own binary from its own source, in its own target directory';
    }
    environment.binaries.head = sha256(glueBytes(productGlue(head)));
    environment.binaries.base = sha256(glueBytes(productGlue(base)));
    environment.binaries.files = {
      head: createHash('sha256').update(readFileSync(productGlue(head))).digest('hex'),
      base: createHash('sha256').update(readFileSync(productGlue(base))).digest('hex'),
    };
    lap('product builds');
    /** @type {{ wasm: string, glue: string, digest: string, info: import('./profile.js').CoverageInfo, tools: { profdata: string, cov: string } } | null} */
    let coverage = null;
    if (lawAnchors.length > 0) {
      const tools = llvmTools(head);
      if ('missing' in tools) {
        throw new BenchRefusal('the law changed, and its reach needs the coverage build\'s mapping: ' + tools.missing);
      }
      const built = buildCoverage(head, 'head', { extraFlags: plant.coverageFlags });
      const info = coverageInfo(built.wasm, join(work, 'coverage-head'));
      coverage = { ...built, info, tools };
      environment.binaries.coverage = built.digest;
      report.coverage.made = true;
      lap('coverage build');
    } else {
      report.coverage.why = 'no law anchor';
    }

    // 3. Processes.
    const table = probeTable(anchors);
    const hazards = anchors.some((a) => a.kind === 'hazard');
    const extra = hazards ? ['suite'] : [];
    const headPlant = (plant.runner && plant.runner.head) || {};
    const redirect = coverage ? { from: productGlue(head), to: coverage.glue } : null;
    const headProc = await startProcess({ name: 'head', tree: head, build: 'product', coverage: true, probes: table.files, modules: extra, plant: headPlant });
    procs.push(headProc);
    const baseProc = await startProcess({ name: 'base', tree: base, build: 'product', coverage: false, modules: extra, plant: (plant.runner && plant.runner.base) || {}, cwd: plant.baseCwd });
    procs.push(baseProc);
    const covProc = coverage ? await startProcess({ name: 'head coverage', tree: head, build: 'coverage', coverage: false, redirect, counters: coverage.info.counters, modules: extra, plant: (plant.runner && plant.runner.coverage) || {} }) : null;
    if (covProc) {
      procs.push(covProc);
    }
    const sweepProc = await startProcess({ name: 'sweep', tree: head, build: coverage ? 'coverage' : 'product', coverage: true, probes: table.files, redirect, counters: coverage ? coverage.info.counters : null, modules: ['sweep'], plant: (plant.runner && plant.runner.sweep) || {} });
    procs.push(sweepProc);
    for (const p of procs) {
      environment.processes[p.name] = { pid: p.pid, tree: p.tree, build: p.build };
    }
    lap('processes');

    // The access map's gatherer.
    /** @type {Map<string, Map<string, any>>} */
    const reachedBy = new Map(anchors.map((a) => [a.id, new Map()]));
    /** @type {Map<string, Set<number>>} */
    const linesReached = new Map(anchors.map((a) => [a.id, new Set()]));
    /** @type {Set<string>} */
    const loadOnly = new Set();
    /** @type {Map<string, Set<string>>} */
    const sourcesOf = new Map(anchors.map((a) => [a.id, new Set()]));
    /**
     * @param {import('./reach.js').Reach} reach
     * @param {any} entry
     */
    const gather = (reach, entry) => {
      for (const id of reach.anchors) {
        const map = /** @type {Map<string, any>} */ (reachedBy.get(id));
        map.set(JSON.stringify(entry), entry);
        /** @type {Set<string>} */ (sourcesOf.get(id)).add(entry.source);
      }
      for (const [id, lines] of reach.lines) {
        for (const line of lines) {
          /** @type {Set<number>} */ (linesReached.get(id)).add(line);
        }
      }
    };
    for (const p of [headProc, sweepProc]) {
      if (p.init.load) {
        gather(reachOf(anchors, table, { counts: p.init.load.counts, law: null, verbs: [], anyIntent: false, hazard: null, load: true, tree: head }), { source: 'load' });
      }
    }

    /** @type {Map<string, Set<number>>} */
    const lawMapped = new Map();
    /** @type {Map<string, { file: string, line: number, column: number, how: string, point: { line: number, column: number } } | null>} */
    const regions = new Map();
    /**
     * Maps a law window and checks the canary against it (pin 3).
     * @param {import('./runner.js').Window | any} win
     * @param {string} where
     * @param {boolean} [canary]
     */
    const mapLaw = async (win, where, canary) => {
      if (!coverage || !win || !win.counters) {
        return null;
      }
      const sources = lawSources(anchors, STEP_FILE).map((file) => join(head, file));
      const t0 = performance.now();
      const files = await mapWindow(coverage.info, coverage.tools, win.counters, sources);
      environment.mapping = environment.mapping || { windows: 0, ms: 0 };
      environment.mapping.windows = environment.mapping.windows + 1;
      environment.mapping.ms = environment.mapping.ms + Math.round(performance.now() - t0);
      if (lawMapped.size === 0) {
        for (const file of lawSources(anchors, STEP_FILE)) {
          lawMapped.set(file, mappedLines(files, head, file));
        }
        // A law deletion's region, read from the coverage build's mapping:
        // the innermost region in force at the point the lines left.
        for (const a of anchors) {
          if (a.kind === 'law-deletion' && a.lawEntries.length === 1 && a.why === 'the innermost coverage region at the point') {
            const e = a.lawEntries[0];
            const segments = files.get(normalize(head.replace(/\\/g, '/') + '/' + e.file));
            const at = segments ? regionAt(segments, e) : null;
            regions.set(a.id, at ? { file: e.file, line: at.line, column: at.column, how: at.how, point: { line: e.line, column: e.column } } : null);
          }
        }
      }
      if (canary !== false) {
        const segments = files.get(normalize(head.replace(/\\/g, '/') + '/' + STEP_FILE));
        const count = segments ? stepCount(segments, head) : null;
        const expected = win.quanta;
        const ok = count !== null && (count === expected || (win.threw && count === expected - 1));
        if (!ok) {
          throw new BenchRefusal('the canary refuses ' + where + ': ' + STEP_FUNCTION + ' ran ' + count + ' times in a window of ' + expected + ' quanta' + (count !== null && count < expected ? ', a lower count: the counters were read at the wrong address, or rewound by a restore the window does not account for' : ', a higher count: the counters were not zeroed, or not rewound'));
        }
      }
      return files;
    };
    /** @type {{ line: number, column: number } | null} */
    let stepEntry = null;
    /**
     * The step function's count in a mapping: its entry region's.
     * @param {import('./profile.js').Segments} segments
     * @param {string} tree
     */
    const stepCount = (segments, tree) => {
      if (!stepEntry) {
        const text = readFileSync(join(tree, STEP_FILE), 'utf8');
        const lines = text.split('\n');
        const at = lines.findIndex((l) => new RegExp('\\bfn ' + STEP_FUNCTION + '\\b').test(l));
        const col = at >= 0 ? /** @type {RegExpExecArray} */ (/\S/.exec(lines[at])).index + 1 : 1;
        stepEntry = { line: at + 1, column: col };
      }
      return countAt(segments, stepEntry.line, stepEntry.column);
    };

    // The product scene's records, from the head, for every process as data.
    const productInput = (await sweepProc.call('world-input', { productScene: true })).input;
    const productSpec = { scene: 'product', world: productInput.world, quanta: 10000 };

    // 4. The coverage build's frames are the product build's.
    if (covProc && coverage) {
      const [h, c] = await Promise.all([
        headProc.call('control', { name: 'product scene check', spec: productSpec, window: false, restoreCheck: false }),
        covProc.call('control', { name: 'product scene check', spec: productSpec, window: true, restoreCheck: false }),
      ]);
      const firstDiff = h.digests.findIndex((/** @type {string} */ d, /** @type {number} */ i) => d !== c.digests[i]);
      if (firstDiff >= 0 || h.digests.length !== c.digests.length) {
        const tick = firstDiff >= 0 ? firstDiff : Math.min(h.digests.length, c.digests.length);
        const block = await blockAt(headProc, covProc, tick, 'head product', 'head coverage');
        throw new BenchRefusal('the coverage build does not compute what the product build computes: the product scene\'s traces differ, frame for frame, first at tick ' + tick + '; ' + frameAgreement(h, c) + '\n' + block);
      }
      const files = await mapLaw(c.window, 'the product scene', false);
      const segments = files ? files.get(normalize(head.replace(/\\/g, '/') + '/' + STEP_FILE)) : null;
      const count = segments ? stepCount(segments, head) : null;
      report.coverage.productScene = 'its product-scene trace equals the head product build\'s, frame for frame, over ' + (h.digests.length - 1) + ' quanta';
      report.coverage.canary = { relation: CANARY, measured: { count, quanta: c.window.quanta } };
      if (count !== c.window.quanta) {
        throw new BenchRefusal('the canary\'s relation does not hold on the product scene: ' + STEP_FUNCTION + ' ran ' + count + ' times in ' + c.window.quanta + ' quanta');
      }
      lap('coverage check');
    }

    // Planted process-model setups, each refused before any candidate.
    if (plant.interleave) {
      await headProc.call('open-run', { name: 'a planted run left live' });
    }

    // 5. The hazard suite.
    if (hazards) {
      const runs = await Promise.all([
        headProc.call('suite', { window: true }),
        baseProc.call('suite', { window: false }),
        covProc ? covProc.call('suite', { window: true }) : Promise.resolve(null),
      ]);
      const [hs, bs, cs] = runs;
      report.suite.ran = true;
      for (const w of hs.windows) {
        gather(reachOf(anchors, table, { counts: w.window.counts, law: null, verbs: [], anyIntent: false, hazard: w.hazard, load: false, tree: head }), { source: 'suite', hazard: { id: w.hazard, world: w.file } });
      }
      if (cs) {
        for (const w of cs.windows) {
          const files = await mapLaw(w.window, 'the suite\'s ' + w.hazard, false);
          gather(reachOf(anchors, table, { counts: null, law: files, verbs: [], anyIntent: false, hazard: w.hazard, load: false, tree: head }), { source: 'suite', hazard: { id: w.hazard, world: w.file } });
        }
      }
      // The two verdict lists compared as admissions are (pin 4): a verdict,
      // or what happened, admitted or refused, that differs is a rung-2
      // difference of the hazard's anchor; a reason whose text alone differs
      // is not, and is listed apart.
      report.suite.reasonOnly = [];
      /** @type {Map<string, any>} */
      const baseVerdicts = new Map(bs.verdicts.map((/** @type {any} */ v) => [v.hazard + '|' + v.verb, v]));
      for (const v of hs.verdicts) {
        const other = baseVerdicts.get(v.hazard + '|' + v.verb);
        const hazardAnchors = anchors.filter((a) => a.kind === 'hazard' && a.hazard && (a.hazard.id === v.hazard || a.hazard.id === '*')).map((a) => a.id);
        if (!other || other.verdict !== v.verdict || other.outcome !== v.outcome) {
          report.suite.differences.push({ hazard: v.hazard, file: v.file, verb: v.verb, anchors: hazardAnchors, head: { verdict: v.verdict, outcome: v.outcome, reason: v.reason }, base: other ? { verdict: other.verdict, outcome: other.outcome, reason: other.reason } : 'absent' });
        } else if (other.reason !== v.reason) {
          report.suite.reasonOnly.push({ hazard: v.hazard, file: v.file, verb: v.verb, anchors: hazardAnchors, reasons: { head: v.reason, base: other.reason } });
        }
      }
      for (const v of bs.verdicts) {
        if (!hs.verdicts.some((/** @type {any} */ h) => h.hazard === v.hazard && h.verb === v.verb)) {
          report.suite.differences.push({ hazard: v.hazard, file: v.file, verb: v.verb, anchors: [], head: 'absent', base: { verdict: v.verdict, outcome: v.outcome, reason: v.reason } });
        }
      }
      lap('suite');
    }

    // The ladder.
    /**
     * A call to a process, its time and quanta added to that process's in
     * the environment block (pin 10): the ladder's time per candidate on each
     * tree, and the coverage build's per quantum.
     * @param {Proc} proc
     * @param {string} op
     * @param {any} args
     */
    const timed = async (proc, op, args) => {
      const t0 = performance.now();
      const got = await proc.call(op, args);
      const entry = environment.processes[proc.name];
      entry.calls = (entry.calls || 0) + 1;
      entry.ms = (entry.ms || 0) + Math.round(performance.now() - t0);
      entry.quanta = (entry.quanta || 0) + (got && typeof got.quanta === 'number' ? got.quanta : 0);
      return got;
    };
    /** @type {Map<string, any>} */
    const runnable = new Map();
    /**
     * What a mutant is compared with: one build's run of an input.
     * @param {any} r
     */
    const view = (r) => ({ digests: r.digests, admitted: r.admissions.map((/** @type {any} */ a) => a.admitted), failure: r.failure ? r.failure.kind : null });
    let serial = 0;
    /**
     * Runs one candidate on every tree and build, and writes its record.
     * @param {Candidate} c
     * @returns {Promise<{ record: CandidateRecord, finish: Promise<CandidateRecord> }>}
     */
    const ladder = async (c) => {
      const entries = c.witness.concat([c.intent]);
      const key = witnessKey(c.world, c.witness, c.witnessEnd);
      const args = { name: c.id, world: c.worldInit, seed: c.seed, entries, witness: c.witness.length, witnessEnd: c.witnessEnd, key, restoreCheck: true };
      if (plant.crossSave && serial === 1) {
        const exported = await headProc.call('export-save', { key: plant.crossSave.key });
        const target = plant.crossSave.to === 'coverage' ? covProc : baseProc;
        await /** @type {Proc} */ (target).call('import-save', { save: exported.save, world: c.worldInit, seed: c.seed });
      }
      const [h, b, cv] = await Promise.all([
        timed(headProc, 'candidate', { ...args, window: true }),
        timed(baseProc, 'candidate', { ...args, window: false }),
        covProc ? timed(covProc, 'candidate', { ...args, window: true }) : Promise.resolve(null),
      ]);
      if (cv) {
        const at = h.digests.findIndex((/** @type {string} */ d, /** @type {number} */ i) => d !== cv.digests[i]);
        if (at >= 0 || h.digests.length !== cv.digests.length) {
          const tick = at >= 0 ? at : Math.min(h.digests.length, cv.digests.length);
          const block = await blockAt(headProc, /** @type {Proc} */ (covProc), tick, 'head product', 'head coverage');
          throw new BenchRefusal('the coverage build computes differently from the product build at ' + c.id + ' in ' + c.world + ': the traces differ, frame for frame, first at tick ' + tick + '; ' + frameAgreement(h, cv) + '\n' + block);
        }
      }
      const record = baseRecord(c);
      record.cost = { quanta: h.quanta, restores: h.restores };
      record.admission = { head: h.admissions, base: b.admissions };
      const own = h.admissions.find((/** @type {any} */ a) => a.index === entries.length - 1);
      record.admittedOnHead = Boolean(own && own.admitted);
      record.rungs[0] = { head: { ok: h.rung0 ? h.rung0.ok : false, detail: h.rung0 ? h.rung0.detail : 'no rung 0' }, base: { ok: b.rung0 ? b.rung0.ok : false, detail: b.rung0 ? b.rung0.detail : 'no rung 0' } };
      if (cv) {
        record.rungs[0].coverage = { ok: cv.rung0 ? cv.rung0.ok : false, detail: cv.rung0 ? cv.rung0.detail : 'no rung 0' };
      }
      const headSound = record.rungs[0].head.ok && (!cv || record.rungs[0].coverage.ok);
      const baseSound = record.rungs[0].base.ok;
      record.recorded = ['0'];
      /** @type {Difference | null} */
      let difference = null;
      if (!headSound) {
        record.notes.push('rung 0 failed on the head: the candidate is not a test input, and none of its rungs 1 to 3 is recorded; a finding of the tick or the restore');
        report.findings.head.push({ id: c.id, world: c.world, detail: record.rungs[0].head.ok ? record.rungs[0].coverage.detail : record.rungs[0].head.detail });
      } else {
        record.recorded.push('1');
        if (!baseSound) {
          record.notes.push('rung 0 failed on the base: a finding of the base, not a difference; its run is no sound reference, so rungs 2 and 3 are not recorded');
          report.findings.base.push({ id: c.id, world: c.world, detail: record.rungs[0].base.detail });
        } else {
          record.recorded.push('2', '3');
          difference = await compare(h, b, entries, headProc, baseProc, plant.swapLabels ? ['base', 'head'] : ['head', 'base']);
          record.rungs[2] = difference;
          const labels = plant.swapLabels ? ['base', 'head'] : ['head', 'base'];
          /** @type {Record<string, any>} */
          const failures = {};
          failures[labels[0]] = h.failure ? { kind: h.failure.kind, tick: h.failure.tick, detail: h.failure.detail } : null;
          failures[labels[1]] = b.failure ? { kind: b.failure.kind, tick: b.failure.tick, detail: b.failure.detail } : null;
          const catchIt = Boolean(h.failure && (!b.failure || b.failure.kind !== h.failure.kind));
          record.rungs[3] = { failures, catch: catchIt };
          if (!difference && ((h.failure && !b.failure) || (!h.failure && b.failure) || (h.failure && b.failure && h.failure.kind !== b.failure.kind))) {
            const only = h.failure && (!b.failure || b.failure.kind !== h.failure.kind) ? h.failure : /** @type {any} */ (b.failure);
            const tree = only === h.failure ? labels[0] : labels[1];
            record.rungs[2] = null;
            record.notes.push('a rung-3 failure on the ' + tree + ' alone: ' + only.kind);
          }
          runnable.set(c.id, { args, control: null, head: view(h), coverage: cv ? view(cv) : null });
        }
      }
      if (headSound && (record.rungs[2] || (record.rungs[3] && (record.rungs[3].catch || Object.values(record.rungs[3].failures).some(Boolean))))) {
        record.bundle = writeCandidateBundle(out, c, h, record, environment);
      }
      serial = serial + 1;
      const finish = (async () => {
        const verbs = entries.slice(-1).map((e) => e.proposal.verb);
        const allVerbs = entries.map((e) => e.proposal.verb);
        const winLaw = cv ? await mapLaw(cv.window, c.id + '\'s window') : null;
        const resLaw = cv ? await mapLaw(cv.restoreWindow, c.id + '\'s restore check') : null;
        if (headSound) {
          const identity = candidateIdentity(c);
          const reachWin = reachOf(anchors, table, { counts: h.window ? h.window.counts : null, law: winLaw, verbs, anyIntent: true, hazard: null, load: false, tree: head });
          const reachRes = reachOf(anchors, table, { counts: h.restoreWindow ? h.restoreWindow.counts : null, law: resLaw, verbs: allVerbs, anyIntent: true, hazard: null, load: false, tree: head });
          gather(reachWin, { source: 'window', candidate: identity });
          gather(reachRes, { source: 'restore', candidate: identity });
          record.anchors = Array.from(reachWin.anchors).sort();
          record.restoreAnchors = Array.from(reachRes.anchors).sort();
          /** @type {Record<string, number[]>} */
          const lines = {};
          for (const [id, set] of reachWin.lines) {
            lines[id] = Array.from(set).sort((x, y) => x - y);
          }
          record.lines = lines;
          record.rungs[1] = record.anchors.length > 0;
        }
        return record;
      })();
      // Awaited in order by drive(). When an earlier candidate's refusal ends
      // the run first, this one is never awaited, and its own refusal, if it
      // has one, is not the run's: it is marked handled so it cannot surface
      // after the run has ended.
      finish.catch(() => {});
      return { record, finish };
    };

    /**
     * Runs a proposer's candidates through the ladder within its budget, and
     * returns its records in order and the candidates the budget left unrun.
     * A proposer with a queue (the sweep) is drawn to its end, and what the
     * budget leaves is listed; one that proposes without end (the grammar) is
     * asked for no candidate once the budget is spent.
     * @param {() => Promise<Candidate | null>} next
     * @param {Budget} budget
     * @param {boolean} queued
     * @returns {Promise<{ records: CandidateRecord[], unrun: Candidate[] }>}
     */
    const drive = async (next, budget, queued) => {
      /** @type {CandidateRecord[]} */
      const done = [];
      /** @type {Promise<CandidateRecord> | null} */
      let inflight = null;
      let quanta = 0;
      let restores = 0;
      /** @type {Candidate[]} */
      const unrun = [];
      for (;;) {
        const spent = quanta >= budget.quanta || restores >= budget.restores;
        if (spent && !queued) {
          break;
        }
        const c = await next();
        if (c === null) {
          break;
        }
        if (spent) {
          unrun.push(c);
          continue;
        }
        const ran = await ladder(c);
        quanta = quanta + ran.record.cost.quanta;
        restores = restores + ran.record.cost.restores;
        if (inflight) {
          const finished = await inflight;
          done.push(finished);
          records.push(finished);
          writeFileSync(join(out, 'records.jsonl'), JSON.stringify(finished) + '\n', { flag: 'a' });
        }
        inflight = ran.finish;
      }
      if (inflight) {
        const finished = await inflight;
        done.push(finished);
        records.push(finished);
        writeFileSync(join(out, 'records.jsonl'), JSON.stringify(finished) + '\n', { flag: 'a' });
      }
      report.spent.quanta = report.spent.quanta + quanta;
      report.spent.restores = report.spent.restores + restores;
      return { records: done, unrun };
    };

    // 6. The scratch worlds.
    /** @type {Record<string, { records: CandidateRecord[], proposed: number, refused: Record<string, number>, unrun: Candidate[], groups: Record<string, number> }>} */
    const byProposer = {
      sweep: { records: [], proposed: 0, refused: {}, unrun: [], groups: {} },
      grammar: { records: [], proposed: 0, refused: {}, unrun: [], groups: {} },
    };
    let candidateCount = 0;
    const worlds = options.worlds || [];
    for (const spec of worlds) {
      const got = await sweepProc.call('world-input', spec.productScene ? { productScene: true } : { file: spec.file });
      if (got.problem) {
        report.worlds.push({ world: spec.file || 'product scene', problem: got.problem });
        continue;
      }
      const input = got.input;
      const worldName = input.name;
      /** @type {any} */
      const worldReport = { world: worldName, sweep: null, grammar: null };
      report.worlds.push(worldReport);
      /** @type {any[]} */
      let archiveCells = [];
      /** @type {Set<string>} */
      const reachedVerbs = new Set();
      // The sweep runs whenever either proposer does: the grammar draws from
      // the states it archived and splits its verbs by the sweep's reach. Its
      // own candidates go through the ladder only when it proposes.
      if (useSweep || useGrammar) {
        const swept = await sweepProc.call('sweep', { input, budget: budgets.sweep });
        worldReport.sweep = { ...swept.summary, ms: undefined, findings: swept.findings };
        environment.times['sweep ' + worldName] = Math.round(swept.summary.ms);
        byProposer.sweep.proposed = byProposer.sweep.proposed + swept.summary.tried;
        for (const r of swept.refusals) {
          byProposer.sweep.refused[r.reason] = (byProposer.sweep.refused[r.reason] || 0) + 1;
        }
        archiveCells = swept.archive.flatMap((/** @type {any} */ part) => part.cells.map((/** @type {any} */ cell) => ({ ...cell, actor: part.actor })));
        // The sweep's own reach, per action: the access map, and the aim.
        /** @type {Candidate[]} */
        const reached = [];
        /** @type {Candidate[]} */
        const rest = [];
        const mapped = await Promise.all(swept.candidates.map((/** @type {any} */ sc, /** @type {number} */ i) => mapLaw(sc.window, 'the sweep\'s action ' + (i + 1) + ' in ' + worldName)));
        swept.candidates.forEach((/** @type {any} */ sc, /** @type {number} */ i) => {
          candidateCount = candidateCount + 1;
          /** @type {Candidate} */
          const c = {
            id: 'c' + candidateCount, proposer: 'sweep', world: worldName, worldInit: input.world, seed: input.seed,
            witness: stripHashes(sc.witness), witnessEnd: sc.witnessEnd, intent: stripHashes([sc.intent])[0],
            cell: sc.cell, actor: sc.actor, group: null, step: null,
          };
          const reach = reachOf(anchors, table, { counts: sc.window.counts, law: mapped[i], verbs: [sc.intent.proposal.verb], anyIntent: true, hazard: null, load: false, tree: head });
          gather(reach, { source: 'window', candidate: candidateIdentity(c) });
          for (const id of reach.anchors) {
            reachedVerbs.add(sc.intent.proposal.verb);
            void id;
          }
          if (reach.anchors.size > 0) {
            c.group = 1;
            reached.push(c);
          } else {
            c.group = 2;
            rest.push(c);
          }
        });
        byProposer.sweep.groups[worldName + ' group 1'] = reached.length;
        byProposer.sweep.groups[worldName + ' group 2'] = rest.length;
        if (useSweep) {
          const queue = reached.concat(rest);
          let i = 0;
          const ran = await drive(async () => (i < queue.length ? queue[i++] : null), budgets.ladder, true);
          byProposer.sweep.records.push(...ran.records);
          byProposer.sweep.unrun.push(...ran.unrun);
        }
        lap('sweep ladder ' + worldName);
      }
      if (useGrammar && archiveCells.length > 0) {
        const verbs = await sweepProc.call('grammar-init', {
          seed: seed ^ hashText(worldName),
          share: grammarOptions.share,
          pitch: grammarOptions.pitch,
          steps: grammarOptions.steps,
          cells: archiveCells.map((cell) => ({ key: cell.key, actor: cell.actor, tick: cell.tick, witness: stripHashes(cell.witness) })),
          input,
          reachedVerbs: Array.from(reachedVerbs),
        });
        worldReport.grammar = { verbs: verbs.verbs, reachedVerbs: verbs.reached, otherVerbs: verbs.unreached };
        let steps = 0;
        const ran = await drive(async () => {
          for (;;) {
            const made = await sweepProc.call('grammar-next', {});
            if (made === null) {
              return null;
            }
            if (made.skipped) {
              steps = steps + 1;
              if (steps > 10000) {
                return null;
              }
              continue;
            }
            const m = made.candidate;
            byProposer.grammar.proposed = byProposer.grammar.proposed + 1;
            candidateCount = candidateCount + 1;
            return {
              id: 'c' + candidateCount, proposer: 'grammar', world: worldName, worldInit: input.world, seed: input.seed,
              witness: stripHashes(m.witness), witnessEnd: m.witnessEnd, intent: stripHashes([m.intent])[0],
              cell: m.cell, actor: m.actor, group: null, step: m.step,
            };
          }
        }, budgets.ladder, false);
        for (const r of ran.records) {
          const own = r.admission.head.find((a) => a.index === r.witness.length);
          if (own && !own.admitted) {
            byProposer.grammar.refused[own.reason] = (byProposer.grammar.refused[own.reason] || 0) + 1;
          }
        }
        byProposer.grammar.records.push(...ran.records);
        byProposer.grammar.unrun.push(...ran.unrun);
        lap('grammar ladder ' + worldName);
      }
    }

    // 7. Control inputs.
    /** @type {CandidateRecord[]} */
    const controlRecords = [];
    for (const spec of options.controls || []) {
      /** @type {any} */
      let runSpec;
      /** @type {any} */
      let bundle = null;
      let kind = 'product';
      let file = 'product scene';
      if (spec.productScene) {
        runSpec = productSpec;
      } else {
        file = /** @type {string} */ (spec.file);
        const path = isAbsolute(file) ? file : join(head, file);
        bundle = JSON.parse(readFileSync(path, 'utf8'));
        kind = bundle.run;
        runSpec = bundle.run === 'product' ? { scene: 'product', world: bundle.world, quanta: bundle.quanta }
          : bundle.run === 'play' ? { seed: bundle.seed, steps: bundle.steps, driven: bundle.driven, world: bundle.world }
            : { seed: bundle.seed, world: bundle.world, log: bundle.log, law: bundle.law, retired: bundle.retired, quanta: bundle.quanta };
      }
      candidateCount = candidateCount + 1;
      const id = 'c' + candidateCount;
      const [h, b, cv] = await Promise.all([
        headProc.call('control', { name: id, spec: runSpec, window: true, restoreCheck: true }),
        baseProc.call('control', { name: id, spec: runSpec, window: false, restoreCheck: true }),
        covProc ? covProc.call('control', { name: id, spec: runSpec, window: true, restoreCheck: true }) : Promise.resolve(null),
      ]);
      if (cv) {
        const at = h.digests.findIndex((/** @type {string} */ d, /** @type {number} */ i) => d !== cv.digests[i]);
        if (at >= 0 || h.digests.length !== cv.digests.length) {
          const tick = at >= 0 ? at : Math.min(h.digests.length, cv.digests.length);
          const block = await blockAt(headProc, /** @type {Proc} */ (covProc), tick, 'head product', 'head coverage');
          throw new BenchRefusal('the coverage build computes differently from the product build on the control input ' + file + ': first at tick ' + tick + '; ' + frameAgreement(h, cv) + '\n' + block);
        }
      }
      /** @type {CandidateRecord} */
      const record = {
        id, proposer: 'control', world: file, cell: null, actor: null, group: null, step: null,
        witness: [], witnessEnd: 0, intent: null, control: { kind, file },
        anchors: [], lines: {}, restoreAnchors: [], admission: { head: h.admissions, base: b.admissions }, admittedOnHead: true,
        rungs: { 0: { head: { ok: Boolean(h.rung0 && h.rung0.ok), detail: h.rung0 ? h.rung0.detail : null }, base: { ok: Boolean(b.rung0 && b.rung0.ok), detail: b.rung0 ? b.rung0.detail : null } }, 1: null, 2: null, 3: null },
        recorded: ['0'], notes: [], cost: { quanta: h.quanta, restores: h.restores }, bundle: null,
      };
      if (bundle && Array.isArray(bundle.hashes)) {
        const upTo = Math.min(bundle.hashes.length, h.hashes.length);
        const mismatch = bundle.hashes.slice(0, upTo).findIndex((/** @type {string} */ hash, /** @type {number} */ i) => hash !== h.hashes[i] && hash !== '-');
        record.notes.push(mismatch < 0 && upTo === bundle.hashes.length
          ? 'its recorded hashes match the head\'s run'
          : 'its recorded hashes do not match the head\'s run' + (mismatch >= 0 ? ', first at tick ' + mismatch : ', which ends at tick ' + (h.hashes.length - 1)) + ': the bundle is from another build');
      }
      const headSound = record.rungs[0].head.ok && (!cv || (cv.rung0 && cv.rung0.ok));
      if (!headSound) {
        record.notes.push('rung 0 failed on the head: a finding of the tick or the restore');
        report.findings.head.push({ id, world: file, detail: record.rungs[0].head.detail });
      } else {
        record.recorded.push('1');
        const winLaw = cv ? await mapLaw(cv.window, 'the control input ' + file) : null;
        const resLaw = cv ? await mapLaw(cv.restoreWindow, 'the control input ' + file + '\'s restore check') : null;
        const verbs = (runSpec.log || []).map((/** @type {any} */ e) => e.proposal.verb);
        const reachWin = reachOf(anchors, table, { counts: h.window ? h.window.counts : null, law: winLaw, verbs, anyIntent: verbs.length > 0, hazard: null, load: false, tree: head });
        const reachRes = reachOf(anchors, table, { counts: h.restoreWindow ? h.restoreWindow.counts : null, law: resLaw, verbs, anyIntent: verbs.length > 0, hazard: null, load: false, tree: head });
        gather(reachWin, { source: 'window', control: { kind, file } });
        gather(reachRes, { source: 'restore', control: { kind, file } });
        record.anchors = Array.from(reachWin.anchors).sort();
        record.restoreAnchors = Array.from(reachRes.anchors).sort();
        record.rungs[1] = record.anchors.length > 0;
        /** @type {Record<string, number[]>} */
        const lines = {};
        for (const [aid, set] of reachWin.lines) {
          lines[aid] = Array.from(set).sort((x, y) => x - y);
        }
        record.lines = lines;
        if (!record.rungs[0].base.ok) {
          record.notes.push('rung 0 failed on the base: a finding of the base, not a difference; rungs 2 and 3 are not recorded');
          report.findings.base.push({ id, world: file, detail: record.rungs[0].base.detail });
        } else {
          record.recorded.push('2', '3');
          const entries = (runSpec.log || []).map((/** @type {any} */ e) => ({ tick: e.tick, proposal: e.proposal }));
          record.rungs[2] = await compare(h, b, entries, headProc, baseProc, ['head', 'base']);
          record.rungs[3] = {
            failures: { head: h.failure ? { kind: h.failure.kind, tick: h.failure.tick, detail: h.failure.detail } : null, base: b.failure ? { kind: b.failure.kind, tick: b.failure.tick, detail: b.failure.detail } : null },
            catch: Boolean(h.failure && (!b.failure || b.failure.kind !== h.failure.kind)),
          };
          runnable.set(id, { control: { name: id, spec: runSpec }, head: view(h), coverage: cv ? view(cv) : null });
          if (record.rungs[2] || record.rungs[3].catch) {
            record.bundle = writeControlBundle(out, id, bundle, runSpec, h, record, environment);
          }
        }
      }
      controlRecords.push(record);
      records.push(record);
      writeFileSync(join(out, 'records.jsonl'), JSON.stringify(record) + '\n', { flag: 'a' });
      report.spent.quanta = report.spent.quanta + h.quanta;
      report.spent.restores = report.spent.restores + h.restores;
    }
    report.controls = controlRecords.map((r) => ({ id: r.id, control: r.control, notes: r.notes, difference: r.rungs[2] ? describeDifference(/** @type {Difference} */ (r.rungs[2])) : null, block: r.rungs[2] ? /** @type {Difference} */ (r.rungs[2]).block : null, bundle: r.bundle }));
    lap('controls');

    // 8. Mutants.
    /** @type {any[]} */
    let mutantResults = [];
    if (mutantsOn) {
      const made = makeMutants(anchors, head, base, lawMapped.size > 0 ? lawMapped : null);
      report.mutants.none = made.none;
      const scored = made.mutants.slice(0, cap);
      report.mutants.leftOut = made.mutants.slice(cap).map((m) => ({ id: m.id, anchor: m.anchor, operator: m.operator, file: m.file, line: m.line }));
      mutantResults = await runMutants(scored, {
        head, work, runnable, coverage, anchors, linesReached, reachedBy, environment, plant, say,
      });
      report.mutants.list = mutantResults;
      /** @type {Record<string, any[]>} */
      const byVerdict = {};
      for (const m of mutantResults) {
        (byVerdict[m.verdict] = byVerdict[m.verdict] || []).push({ id: m.id, operator: m.operator, file: m.file, line: m.line, detail: m.detail, anchor: m.anchor });
      }
      report.mutants.byVerdict = byVerdict;
      lap('mutants');
    }

    // 9. The report.
    for (const a of anchors) {
      const sources = /** @type {Set<string>} */ (sourcesOf.get(a.id));
      if (a.kind === 'js' && sources.has('load') && sources.size === 1) {
        loadOnly.add(a.id);
      }
    }
    report.anchors = anchors.map((a) => {
      const by = /** @type {Map<string, any>} */ (reachedBy.get(a.id));
      const sources = Array.from(/** @type {Set<string>} */ (sourcesOf.get(a.id))).sort();
      return {
        id: a.id, kind: a.kind, file: a.file, name: a.name, lines: a.lines, side: a.side, approximate: a.approximate,
        observable: a.observable, why: a.why, executable: lawMapped.has(a.file) && (a.kind === 'law') ? a.changed.filter((l) => /** @type {Set<number>} */ (lawMapped.get(a.file)).has(l)) : a.executable,
        noExecutableChange: lawMapped.has(a.file) && a.kind === 'law' ? a.changed.every((l) => !/** @type {Set<number>} */ (lawMapped.get(a.file)).has(l)) : a.noExecutableChange,
        runsAtLoad: a.runsAtLoad || loadOnly.has(a.id), removed: a.removed, identifiers: a.identifiers, verb: a.verb, hazard: a.hazard,
        region: regions.has(a.id) ? regions.get(a.id) : undefined,
        reachedBy: sources, entries: by.size,
        linesReached: Array.from(/** @type {Set<number>} */ (linesReached.get(a.id))).sort((x, y) => x - y),
        reached: by.size > 0,
        verdict: by.size > 0 ? 'reached' : a.removed ? 'removed; reach not measurable' : a.approximate ? 'not seen reached (approximate)' : 'not reached',
        differences: records.filter((r) => r.rungs[2] && r.anchors.includes(a.id)).length + report.suite.differences.filter((/** @type {any} */ d) => d.anchors.includes(a.id)).length,
        wording: by.size > 0 && a.observable === 'not observable' ? 'reached and not observable' : 'no trace difference',
      };
    });
    for (const [name, p] of Object.entries(byProposer)) {
      report.proposers[name] = summarize(p.records, p.proposed, p.refused, p.unrun, p.groups, anchors, mutantResults);
    }
    report.proposers.control = summarize(controlRecords, controlRecords.length, {}, [], {}, anchors, mutantResults);
    const access = accessMap(anchors, report.anchors, reachedBy, set.notAimed);
    writeFileSync(join(out, 'access.json'), JSON.stringify(access, null, 1) + '\n');
    report.notMeasured = {
      notAimed: set.notAimed.map((n) => ({ id: n.id, reason: n.reason })),
      notSeenApproximate: access.notSeenApproximate,
      notReached: access.notReached,
      runsAtLoad: access.runsAtLoad,
      noExecutableChange: report.anchors.filter((/** @type {any} */ a) => a.noExecutableChange).map((/** @type {any} */ a) => a.id),
      removed: report.anchors.filter((/** @type {any} */ a) => a.removed).map((/** @type {any} */ a) => a.id),
      unrun: Object.entries(byProposer).flatMap(([name, p]) => {
        /** @type {Record<string, number>} */
        const byGroup = {};
        for (const c of p.unrun) {
          const g = name + ' ' + c.world + (c.group ? ' group ' + c.group : '');
          byGroup[g] = (byGroup[g] || 0) + 1;
        }
        return Object.entries(byGroup).map(([group, count]) => ({ id: group, count }));
      }),
      mutantsNotReached: mutantResults.filter((m) => m.verdict === 'not reached').map((m) => ({ id: m.id, reason: 'no source of pin 3 reached ' + m.file + ':' + m.line })),
      mutantsNotScored: mutantResults.filter((m) => m.verdict === 'not scored').map((m) => ({ id: m.id, reason: m.why })),
      mutantsNone: report.mutants.none.map((/** @type {any} */ n) => ({ anchor: n.anchor, reason: n.reason + (n.line ? ' (line ' + n.line + ')' : '') })),
    };
  } catch (error) {
    if (error instanceof BenchRefusal || error instanceof BuildFailure) {
      report.refused = error.message;
    } else {
      throw error;
    }
  } finally {
    await Promise.all(procs.map((p) => p.close()));
  }
  environment.times.total = Object.values(times).reduce((sum, t) => sum + t, 0);
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1) + '\n');
  writeFileSync(join(out, 'report.md'), markdown(report));
  return report;
}

/**
 * How two runs of one input differ after their first difference: whether
 * their states, each line without its hash, agree again, as they do after a
 * difference later frames undo; the hash is a running chain, so it carries
 * any difference on to the end.
 * @param {{ digests: string[], states: string[] }} a
 * @param {{ digests: string[], states: string[] }} b
 */
function frameAgreement(a, b) {
  const n = Math.min(a.states.length, b.states.length);
  const first = a.digests.findIndex((d, i) => i < n && d !== b.digests[i]);
  if (a.states.length !== b.states.length) {
    return 'one run is ' + Math.abs(a.states.length - b.states.length) + ' frames longer';
  }
  let again = -1;
  for (let i = Math.max(first, 0) + 1; i < n; i = i + 1) {
    if (a.states[i] !== b.states[i]) {
      again = -1;
    } else if (again < 0) {
      again = i;
    }
  }
  return again >= 0
    ? 'the states agree again from tick ' + again + ' to the last frame, tick ' + (n - 1) + ', and the running hash carries the difference on'
    : 'the states still differ at the last frame, tick ' + (n - 1);
}

/**
 * @param {string} text
 */
function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i = i + 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

/**
 * @param {Candidate} c
 * @returns {CandidateRecord}
 */
function baseRecord(c) {
  return {
    id: c.id, proposer: c.proposer, world: c.world, cell: c.cell, actor: c.actor, group: c.group, step: c.step,
    witness: c.witness, witnessEnd: c.witnessEnd, intent: c.intent, control: null,
    anchors: [], lines: {}, restoreAnchors: [], admission: {}, admittedOnHead: false,
    rungs: { 0: {}, 1: null, 2: null, 3: null }, recorded: [], notes: [], cost: { quanta: 0, restores: 0 }, bundle: null,
  };
}

/**
 * The candidate as the access map names it.
 * @param {Candidate} c
 */
function candidateIdentity(c) {
  return { proposer: c.proposer, verb: c.intent.proposal.verb, world: c.world, cell: c.cell, witness: c.witness.map(intentView).concat([intentView(c.intent)]) };
}

/**
 * The first-difference block at a tick between two processes' last runs.
 * @param {Proc} a
 * @param {Proc} b
 * @param {number} tick
 * @param {string} left
 * @param {string} right
 */
async function blockAt(a, b, tick, left, right) {
  const [la, lb] = await Promise.all([a.call('line', { all: true }), b.call('line', { all: true })]);
  const linesA = la.lines || [];
  const linesB = lb.lines || [];
  const { compareLines } = await differenceModule();
  const upTo = tick + 1;
  const partA = linesA.slice(0, upTo);
  const partB = linesB.slice(0, upTo);
  return compareLines(partA.concat([partA.length < linesA.length ? 'continued' : 'end ' + partA.length].filter((l) => l !== 'continued')), partB.concat([partB.length < linesB.length ? 'continued' : 'end ' + partB.length].filter((l) => l !== 'continued')), left, right);
}

/** @type {any} */
let differenceCache = null;
/**
 * T1's comparison (packages/tick/difference.js), from the bench's own checkout.
 */
async function differenceModule() {
  if (!differenceCache) {
    differenceCache = await import('../tick/difference.js');
  }
  return differenceCache;
}

/**
 * Compares the head's and the base's runs of one input (pin 4): tick by tick,
 * the trace line first, then, while the frames agree, each intent's
 * admission. The first of either is the input's first difference; reason
 * text alone is none.
 * @param {any} h
 * @param {any} b
 * @param {Array<{ tick: number, proposal: any }>} entries
 * @param {Proc} headProc
 * @param {Proc} baseProc
 * @param {string[]} labels
 * @returns {Promise<Difference | null>}
 */
async function compare(h, b, entries, headProc, baseProc, labels) {
  const last = Math.max(h.digests.length, b.digests.length);
  /** @type {Map<number, any[]>} */
  const byTickH = new Map();
  /** @type {Map<number, any[]>} */
  const byTickB = new Map();
  for (const a of h.admissions) {
    byTickH.set(a.tick, (byTickH.get(a.tick) || []).concat([a]));
  }
  for (const a of b.admissions) {
    byTickB.set(a.tick, (byTickB.get(a.tick) || []).concat([a]));
  }
  for (let t = 0; t < last; t = t + 1) {
    if (h.digests[t] !== b.digests[t]) {
      const [lh, lb] = await Promise.all([headProc.call('line', { all: true }), baseProc.call('line', { all: true })]);
      const { compareLines } = await differenceModule();
      const a = (lh.lines || []).slice(0, t + 1);
      const c = (lb.lines || []).slice(0, t + 1);
      const endA = a.length < t + 1 ? ['end ' + a.length] : [];
      const endB = c.length < t + 1 ? ['end ' + c.length] : [];
      const block = compareLines(a.concat(endA), c.concat(endB), labels[0], labels[1]);
      const where = /first difference at tick \d+\n(?:body (\S+) field (\S+)|body \d+ (id)|(snapshot)|mind (\S+)|(hash)|(length))/.exec(block);
      let body = '-';
      let field = 'hash';
      if (where) {
        if (where[1]) {
          body = where[1];
          field = where[2];
        } else if (where[3]) {
          field = 'id';
        } else if (where[4]) {
          field = 'snapshot';
        } else if (where[5]) {
          body = where[5];
          field = 'mind';
        } else if (where[7]) {
          field = 'length';
        }
      }
      return { kind: 'trace', tick: t, body, field, block };
    }
    const ah = byTickH.get(t) || [];
    const ab = byTickB.get(t) || [];
    for (const x of ah) {
      const y = ab.find((/** @type {any} */ z) => z.index === x.index);
      if (y && x.admitted !== y.admitted) {
        const entry = entries[x.index];
        const refusing = x.admitted ? labels[1] : labels[0];
        /** @type {Record<string, string>} */
        const reasons = {};
        reasons[labels[0]] = x.admitted ? 'admitted' : x.reason;
        reasons[labels[1]] = y.admitted ? 'admitted' : y.reason;
        const block = 'first difference at tick ' + t + ': admission differs\nintent ' + x.index + ': ' + entry.proposal.verb + ' ' + entry.proposal.actor + ' ' + JSON.stringify(entry.proposal.target) + '\n  ' + labels[0] + ' ' + reasons[labels[0]] + '\n  ' + labels[1] + ' ' + reasons[labels[1]] + '\n';
        return { kind: 'admission', tick: t, index: x.index, verb: entry.proposal.verb, refusing, reasons, block };
      }
    }
  }
  return null;
}

/**
 * A rung-2 or rung-3 candidate as a T5 log bundle from the head: its witness,
 * then its intent, each with the head's admission hash, the head's hashes to
 * the end of its run, and in its failure block the first-difference block of
 * the bench's own two traces. An admission difference is written as the log
 * of every intent both trees admitted before the differing one, with the
 * differing intent, its tick, and both reasons in its failure block, for
 * `bench replay`.
 * @param {string} out
 * @param {Candidate} c
 * @param {any} h
 * @param {CandidateRecord} record
 * @param {any} environment
 */
function writeCandidateBundle(out, c, h, record, environment) {
  const entries = c.witness.concat([c.intent]);
  const d = record.rungs[2];
  /** @type {any[]} */
  const log = [];
  let hashes = h.hashes;
  /** @type {any} */
  let failure = { test: 'bench', block: d ? d.block : (record.notes.join('\n') + '\n') };
  if (d && d.kind === 'admission') {
    for (const a of h.admissions) {
      const other = record.admission.base.find((/** @type {any} */ x) => x.index === a.index);
      if (a.index < d.index && a.admitted && other && other.admitted) {
        log.push({ tick: entries[a.index].tick, hash: h.hashes[entries[a.index].tick], proposal: entries[a.index].proposal });
      }
    }
    hashes = h.hashes.slice(0, d.tick + 1);
    failure = { test: 'bench', block: d.block, intent: entries[d.index], tick: d.tick, reasons: d.reasons };
  } else {
    for (const a of h.admissions) {
      if (a.admitted) {
        log.push({ tick: entries[a.index].tick, hash: h.hashes[entries[a.index].tick], proposal: entries[a.index].proposal });
      }
    }
  }
  const bundle = {
    bundle: 1,
    name: 'bench ' + record.id + ' ' + c.world,
    note: 'A bench finding (T7b): ' + (d ? describeDifference(d) : record.notes.join('; ')) + '. Proposer ' + c.proposer + '.',
    commit: environment.trees.head.commit || 'unknown',
    binary: environment.binaries.head,
    run: 'log',
    seed: c.seed,
    world: c.worldInit,
    log: log.map((e) => ({ ...e, proposal: { ...e.proposal, frameHash: e.hash } })),
    law: 'product',
    retired: true,
    quanta: hashes.length - 1,
    tick: hashes.length - 1,
    hashes,
    image: null,
    failure,
  };
  const path = join(out, 'bundles', record.id + '.bundle.json');
  writeFileSync(path, JSON.stringify(bundle, null, 1) + '\n');
  return relative(out, path).replace(/\\/g, '/');
}

/**
 * A control input's finding: the input's own bundle, with the bench's
 * first-difference block in its failure block.
 * @param {string} out
 * @param {string} id
 * @param {any} bundle
 * @param {any} spec
 * @param {any} h
 * @param {CandidateRecord} record
 * @param {any} environment
 */
function writeControlBundle(out, id, bundle, spec, h, record, environment) {
  const d = record.rungs[2];
  const block = d ? d.block : record.notes.join('\n') + '\n';
  const own = bundle ? { ...bundle } : {
    bundle: 1, name: 'product scene', note: 'the product scene as a control input', commit: environment.trees.head.commit || 'unknown', binary: environment.binaries.head,
    run: 'product', seed: 0, world: spec.world, log: [], quanta: spec.quanta, tick: h.hashes.length - 1, hashes: h.hashes, image: null,
  };
  own.failure = { test: 'bench', block };
  const path = join(out, 'bundles', id + '.bundle.json');
  writeFileSync(path, JSON.stringify(own, null, 1) + '\n');
  return relative(out, path).replace(/\\/g, '/');
}

/**
 * A proposer's part of the report (pin 8).
 * @param {CandidateRecord[]} records
 * @param {number} proposed
 * @param {Record<string, number>} refused
 * @param {Candidate[]} unrun
 * @param {Record<string, number>} groups
 * @param {Anchor[]} anchors
 * @param {any[]} mutants every mutant's result: those an input of these records separated are this proposer's
 */
function summarize(records, proposed, refused, unrun, groups, anchors, mutants) {
  const ids = new Set(records.map((r) => r.id));
  /** @type {Record<string, string[]>} */
  const byVerdict = {};
  for (const m of mutants) {
    if (m.separatedBy && ids.has(m.separatedBy.input)) {
      (byVerdict[m.verdict] = byVerdict[m.verdict] || []).push(m.id);
    }
  }
  const refusedCount = Object.values(refused).reduce((sum, n) => sum + n, 0);
  const differing = records.filter((r) => r.rungs[2]);
  const flooded = floods(records);
  const inFlood = new Set(flooded.flatMap((f) => f.ids));
  /** @type {Set<string>} */
  const anchorsReached = new Set();
  /** @type {Record<string, Set<number>>} */
  const lines = {};
  for (const r of records) {
    r.anchors.forEach((a) => anchorsReached.add(a));
    for (const [a, list] of Object.entries(r.lines)) {
      lines[a] = lines[a] || new Set();
      list.forEach((l) => lines[a].add(l));
    }
  }
  return {
    proposed,
    refused: refusedCount,
    refusals: Object.fromEntries(Object.entries(refused).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))),
    admitted: records.filter((r) => r.admittedOnHead).length,
    ran: records.length,
    unrun: unrun.length,
    groups,
    rungs: {
      head0: records.filter((r) => !/** @type {any} */ (r.rungs[0]).head.ok).length,
      base0: records.filter((r) => /** @type {any} */ (r.rungs[0]).head.ok && !/** @type {any} */ (r.rungs[0]).base.ok).length,
      reached: records.filter((r) => r.rungs[1]).length,
      differ: differing.length,
      fail: records.filter((r) => r.rungs[3] && Object.values(r.rungs[3].failures).some(Boolean)).length,
      catches: records.filter((r) => r.rungs[3] && r.rungs[3].catch).length,
    },
    anchorsReached: Array.from(anchorsReached).sort(),
    observable: Object.fromEntries(Array.from(anchorsReached).sort().map((id) => [id, (anchors.find((a) => a.id === id) || { observable: 'unknown' }).observable])),
    mutants: byVerdict,
    linesReached: Object.fromEntries(Object.entries(lines).map(([a, set]) => [a, Array.from(set).sort((x, y) => x - y)])),
    floods: flooded,
    differences: differing.filter((r) => !inFlood.has(r.id)).map((r) => ({ id: r.id, world: r.world, summary: describeDifference(/** @type {Difference} */ (r.rungs[2])), block: /** @type {Difference} */ (r.rungs[2]).block, bundle: r.bundle })),
    catches: records.filter((r) => r.rungs[3] && r.rungs[3].catch).map((r) => ({ id: r.id, world: r.world, failure: r.rungs[3] ? r.rungs[3].failures : null, bundle: r.bundle })),
    lateGain: lateGain(records),
  };
}

/**
 * The access map (pin 5): every anchor aimed at once, with what reached it by
 * source; the anchors nothing reached, the approximate ones apart; those that
 * run at load; and the kinds not aimed at.
 * @param {Anchor[]} anchors
 * @param {any[]} views the report's anchors
 * @param {Map<string, Map<string, any>>} reachedBy
 * @param {Array<{ id: string, reason: string }>} notAimed
 */
function accessMap(anchors, views, reachedBy, notAimed) {
  const map = {
    anchors: anchors.map((a, i) => ({
      id: a.id, kind: a.kind, file: a.file, name: a.name, lines: a.lines, approximate: a.approximate,
      observable: a.observable,
      reachedBy: Array.from(/** @type {Map<string, any>} */ (reachedBy.get(a.id)).values()),
      runsAtLoad: views[i].runsAtLoad,
    })),
    notReached: /** @type {string[]} */ ([]),
    notSeenApproximate: /** @type {string[]} */ ([]),
    runsAtLoad: views.filter((v) => v.runsAtLoad).map((v) => v.id),
    notAimed: notAimed.map((n) => ({ id: n.id, reason: n.reason })),
  };
  for (const a of map.anchors) {
    if (a.reachedBy.length === 0) {
      if (a.approximate) {
        map.notSeenApproximate.push(a.id);
      } else {
        map.notReached.push(a.id);
      }
    }
  }
  for (const a of map.anchors) {
    delete /** @type {any} */ (a).runsAtLoad;
  }
  return map;
}

/**
 * The mutants, one at a time, each in a process of its own (pin 7).
 * @param {import('./mutants.js').Mutant[]} mutants
 * @param {{
 *   head: string, work: string, runnable: Map<string, any>,
 *   coverage: any, anchors: Anchor[], linesReached: Map<string, Set<number>>, reachedBy: Map<string, Map<string, any>>,
 *   environment: any, plant: Record<string, any>, say: (line: string) => void
 * }} ctx
 */
async function runMutants(mutants, ctx) {
  /** @type {any[]} */
  const results = [];
  const lawTree = join(ctx.work, 'law-tree');
  let lawReady = false;
  /** @type {string | null} */
  let reference = null;
  for (const m of mutants) {
    /** @type {any} */
    const result = {
      id: m.id, anchor: m.anchor, file: m.file, line: m.line, operator: m.operator, detail: m.detail, kind: m.kind, marked: m.marked, verdict: '', why: '', separatedBy: null,
      // What its runs are compared with (pin 7): a law mutant's with the head's
      // coverage build, like with like, and a JS mutant's with the head's product build.
      build: m.kind === 'law' ? 'the head\'s coverage build' : 'the head\'s product build',
      comparedWith: m.kind === 'law' ? { build: 'head coverage', digest: ctx.environment.binaries.coverage || null } : { build: 'head product', digest: ctx.environment.binaries.head },
    };
    const anchor = /** @type {Anchor} */ (ctx.anchors.find((a) => a.id === m.anchor));
    const lineReached = /** @type {Set<number>} */ (ctx.linesReached.get(m.anchor)).has(m.line)
      || ((anchor.kind === 'top-level' || anchor.kind === 'law-top-level' || anchor.kind === 'rule') && /** @type {Map<string, any>} */ (ctx.reachedBy.get(m.anchor)).size > 0);
    /** @type {string} */
    let tree;
    /** @type {{ from: string, to: string } | null} */
    let redirect = null;
    if (m.kind === 'law') {
      if (!lawReady) {
        mkdirSync(lawTree, { recursive: true });
        syncTree(ctx.head, lawTree);
        copyProduct(ctx.head, lawTree);
        // Its target starts as the head's coverage target without the law
        // crate's own files, so the reference compiles the law crate alone,
        // from the law tree's sources. Were any of its files left, cargo could
        // take the head's law crate as fresh, and the reference would carry the
        // head's source paths in its mapping, and so the head's bytes.
        const seeded = seedCoverage(ctx.head, lawTree);
        const ref = buildCoverage(lawTree, 'law tree reference');
        if (ref.digest === ctx.environment.binaries.coverage) {
          throw new BenchRefusal('the law tree\'s reference build has the head coverage build\'s bytes: its law crate was not built from the law tree\'s own sources');
        }
        ctx.environment.lawReferenceSeeded = seeded;
        ctx.environment.lawReferenceMs = Math.round(ref.ms);
        reference = ref.digest;
        ctx.environment.binaries.lawReference = ref.digest;
        lawReady = true;
      }
      const original = readFileSync(join(lawTree, m.file), 'utf8');
      writeFileSync(join(lawTree, m.file), m.text);
      try {
        let built;
        try {
          built = buildCoverage(lawTree, 'law mutant ' + m.id);
          /** @type {Record<string, number>} */
          const rebuilds = ctx.environment.lawRebuilds || {};
          rebuilds[m.id] = Math.round(built.ms);
          ctx.environment.lawRebuilds = rebuilds;
        } catch (error) {
          result.verdict = 'not scored';
          result.why = 'does not load: ' + (error instanceof Error ? error.message.split('\n')[0] : String(error));
          results.push(result);
          continue;
        }
        /** @type {Record<string, string>} */
        const lawMutants = ctx.environment.binaries.lawMutants || {};
        lawMutants[m.id] = built.digest;
        ctx.environment.binaries.lawMutants = lawMutants;
        if (built.digest === reference) {
          result.verdict = 'not scored';
          result.why = 'its rebuild changed no byte: the binary equals the law tree\'s reference';
          results.push(result);
          continue;
        }
        redirect = { from: productGlue(lawTree), to: built.glue };
        tree = lawTree;
        await separate(m, result, tree, redirect, ctx, lineReached);
      } finally {
        writeFileSync(join(lawTree, m.file), original);
      }
      results.push(result);
      continue;
    }
    tree = join(ctx.work, 'mutant-' + m.id);
    rmSync(tree, { recursive: true, force: true });
    copyTree(ctx.head, tree);
    writeFileSync(join(tree, m.file), m.text);
    copyProduct(ctx.head, tree);
    // A JS mutant runs the head's product binary file, byte for byte.
    /** @type {Record<string, string>} */
    const jsMutants = ctx.environment.binaries.jsMutants || {};
    jsMutants[m.id] = createHash('sha256').update(readFileSync(productGlue(tree))).digest('hex');
    ctx.environment.binaries.jsMutants = jsMutants;
    try {
      await separate(m, result, tree, null, ctx, lineReached);
    } finally {
      rmSync(tree, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
    results.push(result);
  }
  return results;
}

/**
 * Runs one mutant's process over every input the ladder ran on the head, in
 * order, and stops at the first that separates the mutant from the head.
 * Verdicts, the first that applies: not scored, marked, caught, survived, not
 * reached.
 * @param {import('./mutants.js').Mutant} m
 * @param {any} result
 * @param {string} tree
 * @param {{ from: string, to: string } | null} redirect
 * @param {any} ctx
 * @param {boolean} lineReached
 */
async function separate(m, result, tree, redirect, ctx, lineReached) {
  /** @type {Proc | null} */
  let proc = null;
  try {
    proc = await startProcess({ name: 'mutant ' + m.id, tree, build: m.kind === 'law' ? 'law mutant ' + m.id : 'mutant ' + m.id, coverage: false, redirect, modules: [] });
    // Its process and its time go in the environment block: a pid and a time
    // are the host's, not the report's.
    ctx.environment.mutants = ctx.environment.mutants || {};
    ctx.environment.mutants[m.id] = { pid: proc.pid, ms: 0 };
  } catch (error) {
    result.verdict = 'not scored';
    result.why = 'does not load: ' + (error instanceof Error ? error.message.split('\n')[0] : String(error));
    return;
  }
  const t0 = performance.now();
  try {
    let first = true;
    for (const [id, run] of ctx.runnable) {
      const ref = m.kind === 'law' ? run.coverage : run.head;
      if (!ref) {
        throw new BenchRefusal('the law mutant ' + m.id + ' has no run of the head\'s coverage build to be compared with on ' + id);
      }
      const got = run.control
        ? await proc.call('control', { ...run.control, window: false, restoreCheck: true })
        : await proc.call('candidate', { ...run.args, window: false });
      if (first && got.failedBeforeActing) {
        result.verdict = 'not scored';
        result.why = 'fails before any candidate acts: ' + (got.failure ? got.failure.detail : 'no frame');
        return;
      }
      first = false;
      // What separates them, in this order: rung 0 on the mutant, a rung-3
      // failure on one and not the other, then the trace, then an admission.
      /** @type {{ rung: string, detail: string } | null} */
      let by = null;
      if (got.rung0 && !got.rung0.ok) {
        by = { rung: 'rung 0', detail: 'rung 0 fails on the mutant: ' + String(got.rung0.detail).split('\n')[0] };
      } else if ((got.failure ? got.failure.kind : null) !== ref.failure) {
        by = { rung: 'rung 3', detail: 'a rung-3 failure on one and not the other: ' + (got.failure ? got.failure.kind + ' on the mutant (' + got.failure.detail + ')' : ref.failure + ' on the head') };
      } else if (got.digests.length !== ref.digests.length || got.digests.some((/** @type {string} */ d, /** @type {number} */ i) => d !== ref.digests[i])) {
        const at = got.digests.findIndex((/** @type {string} */ d, /** @type {number} */ i) => d !== ref.digests[i]);
        by = { rung: 'rung 2', detail: 'a trace difference at tick ' + (at >= 0 ? at : Math.min(got.digests.length, ref.digests.length)) };
      } else if (got.admissions.some((/** @type {any} */ a, /** @type {number} */ i) => a.admitted !== ref.admitted[i])) {
        by = { rung: 'rung 2', detail: 'an admission differs' };
      }
      if (by) {
        result.separatedBy = { input: id, rung: by.rung, by: by.detail };
        break;
      }
    }
  } finally {
    await proc.close();
    ctx.environment.mutants[m.id].ms = Math.round(performance.now() - t0);
  }
  if (m.marked) {
    result.verdict = 'marked';
    result.why = 'its text equals the base\'s at that line, so a difference it shows is the base\'s own' + (result.separatedBy ? ' (it separates the trees)' : '');
  } else if (result.separatedBy) {
    result.verdict = 'caught';
    result.why = 'separated by ' + result.separatedBy.by + ' on ' + result.separatedBy.input;
  } else if (lineReached) {
    result.verdict = 'survived';
    result.why = 'a source reached the line it was made from, and nothing separated them';
  } else {
    result.verdict = 'not reached';
    result.why = 'no source reached the line it was made from';
  }
}

export { applyEdits, lineStats };
