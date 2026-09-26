// The record and the report (T7b pin 8): what each candidate's record holds,
// the stall and the late gain after it (pin 5), floods, and the markdown
// summary of a report.

/** The stall's reporting grid: the n of the grammar's stall, a grid and not a setting (pin 5). */
export const STALL_GRID = [8, 16, 32, 64, 128];

/** The stall at which the model starts: the one the grid measured, n of 8. */
export const MODEL_STALL_N = 8;

/**
 * @typedef {{
 *   kind: 'trace', tick: number, body: string, field: string, block: string
 * } | {
 *   kind: 'admission', tick: number, index: number, verb: string, refusing: string, reasons: Record<string, string>, block: string
 * } | {
 *   kind: 'failure', tick: number, failureKind: string, tree: string, block: string
 * }} Difference
 * @typedef {{
 *   id: string, proposer: string, world: string, cell: string | null, actor: string | null, group: number | null, step: number | null,
 *   witness: Array<{ tick: number, proposal: any }>, witnessEnd: number, intent: { tick: number, proposal: any } | null,
 *   control: { kind: string, file: string } | null,
 *   anchors: string[], lines: Record<string, number[]>, restoreAnchors: string[],
 *   admission: Record<string, Array<{ index: number, tick: number, admitted: boolean, reason: string }>>,
 *   admittedOnHead: boolean,
 *   rungs: {
 *     0: Record<string, { ok: boolean, detail: string | null }>,
 *     1: boolean | null,
 *     2: Difference | null,
 *     3: { failures: Record<string, { kind: string, tick: number, detail: string } | null>, catch: boolean } | null
 *   },
 *   recorded: string[],
 *   notes: string[],
 *   cost: { quanta: number, restores: number },
 *   bundle: string | null
 * }} CandidateRecord
 */

/**
 * The keys a record's difference counts under for the stall: (anchor reached,
 * body, field) for a trace difference; (anchor reached, verb, the refusing
 * tree) for an admission difference; (anchor reached, the failure's kind) for
 * a rung-3 failure on one tree alone. A record that reached no anchor keys its
 * difference under '-'.
 * @param {CandidateRecord} record
 * @returns {string[]}
 */
export function differenceKeys(record) {
  /** @type {string[]} */
  const keys = [];
  const anchors = record.anchors.length > 0 ? record.anchors : ['-'];
  const d = record.rungs[2];
  if (d) {
    for (const a of anchors) {
      if (d.kind === 'trace') {
        keys.push('trace|' + a + '|' + d.body + '|' + d.field);
      } else if (d.kind === 'admission') {
        keys.push('admission|' + a + '|' + d.verb + '|' + d.refusing);
      }
    }
  }
  const r3 = record.rungs[3];
  if (r3) {
    const trees = Object.keys(r3.failures);
    for (const tree of trees) {
      const f = r3.failures[tree];
      if (f && trees.filter((other) => other !== tree).every((other) => !r3.failures[other] || /** @type {any} */ (r3.failures[other]).kind !== f.kind)) {
        for (const a of anchors) {
          keys.push('failure|' + a + '|' + f.kind);
        }
      }
    }
  }
  return keys;
}

/**
 * The stall and the late gain for one proposer's records in order (pin 5): a
 * gain is a changed line reached for the first time or a difference whose key
 * is new; the proposer stalls after n admitted candidates with no gain, and
 * the late gain after that stall is every gain that came after it.
 * @param {CandidateRecord[]} records
 * @returns {Array<{ n: number, stalledAt: string | null, admittedBefore: number | null, lateGain: { lines: number, differences: number } | null }>}
 */
export function lateGain(records) {
  /** @type {Set<string>} */
  const lines = new Set();
  /** @type {Set<string>} */
  const keys = new Set();
  /** @type {Array<{ lines: number, differences: number }>} */
  const gains = [];
  /** @type {Map<number, number>} */
  const stalls = new Map();
  let since = 0;
  let admitted = 0;
  /** @type {number[]} */
  const admittedAt = [];
  records.forEach((record, i) => {
    let newLines = 0;
    for (const [anchor, list] of Object.entries(record.lines)) {
      for (const line of list) {
        const key = anchor + ':' + line;
        if (!lines.has(key)) {
          lines.add(key);
          newLines = newLines + 1;
        }
      }
    }
    let newDifferences = 0;
    for (const key of differenceKeys(record)) {
      if (!keys.has(key)) {
        keys.add(key);
        newDifferences = newDifferences + 1;
      }
    }
    gains.push({ lines: newLines, differences: newDifferences });
    if (newLines + newDifferences > 0) {
      since = 0;
    } else if (record.admittedOnHead) {
      since = since + 1;
    }
    if (record.admittedOnHead) {
      admitted = admitted + 1;
    }
    admittedAt.push(admitted);
    for (const n of STALL_GRID) {
      if (!stalls.has(n) && since >= n) {
        stalls.set(n, i);
      }
    }
  });
  return STALL_GRID.map((n) => {
    const at = stalls.get(n);
    if (at === undefined) {
      return { n, stalledAt: null, admittedBefore: null, lateGain: null };
    }
    const after = gains.slice(at + 1);
    return {
      n,
      stalledAt: records[at].id,
      admittedBefore: admittedAt[at],
      lateGain: { lines: after.reduce((sum, g) => sum + g.lines, 0), differences: after.reduce((sum, g) => sum + g.differences, 0) },
    };
  });
}

