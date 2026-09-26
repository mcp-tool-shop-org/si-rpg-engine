// The seat's one connection to a model: a local Ollama on 127.0.0.1, at port
// 11434 unless a test names the port of a server it started itself, and
// nowhere else. CI and npm test never reach a real one; a person runs it by
// hand, on a GPU. Before each call, observe reads what the client can observe
// of itself, the GPU, the model, and the server, in that order, so the call's
// record holds it however the call ends (T7a pin 6, findings 24 to 30; #87):
// the client's own environment, the GPU's name and count, the model's digest
// and quantization from the server's model list, the Ollama version, and the
// model as the server holds it loaded. It refuses a model whose digest is not
// the role's pin, so a changed model is never asked. After the call, however
// it ends, `loaded` reads the loaded model again (seat.js askWithin). ask makes
// the call and keeps no clock of its own: it takes the seat's signal, and the
// seat's deadline is the call's only one.
//
// Every read of the server carries a timeout, 10 s unless a test shortens it,
// as the GPU's read does, so a wedged server cannot stall a session before the
// seat's deadline exists. A read that fails or times out throws, naming the
// path it read, and observe's throw carries what it read before it, as
// `seen`, so the seat records the call with that and nothing more (#87 pins 3
// and 4).
//
// Ollama takes no per-request setting for its parallel slots: a server reads
// OLLAMA_NUM_PARALLEL when it starts. The seat asks for one slot the only way
// a client can, by never having more than one call outstanding. The client
// records the variables its own environment names, null where unset, as its
// environment: they are what a server started from this environment would
// read, and a server started from another shell or host reads its own, which
// no endpoint the client reads reports. So the record names them as the
// client's, never as the server's. These are recorded, not relied on.

import { execFileSync } from 'node:child_process';

/** The port a local Ollama listens on. */
const PORT = 11434;

/** How long a read of the server, or of the GPU, may take: 10 s, unless a test shortens a read of the server. */
export const READ_TIMEOUT_MS = 10000;

