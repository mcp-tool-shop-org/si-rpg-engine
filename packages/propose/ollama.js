// One chat call to a local Ollama. The pin lives in model.json.
// CI does not call this. A recorded run does.

import { readFileSync } from 'node:fs';

export function pinnedModel() {
  const pin = JSON.parse(readFileSync(new URL('./model.json', import.meta.url), 'utf8'));
  return pin.model;
}

/**
 * @param {string} model
 * @param {string} prompt
 */
export async function askOllama(model, prompt) {
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      format: 'json',
      options: { temperature: 0 },
    }),
  });
  if (!response.ok) {
    throw new Error('ollama returned ' + response.status);
  }
  const body = await response.json();
  const content = body && body.message ? body.message.content : '';
  return typeof content === 'string' ? content : '';
}
