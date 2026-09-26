// Prompts are built fresh from typed state for every call, never from a
// transcript (T7a pin 2, finding 40). A template names its slots as {{name}}.
// Every slot must be filled and every field must fill a slot, so no caller
// can add text the template does not name. For a role shaped like the test
// instrument, the slots are the manifest's input names, and each is rendered
// from the engine's own typed state or from a file the session names. The
// npc-mind prompt is rendered from one character's typed state and nothing
// else; T7a wires no player text to it. Line endings are LF on every platform,
// so a record's messages are the same bytes wherever the seat runs.

import { lf } from '../tick/roles.js';
import { subjectText } from '../tick/subject.js';

/**
 * @typedef {import('../frame/types.js').IntentRule} IntentRule
 * @typedef {import('../frame/types.js').Body} Body
 * @typedef {{ id: string, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }} Box
 * @typedef {{ call: number, proposal: object | null, read: string, admitted: boolean, reason: string | null, at: number | null, anchors?: string[], rungs?: string[] }} Feedback
 * @typedef {{
 *   body: string,
 *   beliefs: Array<{ subject: string, key: string, value: string | number | boolean, confidence: number, label: string, heard?: string }>,
 *   goals: Array<{ kind: string, target: string, met: boolean }>,
 *   sight: Array<{ id: string, x: number, y: number, z: number }>,
 * }} MindState
 */

const SLOT = /\{\{([a-z][a-z0-9-]*)\}\}/g;

/**
 * The slots a template names, each once, in the order they first appear.
 * @param {string} template
 * @returns {string[]}
 */
export function templateSlots(template) {
  /** @type {string[]} */
  const slots = [];
  for (const match of lf(template).matchAll(SLOT)) {
    if (!slots.includes(match[1])) {
      slots.push(match[1]);
    }
  }
  return slots;
}

/**
 * Fills a template's slots. Throws when a slot has no field or a field fills no slot.
 * @param {string} template
 * @param {Record<string, string>} fields
 */
export function renderTemplate(template, fields) {
  /** @type {Set<string>} */
  const used = new Set();
  const text = lf(template).replace(SLOT, (_match, name) => {
    if (!Object.hasOwn(fields, name)) {
      throw new Error('the template names {{' + name + '}}, and no field fills it');
    }
    used.add(name);
    return lf(fields[name]);
  });
  for (const name of Object.keys(fields)) {
    if (!used.has(name)) {
      throw new Error('field ' + name + ' fills no slot in the template');
    }
  }
  return text;
}

/**
 * The admitted verbs, one line each, in verb order.
 * @param {Map<string, IntentRule>} rules
 */
export function catalogText(rules) {
  const verbs = [...rules.keys()].sort();
  return verbs.map((verb) => {
    const rule = /** @type {IntentRule} */ (rules.get(verb));
    const effect = rule.effect || 'drive';
    // What each effect's predicate takes (packages/tick/predicates.js).
    const target = effect === 'carry' ? 'body'
      : effect === 'climb' || effect === 'release' ? 'point'
        : effect === 'episode' ? (rule.targetKind === 'body' || rule.targetKind === 'zone' ? rule.targetKind : 'body or zone')
          : rule.targetKind || 'point';
    const parts = [
      effect + ' effect',
      target + ' target',
      'range ' + rule.maxDistance,
      'speed ' + rule.speed,
      rule.requiresClearPath ? 'needs a clear path' : 'needs no clear path',
    ];
    if (rule.maxRise !== undefined) {
      parts.push('rise up to ' + rule.maxRise);
    }
    if (rule.maxHalfExtent !== undefined) {
      parts.push('carries a half-extent up to ' + rule.maxHalfExtent);
    }
    return '- ' + verb + ': ' + parts.join(', ') + '.';
  }).join('\n');
}

/**
 * Which admitted verbs reach each changed function, one line each.
 * @param {Record<string, string[]>} access
 */
export function accessText(access) {
  const names = Object.keys(access).sort();
  if (names.length === 0) {
    return 'None is known.';
  }
  return names.map((name) => '- ' + name + ': ' + access[name].join(', ') + '.').join('\n');
}

/**
 * The whole world at a frame: every body, collider, and zone, including what
 * no character can see.
 * @param {{ bodies: ReadonlyArray<Readonly<Body>>, colliders: ReadonlyArray<Box>, zones: ReadonlyArray<Box>, zoneOf: (id: string) => string | null }} view
 */
