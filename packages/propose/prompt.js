// The proposer sees the committed frame and, in one condition, the checker's
// last reason. It does not see the hash function and it does not write state.

/**
 * @param {{
 *   tick: number;
 *   x: number;
 *   y: number;
 *   episodes: string[];
 *   lastReason: string | null;
 * }} view
 */
export function proposalPrompt(view) {
  const lines = [
    'Reply with one JSON object and nothing else.',
    'Allowed kinds are intent, belief, and body.',
    'intent: {"kind":"intent","verb":"move","actor":"walker","target":{"x":2,"y":1}}',
    'belief: {"kind":"belief","subject":"walker","key":"mood","value":"wary","confidence":0.5,"source":"e1"}',
    'body: {"kind":"body","id":"crate","x":2.5,"y":1,"hw":0.2,"hh":0.2}',
    'The only verb is move. Its range is 3. The floor is everything at y <= 0. Walls block x <= 0 and x >= 4.',
    'A belief source must be an episode id already admitted. Do not propose a line or a new verb.',
    'Frame tick ' + view.tick + '. Walker at x ' + view.x + ', y ' + view.y + '.',
    'Admitted episodes: ' + (view.episodes.length === 0 ? 'none' : view.episodes.join('; ')) + '.',
  ];
  if (view.lastReason) {
    lines.push('The checker refused the previous proposal: ' + view.lastReason);
    lines.push('Propose a different action that answers that reason.');
  }
  return lines.join('\n');
}
