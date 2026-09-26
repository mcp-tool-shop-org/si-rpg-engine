// The review panel: which models review, through which transport, and with what output budget.
// Kept apart from the prompt and the transport, so a seat changes without touching either, and
// checked before any call, so a seat without a budget stops the run instead of spending tokens.

/**
 * @typedef {{ via: 'openrouter' | 'ollama', model: string, family: string, maxTokens: number, think?: boolean | 'high' | 'medium' | 'low', standby?: boolean }} Seat
 */

/** @type {Seat[]} */
export const PANEL = [
  // Kimi K3 and GLM-5.3 accept 262,144 output tokens on Ollama Cloud (measured 2026-09-26).
  { via: 'ollama', model: 'kimi-k3:cloud', family: 'Moonshot', maxTokens: 262144 },
  { via: 'ollama', model: 'glm-5.3:cloud', family: 'Z.ai', maxTokens: 262144 },
  // DeepSeek and NVIDIA sat on standby until they answered pull requests of this size: both gave
  // verdicts on #95 and #96. Ollama Cloud serves both with at most 65,536 output tokens, and
  // refused a larger budget with HTTP 400. NVIDIA thinks with `think: 'high'`: on four measured
  // problems it reasoned about half again as long with it, while Kimi and GLM reasoned less and
  // DeepSeek and MiniMax no differently, so the others keep their own default.
  { via: 'ollama', model: 'deepseek-v4-pro:cloud', family: 'DeepSeek', maxTokens: 65536 },
  { via: 'ollama', model: 'nemotron-3-ultra:cloud', family: 'NVIDIA', maxTokens: 65536, think: 'high' },
  // MiniMax M3 joined on 2026-09-26, the strongest family on Ollama Cloud the panel did not yet
  // seat; its maximum output is 131,072 tokens. Its first run, a trial on #96 after that pull
  // request merged, returned a BLOCK on two findings that the code refutes. A lone BLOCK is a
  // CHECK the coordinator verifies against the code, so it sits with the others.
  { via: 'ollama', model: 'minimax-m3:cloud', family: 'MiniMax', maxTokens: 131072 },
  // Mistral joined the default panel on 2026-09-26. The daemon's name is
  // mistral-large-3:675b-cloud; the parent id is not found. It accepts 262,144 output tokens,
  // the daemon serves it as mistral-large-3:675b, and a one-word probe returned Pong.
  { via: 'ollama', model: 'mistral-large-3:675b-cloud', family: 'Mistral', maxTokens: 262144 },
  // OpenAI and Google sit out of a default run. Name them with --seats when a review needs that
  // view. gpt-oss:120b is not found; gpt-oss:120b-cloud is, and an output budget over 131,072 is
  // refused. A budget of 32 returns an empty answer, so the seat keeps the accepted maximum.
  // gemma4:31b-cloud is the cloud model; the bare name is the local weight. It accepts 262,144
  // output tokens, the daemon serves it as gemma4:31b, and a one-word probe returned pong.
  { via: 'ollama', model: 'gpt-oss:120b-cloud', family: 'OpenAI', maxTokens: 131072, standby: true },
  { via: 'ollama', model: 'gemma4:31b-cloud', family: 'Google', maxTokens: 262144, standby: true },
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
