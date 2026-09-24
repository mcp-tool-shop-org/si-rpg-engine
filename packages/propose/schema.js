// The grammar the sampler must obey. Each kind is a complete object.
// Verbs and actors come from the catalog and the frame, so an unknown
// verb cannot be decoded, and a missing coordinate cannot either.

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
        required: ['kind', 'verb', 'actor', 'subject', 'key', 'value', 'confidence', 'source'],
        properties: {
          kind: { const: 'belief' },
          verb,
          actor,
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
        required: ['kind', 'verb', 'actor', 'id', 'x', 'y', 'hw', 'hh'],
        properties: {
          kind: { const: 'body' },
          verb,
          actor,
          id: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          hw: { type: 'number' },
          hh: { type: 'number' },
        },
      },
    ],
  };
}
