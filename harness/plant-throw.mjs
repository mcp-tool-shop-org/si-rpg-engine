// A throw planted for one test in harness/sweep.test.js, which starts `load
// world` and `replay` with `node --import <this file>`. No swept world throws,
// so without a plant the sweep's throw finding (T6 pin 7), and its bundle
// whose hashes end in the trace's NAN mark, would never run.
//
// It registers a load hook in the process it is imported into, and nowhere
// else. That process loads packages/tick/tick.js with one statement added
// after the quantum's step: when the newest admitted intent is a push whose
// actor is still mid-action, the actor gets NaN for its vx. The tick's own
// check then throws, `NaN in body <actor> at tick <n>`, on the push's first
// quantum, in the sweep and in the replay of its bundle alike. The file on disk
// is unchanged and nothing under packages/ imports this, so the product path
// has no hook: only a process started with it runs the plant. The hook refuses
// to load the tick when the step it follows is not there, so a change to the
// tick fails the test instead of planting nothing.

import { register } from 'node:module';
import { isMainThread } from 'node:worker_threads';

/** The quantum's step in packages/tick/tick.js, with its indent and line ending. */
const STEP = /\n([ \t]*)world\.step\(driving\);(\r?\n)/;

/** What the plant adds after the step, in the scope of the tick's advance. */
const PLANT = 'const planted = inputLog[inputLog.length - 1]; '
  + 'if (planted && planted.proposal.kind === \'intent\' && planted.proposal.verb === \'push\' && actions.has(planted.proposal.actor)) { '
  + 'const pusher = world.body(planted.proposal.actor); if (pusher) { pusher.vx = NaN; } }';

// The hook runs on the loader's own thread, which imports this file again;
// only the importing thread registers it.
if (isMainThread) {
  register(import.meta.url);
}

/** @type {import('node:module').LoadHook} */
export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);
  if (!url.endsWith('/packages/tick/tick.js')) {
    return loaded;
  }
  const source = typeof loaded.source === 'string' ? loaded.source : new TextDecoder().decode(/** @type {ArrayBuffer | Uint8Array} */ (loaded.source));
  const found = STEP.exec(source);
  if (!found) {
    throw new Error('plant-throw: packages/tick/tick.js has no `world.step(driving);` for the plant to follow');
  }
  const after = found.index + found[0].length;
  return { ...loaded, source: source.slice(0, after) + found[1] + PLANT + found[2] + source.slice(after) };
}
