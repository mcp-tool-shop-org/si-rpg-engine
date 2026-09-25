// The grammar the sampler must obey. Intent names a catalog verb and a
// body already on the frame. Belief and body do not carry verb or actor.
// A body draft names a label. The seat assigns the id.
// Belief exists only when an episode has been admitted, and its source is
// one of those episode ids.

/**
 * @typedef {{
 *   type: 'object',
 *   additionalProperties: false,
 *   required: string[],
 *   properties: {
 *     kind: { const: string },
 *     verb?: { type: string, enum: string[] },
 *     actor?: { type: string, enum: string[] },
 *     target?: object,
 *     subject?: { type: string },
 *     key?: { type: string },
 *     value?: { type: string },
 *     confidence?: { type: string },
 *     source?: { type: string, enum: string[] },
 *     supersedes?: { type: string },
 *     withdrawnBy?: { type: string },
 *     label?: { type: string },
 *     x?: { type: string },
 *     y?: { type: string },
 *     z?: { type: string },
 *     hx?: { type: string },
 *     hy?: { type: string },
 *     hz?: { type: string },
 *     qx?: { type: string },
 *     qy?: { type: string },
 *     qz?: { type: string },
 *     qw?: { type: string },
 *     wx?: { type: string },
 *     wy?: { type: string },
 *     wz?: { type: string },
 *   },
 * }} ProposalBranch
 */

/**
 * @param {string[]} verbs
 * @param {string[]} actors
 * @param {string[]} [sources] admitted episode ids. No belief branch when this is empty.
 * @returns {{ oneOf: ProposalBranch[] }}
 */
export function proposalSchema(verbs, actors, sources) {
  const admitted = sources ?? [];
  const verb = { type: 'string', enum: verbs };
  const actor = { type: 'string', enum: actors };
  /** @type {ProposalBranch[]} */
  const branches = [
      {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'verb', 'actor', 'target'],
        properties: {
          kind: { const: 'intent' },
          verb,
          actor,
          target: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'z'],
            properties: { x: { type: 'number' }, z: { type: 'number' } },
          },
        },
      },
  ];
  if (admitted.length > 0) {
    branches.push({
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'subject', 'key', 'value', 'confidence', 'source'],
      properties: {
        kind: { const: 'belief' },
        subject: { type: 'string' },
        key: { type: 'string' },
        value: { type: 'string' },
        confidence: { type: 'number' },
        source: { type: 'string', enum: admitted },
        supersedes: { type: 'string' },
        withdrawnBy: { type: 'string' },
      },
    });
  }
  branches.push({
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'label', 'x', 'y', 'z', 'hx', 'hy', 'hz'],
        properties: {
          kind: { const: 'body' },
          label: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
          hx: { type: 'number' },
          hy: { type: 'number' },
          hz: { type: 'number' },
          qx: { type: 'number' },
          qy: { type: 'number' },
          qz: { type: 'number' },
          qw: { type: 'number' },
          wx: { type: 'number' },
          wy: { type: 'number' },
          wz: { type: 'number' },
        },
      },
  );
  return { oneOf: branches };
}
