/**
 * Procedural geometry helpers for the LUMEN 68 keyboard.
 *
 * Everything is generated from code — no imported meshes or textures are used
 * anywhere in the scene. The two primitives we need are:
 *
 *  - a lofted rounded-rectangle solid (case, plate, gasket, seam, keycaps)
 *  - flat canvas textures for the keycap legends
 *
 * All units are keyboard units (1u = one 19.05 mm key pitch).
 */
import * as THREE from 'three';

/**
 * Perimeter of a rounded rectangle, sampled with a fixed number of points so
 * that rings of different sizes can be lofted together with matched vertices.
 *
 * The points run counter-clockwise in the XZ plane (x = right, z = front) when
 * viewed from above, which makes the loft winding below produce outward faces.
 *
 * @param {number} hw Half width.
 * @param {number} hd Half depth.
 * @param {number} radius Corner radius.
 * @param {number} cornerSeg Samples per 90° corner arc.
 * @param {number} edgeSeg Interior samples per straight edge.
 * @returns {Array<[number, number]>} [x, z] pairs.
 */
export function roundedRectRing(hw, hd, radius, cornerSeg = 5, edgeSeg = 2) {
  const r = Math.max(0.0001, Math.min(radius, hw * 0.999, hd * 0.999));
  const cx = hw - r;
  const cz = hd - r;
  const corners = [
    { cx, cz, start: 0 },
    { cx: -cx, cz, start: Math.PI / 2 },
    { cx: -cx, cz: -cz, start: Math.PI },
    { cx, cz: -cz, start: Math.PI * 1.5 },
  ];

  /** @type {Array<[number, number]>} */
  const points = [];
  for (let q = 0; q < 4; q += 1) {
    const corner = corners[q];
    const next = corners[(q + 1) % 4];

    for (let s = 0; s < cornerSeg; s += 1) {
      const phi = corner.start + (s / cornerSeg) * (Math.PI / 2);
      points.push([corner.cx + r * Math.cos(phi), corner.cz + r * Math.sin(phi)]);
    }

    const endPhi = corner.start + Math.PI / 2;
    const ax = corner.cx + r * Math.cos(endPhi);
    const az = corner.cz + r * Math.sin(endPhi);
    const bx = next.cx + r * Math.cos(next.start);
    const bz = next.cz + r * Math.sin(next.start);
    for (let e = 0; e < edgeSeg; e += 1) {
      const t = (e + 1) / (edgeSeg + 1);
      points.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  return points;
}

/**
 * Build a closed lofted solid from a stack of rounded-rectangle rings.
 *
 * @param {Array<{hw: number, hd: number, r: number, y: number | ((z: number) => number), cornerSeg?: number, edgeSeg?: number}>} rings
 *        Rings ordered from bottom to top. `y` may be a function of z so that
 *        the top of a wedge-shaped case can follow a sloped plane.
 * @param {{capTop?: boolean, capBottom?: boolean}} [options]
 * @returns {THREE.BufferGeometry}
 */
export function createLoftGeometry(rings, options = {}) {
  const { capTop = true, capBottom = true } = options;
  if (!rings.length) throw new Error('createLoftGeometry needs at least one ring');

  const cornerSeg = rings[0].cornerSeg ?? 6;
  const edgeSeg = rings[0].edgeSeg ?? 3;
  const perRing = 4 * (cornerSeg + edgeSeg);

  /** @type {number[]} */
  const positions = [];
  /** @type {number[]} */
  const indices = [];

  for (const ring of rings) {
    const points = roundedRectRing(ring.hw, ring.hd, ring.r, cornerSeg, edgeSeg);
    for (const [x, z] of points) {
      const y = typeof ring.y === 'function' ? ring.y(z) : ring.y;
      positions.push(x, y, z);
    }
  }

  // Side walls.
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let j = 0; j < perRing; j += 1) {
      const next = (j + 1) % perRing;
      const a = i * perRing + j;
      const b = i * perRing + next;
      const c = (i + 1) * perRing + j;
      const d = (i + 1) * perRing + next;
      indices.push(a, c, d, a, d, b);
    }
  }

  const lastIndex = (rings.length - 1) * perRing;
  const lastRing = rings[rings.length - 1];
  if (capTop) {
    const topCenterY =
      typeof lastRing.y === 'function' ? lastRing.y(0) : lastRing.y;
    const center = positions.length / 3;
    positions.push(0, topCenterY, 0);
    for (let j = 0; j < perRing; j += 1) {
      const a = lastIndex + j;
      const b = lastIndex + ((j + 1) % perRing);
      indices.push(center, b, a);
    }
  }

  if (capBottom) {
    const firstRing = rings[0];
    const bottomCenterY =
      typeof firstRing.y === 'function' ? firstRing.y(0) : firstRing.y;
    const center = positions.length / 3;
    positions.push(0, bottomCenterY, 0);
    for (let j = 0; j < perRing; j += 1) {
      const a = j;
      const b = (j + 1) % perRing;
      indices.push(center, a, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Sculpted keycap geometry: a slightly tapered loft with a rounded top rim.
 * Origin is at the bottom centre; the top surface is flat at y = height.
 *
 * @param {{width: number, depth: number, height: number, radius?: number}} spec
 * @returns {THREE.BufferGeometry}
 */
export function createKeycapGeometry({ width, depth, height, radius = 0.095 }) {
  const profile = [
    [0.0, 0.9],
    [0.03, 0.985],
    [0.1, 1.0],
    [0.4, 0.992],
    [0.64, 0.952],
    [0.8, 0.892],
    [0.9, 0.828],
    [0.96, 0.772],
    [1.0, 0.735],
  ];
  const hw = width / 2;
  const hd = depth / 2;
  const rings = profile.map(([fraction, scale]) => ({
    hw: hw * scale,
    hd: hd * scale,
    r: Math.max(0.02, radius * Math.max(0.55, scale)),
    y: height * fraction,
    cornerSeg: 5,
    edgeSeg: 2,
  }));
  return createLoftGeometry(rings, { capTop: true, capBottom: true });
}

/**
 * Flat rounded slab (plate, gasket, edge trim, seam band).
 *
 * @param {{width: number, depth: number, height: number, radius?: number, bevel?: number, capTop?: boolean, capBottom?: boolean}} spec
 * @returns {THREE.BufferGeometry}
 */
export function createSlabGeometry({
  width,
  depth,
  height,
  radius = 0.16,
  bevel = 0.012,
  capTop = true,
  capBottom = true,
}) {
  const b = Math.min(bevel, height / 2);
  const hw = width / 2;
  const hd = depth / 2;
  const rings = [
    { hw: hw - b, hd: hd - b, r: Math.max(0.02, radius - b), y: 0, cornerSeg: 8, edgeSeg: 4 },
    { hw, hd, r: radius, y: b, cornerSeg: 8, edgeSeg: 4 },
    { hw, hd, r: radius, y: height - b, cornerSeg: 8, edgeSeg: 4 },
    { hw: hw - b, hd: hd - b, r: Math.max(0.02, radius - b), y: height, cornerSeg: 8, edgeSeg: 4 },
  ].filter((ring) => ring.y >= 0 && ring.y <= height + 1e-6);

  // Avoid duplicate rings when the slab is thinner than two bevels.
  const unique = [];
  for (const ring of rings) {
    if (!unique.some((item) => Math.abs(item.y - ring.y) < 1e-6 && item.hw === ring.hw)) {
      unique.push(ring);
    }
  }
  if (unique.length < 2) {
    unique.length = 0;
    unique.push(
      { hw, hd, r: radius, y: 0, cornerSeg: 8, edgeSeg: 4 },
      { hw, hd, r: radius, y: height, cornerSeg: 8, edgeSeg: 4 },
    );
  }
  return createLoftGeometry(unique, { capTop, capBottom });
}
