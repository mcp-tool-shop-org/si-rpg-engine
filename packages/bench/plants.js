// The planted changes of pin 9, each with a known, measured effect, named
// once here so every test that runs one plants the same text, and the cap on
// mutants can be checked against them all (pin 7). A plant is a list of
// edits: in a file, the exact text replaced and its replacement.

/**
 * @typedef {{ file: string, from: string, to: string }} Edit
 */

/**
 * Behaviour-neutral changes, each for one case of pin 9, planted together in
 * one head: none of them changes what any run computes, so the bench must
 * report no difference while it names, reaches, and marks each one.
 * @type {Record<string, Edit[]>}
 */
export const NEUTRAL = {
  // A comment inside a JS function is rewritten.
  comment: [{ file: 'packages/tick/tick.js', from: '        // The host\'s intent cites the newest frame. A role\'s cites the frame\n', to: '        // The host\'s intent cites the newest frame; a role\'s cites the frame\n' }],
  // A function is renamed with every caller.
  rename: [
    { file: 'packages/tick/predicates.js', from: 'function nearFace(actor, other) {', to: 'function nearestFace(actor, other) {' },
    { file: 'packages/tick/predicates.js', from: '  const face = nearFace(actor, other);\n  const dx = face.x - actor.x;\n  const dz = face.z - actor.z;\n  const distance = Math.sqrt(dx * dx + dz * dz);\n  if (distance > rule.maxDistance) {\n    return { ok: false, reason: \'target is beyond \' + rule.verb + \' range \' + rule.maxDistance };\n  }\n  if (rule.requiresClearPath) {\n    // A sleeping', to: '  const face = nearestFace(actor, other);\n  const dx = face.x - actor.x;\n  const dz = face.z - actor.z;\n  const distance = Math.sqrt(dx * dx + dz * dz);\n  if (distance > rule.maxDistance) {\n    return { ok: false, reason: \'target is beyond \' + rule.verb + \' range \' + rule.maxDistance };\n  }\n  if (rule.requiresClearPath) {\n    // A sleeping' },
    { file: 'packages/tick/predicates.js', from: '  const face = nearFace(actor, other);\n  const dx = face.x - actor.x;\n  const dz = face.z - actor.z;\n  const distance = Math.sqrt(dx * dx + dz * dz);\n  if (distance > rule.maxDistance) {\n    return { ok: false, reason: \'target is beyond \' + rule.verb + \' range \' + rule.maxDistance };\n  }\n  if (rule.requiresClearPath) {\n    const hit = world.segmentHits(actor.x, actor.y + REST_MARGIN, actor.z, face.x, face.y + REST_MARGIN, face.z, { hx: actor.hx, hy: actor.hy, hz: actor.hz });\n    if (hit !== null) {\n      return { ok: false, reason: \'path crosses collider \' + hit };\n    }\n  }\n  return { ok: true, rule, quanta: 1, otherId: other.id };', to: '  const face = nearestFace(actor, other);\n  const dx = face.x - actor.x;\n  const dz = face.z - actor.z;\n  const distance = Math.sqrt(dx * dx + dz * dz);\n  if (distance > rule.maxDistance) {\n    return { ok: false, reason: \'target is beyond \' + rule.verb + \' range \' + rule.maxDistance };\n  }\n  if (rule.requiresClearPath) {\n    const hit = world.segmentHits(actor.x, actor.y + REST_MARGIN, actor.z, face.x, face.y + REST_MARGIN, face.z, { hx: actor.hx, hy: actor.hy, hz: actor.hz });\n    if (hit !== null) {\n      return { ok: false, reason: \'path crosses collider \' + hit };\n    }\n  }\n  return { ok: true, rule, quanta: 1, otherId: other.id };' },
    { file: 'packages/tick/predicates.js', from: '    const face = nearFace(actor, other);', to: '    const face = nearestFace(actor, other);' },
  ],
  // A refusal's reason text alone is changed in a predicate.
  reason: [{ file: 'packages/tick/predicates.js', from: 'reason: \'actor is not in zone \' + target.zone', to: 'reason: \'the actor is outside zone \' + target.zone' }],
  // The text of the use episode is changed.
  episode: [{ file: 'packages/tick/tick.js', from: 'memory.recordEpisode(tick, \'use\', \'use \' + actor + \' \' + name);', to: 'memory.recordEpisode(tick, \'use\', \'used \' + actor + \' \' + name);' }],
  // A function that runs only while its module loads, and a top-level
  // expression with no identifier.
  load: [{ file: 'packages/tick/subject.js', from: '// Subject text for a belief. No file access: the product harness imports this.\n', to: '// Subject text for a belief. No file access: the product harness imports this.\n\nfunction plantedAtLoad() {\n  return 1;\n}\nplantedAtLoad();\nvoid 0;\n' }],
  // A line inside a multi-line top-level declaration.
  declaration: [{ file: 'packages/tick/roles.js', from: '  diff: { trust: \'untrusted\', privacy: \'public\' },', to: '  diff: { trust: \'untrusted\',  privacy: \'public\' },' }],
  // A top-level constant that only an unreached function names.
  unreached: [{ file: 'packages/tick/replay.js', from: 'const FRAME_HASH = /^[0-9a-f]{16}$/;', to: 'const FRAME_HASH = /^[0-9a-f]{16}$/u;' }],
  // A top-level constant deleted with every use.
  removed: [
    { file: 'packages/tick/tick.js', from: '/** A frame\'s hash: sixteen lowercase hex digits (frame/hash.js). */\nconst FRAME_HASH = /^[0-9a-f]{16}$/;\n', to: '' },
    { file: 'packages/tick/tick.js', from: '&& typeof frame.hash === \'string\' && FRAME_HASH.test(frame.hash)', to: '&& typeof frame.hash === \'string\' && /^[0-9a-f]{16}$/.test(frame.hash)' },
  ],
  // A line in the tick's restore.
  restore: [{ file: 'packages/tick/tick.js', from: '    pending = saved.pending;\n', to: '    pending = saved.pending + 0;\n' }],
  // Two lines of one function, one under a branch no candidate takes.
  twoLines: [
    { file: 'packages/tick/predicates.js', from: '  const carriedId = world.carryingOf ? world.carryingOf(actor.id) : null;', to: '  const carriedId = world.carryingOf ? world.carryingOf(actor.id) : (null);' },
    { file: 'packages/tick/predicates.js', from: '  const carried = world.body(carriedId);\n  if (!carried) {\n    return { ok: false, reason: \'nothing is carried\' };', to: '  const carried = world.body(carriedId);\n  if (!carried) {\n    return { ok: false, reason: \'the carried body is gone\' };' },
  ],
  // An imported binding renamed on its import line and in every use, and an
  // exported constant changed that a function in another file uses.
  imported: [
    { file: 'packages/tick/predicates.js', from: 'import { DT } from \'./world.js\';', to: 'import { DT as QUANTUM } from \'./world.js\';' },
    { file: 'packages/tick/predicates.js', from: 'Math.ceil(distance / rule.speed / DT)', to: 'Math.ceil(distance / rule.speed / QUANTUM)' },
  ],
  exported: [{ file: 'packages/tick/world.js', from: 'export const DT = 1 / 64;', to: 'export const DT = 0.015625;' }],
  // A changed line no operator applies to: a call's two arguments swapped.
  swapped: [{ file: 'packages/tick/predicates.js', from: 'riseQuanta: Math.min(riseQuanta, quanta)', to: 'riseQuanta: Math.min(quanta, riseQuanta)' }],
  // A function whose writes the rule cannot classify.
  unclassified: [{ file: 'packages/tick/memory.js', from: '    const found = byMind.get(mind);\n', to: '    const found = byMind.get(mind) || undefined;\n' }],
  // A deleted line of a predicate: one line of a comment in admitIntent's
  // body-target branch.
  deleted: [{ file: 'packages/tick/predicates.js', from: '    // The near face only has to be in range. The scheduled distance is the\n', to: '' }],
  // A hazard's scenario changed so its refusal's reason alone differs.
  hazard: [{ file: 'predicates/hazards/beyond-wall.json', from: '"target": { "x": 3, "z": 0 }', to: '"target": { "x": 4.5, "z": 0 }' }],
};

