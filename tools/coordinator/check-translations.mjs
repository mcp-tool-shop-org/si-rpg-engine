#!/usr/bin/env node
// check-translations <checkout> [token ...]: each README.<lang>.md against README.md. A translation must
// have the English's count of headings, table rows, and code fences; every fenced code block byte for
// byte; and every token as often as the English has it. The site link is always a token, because the
// Japanese translation drops it on most runs and it is then restored by hand. Exit 0 when every
// language holds, 1 when any does not, 2 on a usage error.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The languages `translate-all.mjs` writes. */
export const LANGUAGES = ['ja', 'zh', 'es', 'fr', 'hi', 'it', 'pt-BR'];

/** Tokens checked in every run. */
export const ALWAYS = ['https://mcp-tool-shop.github.io/'];

/**
 * The parts of a README a translation must keep.
 * @param {string} text
 */
function shape(text) {
  const lines = text.split(/\r?\n/);
  return {
    headings: lines.filter((l) => l.startsWith('#')).length,
    rows: lines.filter((l) => l.startsWith('|')).length,
    blocks: [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\r\n/g, '\n')),
  };
}

/**
 * How many times `token` occurs in `text`.
 * @param {string} text
 * @param {string} token
 */
function count(text, token) {
  return token === '' ? 0 : text.split(token).length - 1;
}

/**
 * What is wrong with one translation against the English, one line per problem; empty when it holds.
 * @param {string} english
 * @param {string} translated
 * @param {string[]} tokens
 * @returns {string[]}
 */
export function compare(english, translated, tokens) {
  const a = shape(english);
  const b = shape(translated);
  /** @type {string[]} */
  const problems = [];
  if (b.headings !== a.headings) problems.push('headings ' + b.headings + ' vs ' + a.headings);
  if (b.rows !== a.rows) problems.push('table rows ' + b.rows + ' vs ' + a.rows);
  if (b.blocks.length !== a.blocks.length) {
    problems.push('code blocks ' + b.blocks.length + ' vs ' + a.blocks.length);
  } else {
    b.blocks.forEach((block, i) => {
      if (block !== a.blocks[i]) problems.push('code block ' + i + ' differs');
    });
  }
  for (const token of [...new Set([...ALWAYS, ...tokens])]) {
    const want = count(english, token);
    const got = count(translated, token);
    if (got !== want) problems.push('token ' + token + ': ' + got + ' vs ' + want);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [root, ...tokens] = process.argv.slice(2);
  if (!root || root === '--help') {
    process.stdout.write('check-translations <checkout> [token ...]\n');
    process.exit(root ? 0 : 2);
  }
  const english = readFileSync(join(root, 'README.md'), 'utf8');
  let bad = 0;
  for (const lang of LANGUAGES) {
    const translated = readFileSync(join(root, 'README.' + lang + '.md'), 'utf8');
    const problems = compare(english, translated, tokens);
    process.stdout.write(lang + ' ' + (problems.length === 0 ? 'OK' : problems.join('; ')) + '\n');
    if (problems.length > 0) bad = bad + 1;
  }
  process.exit(bad > 0 ? 1 : 0);
}
