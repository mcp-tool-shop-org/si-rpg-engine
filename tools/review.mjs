#!/usr/bin/env node
// review: an external, cross-family review of one pull request against its written contract.
//
//   node tools/review.mjs --pr <n> --dispatch <path> --checklist <file> [--evidence <file>] [--seats <families>] [--dry-run] [--out <receipt.json>]
//
// Gathers the dispatch as merged on the base branch (or the PR's own when the base has none), the PR's title and body, its diff (bulky generated
// files summarized, not sent), the CI result lines for the head, and the coordinator's own
// verification results; sends them to a panel of models from different families with a
// refute-by-default rubric; checks that each answer came from the model asked for; and writes
// a receipt plus a markdown summary for the pull request. The reviewers cannot run code: the
// mechanical proof is CI and the coordinator's own run, given to them as evidence.
//
// Standards compliance (0 missing, 1 partial, 2 present, 3 exemplary):
// - PIN_PER_STEP 3: every call records the requested and served model id, the provider, its output
//   budget, and the SHA-256 of the exact prompt, system rubric, dispatch, checklist, and evidence;
//   the receipt carries the SHA-256 of this file and of panel.js, prompt.js, and verdicts.js, so a
//   review names the exact runner, panel, rubric, and verdict rule that produced it.
// - ANDON_AUTHORITY 2: any reviewer's BLOCK stops the merge until the coordinator checks the
//   named defect against the code; a reviewer whose served model differs from the one asked for
//   is discarded, never counted.
// - NAMED_COMPENSATORS 2: the runner's only irreversible act is spending model tokens (bounded:
//   four calls, a size cap on the prompt, an owner-accepted cost recorded per call). Posting the
//   summary to the pull request is undone by deleting the comment (owner: coordinator).
// - DECOMPOSE_BY_SECRETS 3: the panel (panel.js), the rubric and message (prompt.js), and the
//   verdict rules (verdicts.js) are modules apart from gathering and transport here, and each is
//   tested without a network; a seat, the rubric, or the rule changes without touching the rest.
// - UNCERTAINTY_GATED_HUMANS 2: unanimous MERGE lets the coordinator merge on its own review; a
//   lone BLOCK is checked against the code by the coordinator; a corroborated BLOCK, or a BLOCK
//   the coordinator cannot refute, goes back to the builder, and a disagreement about design goes
//   to the Director, framed contrastively.
// - EXTERNAL_VERIFIER 3: the panel is four families other than the author's (xAI, Google,
//   Moonshot, Z.ai), none sees the author's reasoning, and the served-model check is enforced.
//
// Text the pull request's author wrote, or its code printed, is fenced in the message as untrusted
// data (prompt.js), and the dispatch comes from the base branch, so a pull request cannot rewrite
// its own contract. The fence lowers the chance of a reviewer being steered by accident; it is not
// a security boundary (see prompt.js), which is why no verdict merges anything by itself.
//
// Reads OPENROUTER_API_KEY from the environment and never prints it. Ollama Cloud models go
// through the local daemon at 127.0.0.1:11434, which is signed in to Ollama Cloud.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PANEL, panelProblems, choose } from './panel.js';
import { SYSTEM, buildPrompt } from './prompt.js';
import { parseVerdict, combine, whyNotCounted } from './verdicts.js';
import { guard } from '../packages/tool/guard.js';

const USAGE = 'node tools/review.mjs --pr <n> --dispatch <path> --checklist <file> [--evidence <file>] [--seats <families>] [--dry-run] [--out <receipt.json>] [--repo <owner/name>] [--debug]';
// --help prints the usage and exits 0; an unexpected failure prints one line and exits 2.
guard(USAGE);

/**
 * @typedef {import('./panel.js').Seat} Seat
 * @typedef {import('./verdicts.js').Verdict} Verdict
 * @typedef {{ text: string, served: string | null, provider: unknown, usage: any, cost: number | null }} Answer
 * @typedef {Seat & { served?: string | null, servedOk?: boolean, provider?: unknown, ms: number, usage?: any, cost?: number | null, parsed?: Verdict | null, unparsed?: string | null, raw?: string, error?: string }} Result
 */

