// The seat's scene. The kernel fixture room is unchanged.
// The pillar blocks the diagonal from the walker's start to the goal.
// Its underside is above the walker's bounce, so a move that drops to the
// floor first can pass underneath. The goal sits in that floor band.

export const GOAL = { x: 3, y: 0.35, radius: 0.5 };

export const PILLAR = { id: 'pillar', minX: 1.8, maxX: 2.2, minY: 0.72, maxY: 2.2 };

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

export function goalText() {
  return 'Goal: put the walker centre within ' + GOAL.radius + ' of x ' + GOAL.x + ', y ' + GOAL.y + '.';
}

export function obstacleText() {
  return 'A pillar occupies x ' + PILLAR.minX + ' to ' + PILLAR.maxX + ', y ' + PILLAR.minY + ' to ' + PILLAR.maxY + '.';
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