/**
 * One change of each kind pin 1 does not aim at that the neutral head can
 * carry without a build: the dependency files of solver/ are planted where
 * the trees build (the law's tests).
 * @type {Record<string, Edit[]>}
 */
export const NOT_AIMED = {
  beliefKey: [{ file: 'predicates/beliefs/keys.json', from: '"at": { "subject": "body", "value": "zone" }', to: '"at": { "subject": "body", "value": "zone", "maxLength": 40 }' }],
  roleManifest: [{ file: 'predicates/roles/npc-mind.json', from: '"purpose": "Proposes, for one character during play, intents for its own body and beliefs for its own mind."', to: '"purpose": "Proposes, for one character in play, intents for its own body and beliefs for its own mind."' }],
  load: [{ file: 'packages/load/sweep.js', from: '// The reachability sweep, T6', to: '// The reachability sweep (T6)' }],
  packageJson: [{ file: 'package.json', from: '"description": "A deterministic, hashed, replayable 3D simulation engine:', to: '"description": "A deterministic, hashed, and replayable 3D simulation engine:' }],
  packageLock: [{ file: 'package-lock.json', from: '"lockfileVersion": 3,', to: '"lockfileVersion": 3 ,' }],
  test: [{ file: 'harness/golden-gate.test.js', from: '// T4 pin 6: write-golden', to: '// T4, pin 6: write-golden' }],
  doc: [{ file: 'docs/PHASE-2.md', from: '# Phase 2 ', to: '# Phase two ' }],
  atlas: [{ file: 'atlas/README.md', from: '# si-rpg-engine: how it works', to: '# si-rpg-engine, how it works' }],
  tool: [{ file: 'tools/prompt.js', from: '// The review prompt: the rubric', to: '// The review prompt, the rubric' }],
};

