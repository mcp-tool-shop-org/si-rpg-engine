// The proposer sees the committed frame and, in one condition, the checker's
// last reason. It does not see the hash function and it does not write state.

/**
 * @param {{
 *   tick: number;
 *   bodies: Array<{ id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number }>;
 *   episodes: string[];
 *   goal: string;
 *   obstacle: string;
 *   previous: string | null;
 *   verdict: 'admitted' | 'rejected' | null;
 *   lastReason: string | null;
 * }} view
 */
export function proposalPrompt(view) {
  const beliefOpen = view.episodes.length > 0;
  const lines = [
    'Reply with one JSON object and nothing else.',
    beliefOpen
      ? 'kind is intent, belief, or body. The schema fixes the fields.'
      : 'kind is intent or body. The schema fixes the fields.',
    'The only verb is move. Its range is 3. The floor is everything at y <= 0. Walls block x <= 0 and x >= 4.',
    view.goal,
    view.obstacle,
    beliefOpen
      ? 'A belief source must be an admitted episode. Do not cite the withdrawn episode. Do not propose a line or a new verb.'
      : 'Do not propose a line or a new verb.',
    'A body proposal names a label. It does not name an id.',
    'Frame tick ' + view.tick + '.',
    'Bodies on the frame: ' + view.bodies.map((body) => body.id + ' at x ' + body.x + ' y ' + body.y + ' z ' + body.z + ', half-extents ' + body.hx + ', ' + body.hy + ', ' + body.hz).join('; ') + '.',
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
