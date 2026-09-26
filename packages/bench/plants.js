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
    { file: 'packages/tick/predicates.js', from: 'speed * DT * RELEASE_MARGIN_STEPS', to: 'speed * QUANTUM * RELEASE_MARGIN_STEPS' },
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

/**
 * The dependency files of solver/, not aimed at, planted where the trees
 * build: comment lines only, so the build and the lock stay as they were.
 * @type {Record<string, Edit[]>}
 */
export const NOT_AIMED_SOLVER = {
  cargoToml: [{ file: 'solver/Cargo.toml', from: '# The allocator std links on wasm32, at std 1.98.1\'s version, given a fixed\n', to: '# The allocator std links on wasm32 at std 1.98.1\'s version, given a fixed\n' }],
  cargoLock: [{ file: 'solver/Cargo.lock', from: '# It is not intended for manual editing.\n', to: '# It is not meant for manual editing.\n' }],
};

/**
 * The law's plants (pin 9), planted together in one head: each is a kind of
 * law anchor, and none stops the product scene.
 * @type {Record<string, Edit[]>}
 */
export const LAW = {
  // One operator on a line the product scene runs: the snapshot's sleep
  // timer, which the frame hash mixes, is written times the quantum instead of
  // divided by it, so frames differ wherever a dynamic body can sleep.
  operator: [{ file: 'solver/src/rapier_law.rs', from: '            push_f64(out, act.time_since_can_sleep / DT);\n', to: '            push_f64(out, act.time_since_can_sleep * DT);\n' }],
  // A const two law functions name, gravity, written again at the same
  // value: the difference the head shows is the operator's alone, and the
  // const's four mutants each change what runs.
  constant: [{ file: 'solver/src/rapier_law.rs', from: 'const G: f64 = -8.0;\n', to: 'const G: f64 = -8.000;\n' }],
  // A comment in a law function, rewritten; nothing else in that function changes.
  comment: [{ file: 'solver/src/rapier_law.rs', from: '        // A lifted kinematic takes its vertical velocity from the record.\n', to: '        // A lifted kinematic body takes its vertical velocity from the record.\n' }],
  // A line deleted from a law function the product scene runs: one line of
  // the comment on the snapshot's sort.
  deleted: [{ file: 'solver/src/rapier_law.rs', from: '    // pairs never share both handles. The stable sort stays anyway, so that if\n', to: '' }],
  // A top-level const no code names: a build leaves it out, so each of its
  // mutants rebuilds to the law tree's reference byte for byte.
  unused: [{ file: 'solver/src/rapier_law.rs', from: 'const SKIN: f64 = 0.01;\n', to: 'const SKIN: f64 = 0.01;\nconst PLANTED_UNUSED: f64 = 0.5;\n' }],
  // A comment in the controller copied from Rapier, in the move every walk
  // runs: the coverage build covers everything linked, kcc.rs included.
  copied: [{ file: 'solver/src/kcc.rs', from: '        // Return the result.\n', to: '        // The result.\n' }],
};

/**
 * A hazard's scenario changed so its outcome changes: the wall moved off the
 * path, so the move the hazard expects refused is admitted on the head.
 * @type {Edit[]}
 */
export const HAZARD_FLIP = [{ file: 'predicates/hazards/beyond-wall.json', from: '"minX": 1.7, "maxX": 1.9,', to: '"minX": 3.7, "maxX": 3.9,' }];

/**
 * A coverage build planted to compute differently from the product build,
 * only in a world of eight colliders, walled-open's: no other world a test
 * runs has eight, not the product scene, the room, or any hazard's. At its
 * 20th quantum in such a world, while the load settles, it writes the first
 * body's x 1e-9 off, once, and the next quantum writes it true again, so
 * later frames undo the difference. The code is under --cfg law_coverage, so
 * the product build never holds it; it rides in the law head beside the
 * law's plants, and only a run over walled-open meets it.
 * @type {Edit[]}
 */
export const SKEW = [
  { file: 'solver/src/rapier_law.rs', from: '    integrate(loaded, mover, pusher)?;\n    rebuild_snapshot(loaded, &mut solver.snapshot)\n}\n', to: '    integrate(loaded, mover, pusher)?;\n    #[cfg(law_coverage)]\n    planted_skew(loaded);\n    rebuild_snapshot(loaded, &mut solver.snapshot)\n}\n\n#[cfg(law_coverage)]\nstatic mut PLANTED_STEPS: u32 = 0;\n\n#[cfg(law_coverage)]\nfn planted_skew(loaded: &Loaded) {\n    if loaded.signature.n_colliders != 8 {\n        return;\n    }\n    unsafe {\n        let steps = &raw mut PLANTED_STEPS;\n        *steps = (*steps).wrapping_add(1);\n        if *steps == 20 {\n            BODIES[0] = BODIES[0] + 1.0e-9;\n        }\n    }\n}\n' },
];