/** A fixture edited in the base alone. */
export const BASE_FIXTURE = [{ file: 'fixtures/sweep/walled.json', from: '"name": "sweep-walled"', to: '"name": "sweep-walled-edited"' }];

/**
 * Changes whose effect the bench must find, each planted alone.
 * @type {Record<string, Edit[]>}
 */
export const FINDING = {
  // A verb's maxDistance narrowed until it refuses throughout, a rule's flag
  // changed, and a verb retired in the catalog.
  rule: [
    { file: 'predicates/intents/move.json', from: '"maxDistance": 3,', to: '"maxDistance": 0.0001,' },
    { file: 'predicates/intents/climb.json', from: '"requiresClearPath": true,', to: '"requiresClearPath": false,' },
    { file: 'predicates/intents/index.json', from: '"retired": []', to: '"retired": ["use"]' },
  ],
  // A comparison in the checker's segment query flipped from < to <=: a move
  // that ends where the actor's box touches a collider, at a cell centre the
  // sweep aims at, is refused where the base admits it.
  comparison: [{ file: 'packages/tick/world.js', from: '    return t0 < t1;\n', to: '    return t0 <= t1;\n' }],
  // STEP_HEIGHT's value.
  stepHeight: [{ file: 'packages/tick/predicates.js', from: 'const STEP_HEIGHT = 0.3;', to: 'const STEP_HEIGHT = 0.4;' }],
  // The push's speed: a witness's push runs another way, and a candidate
  // whose own intent is a move reaches no anchor and still differs.
  push: [{ file: 'predicates/intents/push.json', from: '"speed": 1,', to: '"speed": 1.5,' }],
  // The hasher's offset basis: every frame's hash differs from the load.
  hasher: [
    { file: 'packages/frame/hash.js', from: '  let h0 = 0x811c9dc5;\n  let h1 = 0x811c9dc5;\n', to: '  let h0 = 0x811c9dc6;\n  let h1 = 0x811c9dc5;\n' },
  ],
  // One more quantum for every action: the same differences whichever tree
  // proposes.
  quanta: [{ file: 'packages/tick/predicates.js', from: 'let quanta = Math.ceil(distance / rule.speed / DT);', to: 'let quanta = Math.ceil(distance / rule.speed / DT) + 1;' }],
  // A restore that drops one saved field: the hasher's lanes.
  dropLanes: [{ file: 'packages/tick/tick.js', from: '    hasher.resume(saved.lanes);\n', to: '' }],
  // A predicate that admits on every other call, by a counter kept outside the tick.
  alternate: [
    { file: 'packages/tick/predicates.js', from: 'export function admitIntent(intent, world, rules, retired, scheduled) {\n', to: 'let plantedCalls = 0;\n\nexport function admitIntent(intent, world, rules, retired, scheduled) {\n  plantedCalls = plantedCalls + 1;\n  if (plantedCalls % 2 === 0) {\n    return { ok: false, reason: \'planted: every other call\' };\n  }\n' },
  ],
  // A throw after an admitted push, as T6's plant: the pusher's vx is NaN on
  // the push's first quantum, and the tick's own check throws.
  throws: [
    { file: 'packages/tick/tick.js', from: '    world.step(driving);\n', to: '    world.step(driving);\n    const planted = inputLog[inputLog.length - 1];\n    if (planted && planted.proposal.kind === \'intent\' && planted.proposal.verb === \'push\' && actions.has(planted.proposal.actor)) {\n      const pusher = world.body(planted.proposal.actor);\n      if (pusher) {\n        pusher.vx = NaN;\n      }\n    }\n' },
  ],
};