const OMIT = [/^fixtures\/behavior-.*\.json$/, /^fixtures\/corpus\//, /^fixtures\/shape-traversal\.json$/, /^atlas\//, /package-lock\.json$/, /^README\.[a-zA-Z-]+\.md$/];
const MAX_FILE_DIFF = 60000;

/**
 * @param {string} name
 * @returns {string | undefined}
 */
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Ends the run with exit 2 and a line on stderr, before any model is called.
 * @param {string} message
 * @returns {never}
 */
function stop(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}
const pr = arg('--pr');
const dispatchPath = arg('--dispatch');
const checklistPath = arg('--checklist');
const evidencePath = arg('--evidence');
const outPath = arg('--out') ?? 'review-receipt-' + pr + '.json';
const repo = arg('--repo') ?? 'mcp-tool-shop-org/si-rpg-engine';
const seats = arg('--seats');
const problems = panelProblems(PANEL);
if (problems.length > 0) {
  stop('the panel is not sound:\n' + problems.map((x) => '  ' + x).join('\n'));
}
const chosen = choose(PANEL, seats);
if (chosen.unknown.length > 0 || chosen.seats.length === 0) {
  stop('no seat for: ' + (chosen.unknown.join(', ') || seats) + '; the families are ' + PANEL.map((p) => p.family).join(', '));
}
const panel = chosen.seats;
if (!pr || !dispatchPath || !checklistPath) {
  stop('usage: ' + USAGE);
}
if (!process.env.OPENROUTER_API_KEY) {
  stop('OPENROUTER_API_KEY is not set');
}

const sha = (/** @type {string | Buffer} */ s) => createHash('sha256').update(s).digest('hex');
const runnerSha = {
  review: sha(readFileSync(fileURLToPath(import.meta.url))),
  panel: sha(readFileSync(fileURLToPath(new URL('./panel.js', import.meta.url)))),
  prompt: sha(readFileSync(fileURLToPath(new URL('./prompt.js', import.meta.url)))),
  verdicts: sha(readFileSync(fileURLToPath(new URL('./verdicts.js', import.meta.url)))),
};
const gh = (/** @type {string[]} */ args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * @param {string} pr
 * @param {string} dispatchPath
 */
function gather(pr, dispatchPath) {
  const meta = JSON.parse(gh(['pr', 'view', pr, '--repo', repo, '--json', 'title,body,headRefOid,headRefName,baseRefName']));
  // The contract as merged on the base branch, so a pull request cannot rewrite what it is judged
  // by; a pull request that brings its own contract (the base has no copy) is judged by that copy,
  // fenced as untrusted.
  /** @type {'base' | 'head'} */
  let dispatchFrom = 'base';
  let dispatch;
  try {
    dispatch = gh(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${dispatchPath}?ref=${meta.baseRefName}`]);
  } catch (error) {
    // Only a file the base does not have sends the review to the head's copy; a rate limit, an
    // authentication failure, or a network error stops the run instead of demoting the contract.
    const said = String((error && typeof error === 'object' && 'stderr' in error ? error.stderr : '') || (error instanceof Error ? error.message : error));
    if (!/HTTP 404|Not Found/.test(said)) {
      throw new Error('could not read the dispatch from ' + meta.baseRefName + ': ' + said.trim().split('\n')[0]);
    }
    dispatchFrom = 'head';
    dispatch = gh(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${dispatchPath}?ref=${meta.headRefOid}`]);
  }
  const rawDiff = gh(['pr', 'diff', pr, '--repo', repo]);
  const parts = rawDiff.split(/^(?=diff --git )/m);
  const kept = [];
  const omitted = [];
  for (const part of parts) {
    const m = /^diff --git a\/(\S+) b\/(\S+)/.exec(part);
    if (!m) continue;
    const file = m[2];
    const added = (part.match(/^\+(?!\+\+)/gm) || []).length;
    const removed = (part.match(/^-(?!--)/gm) || []).length;
    if (OMIT.some((re) => re.test(file))) {
      omitted.push(`${file} (+${added} -${removed}, generated or bulky; not sent)`);
    } else if (part.length > MAX_FILE_DIFF) {
      omitted.push(`${file} (+${added} -${removed}, ${part.length} characters; too large to send whole)`);
      kept.push(part.slice(0, MAX_FILE_DIFF) + '\n[... truncated ...]\n');
    } else {
      kept.push(part);
    }
  }
  let ci = '';
  try {
    /** @type {Array<{ databaseId: number, headSha: string, conclusion: string, workflowName: string }>} */
    const runs = JSON.parse(gh(['run', 'list', '--repo', repo, '--branch', meta.headRefName, '--limit', '5', '--json', 'databaseId,headSha,conclusion,workflowName']));
    const run = runs.find((r) => r.headSha === meta.headRefOid && r.workflowName === 'CI');
    if (run) {
      const log = gh(['run', 'view', String(run.databaseId), '--repo', repo, '--log']);
      const lines = log.split('\n').filter((l) => /# (tests|pass|fail)|engines match|boundaries match|identical|lint clean|matches [0-9a-f]{16}|test result:|error/i.test(l));
      ci = `CI run ${run.databaseId} on ${run.headSha.slice(0, 7)}: ${run.conclusion}\n` + lines.map((l) => l.replace(/^[^\t]*\t[^\t]*\t/, '').replace(/^\S+Z /, '')).slice(0, 60).join('\n');
    } else {
      ci = 'No CI run found for the head commit.';
    }
  } catch (e) {
    ci = 'CI lines unavailable: ' + String(e instanceof Error ? e.message : e).slice(0, 200);
  }
  return { meta, dispatch, dispatchFrom, diff: kept.join(''), omitted, ci };
}

/**
 * @param {Seat} seat
 * @param {string} prompt
 * @returns {Promise<Answer>}
 */
async function callOpenRouter(seat, prompt) {
  const { model, maxTokens } = seat;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], max_tokens: maxTokens, usage: { include: true } }),
    signal: AbortSignal.timeout(900000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
  const choice = j.choices[0];
  const usage = { ...j.usage, max_tokens: maxTokens, finish_reason: choice.finish_reason, native_finish_reason: choice.native_finish_reason };
  return { text: choice.message.content || '', served: j.model, provider: j.provider, usage, cost: j.usage && j.usage.cost };
}

