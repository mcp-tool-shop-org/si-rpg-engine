#!/usr/bin/env node
// review: an external, cross-family review of one pull request against its written contract.
//
//   node tools/review.mjs --pr <n> --dispatch <path> --checklist <file> [--evidence <file>] [--seats <families>] [--out <receipt.json>]
//
// Gathers the dispatch at the PR's head, the PR's title and body, its diff (bulky generated
// files summarized, not sent), the CI result lines for the head, and the coordinator's own
// verification results; sends them to a panel of models from different families with a
// refute-by-default rubric; checks that each answer came from the model asked for; and writes
// a receipt plus a markdown summary for the pull request. The reviewers cannot run code: the
// mechanical proof is CI and the coordinator's own run, given to them as evidence.
//
// Standards compliance (0 missing, 1 partial, 2 present, 3 exemplary):
// - PIN_PER_STEP 3: every call records the requested and served model id, the provider, and the
//   SHA-256 of the exact prompt, system rubric, dispatch, checklist, and evidence, and the receipt
//   carries the SHA-256 of this file and of verdicts.js, which holds the rule that decides the
//   verdict, so a review names the exact runner that produced it; the panel is a constant here.
// - ANDON_AUTHORITY 2: any reviewer's BLOCK stops the merge until the coordinator checks the
//   named defect against the code; a reviewer whose served model differs from the one asked for
//   is discarded, never counted.
// - NAMED_COMPENSATORS 2: the runner's only irreversible act is spending model tokens (bounded:
//   four calls, a size cap on the prompt, an owner-accepted cost recorded per call). Posting the
//   summary to the pull request is undone by deleting the comment (owner: coordinator).
// - DECOMPOSE_BY_SECRETS 2: gathering, prompting, transport, and aggregation are separate
//   functions; the panel and the rubric change without touching transport.
// - UNCERTAINTY_GATED_HUMANS 2: unanimous MERGE lets the coordinator merge on its own review; a
//   lone BLOCK is checked against the code by the coordinator; a corroborated BLOCK, or a BLOCK
//   the coordinator cannot refute, goes back to the builder, and a disagreement about design goes
//   to the Director, framed contrastively.
// - EXTERNAL_VERIFIER 3: the panel is four families other than the author's (xAI, Google,
//   Moonshot, Z.ai), none sees the author's reasoning, and the served-model check is enforced.
//
// Reads OPENROUTER_API_KEY from the environment and never prints it. Ollama Cloud models go
// through the local daemon at 127.0.0.1:11434, which is signed in to Ollama Cloud.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseVerdict, combine } from './verdicts.js';

const PANEL = [
  { via: 'openrouter', model: 'x-ai/grok-4.7', family: 'xAI' },
  { via: 'openrouter', model: 'google/gemini-3.1-pro-preview', family: 'Google' },
  { via: 'ollama', model: 'kimi-k3:cloud', family: 'Moonshot' },
  { via: 'ollama', model: 'glm-5.3:cloud', family: 'Z.ai' },
  // Standby seats, used only when named with --seats. deepseek-v4-pro thought past its output
  // budget on PR #59 (65,536 tokens of thought, no answer) and is standby until a run shows it
  // answering a pull request of this size.
  { via: 'ollama', model: 'deepseek-v4-pro:cloud', family: 'DeepSeek', standby: true },
  { via: 'ollama', model: 'nemotron-3-ultra:cloud', family: 'NVIDIA', standby: true },
];