/**
 * The record index where a proposer first goes n admitted candidates with no
 * new changed line and no new difference, or null when the records end first.
 * The model starts after that record. n of 8 is the stall the grid measured.
 * @param {CandidateRecord[]} records
 * @param {number} [n]
 * @returns {number | null}
 */
export function stallIndex(records, n = MODEL_STALL_N) {
  const row = lateGain(records).find((item) => item.n === n);
  if (!row || row.stalledAt === null) {
    return null;
  }
  const index = records.findIndex((record) => record.id === row.stalledAt);
  return index < 0 ? null : index;
}

/**
 * Candidates in order until their cost reaches the quanta and restores named,
 * including the candidate that crosses. Nothing is taken when both are zero.
 * @param {CandidateRecord[]} records
 * @param {number} quanta
 * @param {number} restores
 */
export function withinCost(records, quanta, restores) {
  /** @type {CandidateRecord[]} */
  const out = [];
  if (quanta <= 0 && restores <= 0) {
    return out;
  }
  let q = 0;
  let r = 0;
  for (const record of records) {
    if (q >= quanta && r >= restores) {
      break;
    }
    out.push(record);
    q = q + record.cost.quanta;
    r = r + record.cost.restores;
  }
  return out;
}

/**
 * What an arm found that the records before the start point had not: new
 * changed lines and new difference keys, from admitted candidates only.
 * @param {CandidateRecord[]} before
 * @param {CandidateRecord[]} arm
 */
export function newFindings(before, arm) {
  /** @type {Set<string>} */
  const lines = new Set();
  /** @type {Set<string>} */
  const keys = new Set();
  for (const record of before) {
    for (const [anchor, list] of Object.entries(record.lines || {})) {
      for (const line of list) {
        lines.add(anchor + ':' + line);
      }
    }
    for (const key of differenceKeys(record)) {
      keys.add(key);
    }
  }
  /** @type {string[]} */
  const newLines = [];
  /** @type {string[]} */
  const newKeys = [];
  for (const record of arm) {
    if (!record.admittedOnHead) {
      continue;
    }
    for (const [anchor, list] of Object.entries(record.lines || {})) {
      for (const line of list) {
        const key = anchor + ':' + line;
        if (!lines.has(key)) {
          lines.add(key);
          newLines.push(key);
        }
      }
    }
    for (const key of differenceKeys(record)) {
      if (!keys.has(key)) {
        keys.add(key);
        newKeys.push(key);
      }
    }
  }
  return { lines: newLines, differences: newKeys };
}

/**
 * The report body, up to the environment section, which ends the file. A line
 * after that section is refused.
 * @param {string} text
 * @returns {{ ok: true, summary: string } | { ok: false, reason: string }}
 */
export function cutReport(text) {
  const marker = '\n## Environment\n';
  const at = text.indexOf(marker);
  if (at < 0 || text.slice(0, at).includes('## Environment')) {
    return { ok: false, reason: 'the environment section does not end the file' };
  }
  const after = text.slice(at + marker.length);
  const close = after.lastIndexOf('```');
  if (close < 0 || after.slice(close + 3).trim() !== '') {
    return { ok: false, reason: 'a line follows the environment section, which ends the file' };
  }
  return { ok: true, summary: text.slice(0, at) };
}

/**
 * The floods among one proposer's records (pin 4): every compared candidate
 * differs the same way; or a verb's admissions differ throughout, which is
 * that in every compared candidate where either tree admits the verb, its
 * first difference is that verb's admission, refused on the same tree. A
 * candidate where both trees refuse the verb says nothing about the rule
 * either way, since reason text alone is no difference.
 * @param {CandidateRecord[]} records
 * @returns {Array<{ line: string, ids: string[] }>}
 */
