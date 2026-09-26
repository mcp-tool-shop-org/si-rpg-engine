// Reading a reviewer's answer and combining the panel's verdicts. Kept apart from gathering and
// transport, so the rule that decides a merge is tested without calling a model.

/**
 * @typedef {{ n: number | string, result: string, evidence?: string }} Item
 * @typedef {{ file: string, severity: string, what: string }} Defect
 * @typedef {{ items: Item[], defects?: Defect[], verdict: 'MERGE' | 'BLOCK', block_reason?: string, trailingCommas?: boolean }} Verdict
 * @typedef {{ family: string, parsed: Verdict }} Counted
 * @typedef {'NO VALID VERDICTS' | 'MERGE' | 'BLOCK' | 'CHECK'} Decision
 * @typedef {{ completion_tokens?: number, max_tokens?: number, finish_reason?: string, done_reason?: string, thinking_chars?: number, completion_tokens_details?: { reasoning_tokens?: number } }} Usage
 */

/**
 * Every balanced {...} span in the text, as start and end offsets, found in one pass. Braces
 * inside JSON strings do not count. Quotation marks are read as strings only inside a brace, so
 * quotation marks in the prose before the JSON cannot hide it.
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
function objectSpans(text) {
  /** @type {Array<[number, number]>} */
  const spans = [];
  /** @type {number[]} */
  const open = [];
  let inString = false;
  for (let i = 0; i < text.length; i = i + 1) {
    const c = text[i];
    if (inString) {
      if (c === '\\') {
        i = i + 1;
      } else if (c === '"') {
        inString = false;
      }
    } else if (c === '"') {
      inString = open.length > 0;
    } else if (c === '{') {
      open.push(i);
    } else if (c === '}') {
      const start = open.pop();
      if (start !== undefined) {
        spans.push([start, i + 1]);
      }
    }
  }
  return spans;
}

/**
 * The verdict an answer ends with. Of every candidate that parses as JSON with an items array and
 * a verdict of MERGE or BLOCK, it is the one that ends last in the answer, the outermost when two
 * end together. The candidates are every fenced json block and every balanced {...} span that
 * mentions both keys, so the verdict is found whatever order its keys are in and whatever prose
 * comes before or after it. A candidate that is JSON but for a comma before a closing bracket or
 * brace is read without that comma, as Z.ai's MERGE on PR #95 had to be, and the verdict says so
 * with `trailingCommas`. Entries of `items` and `defects` that are not objects are dropped, so a
 * malformed entry cannot crash what reads them. Null when there is none.
 * @param {string} text
 * @returns {Verdict | null}
 */
export function parseVerdict(text) {
  /** @type {Array<{ body: string, end: number, length: number }>} */
  const candidates = [];
  for (const m of text.matchAll(/```json\s*([\s\S]*?)```/g)) {
    candidates.push({ body: m[1], end: (m.index ?? 0) + m[0].length, length: m[0].length });
  }
  for (const [start, end] of objectSpans(text)) {
    const body = text.slice(start, end);
    if (body.includes('"items"') && body.includes('"verdict"')) {
      candidates.push({ body, end, length: end - start });
    }
  }
  candidates.sort((a, b) => b.end - a.end || b.length - a.length);
  for (const c of candidates) {
    const body = c.body.trim();
    const loose = withoutTrailingCommas(body);
    for (const [source, trailingCommas] of /** @type {Array<[string, boolean]>} */ ([[body, false], [loose, true]])) {
      if (trailingCommas && loose === body) {
        continue;
      }
      /** @type {any} */
      let j;
      try {
        j = JSON.parse(source);
      } catch {
        continue;
      }
      if (j && Array.isArray(j.items) && (j.verdict === 'MERGE' || j.verdict === 'BLOCK')) {
        return {
          ...j,
          ...(trailingCommas ? { trailingCommas: true } : {}),
          items: j.items.filter((/** @type {unknown} */ i) => i !== null && typeof i === 'object'),
          defects: Array.isArray(j.defects) ? j.defects.filter((/** @type {unknown} */ d) => d !== null && typeof d === 'object') : [],
        };
      }
    }
  }
  return null;
}