const OMIT = [/^fixtures\/behavior-.*\.json$/, /^fixtures\/corpus\//, /^fixtures\/shape-traversal\.json$/, /^atlas\//, /package-lock\.json$/, /^README\.[a-zA-Z-]+\.md$/];
const MAX_FILE_DIFF = 60000;
const MAX_PROMPT = 400000;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
if (process.argv.includes('--help')) {
  process.stdout.write('usage: node tools/review.mjs --pr <n> --dispatch <path> --checklist <file> [--evidence <file>] [--seats <families>] [--out <receipt.json>] [--repo <owner/name>]\n');
  process.exit(0);
}
const pr = arg('--pr');
const dispatchPath = arg('--dispatch');
const checklistPath = arg('--checklist');
const evidencePath = arg('--evidence');
const outPath = arg('--out', 'review-receipt-' + pr + '.json');
const repo = arg('--repo', 'mcp-tool-shop-org/si-rpg-engine');
const seats = arg('--seats');
const panel = seats ? PANEL.filter((p) => seats.split(',').map((x) => x.trim().toLowerCase()).includes(p.family.toLowerCase())) : PANEL.filter((p) => !p.standby);
if (!pr || !dispatchPath || !checklistPath) {
  process.stderr.write('usage: node tools/review.mjs --pr <n> --dispatch <path> --checklist <file> [--evidence <file>] [--seats <families>] [--out <receipt.json>]\n');
  process.exit(2);
}
if (!process.env.OPENROUTER_API_KEY) {
  process.stderr.write('OPENROUTER_API_KEY is not set\n');
  process.exit(2);
}

const sha = (s) => createHash('sha256').update(s).digest('hex');
const runnerSha = {
  review: sha(readFileSync(fileURLToPath(import.meta.url))),
  verdicts: sha(readFileSync(fileURLToPath(new URL('./verdicts.js', import.meta.url)))),
};
const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function gather() {
  const meta = JSON.parse(gh(['pr', 'view', pr, '--repo', repo, '--json', 'title,body,headRefOid,headRefName,baseRefName']));
  const dispatch = gh(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${dispatchPath}?ref=${meta.headRefOid}`]);
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
    ci = 'CI lines unavailable: ' + String(e.message).slice(0, 200);
  }
  return { meta, dispatch, diff: kept.join(''), omitted, ci };
}

const SYSTEM = [
  'You are an independent reviewer of a pull request to a deterministic, hashed, replayable 3D simulation engine: a JavaScript tick over a Rust physics law (rapier3d-f64 with enhanced-determinism) compiled to one WebAssembly binary.',
  'You did not write this code. Your job is to find what is wrong with it, not to approve it. Refute by default: an item HOLDS only when the diff shows it.',
  'The pull request was built against a written contract, the dispatch. You are given the dispatch, the pull request description, the diff (some generated files are listed but not sent), CI result lines, and the coordinator\'s own verification results. You cannot run code; treat the CI lines and the coordinator\'s results as evidence, and judge the code itself.',
  'Answer every checklist item with HOLDS, FAILS, or UNCLEAR and one or two sentences of evidence that cite a file and, where you can, a line or function from the diff. Then list any real defect you find that the checklist does not cover, each with a file, a severity (high, medium, low), and why it is a defect. Do not list style preferences.',
  'End with a single JSON object in a ```json fenced block with exactly these keys: "items" (array of {"n": number, "result": "HOLDS"|"FAILS"|"UNCLEAR", "evidence": string}), "defects" (array of {"file": string, "severity": "high"|"medium"|"low", "what": string}), and "verdict" ("MERGE" or "BLOCK"), and "block_reason" (string, empty when MERGE). BLOCK only for a checklist item that FAILS or a high-severity defect.',
].join('\n');

function buildPrompt(g, checklist, evidence) {
  const parts = [
    '# The dispatch (the contract)\n\n' + g.dispatch,
    '# The pull request\n\nTitle: ' + g.meta.title + '\nHead: ' + g.meta.headRefOid + '\n\n' + (g.meta.body || ''),
    '# CI result lines for the head\n\n' + g.ci,
    '# The coordinator\'s own verification\n\n' + (evidence || '(none given)'),
    '# Files in the diff that were not sent\n\n' + (g.omitted.length ? g.omitted.map((o) => '- ' + o).join('\n') : '(none)'),
    '# The diff\n\n```diff\n' + g.diff + '\n```',
    '# The checklist\n\n' + checklist,
  ];
  let text = parts.join('\n\n');
  if (text.length > MAX_PROMPT) {
    text = text.slice(0, MAX_PROMPT) + '\n[... prompt truncated at the size cap ...]\n\n# The checklist (repeated)\n\n' + checklist;
  }
  return text;
}

async function callOpenRouter(model, prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], max_tokens: 32000, usage: { include: true } }),
    signal: AbortSignal.timeout(900000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + res.status));
  return { text: j.choices[0].message.content || '', served: j.model, provider: j.provider, usage: j.usage, cost: j.usage && j.usage.cost };
}

