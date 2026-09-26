// Reach (T7b pin 3): from a window's measurements to the anchors it reached.
//
// A window is measured twice over: V8's block counts at the probes the
// anchors name, taken in a head-tree process, and, when the head changes the
// law, the coverage build's counters mapped to the law's lines. The sources a
// window comes from are named as pin 3 names them: `window`, a candidate's
// intent and the quanta after it; `restore`, rung 0's second run from the
// load; `load`, a process's own module loading, before any candidate; and
// `suite`, one hazard's run of the suite.
//
//   js          reached when V8 counts its function's body;
//   top-level   when a function that names one of its identifiers ran; an
//               import or export line, or one with no identifier, when its
//               module loaded;
//   deletion    when V8 counts the innermost block at its point, or a function
//               that names what it declared ran;
//   law         when its function's entry region counts, in the mapping;
//   law-top-level, law-deletion  likewise, by the functions that name it or
//               the innermost region at its point, or, at a point between
//               regions, the first region of the innermost block around it;
//   rule        when its verb was submitted in the window, admitted or refused;
//   catalog     when any intent was submitted, or the verb a line retires or
//               restores was;
//   hazard      when the suite ran its hazard.

import { countAt, lineStats, normalize, regionAt } from './profile.js';

/**
 * @typedef {import('./anchors.js').Anchor} Anchor
 * @typedef {{ file: string, offsets: number[] }} ProbeFile
 * @typedef {{ files: ProbeFile[], at: Map<string, [number, number]> }} ProbeTable
 * @typedef {{ anchors: Set<string>, lines: Map<string, Set<number>> }} Reach
 */

/**
 * The probe table: every offset any anchor names, grouped by file, and where
 * each (file, offset) sits in the table. A module's offset 0 is its top-level
 * code, counted once when it loads.
 * @param {Anchor[]} anchors
 * @returns {ProbeTable}
 */
export function probeTable(anchors) {
  /** @type {Map<string, number[]>} */
  const byFile = new Map();
  /** @param {string} file @param {number} offset */
  const add = (file, offset) => {
    const list = byFile.get(file) || [];
    if (!list.includes(offset)) {
      list.push(offset);
    }
    byFile.set(file, list);
  };
  for (const a of anchors) {
    for (const p of a.probes) {
      add(p.file, p.offset);
    }
    for (const lp of a.lineProbes) {
      add(lp.probe.file, lp.probe.offset);
    }
    if (a.module) {
      add(a.module, 0);
    }
  }
  const files = Array.from(byFile.keys()).sort().map((file) => ({ file, offsets: /** @type {number[]} */ (byFile.get(file)).slice().sort((x, y) => x - y) }));
  /** @type {Map<string, [number, number]>} */
  const at = new Map();
  files.forEach((f, i) => f.offsets.forEach((offset, j) => at.set(f.file + '@' + offset, [i, j])));
  return { files, at };
}

/**
 * V8's count at one probe in a window, 0 when the table does not hold it.
 * @param {ProbeTable} table
 * @param {number[][]} counts
 * @param {string} file
 * @param {number} offset
 */
function probeCount(table, counts, file, offset) {
  const where = table.at.get(file + '@' + offset);
  if (!where || !counts[where[0]]) {
    return 0;
  }
  return counts[where[0]][where[1]] || 0;
}

/**
 * The anchors a window reached, and each anchor's changed lines reached.
 * @param {Anchor[]} anchors
 * @param {ProbeTable} table
 * @param {{
 *   counts: number[][] | null,
 *   law: Map<string, import('./profile.js').Segments> | null,
 *   verbs: string[], anyIntent: boolean,
 *   hazard: string | null, load: boolean,
 *   tree: string
 * }} window verbs: the verbs submitted in the window; hazard: the hazard a
 *   suite window ran; load: a load window, which reaches what runs at load
 * @returns {Reach}
 */
export function reachOf(anchors, table, window) {
  /** @type {Set<string>} */
  const reached = new Set();
  /** @type {Map<string, Set<number>>} */
  const lines = new Map();
  /** @param {string} id @param {number} line */
  const lineReached = (id, line) => {
    const set = lines.get(id) || new Set();
    set.add(line);
    lines.set(id, set);
  };
  /** @param {string} file */
  const segmentsOf = (file) => {
    if (!window.law) {
      return null;
    }
    return window.law.get(normalize(window.tree.replace(/\\/g, '/') + '/' + file)) || null;
  };
  for (const a of anchors) {
    if (a.kind === 'js' || a.kind === 'deletion' || a.kind === 'top-level') {
      if (!window.counts) {
        continue;
      }
      const counts = window.counts;
      if (a.probes.some((p) => probeCount(table, counts, p.file, p.offset) > 0)) {
        reached.add(a.id);
      }
      for (const lp of a.lineProbes) {
        if (probeCount(table, counts, lp.probe.file, lp.probe.offset) > 0) {
          lineReached(a.id, lp.line);
        }
      }
      if (window.load && a.runsAtLoad && a.module && probeCount(table, counts, a.module, 0) > 0) {
        reached.add(a.id);
      }
      continue;
    }
    if (a.kind === 'law' || a.kind === 'law-top-level' || a.kind === 'law-deletion') {
      for (const entry of a.lawEntries) {
        const segments = segmentsOf(entry.file);
        if (!segments) {
          continue;
        }
        // A deletion's point reads its region; every other entry, a function's.
        const region = a.kind === 'law-deletion' && entry.block !== undefined ? regionAt(segments, entry) : null;
        const count = region ? region.count : a.kind === 'law-deletion' && entry.block !== undefined ? null : countAt(segments, entry.line, entry.column);
        if (count !== null && count > 0) {
          reached.add(a.id);
        }
      }
      for (const l of a.lawLines) {
        const segments = segmentsOf(l.file);
        if (!segments) {
          continue;
        }
        const stats = lineStats(segments);
        const count = stats.get(l.line);
        if (count !== undefined && count > 0) {
          lineReached(a.id, l.line);
        }
      }
      continue;
    }
    if (a.kind === 'rule' || a.kind === 'catalog') {
      if ((a.anyIntent && window.anyIntent) || (a.verb !== null && window.verbs.includes(a.verb))) {
        reached.add(a.id);
        for (const line of a.executable) {
          lineReached(a.id, line);
        }
      }
      continue;
    }
    if (a.kind === 'hazard' && a.hazard && window.hazard !== null && (a.hazard.id === window.hazard || a.hazard.id === '*')) {
      reached.add(a.id);
      for (const line of a.executable) {
        lineReached(a.id, line);
      }
    }
  }
  return { anchors: reached, lines };
}

/**
 * The law files whose lines a mapping must export: every file a law anchor
 * names, and the file holding the step function the canary reads.
 * @param {Anchor[]} anchors
 * @param {string} stepFile
 */
export function lawSources(anchors, stepFile) {
  /** @type {Set<string>} */
  const files = new Set([stepFile]);
  for (const a of anchors) {
    for (const e of a.lawEntries) {
      files.add(e.file);
    }
    for (const l of a.lawLines) {
      files.add(l.file);
    }
  }
  return Array.from(files).sort();
}

/**
 * The law's lines a mapping says are executable: those in a region.
 * @param {Map<string, import('./profile.js').Segments>} law
 * @param {string} tree
 * @param {string} file
 */
export function mappedLines(law, tree, file) {
  const segments = law.get(normalize(tree.replace(/\\/g, '/') + '/' + file));
  return segments ? new Set(lineStats(segments).keys()) : new Set();
}
