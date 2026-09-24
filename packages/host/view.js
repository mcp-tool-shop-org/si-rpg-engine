// Presentation math for the page. No tick, no collider, no hash.
// The page imports this file. A test imports it too. It must not import Node.

/**
 * @param {number} width
 * @param {number} height
 */
export function fit(width, height) {
  const minX = -1;
  const maxX = 5;
  const minY = -1;
  const maxY = 4;
  const scale = Math.min(width / (maxX - minX), height / (maxY - minY));
  const usedW = (maxX - minX) * scale;
  const usedH = (maxY - minY) * scale;
  return {
    minX,
    maxX,
    minY,
    maxY,
    scale,
    originX: (width - usedW) / 2,
    originY: (height - usedH) / 2,
    width,
    height,
  };
}

/**
 * @param {ReturnType<typeof fit>} view
 * @param {number} x
 * @param {number} y
 */
export function worldToCanvas(view, x, y) {
  return {
    x: view.originX + (x - view.minX) * view.scale,
    y: view.originY + (view.maxY - y) * view.scale,
  };
}

/**
 * @param {ReturnType<typeof fit>} view
 * @param {number} x
 * @param {number} y
 */
export function canvasToWorld(view, x, y) {
  return {
    x: view.minX + (x - view.originX) / view.scale,
    y: view.maxY - (y - view.originY) / view.scale,
  };
}

/**
 * Blend one body from the previous committed pose toward the next.
 * A jump larger than this quantum's velocity is drawn as a cut.
 * @param {{ x: number, y: number } | null} prev
 * @param {{ x: number, y: number, vx: number, vy: number }} next
 * @param {number} alpha
 * @param {number} dt
 */
export function blendBody(prev, next, alpha, dt) {
  if (!prev) {
    return { x: next.x, y: next.y, cut: true };
  }
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const step = Math.hypot(next.vx, next.vy) * dt;
  const dist = Math.hypot(dx, dy);
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  if (dist > step + 1e-6) {
    return { x: next.x, y: next.y, cut: true };
  }
  return { x: prev.x + dx * t, y: prev.y + dy * t, cut: false };
}
