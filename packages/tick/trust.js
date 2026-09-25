// Trust labels (T7a pin 5). An admitted belief records the trust of what
// formed it, from most trusted to least:
//   authored   the world file, and a belief the host submits without
//              provenance: the host is the engine's own caller, and T7a wires
//              no player text to it;
//   observed   the tick's own sight;
//   role       a role whose sources are all trusted;
//   untrusted  a role with any untrusted source;
//   hearsay    a role that reads player text; the label names the source.
// The gate sets a model-produced belief's label from the role's manifest and
// the minds it read, never from what a caller says, and never to authored or
// observed. A label is fixed at admission and travels with the belief. No
// imports: the engine shells run minds.js and memory.js, which read these.

/**
 * @typedef {import('../frame/types.js').TrustLabel} TrustLabel
 * @typedef {{ label: TrustLabel, heard?: string }} Label
 */

/** @type {ReadonlyArray<TrustLabel>} */
export const LABELS = ['authored', 'observed', 'role', 'untrusted', 'hearsay'];

/** @type {Label} */
export const AUTHORED = Object.freeze({ label: 'authored' });

/** @type {Label} */
export const OBSERVED = Object.freeze({ label: 'observed' });

/**
 * The label's place in LABELS: 0 is the most trusted.
 * @param {TrustLabel} label
 */
export function labelRank(label) {
  const rank = LABELS.indexOf(label);
  if (rank < 0) {
    throw new Error('unknown trust label: ' + String(label));
  }
  return rank;
}

/**
 * The less trusted of two labels; the first when they tie. Null is a mind
 * with no beliefs, which lowers nothing.
 * @param {Label | null} a
 * @param {Label | null} b
 * @returns {Label | null}
 */
export function lowerLabel(a, b) {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return labelRank(b.label) > labelRank(a.label) ? b : a;
}

/**
 * The label a belief record carries: the name, and the source when it is hearsay.
 * @param {Label} label
 * @returns {Label}
 */
export function labelFields(label) {
  return label.label === 'hearsay' && typeof label.heard === 'string'
    ? { label: label.label, heard: label.heard }
    : { label: label.label };
}
