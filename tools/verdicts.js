// Reading a reviewer's answer and combining the panel's verdicts. Kept apart from gathering and
// transport, so the rule that decides a merge is tested without calling a model.

/**
 * @typedef {{ n: number | string, result: string, evidence?: string }} Item
 * @typedef {{ file: string, severity: string, what: string }} Defect
 * @typedef {{ items: Item[], defects?: Defect[], verdict: 'MERGE' | 'BLOCK', block_reason?: string }} Verdict
 * @typedef {{ family: string, parsed: Verdict }} Counted
 * @typedef {'NO VALID VERDICTS' | 'MERGE' | 'BLOCK' | 'CHECK'} Decision
 * @typedef {{ completion_tokens?: number, max_tokens?: number, finish_reason?: string, done_reason?: string, thinking_chars?: number, completion_tokens_details?: { reasoning_tokens?: number } }} Usage
 */

/**
 * The verdict at the end of a reviewer's answer: the last candidate that parses as JSON with an
 * items array and a verdict of MERGE or BLOCK, or null. The candidates are every fenced json block
 * and, tried first, the text from the last `{"items"` to the end of the answer.
 * @param {string} text
 * @returns {Verdict | null}
 */
export function parseVerdict(text) {
  const candidates = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].map((b) => b[1]);
  const brace = text.lastIndexOf('{"items"');
  if (brace >= 0) candidates.push(text.slice(brace));
  for (let i = candidates.length - 1; i >= 0; i = i - 1) {
    try {
      const j = JSON.parse(candidates[i].trim());
      if (j && Array.isArray(j.items) && (j.verdict === 'MERGE' || j.verdict === 'BLOCK')) return j;
    } catch {}
  }
  return null;
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