export function worldText(view) {
  /** @type {string[]} */
  const lines = [];
  for (const body of view.bodies) {
    const zone = view.zoneOf(body.id);
    lines.push('- body ' + body.id + ': centre x ' + body.x + ', y ' + body.y + ', z ' + body.z + '; half-extents ' + body.hx + ', ' + body.hy + ', ' + body.hz + '; ' + (zone === null ? 'in no zone' : 'in zone ' + zone) + '.');
  }
  for (const box of view.colliders) {
    lines.push('- collider ' + box.id + ': x ' + box.minX + ' to ' + box.maxX + ', y ' + box.minY + ' to ' + box.maxY + ', z ' + box.minZ + ' to ' + box.maxZ + '.');
  }
  for (const zone of view.zones) {
    lines.push('- zone ' + zone.id + ': x ' + zone.minX + ' to ' + zone.maxX + ', y ' + zone.minY + ' to ' + zone.maxY + ', z ' + zone.minZ + ' to ' + zone.maxZ + '.');
  }
  return lines.join('\n');
}

/**
 * The anchors a call reached and the rungs the ladder recorded, after the
 * checker's own sentence.
 * @param {Feedback} item
 */
function reachedText(item) {
  /** @type {string[]} */
  const parts = [];
  if (item.anchors && item.anchors.length > 0) {
    parts.push('it reached ' + item.anchors.join(', '));
  }
  if (item.rungs && item.rungs.length > 0) {
    parts.push('rungs ' + item.rungs.join(', '));
  }
  return parts.length === 0 ? '' : ' ' + parts.join('; ') + '.';
}

/**
 * The engine's own results for the calls before this one.
 * @param {ReadonlyArray<Feedback>} feedback
 */
export function feedbackText(feedback) {
  if (feedback.length === 0) {
    return 'Nothing yet: this is the first call.';
  }
  return feedback.map((item) => {
    const head = '- Call ' + (item.call + 1);
    const reached = reachedText(item);
    if (item.read !== 'ok' || item.proposal === null) {
      return head + ': the reply could not be read (' + item.read + (item.reason ? ': ' + item.reason : '') + ').' + reached;
    }
    const said = JSON.stringify(item.proposal);
    if (item.admitted) {
      return head + ' proposed ' + said + ', and the checker admitted it at tick ' + item.at + '.' + reached;
    }
    return head + ' proposed ' + said + ', and the checker refused it: ' + item.reason + '.' + reached;
  }).join('\n');
}

const MIND_STATE = ['body', 'beliefs', 'goals', 'sight'];

/**
 * One character's prompt, from its typed state alone. A field that is not
 * part of that state, a transcript among them, is refused.
 * @param {string} template
 * @param {MindState} state
 */
export function npcMindPrompt(template, state) {
  const extra = Object.keys(state).find((key) => !MIND_STATE.includes(key));
  if (extra !== undefined) {
    throw new Error('an npc-mind prompt is built from typed state alone, and ' + extra + ' is not part of it');
  }
  const beliefs = state.beliefs.length === 0
    ? 'Nothing yet.'
    : state.beliefs.map((item) => '- ' + item.subject + ' ' + item.key + ' ' + String(item.value) + ', confidence ' + item.confidence + ', ' + item.label + (item.heard ? ' from ' + item.heard : '') + '.').join('\n');
  const goals = state.goals.length === 0
    ? 'Nothing.'
    : state.goals.map((item) => '- ' + item.kind + ' ' + item.target + (item.met ? ', done' : '') + '.').join('\n');
  const sight = state.sight.length === 0
    ? 'Nothing.'
    : state.sight.map((item) => '- ' + item.id + ' at x ' + item.x + ', y ' + item.y + ', z ' + item.z + '.').join('\n');
  return renderTemplate(template, { body: state.body, beliefs, goals, sight });
}

/**
 * A character's typed state, read from the engine: its live beliefs with
 * their labels, its goals, and the bodies in its sight, as the tick's own
 * sight decides it (distance within the mind's sight and a clear segment).
 * @param {ReturnType<import('../tick/world.js').createWorld>} world
 * @param {ReturnType<import('../tick/memory.js').createMemory>} memory
 * @param {string} body
 * @returns {MindState}
 */
export function npcMindState(world, memory, body) {
  const mind = (world.minds || []).find((item) => item.body === body);
  const eye = world.body(body);
  if (!mind || !eye) {
    throw new Error('no mind named ' + body);
  }
  const beliefs = memory.mindBeliefs(body).filter((item) => !item.supersededBy).map((item) => ({
    subject: subjectText(item.subject),
    key: item.key,
    value: item.value,
    confidence: item.confidence,
    label: item.label,
    ...(item.heard ? { heard: item.heard } : {}),
  }));
  const goals = mind.goals.map((goal) => ({
    kind: goal.kind,
    target: goal.kind === 'reach' ? goal.zone : goal.target,
    met: goal.metTick !== undefined,
  }));
  /** @type {MindState['sight']} */
  const sight = [];
  for (const other of world.bodies) {
    if (other.id === body) {
      continue;
    }
    const dx = eye.x - other.x;
    const dy = eye.y - other.y;
    const dz = eye.z - other.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= mind.sight && world.segmentHits(eye.x, eye.y, eye.z, other.x, other.y, other.z) === null) {
      sight.push({ id: other.id, x: other.x, y: other.y, z: other.z });
    }
  }
  return { body, beliefs, goals, sight };
}