/**
 * The law without the coverage build's shim: the product build of this tree
 * is the product build of main's law, so its digest is the one the shim must
 * leave unmoved (pin 3).
 * @type {Edit[]}
 */
export const NO_SHIM = [{ file: 'solver/src/lib.rs', from: '// The coverage build\'s one symbol (T7b pin 3). The bench builds the law with\n// `-C instrument-coverage -Z no-profiler-runtime --cfg law_coverage`, and the\n// instrumented code still references `__llvm_profile_runtime`, which the\n// dropped runtime would have defined. Nothing else sets the cfg, so the\n// product binary never holds this static and its bytes do not move.\n#[cfg(law_coverage)]\n#[unsafe(no_mangle)]\npub static __llvm_profile_runtime: i32 = 0;\n\n', to: '' }];

/** A base whose solver/ does not compile: a law function returns text. */
export const BROKEN_LAW = [{ file: 'solver/src/rapier_law.rs', from: 'fn canon(x: f64) -> f64 {\n    if x == 0.0 { 0.0 } else { x }\n}\n', to: 'fn canon(x: f64) -> f64 {\n    if x == 0.0 { 0.0 } else { "x" }\n}\n' }];

/**
 * Planted in both trees alike, so it is no part of the change: the catalog
 * with push first, so the sweep pushes from the load before it moves, and the
 * cells a push reaches are explored first.
 * @type {Edit[]}
 */
export const PUSH_FIRST = [{ file: 'predicates/intents/index.json', from: '    "move.json",\n    "push.json",\n', to: '    "push.json",\n    "move.json",\n' }];

/** A fixture edited in the base alone. */
export const BASE_FIXTURE = [{ file: 'fixtures/sweep/walled.json', from: '"name": "sweep-walled"', to: '"name": "sweep-walled-edited"' }];

/**
 * Changes whose effect the bench must find, each planted alone.
 * @type {Record<string, Edit[]>}
 */
export const FINDING = {
  // A verb's maxDistance narrowed until it refuses throughout: the grammar,
  // which draws within the head's reach, proposes moves the base admits and
  // the head refuses. In the base, the same narrowing is the admission flood.
  rule: [{ file: 'predicates/intents/move.json', from: '"maxDistance": 3,', to: '"maxDistance": 0.0001,' }],
  // A rule's flag, not a number, and a verb retired in the catalog.
  ruleFlag: [
    { file: 'predicates/intents/climb.json', from: '"requiresClearPath": true,', to: '"requiresClearPath": false,' },
    { file: 'predicates/intents/index.json', from: '"retired": []', to: '"retired": ["use"]' },
  ],
  // A comparison in the checker's segment query flipped from < to <=, planted
  // in the base: a move ends where the actor's box touches a collider's face,
  // at a cell centre the head's sweep lands on, and the base refuses it.
  comparison: [{ file: 'packages/tick/world.js', from: '    return t0 < t1;\n', to: '    return t0 <= t1;\n' }],
  // STEP_HEIGHT's value, lowered in the head: the room's 0.25 step, a move's
  // on the base, is a climb on the head, and its sweep climbs it from the load.
  // The step stands clear of the push's path, so the cell a push reaches from
  // the load has moves of its own.
  stepHeight: [{ file: 'packages/tick/predicates.js', from: 'const STEP_HEIGHT = 0.3;', to: 'const STEP_HEIGHT = 0.2;' }],
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
 * A line of the form the early-return operator takes: a return, whole on its
 * line, inside a block of its function, rewritten with a trailing comma. No
 * candidate names the actor as its own target, so no source reaches it.
 * @type {Edit[]}
 */
export const EARLY_RETURN = [{ file: 'packages/tick/predicates.js', from: '      return { ok: false, reason: \'target is the actor\' };\n', to: '      return { ok: false, reason: \'target is the actor\', };\n' }];

/**
 * Every planted change, by name, for the cap's check (pin 7): each is one
 * head's change against a clean base, as its test plants it.
 * @type {Record<string, Edit[]>}
 */
export const EVERY_PLANT = {
  neutral: Object.values(NEUTRAL).flat(),
  notAimed: Object.values(NOT_AIMED).flat(),
  ...Object.fromEntries(Object.entries(FINDING).map(([name, edits]) => ['finding ' + name, edits])),
  'finding stepHeight': FINDING.stepHeight.concat(HAZARD_FLIP),
  'finding ruleFlag': FINDING.ruleFlag.concat(PUSH_FIRST),
  mutantLines: MUTANT_LINES.concat(EARLY_RETURN),
  law: Object.values(LAW).flat().concat(Object.values(NOT_AIMED_SOLVER).flat(), SKEW, NEUTRAL.hazard),
  brokenLaw: BROKEN_LAW,
  noShim: NO_SHIM,
  pushFirst: PUSH_FIRST,
};

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
