// The seat's one connection to a model: a local Ollama at 127.0.0.1:11434 and
// nowhere else. CI and npm test never import a path that calls it; a person
// runs it by hand, on a GPU. Each call reads what the client can observe of
// the model and the server at call time, so its record holds it (T7a pin 6,
// findings 24 to 30): the model's digest and quantization from the server's
// model list, the Ollama version, the server settings this process can read
// from its environment, the model as the server holds it loaded after the
// call, and the GPU's name and count. Before the call it refuses a model whose
// digest is not the role's pin, so a changed model is never asked.
//
// Ollama takes no per-request setting for its parallel slots: the server
// reads OLLAMA_NUM_PARALLEL when it starts. The seat asks for one slot the
// only way a client can, by never having more than one call outstanding, and
// records the setting as its environment names it, null where unset, which
// means the server's default. These settings are recorded, not relied on.

import { execFileSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:11434';

/** The server settings a client can read, from the environment the server is started from on this machine. */
export const SETTINGS = [
  'OLLAMA_NUM_PARALLEL',
  'OLLAMA_CONTEXT_LENGTH',
  'OLLAMA_FLASH_ATTENTION',
  'OLLAMA_KV_CACHE_TYPE',
  'OLLAMA_MAX_LOADED_MODELS',
  'OLLAMA_MAX_QUEUE',
  'OLLAMA_SCHED_SPREAD',
  'OLLAMA_GPU_OVERHEAD',
  'OLLAMA_LLM_LIBRARY',
  'OLLAMA_KEEP_ALIVE',
  'LLAMA_ARG_FIT',
  'LLAMA_ARG_FIT_TARGET',
];

/**
 * @typedef {{ name: string, digest: string, quantization: string, format: string, family: string, parameterSize: string }} ModelSeen
 * @typedef {{ version: string, settings: Record<string, string | null>, loaded: Record<string, unknown> | null, callsAtOnce: 1 }} ServerSeen
 * @typedef {{ names: string[], count: number, driver: string | null }} GpuSeen
 * @typedef {{ ms: number, timedOut: boolean, totalDuration: number | null, loadDuration: number | null, promptEvalCount: number | null, promptEvalDuration: number | null, evalCount: number | null, evalDuration: number | null, doneReason: string | null }} Timing
 * @typedef {{ output: string | null, model: ModelSeen, server: ServerSeen, gpu: GpuSeen, timing: Timing }} CallResult
 * @typedef {{ model: string, messages: Array<{ role: string, content: string }>, options: Record<string, unknown>, format: object, stream: false }} ChatRequest
 */

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function getJson(path, init) {
  const response = await fetch(BASE + path, init);
  if (!response.ok) {
    throw new Error('ollama returned ' + response.status + ' for ' + path);
  }
  return /** @type {any} */ (await response.json());
}

/**
 * The model as the server's model list names it: its digest and quantization.
 * @param {string} name
 * @returns {Promise<ModelSeen>}
 */
export async function modelSeen(name) {
  const tags = await getJson('/api/tags');
  const found = Array.isArray(tags.models) ? tags.models.find((/** @type {any} */ item) => item.name === name || item.model === name) : null;
  if (!found) {
    throw new Error('the server has no model ' + name);
  }
  const details = found.details || {};
  return {
    name,
    digest: String(found.digest),
    quantization: String(details.quantization_level),
    format: String(details.format),
    family: String(details.family),
    parameterSize: String(details.parameter_size),
  };
}

/** The server settings this process can read; null where the environment names none. */
export function settingsSeen() {
  /** @type {Record<string, string | null>} */
  const settings = {};
  for (const name of SETTINGS) {
    const value = process.env[name];
    settings[name] = typeof value === 'string' ? value : null;
  }
  return settings;
}

/**
 * The model as the server holds it loaded: the fields that do not move with
 * the clock. Null when it is not loaded.
 * @param {string} name
 */
async function loadedSeen(name) {
  const ps = await getJson('/api/ps');
  const found = Array.isArray(ps.models) ? ps.models.find((/** @type {any} */ item) => item.name === name || item.model === name) : null;
  if (!found) {
    return null;
  }
  /** @type {Record<string, unknown>} */
  const loaded = {};
  for (const key of ['name', 'model', 'digest', 'size', 'size_vram', 'context_length']) {
    if (found[key] !== undefined) {
      loaded[key] = found[key];
    }
  }
  return loaded;
}

/** The GPUs nvidia-smi names, and the driver. None when it cannot be asked. */
export function gpuSeen() {
  try {
    const text = execFileSync('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'], { encoding: 'utf8', timeout: 10000 });
    const rows = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    const names = rows.map((row) => row.split(',')[0].trim());
    const driver = rows.length > 0 && rows[0].includes(',') ? rows[0].split(',')[1].trim() : null;
    return { names, count: names.length, driver };
  } catch {
    return { names: [], count: 0, driver: null };
  }
}

/**
 * One chat call. Refuses a model whose digest is not the pin before asking.
 * A call past its timeout is aborted and comes back with no output.
 * @param {ChatRequest} request
 * @param {{ timeoutMs: number, pin: string }} options
 * @returns {Promise<CallResult>}
 */
export async function askOllama(request, options) {
  const model = await modelSeen(request.model);
  if (model.digest !== options.pin) {
    throw new Error('the server holds ' + request.model + ' as ' + model.digest + ', not the pinned ' + options.pin);
  }
  const version = String((await getJson('/api/version')).version);
  const gpu = gpuSeen();
  const started = performance.now();
  /** @type {any} */
  let body = null;
  let timedOut = false;
  try {
    const response = await fetch(BASE + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!response.ok) {
      throw new Error('ollama returned ' + response.status + ' for /api/chat: ' + (await response.text()));
    }
    body = await response.json();
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      timedOut = true;
    } else {
      throw error;
    }
  }
  const ms = performance.now() - started;
  const loaded = await loadedSeen(request.model);
  /** @param {unknown} n */
  const count = (n) => (typeof n === 'number' ? n : null);
  const content = body && body.message && typeof body.message.content === 'string' ? body.message.content : null;
  return {
    output: timedOut ? null : content,
    model,
    server: { version, settings: settingsSeen(), loaded, callsAtOnce: 1 },
    gpu,
    timing: {
      ms,
      timedOut,
      totalDuration: body ? count(body.total_duration) : null,
      loadDuration: body ? count(body.load_duration) : null,
      promptEvalCount: body ? count(body.prompt_eval_count) : null,
      promptEvalDuration: body ? count(body.prompt_eval_duration) : null,
      evalCount: body ? count(body.eval_count) : null,
      evalDuration: body ? count(body.eval_duration) : null,
      doneReason: body && typeof body.done_reason === 'string' ? body.done_reason : null,
    },
  };
}
