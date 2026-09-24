// The proposer sees the committed frame and, in one condition, the checker's
// last reason. It does not see the hash function and it does not write state.

/**
 * @param {{
 *   tick: number;
 *   bodies: Array<{ id: string, x: number, y: number, hw: number, hh: number }>;
 *   episodes: string[];
 *   previous: string | null;
 *   verdict: 'admitted' | 'rejected' | null;
 *   lastReason: string | null;
 * }} view
 */
export function proposalPrompt(view) {
  const lines = [
    'Reply with one JSON object and nothing else.',
    'Allowed kinds are intent, belief, and body.',
    'intent: {"kind":"intent","verb":"move","actor":"walker","target":{"x":2,"y":1}}',
    'belief: {"kind":"belief","subject":"walker","key":"mood","value":"wary","confidence":0.5,"source":"e1"}',
    'body: {"kind":"body","label":"crate","x":2.5,"y":1,"hw":0.2,"hh":0.2}',
    'The only verb is move. Its range is 3. The floor is everything at y <= 0. Walls block x <= 0 and x >= 4.',
    'A belief source must be an admitted episode. Do not cite the withdrawn episode. Do not propose a line or a new verb.',
    'Frame tick ' + view.tick + '.',
    'Bodies on the frame: ' + view.bodies.map((body) => body.id + ' at x ' + body.x + ' y ' + body.y + ', half-size ' + body.hw + ' by ' + body.hh).join('; ') + '.',
    'Admitted episodes: ' + (view.episodes.length === 0 ? 'none' : view.episodes.join('; ')) + '.',
    'Withdrawn episode e0 must not be cited. It is not in the log.',
  ];
  if (view.previous) {
    lines.push('Previous proposal: ' + view.previous);
    lines.push('Verdict: ' + view.verdict);
  }
  if (view.lastReason) {
    lines.push('Checker reason: ' + view.lastReason);
  }
  return lines.join('\n');
}