// Streamed: Ollama sends no headers until a non-streamed answer is complete, and Node's
// fetch gives up on headers after five minutes, which a large thinking model can exceed.
/**
 * @param {Seat} seat
 * @param {string} prompt
 * @returns {Promise<Answer>}
 */
async function callOllama(seat, prompt) {
  const { model, maxTokens } = seat;
  const res = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], stream: true, options: { num_predict: maxTokens } }),
    signal: AbortSignal.timeout(1800000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let thinking = 0;
  /** @type {string | null} */
  let served = null;
  /** @type {any} */
  let usage = {};
  if (!res.body) throw new Error('Ollama sent no body');
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      if (j.model) served = j.model;
      if (j.message && j.message.content) text += j.message.content;
      if (j.message && j.message.thinking) thinking += j.message.thinking.length;
      if (j.done) usage = { prompt_tokens: j.prompt_eval_count, completion_tokens: j.eval_count, max_tokens: maxTokens, thinking_chars: thinking, done_reason: j.done_reason };
    }
  }
  return { text, served, provider: 'Ollama Cloud', usage, cost: null };
}

/**
 * @param {Seat} seat
 * @param {string} prompt
 * @returns {Promise<Result>}
 */
async function review(seat, prompt) {
  const t0 = Date.now();
  try {
    const r = seat.via === 'openrouter' ? await callOpenRouter(seat, prompt) : await callOllama(seat, prompt);
    const servedOk = r.served === seat.model || (r.served || '').replace(/[-:]cloud$/, '') === seat.model.replace(/[-:]cloud$/, '');
    const parsed = parseVerdict(r.text);
    const why = parsed ? null : whyNotCounted(r.text, r.usage);
    return { ...seat, served: r.served, servedOk, provider: r.provider, ms: Date.now() - t0, usage: r.usage, cost: r.cost, parsed, unparsed: why, raw: r.text };
  } catch (e) {
    return { ...seat, error: String(e instanceof Error ? e.message : e), ms: Date.now() - t0 };
  }
}