/**
 * The text with every comma dropped that stands, outside a string, before a closing bracket or
 * brace with only whitespace between. Commas inside strings are kept.
 * @param {string} text
 * @returns {string}
 */
function withoutTrailingCommas(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i = i + 1) {
    const c = text[i];
    if (inString) {
      out = out + c;
      if (c === '\\' && i + 1 < text.length) {
        i = i + 1;
        out = out + text[i];
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
    } else if (c === ',') {
      let k = i + 1;
      while (k < text.length && /\s/.test(text[k])) {
        k = k + 1;
      }
      if (text[k] === ']' || text[k] === '}') {
        continue;
      }
    }
    out = out + c;
  }
  return out;
}

/**
 * Why an answer without a verdict was not counted, from the answer and the transport's usage.
 * An answer that ended because it reached its output budget says so, with the tokens it used,
 * the budget, and how much of it went to reasoning, so a truncated answer is never read as a
 * reviewer that declined to decide.
 * @param {string} text
 * @param {Usage | null | undefined} usage
 * @returns {string}
 */
export function whyNotCounted(text, usage) {
  const u = usage || {};
  const answer = text.trim().length === 0 ? 'no answer' : 'the answer stopped before its verdict';
  if (u.finish_reason === 'length' || u.done_reason === 'length') {
    const used = typeof u.completion_tokens === 'number' ? u.completion_tokens + (typeof u.max_tokens === 'number' ? ' of ' + u.max_tokens : '') + ' tokens' : 'the budget';
    const reasoning = u.completion_tokens_details && typeof u.completion_tokens_details.reasoning_tokens === 'number'
      ? ', ' + u.completion_tokens_details.reasoning_tokens + ' of them reasoning'
      : typeof u.thinking_chars === 'number' && u.thinking_chars > 0 ? ', with ' + u.thinking_chars + ' characters of thinking' : '';
    return 'output budget spent: ' + used + reasoning + '; ' + answer;
  }
  return text.trim().length === 0 ? 'no answer' : 'answer did not contain the verdict JSON';
}

/**
 * Combine the verdicts that were counted. No BLOCK is a MERGE. A BLOCK is corroborated only when
 * two or more families BLOCK and fail the same checklist item; any other BLOCK is a CHECK, which
 * the coordinator settles against the code, so a lone dissent never decides. A family counts once
 * per item however often it lists that item, item numbers compare as text so 3 and "3" are one
 * item, and a result is read without regard to case or surrounding space.
 * @param {Counted[]} counted
 * @returns {{ decision: Decision, shared: [string, string[]][], text: string }}
 */
export function combine(counted) {
  const blocks = counted.filter((r) => r.parsed.verdict === 'BLOCK');
  /** @type {Map<string, Set<string>>} */
  const failedBy = new Map();
  for (const r of blocks) {
    for (const i of r.parsed.items) {
      if (String(i.result).trim().toUpperCase() !== 'FAILS') continue;
      const n = String(i.n).trim();
      const families = failedBy.get(n) || new Set();
      families.add(r.family);
      failedBy.set(n, families);
    }
  }
  /** @type {[string, string[]][]} */
  const shared = [];
  for (const [n, families] of failedBy) {
    if (families.size >= 2) shared.push([n, [...families]]);
  }
  if (counted.length === 0) return { decision: 'NO VALID VERDICTS', shared, text: 'NO VALID VERDICTS' };
  if (blocks.length === 0) return { decision: 'MERGE', shared, text: 'MERGE (unanimous among valid verdicts)' };
  if (shared.length) {
    return { decision: 'BLOCK', shared, text: 'BLOCK: item ' + shared.map(([n, f]) => n + ' failed by ' + f.join(' and ')).join('; ') };
  }
  return {
    decision: 'CHECK',
    shared,
    text: 'CHECK: ' + blocks.length + ' BLOCK' + (blocks.length > 1 ? 's on different items' : '') + '; the coordinator checks each against the code',
  };
}
