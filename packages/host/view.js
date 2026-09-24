// Presentation math for the page. No tick, no collider, no hash.
// The page imports this file. A test imports it too. It must not import Node.

/**
 * @param {number} width
 * @param {number} height
 * @param {{ minH: number, maxH: number, minV: number, maxV: number }} [bounds]
 */
export function fit(width, height, bounds) {
  const minX = bounds ? bounds.minH : -1;
  const maxX = bounds ? bounds.maxH : 5;
  const minY = bounds ? bounds.minV : -1;
  const maxY = bounds ? bounds.maxV : 4;
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
 * @param {{ x: number, y: number, z?: number } | null} prev
 * @param {{ x: number, y: number, z?: number, vx: number, vy: number, vz?: number }} next
 * @param {number} alpha
 * @param {number} dt
 */
export function blendBody(prev, next, alpha, dt) {
  const nz = next.z ?? 0;
  const nvz = next.vz ?? 0;
  if (!prev) {
    return { x: next.x, y: next.y, z: nz, cut: true };
  }
  const pz = prev.z ?? 0;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const dz = nz - pz;
  const step = Math.hypot(next.vx, next.vy, nvz) * dt;
  const dist = Math.hypot(dx, dy, dz);
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  if (dist > step + 1e-6) {
    return { x: next.x, y: next.y, z: nz, cut: true };
  }
  return { x: prev.x + dx * t, y: prev.y + dy * t, z: pz + dz * t, cut: false };
}

/**
 * The axis named by the key is the one not drawn.
 * @param {string} along
 * @returns {{ horizontal: 'x' | 'y' | 'z', vertical: 'x' | 'y' | 'z', label: string }}
 */
export function projectionAxes(along) {
  if (along === 'x') {
    return { horizontal: 'z', vertical: 'y', label: 'z-y, looking along x' };
  }
  if (along === 'y') {
    return { horizontal: 'x', vertical: 'z', label: 'x-z, looking along y' };
  }
  return { horizontal: 'x', vertical: 'y', label: 'x-y, looking along z' };
}

/**
 * @param {string} along
 * @param {Record<string, number>} box min/max or a centre plus half-extents
 * @param {boolean} extents true when box is a body centre
 */
export function projectedSpan(along, box, extents) {
  const axes = projectionAxes(along);
  if (extents) {
    const h = box[axes.horizontal];
    const v = box[axes.vertical];
    const halfH = box['h' + axes.horizontal];
    const halfV = box['h' + axes.vertical];
    return { h0: h - halfH, h1: h + halfH, v0: v - halfV, v1: v + halfV };
  }
  const min = { x: 'minX', y: 'minY', z: 'minZ' };
  const max = { x: 'maxX', y: 'maxY', z: 'maxZ' };
  return {
    h0: box[min[axes.horizontal]],
    h1: box[max[axes.horizontal]],
    v0: box[min[axes.vertical]],
    v1: box[max[axes.vertical]],
  };
}

/**
 * A click on the projection becomes a ground-plane target. The vertical
 * axis is kept only when that axis is x or z. y is up and is not a target.
 * @param {string} along
 * @param {number} horizontal
 * @param {number} vertical
 * @param {{ x: number, z: number }} actor
 */
export function groundTarget(along, horizontal, vertical, actor) {
  const axes = projectionAxes(along);
  let x = actor.x;
  let z = actor.z;
  if (axes.horizontal === 'x') {
    x = horizontal;
  } else if (axes.horizontal === 'z') {
    z = horizontal;
  }
  if (axes.vertical === 'x') {
    x = vertical;
  } else if (axes.vertical === 'z') {
    z = vertical;
  }
  return { x, z };
}