// Streamed: Ollama sends no headers until a non-streamed answer is complete, and Node's
// fetch gives up on headers after five minutes, which a large thinking model can exceed.
async function callOllama(model, prompt) {
  const res = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], stream: true, options: { num_predict: 131072 } }),
    signal: AbortSignal.timeout(1800000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let thinking = 0;
  let served = null;
  let usage = {};
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
      if (j.done) usage = { prompt_tokens: j.prompt_eval_count, completion_tokens: j.eval_count, thinking_chars: thinking, done_reason: j.done_reason };
    }
  }
  return { text, served, provider: 'Ollama Cloud', usage };
}

async function review(seat, prompt) {
  const t0 = Date.now();
  try {
    const r = seat.via === 'openrouter' ? await callOpenRouter(seat.model, prompt) : await callOllama(seat.model, prompt);
    const servedOk = r.served === seat.model || (r.served || '').replace(/[-:]cloud$/, '') === seat.model.replace(/[-:]cloud$/, '');
    const parsed = parseVerdict(r.text);
    const why = parsed ? null : r.text.length === 0 ? 'no answer (output budget spent' + (r.usage && r.usage.thinking_chars ? ' on ' + r.usage.thinking_chars + ' characters of thinking' : '') + ')' : 'answer did not contain the verdict JSON';
    return { ...seat, served: r.served, servedOk, provider: r.provider, ms: Date.now() - t0, usage: r.usage, cost: r.cost, parsed, unparsed: why, raw: r.text };
  } catch (e) {
    return { ...seat, error: String(e.message || e), ms: Date.now() - t0 };
  }
}

const checklist = readFileSync(checklistPath, 'utf8');
const evidence = evidencePath ? readFileSync(evidencePath, 'utf8') : '';
const g = gather();
const prompt = buildPrompt(g, checklist, evidence);
process.stderr.write(`prompt ${prompt.length} characters; ${g.omitted.length} files not sent; calling ${panel.length} reviewers\n`);
const results = await Promise.all(panel.map((seat) => review(seat, prompt)));

const counted = results.filter((r) => !r.error && r.servedOk && r.parsed);
const aggregate = combine(counted).text;

const receipt = {
  pr: Number(pr), repo, head: g.meta.headRefOid, dispatch: dispatchPath,
  runner: runnerSha,
  sha256: { dispatch: sha(g.dispatch), checklist: sha(checklist), evidence: sha(evidence), prompt: sha(prompt), system: sha(SYSTEM) },
  omitted: g.omitted, promptChars: prompt.length, aggregate,
  panel: results.map((r) => ({ family: r.family, via: r.via, requested: r.model, served: r.served, servedOk: r.servedOk, provider: r.provider, ms: r.ms, usage: r.usage, cost: r.cost, error: r.error, verdict: r.parsed ? r.parsed.verdict : null, block_reason: r.parsed ? r.parsed.block_reason : null, items: r.parsed ? r.parsed.items : null, defects: r.parsed ? r.parsed.defects : null, raw: r.raw })),
};
writeFileSync(outPath, JSON.stringify(receipt, null, 2));

const lines = [];
lines.push(`**External review of #${pr} at \`${g.meta.headRefOid.slice(0, 7)}\`** against \`${dispatchPath}\`: ${aggregate}.`);
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
