// A committed frame: a frozen copy of the bodies at one hash. This is the
// whole of what crosses the host boundary in the host's direction.

/**
 * @param {number} tick
 * @param {string} hash
 * @param {ReadonlyArray<import('./types.js').Body>} bodies
 * @returns {import('./types.js').Frame}
 */
export function commitFrame(tick, hash, bodies) {
  const copy = bodies.map((b) =>
    Object.freeze({
      id: b.id, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, hx: b.hx, hy: b.hy, hz: b.hz,
    })
  );
  return Object.freeze({ tick, hash, bodies: Object.freeze(copy) });
}