export function floods(records) {
  /** @type {Array<{ line: string, ids: string[] }>} */
  const out = [];
  const compared = records.filter((r) => r.recorded.includes('2'));
  const differing = compared.filter((r) => r.rungs[2] !== null);
  if (differing.length >= 2 && differing.length === compared.length) {
    const signatures = new Set(differing.map((r) => signature(/** @type {Difference} */ (r.rungs[2]))));
    if (signatures.size === 1) {
      const d = /** @type {Difference} */ (differing[0].rungs[2]);
      out.push({ line: 'every one of the ' + differing.length + ' candidates compared differs the same way: ' + describeFlood(d), ids: differing.map((r) => r.id) });
      return out;
    }
  }
  /** @type {Map<string, { live: string[], differ: string[], refusing: Set<string> }>} */
  const byVerb = new Map();
  for (const r of compared) {
    const intents = r.witness.concat(r.intent ? [r.intent] : []);
    const d = r.rungs[2];
    /** @type {Set<string>} */
    const live = new Set();
    for (const entries of Object.values(r.admission)) {
      for (const e of entries) {
        const submitted = intents[e.index];
        if (e.admitted && submitted && submitted.proposal && typeof submitted.proposal.verb === 'string') {
          live.add(submitted.proposal.verb);
        }
      }
    }
    if (d && d.kind === 'admission') {
      live.add(d.verb);
    }
    for (const verb of live) {
      const entry = byVerb.get(verb) || { live: [], differ: [], refusing: new Set() };
      entry.live.push(r.id);
      if (d && d.kind === 'admission' && d.verb === verb) {
        entry.differ.push(r.id);
        entry.refusing.add(d.refusing);
      }
      byVerb.set(verb, entry);
    }
  }
  for (const [verb, entry] of Array.from(byVerb.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (entry.differ.length >= 2 && entry.differ.length === entry.live.length && entry.refusing.size === 1) {
      out.push({ line: 'admissions of ' + verb + ' differ throughout: refused on the ' + Array.from(entry.refusing)[0] + ' in each of the ' + entry.differ.length + ' candidates where either tree admits it', ids: entry.differ });
    }
  }
  return out;
}

/**
 * What a flood's candidates share: the whole of a trace difference's place,
 * and an admission difference's verb and refusing tree, whose ticks may differ.
 * @param {Difference} d
 */
function signature(d) {
  if (d.kind === 'trace') {
    return 'trace ' + d.tick + ' ' + d.body + ' ' + d.field;
  }
  if (d.kind === 'admission') {
    return 'admission ' + d.verb + ' ' + d.refusing;
  }
  return 'failure ' + d.failureKind + ' ' + d.tree;
}

/**
 * A flood's shared difference in words: only what its signature holds.
 * @param {Difference} d
 */
function describeFlood(d) {
  if (d.kind === 'admission') {
    return 'admission of ' + d.verb + ' differs, refused on the ' + d.refusing;
  }
  if (d.kind === 'failure') {
    return 'a ' + d.failureKind + ' failure on the ' + d.tree + ' alone';
  }
  return describeDifference(d);
}

/**
 * One line for a difference.
 * @param {Difference} d
 */
export function describeDifference(d) {
  if (d.kind === 'trace') {
    return 'at tick ' + d.tick + (d.body === '-' ? ' in the ' + d.field : ', body ' + d.body + ', field ' + d.field);
  }
  if (d.kind === 'admission') {
    return 'admission differs at tick ' + d.tick + ': ' + d.verb + ' refused on the ' + d.refusing;
  }
  return 'a ' + d.failureKind + ' failure on the ' + d.tree + ' alone at tick ' + d.tick;
}

/**
 * A table row, cells escaped for markdown.
 * @param {Array<string | number>} cells
 */
function row(cells) {
  return '| ' + cells.map((c) => String(c).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |';
}

/**
 * The markdown summary of a report.
 * @param {any} report
 */
export function markdown(report) {
  /** @type {string[]} */
  const out = [];
  out.push('# Bench report');
  out.push('');
  if (report.refused) {
    out.push('**Refused:** ' + report.refused);
    out.push('');
  }
  out.push('Seed ' + report.seed + '. Budgets: sweep ' + report.budgets.sweep.quanta + ' quanta and ' + report.budgets.sweep.restores + ' restores per world; ladder ' + report.budgets.ladder.quanta + ' quanta and ' + report.budgets.ladder.restores + ' restores per proposer per world. Spent: ' + report.spent.quanta + ' quanta and ' + report.spent.restores + ' restores.');
  out.push('');
  out.push('Binaries: ' + report.binaries.mode + '. Coverage build: ' + (report.coverage.made ? 'made; ' + report.coverage.productScene : 'not made (' + report.coverage.why + ')') + '.');
  out.push('');
  out.push('## Anchors');
  out.push('');
  out.push(row(['anchor', 'kind', 'lines', 'reached by', 'changed lines reached', 'observable']));
  out.push(row(['---', '---', '---', '---', '---', '---']));
  for (const a of report.anchors) {
    out.push(row([a.id, a.kind, a.lines.map((/** @type {number[]} */ r) => r[0] === r[1] ? r[0] : r[0] + '-' + r[1]).join(', '), a.reachedBy.length > 0 ? a.reachedBy.join(', ') : (a.approximate ? 'not seen reached (approximate)' : 'not reached'), a.noExecutableChange ? 'no executable change' : a.linesReached.length + ' of ' + a.executable.length, a.observable]));
  }
  out.push('');
  for (const [name, p] of Object.entries(report.proposers)) {
    const proposer = /** @type {any} */ (p);
    out.push('## ' + name);
    out.push('');
    out.push('Proposed ' + proposer.proposed + ', refused ' + proposer.refused + ', admitted ' + proposer.admitted + '; ran ' + proposer.ran + ' through the ladder, ' + proposer.unrun + ' left unrun by the budget.');
    if (Object.keys(proposer.refusals).length > 0) {
      out.push('');
      out.push('Refusals: ' + Object.entries(proposer.refusals).map(([reason, n]) => n + ' x ' + reason).join('; '));
    }
    out.push('');
    out.push('Rungs: 0 failed on the head ' + proposer.rungs.head0 + ', on the base ' + proposer.rungs.base0 + '; 1 reached ' + proposer.rungs.reached + '; 2 differ ' + proposer.rungs.differ + '; 3 fail ' + proposer.rungs.fail + ', catches ' + proposer.rungs.catches + '.');
    for (const flood of proposer.floods) {
      out.push('');
      out.push('Flood: ' + flood.line);
    }
    for (const d of proposer.differences) {
      out.push('');
      out.push('- ' + d.id + ': ' + d.summary + (d.bundle ? ' (bundle ' + d.bundle + ')' : ''));
    }
    out.push('');
    out.push('Late gain: ' + proposer.lateGain.map((/** @type {any} */ g) => 'n=' + g.n + ' ' + (g.stalledAt === null ? 'no stall' : 'stalled at ' + g.stalledAt + ', then ' + g.lateGain.lines + ' lines and ' + g.lateGain.differences + ' differences')).join('; ') + '.');
    out.push('');
  }
  if (Array.isArray(report.arms)) {
    out.push('## Arms');
    out.push('');
    /** @param {string[]} items */
    const listed = (items) => (items.length === 0 ? 'none' : items.join(', '));
    for (const arm of report.arms) {
      const where = arm.start.candidate === null ? 'the end of the grammar\'s budget' : arm.start.candidate;
      out.push(arm.world + ': the model starts at ' + where + '.');
      out.push('Arm M: ' + arm.M.calls + ' calls, ' + arm.M.quanta + ' quanta, ' + arm.M.restores + ' restores. New lines: ' + listed(arm.M.findings.lines) + '. New differences: ' + listed(arm.M.findings.differences) + '. Newly caught mutants: ' + listed(arm.M.findings.mutants) + '.');
      out.push('Arm G: ' + arm.G.quanta + ' quanta, ' + arm.G.restores + ' restores' + (arm.G.extended ? ', extended past the grammar\'s budget' : '') + '. New lines: ' + listed(arm.G.findings.lines) + '. New differences: ' + listed(arm.G.findings.differences) + '. Newly caught mutants: ' + listed(arm.G.findings.mutants) + '.');
      out.push('');
    }
  }
  out.push('## Mutants');
  out.push('');
  out.push(report.mutants.note);
  out.push('');
  for (const [verdict, list] of Object.entries(report.mutants.byVerdict)) {
    out.push('- ' + verdict + ': ' + (/** @type {any[]} */ (list)).map((m) => m.id + ' ' + m.operator + ' at ' + m.file + ':' + m.line).join('; '));
  }
  if (report.mutants.leftOut.length > 0) {
    out.push('- left out by the cap of ' + report.mutants.cap + ': ' + report.mutants.leftOut.map((/** @type {any} */ m) => m.anchor + ' ' + m.operator).join('; '));
  }
  out.push('');
  out.push('## What was not measured');
  out.push('');
  for (const [what, list] of Object.entries(report.notMeasured)) {
    const items = /** @type {any[]} */ (list);
    out.push('- ' + what + ': ' + (items.length === 0 ? 'none' : items.map((item) => typeof item === 'string' ? item : (item.id || item.anchor || item.file || '') + (item.reason ? ' (' + item.reason + ')' : item.count !== undefined ? ' ' + item.count : '')).join('; ')));
  }
  out.push('');
  out.push('## Environment');
  out.push('');
  out.push('```');
  out.push(JSON.stringify(report.environment, null, 1));
  out.push('```');
  out.push('');
  return out.join('\n');
}
