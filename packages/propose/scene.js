// The seat's scene. The kernel fixture room is unchanged. A pillar stands
// between the walker and the goal, so the straight move is refused.

export const GOAL = { x: 3, y: 1, radius: 0.5 };

export const PILLAR = { id: 'pillar', minX: 1.7, maxX: 2.3, minY: 0.6, maxY: 1.4 };

export function proposeWorld() {
  return {
    bodies: [{ id: 'walker', x: 1, y: 1, vx: 0, vy: 0, hw: 0.25, hh: 0.25 }],
    colliders: [
      { id: 'floor', minX: -1, maxX: 5, minY: -1, maxY: 0 },
      { id: 'wall-left', minX: -1, maxX: 0, minY: 0, maxY: 8 },
      { id: 'wall-right', minX: 4, maxX: 5, minY: 0, maxY: 8 },
      PILLAR,
    ],
  };
}

/**
 * @param {number} x
 * @param {number} y
 */
export function reachedGoal(x, y) {
  const dx = x - GOAL.x;
  const dy = y - GOAL.y;
  return Math.sqrt(dx * dx + dy * dy) <= GOAL.radius;
}

/**
 * @param {Array<{ x: number, y: number }>} attempts
 * @returns {number | null} one-based attempt that first reached the goal
 */
export function attemptsToGoal(attempts) {
  for (let i = 0; i < attempts.length; i = i + 1) {
    if (reachedGoal(attempts[i].x, attempts[i].y)) {
      return i + 1;
    }
  }
  return null;
}
