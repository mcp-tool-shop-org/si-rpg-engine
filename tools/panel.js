// The review panel: which models review, through which transport, and with what output budget.
// Kept apart from the prompt and the transport, so a seat changes without touching either, and
// checked before any call, so a seat without a budget stops the run instead of spending tokens.

/**
 * @typedef {{ via: 'openrouter' | 'ollama', model: string, family: string, maxTokens: number, standby?: boolean }} Seat
 */

/** @type {Seat[]} */
export const PANEL = [
  { via: 'openrouter', model: 'x-ai/grok-4.7', family: 'xAI', maxTokens: 32000 },
  // Gemini spent 30,717 of 32,000 output tokens reasoning on PR #68 and stopped before its verdict.
  { via: 'openrouter', model: 'google/gemini-3.1-pro-preview', family: 'Google', maxTokens: 64000 },
  { via: 'ollama', model: 'kimi-k3:cloud', family: 'Moonshot', maxTokens: 131072 },
  { via: 'ollama', model: 'glm-5.3:cloud', family: 'Z.ai', maxTokens: 131072 },
  // Standby seats, used only when named with --seats. deepseek-v4-pro thought past its output
  // budget on PR #59 (65,536 tokens of thought, no answer) and is standby until a run shows it
  // answering a pull request of this size. Ollama Cloud serves both with at most 65,536 output
  // tokens, and refused a larger budget with HTTP 400 on PR #95, so that is what they ask for.
  { via: 'ollama', model: 'deepseek-v4-pro:cloud', family: 'DeepSeek', maxTokens: 65536, standby: true },
  { via: 'ollama', model: 'nemotron-3-ultra:cloud', family: 'NVIDIA', maxTokens: 65536, standby: true },
];

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
