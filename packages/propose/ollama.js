// One chat call to a local Ollama. The pin lives in model.json.
// CI does not call this. A recorded run does.

import { readFileSync } from 'node:fs';

export function pinnedRun() {
  const pin = JSON.parse(readFileSync(new URL('./model.json', import.meta.url), 'utf8'));
  return { model: pin.model, temperature: pin.temperature };
}

/**
 * @param {string} model
 * @param {string} prompt
 * @param {{ schema: object, seed: number, temperature: number }} call
 */
export async function askOllama(model, prompt, call) {
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      format: call.schema,
      options: { temperature: call.temperature, seed: call.seed },
    }),
  });
  if (!response.ok) {
    throw new Error('ollama returned ' + response.status);
  }
  const body = await response.json();
  const content = body && body.message ? body.message.content : '';
  return typeof content === 'string' ? content : '';
}