const checklist = readFileSync(checklistPath, 'utf8');
const evidence = evidencePath ? readFileSync(evidencePath, 'utf8') : '';
const g = gather(pr, dispatchPath);
const built = buildPrompt(g, checklist, evidence);
const prompt = built.text;
if (process.argv.includes('--dry-run')) {
  // Everything up to the first model call, and no call: the message's size and fence, where the
  // dispatch came from, and the seats that would be asked.
  process.stdout.write(JSON.stringify({ pr: Number(pr), head: g.meta.headRefOid, dispatchFrom: g.dispatchFrom, fenceTag: built.tag, diffCut: built.diffCut, promptChars: prompt.length, promptSha256: sha(prompt), notSent: g.omitted.length, seats: panel.map((seat) => seat.family + ' ' + seat.model + ' ' + seat.maxTokens) }, null, 2) + '\n');
  process.exit(0);
}
process.stderr.write(`prompt ${prompt.length} characters; ${g.omitted.length} files not sent; calling ${panel.length} reviewers\n`);
const results = await Promise.all(panel.map((seat) => review(seat, prompt)));

const counted = /** @type {Array<Result & { parsed: Verdict }>} */ (results.filter((r) => !r.error && r.servedOk && r.parsed));
const aggregate = combine(counted).text;

const receipt = {
  pr: Number(pr), repo, head: g.meta.headRefOid, dispatch: dispatchPath,
  runner: runnerSha,
  sha256: { dispatch: sha(g.dispatch), checklist: sha(checklist), evidence: sha(evidence), prompt: sha(prompt), system: sha(SYSTEM) },
  omitted: g.omitted, promptChars: prompt.length, dispatchFrom: g.dispatchFrom, fenceTag: built.tag, diffCut: built.diffCut, aggregate,
  panel: results.map((r) => ({ family: r.family, via: r.via, requested: r.model, maxTokens: r.maxTokens, served: r.served, servedOk: r.servedOk, provider: r.provider, ms: r.ms, usage: r.usage, cost: r.cost, error: r.error, verdict: r.parsed ? r.parsed.verdict : null, block_reason: r.parsed ? r.parsed.block_reason : null, items: r.parsed ? r.parsed.items : null, defects: r.parsed ? r.parsed.defects : null, raw: r.raw })),
};
writeFileSync(outPath, JSON.stringify(receipt, null, 2));

const lines = [];
const source = g.dispatchFrom === 'base' ? 'as merged on `' + g.meta.baseRefName + '`' : 'the pull request\'s own copy, since `' + g.meta.baseRefName + '` has none';
lines.push(`**External review of #${pr} at \`${g.meta.headRefOid.slice(0, 7)}\`** against \`${dispatchPath}\` (${source}): ${aggregate}.`);
lines.push('');
lines.push('Reviewers read the dispatch, the diff, the CI lines, and the coordinator\'s verification; they did not run code. Generated fixture and map files were listed, not sent.');
lines.push('');
lines.push('| Family | Model asked | Model served | Verdict | Time | Cost |');
lines.push('|---|---|---|---|---|---|');
for (const r of results) {
  lines.push(`| ${r.family} | \`${r.model}\` | ${r.error ? 'error' : '`' + r.served + '`' + (r.servedOk ? '' : ' (mismatch, discarded)')} | ${r.error ? r.error.slice(0, 60) : r.parsed ? r.parsed.verdict : 'not counted: ' + r.unparsed} | ${Math.round(r.ms / 1000)} s | ${r.cost != null ? '$' + Number(r.cost).toFixed(4) : 'n/a'} |`);
}
for (const r of counted) {
  const fails = r.parsed.items.filter((i) => i.result !== 'HOLDS');
  const defects = (r.parsed.defects || []).filter((d) => d.severity !== 'low');
  if (fails.length || defects.length || r.parsed.verdict === 'BLOCK') {
    lines.push('');
    lines.push(`**${r.family}** ${r.parsed.verdict}${r.parsed.block_reason ? ': ' + r.parsed.block_reason : ''}`);
    for (const i of fails) lines.push(`- item ${i.n} ${i.result}: ${i.evidence}`);
    for (const d of defects) lines.push(`- ${d.severity} defect in \`${d.file}\`: ${d.what}`);
  }
}
const md = lines.join('\n');
writeFileSync(outPath.replace(/\.json$/, '.md'), md + '\n');
process.stdout.write(md + '\n');