/**
 * Lines planted for the mutants' verdicts (pin 9, "Mutants"), each changed in
 * the head so the operators apply to it.
 * @type {Edit[]}
 */
export const MUTANT_LINES = [
  // A guard that never fires as written, with one actor: its flip, its
  // constant's ulp down, and its times 0.9 throw once an action is in flight,
  // rung-3 catches; its negation throws before any candidate acts; its ulp up
  // and its times 1.1 survive.
  { file: 'packages/tick/tick.js', from: '    world.step(driving);\n', to: '    world.step(driving);\n    if (actions.size > 1) {\n      throw new Error(\'planted: more than one action in flight\');\n    }\n' },
  // The tick's count after a restore, times one: each of its constant's four
  // leaves a restored tick fractional, which rung 0 catches.
  { file: 'packages/tick/tick.js', from: '    tick = saved.tick;\n', to: '    tick = saved.tick * 1;\n' },
  // The carried body's height, lowered by the head: the first + to - is a
  // trace difference, and the - to + is the base's own text, marked though it
  // separates the trees.
  { file: 'packages/tick/world.js', from: '      carried.y = actor.y + actor.hy + carried.hy;\n', to: '      carried.y = actor.y + actor.hy - carried.hy;\n' },
  // The reference kernel, which the product law never runs: a flipped
  // comparison whose flip is the base's own text, marked, and a line no
  // source reaches.
  { file: 'packages/tick/world.js', from: '      if (speed2 > MAX_SPEED * MAX_SPEED) {\n', to: '      if (speed2 >= MAX_SPEED * MAX_SPEED) {\n' },
  { file: 'packages/tick/world.js', from: '      b.vy = b.vy + G * DT;\n', to: '      b.vy = (b.vy + G * DT);\n' },
  // The trace's scratch buffer: its ulp down and its times 0.9 leave it seven
  // bytes, and the module does not load.
  { file: 'packages/tick/trace-line.js', from: 'const buf = new ArrayBuffer(8);', to: 'const buf = new ArrayBuffer(8.0);' },
];

/**
 * Applies a plant to a tree.
 * @param {(tree: string, file: string, from: string, to: string) => void} plant
 * @param {string} tree
 * @param {Edit[]} edits
 */
export function apply(plant, tree, edits) {
  for (const e of edits) {
    plant(tree, e.file, e.from, e.to);
  }
}
