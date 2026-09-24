// Turn a model's text into a proposal the tick can refuse.
// The seat stamps the frame hash. The model does not get to name it.

/**
 * @param {string} text
 * @param {string} frameHash
 * @returns {{ verdict: 'ok', proposal: import('../frame/types.js').Proposal } | { verdict: 'not-json' | 'wrong-shape', proposal: null }}
 */
export function readProposal(text, frameHash) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { verdict: 'not-json', proposal: null };
  }
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { verdict: 'not-json', proposal: null };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { verdict: 'not-json', proposal: null };
  }
  const proposal = stamp(/** @type {Record<string, unknown>} */ (value), frameHash);
  if (!proposal) {
    return { verdict: 'wrong-shape', proposal: null };
  }
  return { verdict: 'ok', proposal };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} frameHash
 * @returns {import('../frame/types.js').Proposal | null}
 */
export function stamp(raw, frameHash) {
  if (raw.kind === 'intent') {
    const target = /** @type {{ x?: unknown, y?: unknown }} */ (raw.target);
    if (typeof raw.verb !== 'string' || typeof raw.actor !== 'string') {
      return null;
    }
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
      return null;
    }
    return { kind: 'intent', verb: raw.verb, actor: raw.actor, target: { x: target.x, y: target.y }, frameHash };
  }
  if (raw.kind === 'belief') {
    if (typeof raw.subject !== 'string' || typeof raw.key !== 'string' || typeof raw.value !== 'string') {
      return null;
    }
    if (typeof raw.confidence !== 'number' || typeof raw.source !== 'string') {
      return null;
    }
    /** @type {import('../frame/types.js').BeliefWrite} */
    const belief = {
      kind: 'belief',
      subject: raw.subject,
      key: raw.key,
      value: raw.value,
      confidence: raw.confidence,
      source: raw.source,
    };
    if (typeof raw.supersedes === 'string') {
      belief.supersedes = raw.supersedes;
    }
    if (typeof raw.withdrawnBy === 'string') {
      belief.withdrawnBy = raw.withdrawnBy;
    }
    return belief;
  }
  if (raw.kind === 'body') {
    if (typeof raw.id !== 'string' || typeof raw.x !== 'number' || typeof raw.y !== 'number') {
      return null;
    }
    if (typeof raw.hw !== 'number' || typeof raw.hh !== 'number') {
      return null;
    }
    return { kind: 'body', id: raw.id, x: raw.x, y: raw.y, hw: raw.hw, hh: raw.hh };
  }
  if (raw.kind === 'line' && typeof raw.speaker === 'string' && typeof raw.text === 'string') {
    return { kind: 'line', speaker: raw.speaker, text: raw.text };
  }
  if (raw.kind === 'verb') {
    return { kind: 'verb', rule: /** @type {import('../frame/types.js').IntentRule} */ (raw.rule) };
  }
  return null;
}
