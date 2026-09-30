// The review panel: which models review, through which transport, and with what output budget.
// Kept apart from the prompt and the transport, so a seat changes without touching either, and
// checked before any call, so a seat without a budget stops the run instead of spending tokens.

/**
 * @typedef {{ via: 'openrouter' | 'ollama', model: string, family: string, maxTokens: number, think?: boolean | 'high' | 'medium' | 'low', reasoningEffort?: 'none' | 'low' | 'high' | 'max', standby?: boolean }} Seat
 */

/** @type {Seat[]} */
export const PANEL = [
  // Verification path from 2026-09-30. Ollama Cloud is not seated. This OpenRouter model is the
  // review seat. Reasoning effort is none. The default effort spent a 16,384-token budget on
  // reasoning and returned no answer, and low effort then spent 32,768 the same way. With
  // reasoning off, the model answers. The output budget is 8,192 tokens, so one review of a
  // pull request of this size stays about a cent. A router id is not a seat: the runner discards
  // a served id that differs from this one.
  { via: 'openrouter', model: 'deepseek/deepseek-v4.1-flash', family: 'DeepSeek', maxTokens: 8192, reasoningEffort: 'none' },
];

/**
 * How many requests Ollama Cloud serves this account at once. The Max plan serves 10 (from
 * 2026-09-26); the earlier plan served one, and two at once failed with HTTP 429 on #74.
 */
export const OLLAMA_CONCURRENCY = 10;

/** The largest output budget the runner will ask for, per transport. */
export const BUDGET_LIMIT = { openrouter: 128000, ollama: 262144 };

/**
 * What is wrong with a panel, one line per problem; empty when it is sound. Every seat names a
 * transport the runner has, a model, and a family, and carries a whole-number output budget no
 * larger than its transport's limit. No two seats share a family, since a family counts once.
 * @param {ReadonlyArray<Record<string, unknown>>} panel
 * @returns {string[]}
 */
export function panelProblems(panel) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Set<string>} */
  const families = new Set();
  panel.forEach((seat, i) => {
    const name = typeof seat.model === 'string' && seat.model ? seat.model : 'seat ' + i;
    if (seat.via !== 'openrouter' && seat.via !== 'ollama') {
      problems.push(name + ': the transport must be openrouter or ollama');
    }
    if (typeof seat.model !== 'string' || seat.model === '') {
      problems.push(name + ': no model');
    }
    if (typeof seat.family !== 'string' || seat.family === '') {
      problems.push(name + ': no family');
    } else if (families.has(seat.family.toLowerCase())) {
      problems.push(name + ': the family ' + seat.family + ' already has a seat');
    } else {
      families.add(seat.family.toLowerCase());
    }
    if (seat.think !== undefined && ![true, false, 'high', 'medium', 'low'].includes(/** @type {any} */ (seat.think))) {
      problems.push(name + ': think must be true, false, high, medium, or low');
    }
    if (seat.think !== undefined && seat.via !== 'ollama') {
      problems.push(name + ': think is an Ollama setting');
    }
    if (seat.reasoningEffort !== undefined && seat.via !== 'openrouter') {
      problems.push(name + ': reasoning effort is an OpenRouter setting');
    }
    if (seat.reasoningEffort !== undefined && !['none', 'low', 'high', 'max'].includes(/** @type {any} */ (seat.reasoningEffort))) {
      problems.push(name + ': reasoning effort must be none, low, high, or max');
    }
    const limit = seat.via === 'openrouter' || seat.via === 'ollama' ? BUDGET_LIMIT[seat.via] : 0;
    if (typeof seat.maxTokens !== 'number' || !Number.isInteger(seat.maxTokens) || seat.maxTokens <= 0) {
      problems.push(name + ': the output budget must be a whole number of tokens');
    } else if (limit > 0 && seat.maxTokens > limit) {
      problems.push(name + ': the output budget ' + seat.maxTokens + ' is over the limit of ' + limit);
    }
  });
  return problems;
}

/**
 * The seats for a run: the families named, comma-separated and without regard to case, or every
 * seat not on standby when none are named. A name that matches no seat is returned in `unknown`,
 * so a misspelt family stops the run rather than silently dropping a reviewer.
 * @param {Seat[]} panel
 * @param {string | undefined} names
 * @returns {{ seats: Seat[], unknown: string[] }}
 */
export function choose(panel, names) {
  if (!names) {
    return { seats: panel.filter((seat) => !seat.standby), unknown: [] };
  }
  const wanted = names.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
  const lower = wanted.map((x) => x.toLowerCase());
  return {
    seats: panel.filter((seat) => lower.includes(seat.family.toLowerCase())),
    unknown: wanted.filter((x) => !panel.some((seat) => seat.family.toLowerCase() === x.toLowerCase())),
  };
}
