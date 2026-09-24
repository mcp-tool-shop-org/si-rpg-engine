// The grammar the sampler must obey. Intent names a catalog verb and a
// body already on the frame. Belief and body do not carry verb or actor.
// A body draft names a label. The seat assigns the id.

/**
 * @param {string[]} verbs
 * @param {string[]} actors
 */
export function proposalSchema(verbs, actors) {
  const verb = { type: 'string', enum: verbs };
  const actor = { type: 'string', enum: actors };
  return {
    oneOf: [
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
            required: ['x', 'y'],
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'subject', 'key', 'value', 'confidence', 'source'],
        properties: {
          kind: { const: 'belief' },
          subject: { type: 'string' },
          key: { type: 'string' },
          value: { type: 'string' },
          confidence: { type: 'number' },
          source: { type: 'string' },
          supersedes: { type: 'string' },
          withdrawnBy: { type: 'string' },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'label', 'x', 'y', 'hw', 'hh'],
        properties: {
          kind: { const: 'body' },
          label: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          hw: { type: 'number' },
          hh: { type: 'number' },
        },
      },
    ],
  };
}