/** The variables of the client's own environment the record names: the settings an Ollama started from it would read. */
export const ENVIRONMENT = [
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
 * @typedef {Record<string, unknown> | null} Loaded the model as the server holds it loaded, in the fields that do not move with the clock; null when it is not loaded
 * @typedef {{ names: string[], count: number, driver: string | null }} GpuSeen
 * @typedef {{ ms: number, timedOut: boolean, totalDuration: number | null, loadDuration: number | null, promptEvalCount: number | null, promptEvalDuration: number | null, evalCount: number | null, evalDuration: number | null, doneReason: string | null }} Timing
 * @typedef {{ model: ModelSeen, server: { version: string, loadedBefore: Loaded }, client: { environment: Record<string, string | null> }, gpu: GpuSeen }} Observed what the client reads before a call
 * @typedef {{ output: string | null, timing: Timing }} Reply a call that returned
 * @typedef {{ model: string, messages: Array<{ role: string, content: string }>, options: Record<string, unknown>, format: object, stream: false }} ChatRequest
 * @typedef {{ port?: number, readTimeoutMs?: number, gpu?: () => GpuSeen }} ClientOptions the port of a server a test started, a shorter timeout for each read of the server, and a GPU reader that spawns no process
 */

/**
 * What a read or a call threw, as one line, with its cause where it names one.
 * @param {unknown} error
 */
function messageOf(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause instanceof Error && error.cause.message.length > 0 ? ' (' + error.cause.message + ')' : '';
  return error.message + cause;
}

/**
 * One read of the server under its own timeout. It throws, naming the path,
 * when the server does not answer within the timeout, cannot be reached, or
 * answers with an error or with something that is not JSON.
 * @param {string} base
 * @param {string} path
 * @param {number} ms
 */
async function getJson(base, path, ms) {
  const signal = AbortSignal.timeout(ms);
  let status = 0;
  /** @type {unknown} */
  let body = null;
  try {
    const response = await fetch(base + path, { signal });
    status = response.status;
    if (response.ok) {
      body = await response.json();
    } else {
      await response.text();
    }
  } catch (error) {
    throw new Error(signal.aborted ? 'ollama did not answer ' + path + ' within ' + ms + ' ms' : 'ollama could not be read at ' + path + ': ' + messageOf(error));
  }
  if (status < 200 || status > 299) {
    throw new Error('ollama returned ' + status + ' for ' + path);
  }
  return /** @type {any} */ (body);
}

/**
 * The model as the server's model list names it: its digest and quantization.
 * @param {string} base
 * @param {string} name
 * @param {number} ms
 * @returns {Promise<ModelSeen>}
 */
async function modelSeen(base, name, ms) {
  const tags = await getJson(base, '/api/tags', ms);
  const found = tags && Array.isArray(tags.models) ? tags.models.find((/** @type {any} */ item) => item.name === name || item.model === name) : null;
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

/**
 * The model as the server holds it loaded: the fields that do not move with
 * the clock. Null when it is not loaded.
 * @param {string} base
 * @param {string} name
 * @param {number} ms
 * @returns {Promise<Loaded>}
 */
async function loadedSeen(base, name, ms) {
  const ps = await getJson(base, '/api/ps', ms);
  const found = ps && Array.isArray(ps.models) ? ps.models.find((/** @type {any} */ item) => item.name === name || item.model === name) : null;
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

/** The variables of the client's own environment the record names; null where the environment names none. */
export function environmentSeen() {
  /** @type {Record<string, string | null>} */
  const environment = {};
  for (const name of ENVIRONMENT) {
    const value = process.env[name];
    environment[name] = typeof value === 'string' ? value : null;
  }
  return environment;
}

/** The GPUs nvidia-smi names, and the driver. None when it cannot be asked within the read timeout. */
export function gpuSeen() {
  try {
    const text = execFileSync('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'], { encoding: 'utf8', timeout: READ_TIMEOUT_MS });
    const rows = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    const names = rows.map((row) => row.split(',')[0].trim());
    const driver = rows.length > 0 && rows[0].includes(',') ? rows[0].split(',')[1].trim() : null;
    return { names, count: names.length, driver };
  } catch {
    return { names: [], count: 0, driver: null };
  }
}

/**
 * What the client can observe of itself, the GPU, the model, and the server,
 * read before a call, each read of the server under its timeout. Refuses a
 * model whose digest is not the pin, so it is never asked. A throw carries
 * what was read before it, as `seen`.
 * @param {string} base
 * @param {string} name
 * @param {string} pin
 * @param {number} ms
 * @param {() => GpuSeen} gpu
 * @returns {Promise<Observed>}
 */
async function observeOllama(base, name, pin, ms, gpu) {
  /** @type {{ client: Observed['client'], gpu: GpuSeen, model?: ModelSeen, server?: { version: string, loadedBefore?: Loaded } }} */
  const seen = { client: { environment: environmentSeen() }, gpu: gpu() };
  try {
    const model = await modelSeen(base, name, ms);
    seen.model = model;
    if (model.digest !== pin) {
      throw new Error('the server holds ' + name + ' as ' + model.digest + ', not the pinned ' + pin);
    }
    const server = { version: String((await getJson(base, '/api/version', ms)).version) };
    seen.server = server;
    const loadedBefore = await loadedSeen(base, name, ms);
    return { model, server: { ...server, loadedBefore }, client: seen.client, gpu: seen.gpu };
  } catch (error) {
    throw Object.assign(new Error(messageOf(error)), { seen });
  }
}

/**
 * One chat call, under the seat's signal. It keeps no clock of its own: when
 * the seat's deadline passes, the seat aborts the signal, this call rejects,
 * and the seat records the call as cut off at its budget (seat.js askWithin).
 * Any other failure rejects naming /api/chat, and the seat records it as the
 * call's failure.
 * @param {string} base
 * @param {ChatRequest} request
 * @param {AbortSignal} signal
 * @returns {Promise<Reply>}
 */
async function askOllama(base, request, signal) {
  const started = performance.now();
  /** @type {Response} */
  let response;
  try {
    response = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    throw signal.aborted ? error : new Error('ollama could not be asked at /api/chat: ' + messageOf(error));
  }
  if (!response.ok) {
    throw new Error('ollama returned ' + response.status + ' for /api/chat: ' + (await response.text()));
  }
  /** @type {any} */
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw signal.aborted ? error : new Error('ollama\'s reply to /api/chat did not read: ' + messageOf(error));
  }
  const ms = performance.now() - started;
  /** @param {unknown} n */
  const count = (n) => (typeof n === 'number' ? n : null);
  return {
    output: body && body.message && typeof body.message.content === 'string' ? body.message.content : null,
    timing: {
      ms,
      timedOut: false,
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

/**
 * The seat's client for a local Ollama: on 127.0.0.1 and nowhere else, at
 * port 11434 unless a test names the port of a server it started, with each
 * read of the server under a timeout of 10 s unless a test shortens it.
 * @param {ClientOptions} [options]
 * @returns {import('./seat.js').Client}
 */
export function ollamaClient(options) {
  const port = options && options.port !== undefined ? options.port : PORT;
  const ms = options && options.readTimeoutMs !== undefined ? options.readTimeoutMs : READ_TIMEOUT_MS;
  const gpu = options && options.gpu ? options.gpu : gpuSeen;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('the seat reaches a local Ollama at a port from 1 to 65535, and ' + String(port) + ' is not one');
  }
  if (!Number.isInteger(ms) || ms < 1) {
    throw new Error('a read of the server has a timeout of at least 1 ms, and ' + String(ms) + ' is not one');
  }
  const base = 'http://127.0.0.1:' + port;
  return {
    observe: (name, pin) => observeOllama(base, name, pin, ms, gpu),
    ask: (request, signal) => askOllama(base, request, signal),
    loaded: (name) => loadedSeen(base, name, ms),
  };
}
