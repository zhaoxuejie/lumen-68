/**
 * Canvas-generated artwork for the scene:
 *  - keycap legends (white alpha masks tinted by the keycap theme material)
 *  - the nameplate / case badge
 *  - the case-top wordmark decal
 *  - the soft under-keyboard glow
 *
 * All textures are built at runtime so the whole product page can be exported
 * as a single offline HTML file.
 */
import * as THREE from 'three';

const SANS =
  '"Segoe UI Variable Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const PX_PER_UNIT = 240;

/**
 * @typedef {object} LegendSpec
 * @property {string} [main] Main legend, e.g. "Q" or "1".
 * @property {string} [sub] Shifted legend, e.g. "!".
 * @property {'up'|'down'|'left'|'right'|null} [arrows]
 * @property {boolean} [space]
 * @property {boolean} [isMod]
 * @property {number} width Label plane width in keyboard units.
 * @property {number} height Label plane depth in keyboard units.
 */

/**
 * Draw a keycap legend into a white-on-transparent canvas texture.
 * @param {LegendSpec} spec
 * @returns {THREE.CanvasTexture}
 */
export function createLegendTexture(spec) {
  const width = Math.max(52, Math.round(spec.width * PX_PER_UNIT));
  const height = Math.max(52, Math.round(spec.height * PX_PER_UNIT));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (spec.arrows) {
    drawArrow(ctx, spec.arrows, width, height);
  } else if (spec.space) {
    drawWordmark(ctx, width, height);
  } else if (spec.sub) {
    const subSize = Math.round(height * 0.27);
    const mainSize = fitFont(ctx, spec.main ?? '', width * 0.8, height * 0.46, SANS, 700);
    ctx.globalAlpha = 0.96;
    ctx.font = `600 ${subSize}px ${SANS}`;
    ctx.fillText(spec.sub, width * 0.3, height * 0.28);
    ctx.font = `700 ${mainSize}px ${SANS}`;
    ctx.fillText(spec.main ?? '', width * 0.57, height * 0.64);
  } else {
    const base = height * (spec.isMod ? 0.4 : 0.56);
    const size = fitFont(ctx, spec.main ?? '', width * 0.82, base, SANS, 700);
    ctx.font = `700 ${size}px ${SANS}`;
    ctx.fillText(spec.main ?? '', width / 2, height * 0.53);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Shrink a font size until the measured text fits the available width.
 * @returns {number}
 */
function fitFont(ctx, text, maxWidth, preferredSize, family, weight = 600) {
  let size = Math.max(10, Math.round(preferredSize));
  for (let i = 0; i < 18; i += 1) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth || size <= 10) break;
    size = Math.max(10, Math.floor(size * 0.9));
  }
  return size;
}

/** @param {CanvasRenderingContext2D} ctx */
function drawArrow(ctx, direction, width, height) {
  const size = Math.min(width, height) * 0.34;
  const cx = width / 2;
  const cy = height / 2;
  ctx.save();
  ctx.translate(cx, cy);
  const angles = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
  ctx.rotate(angles[direction] ?? 0);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.92);
  ctx.lineTo(size * 0.78, size * 0.52);
  ctx.lineTo(size * 0.26, size * 0.52);
  ctx.lineTo(size * 0.26, size * 0.95);
  ctx.lineTo(-size * 0.26, size * 0.95);
  ctx.lineTo(-size * 0.26, size * 0.52);
  ctx.lineTo(-size * 0.78, size * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Spacebar wordmark. */
function drawWordmark(ctx, width, height) {
  const text = 'LUMEN';
  const size = Math.max(12, Math.round(Math.min(height * 0.2, width * 0.09)));
  ctx.font = `600 ${size}px ${SANS}`;
  ctx.globalAlpha = 0.9;
  const spacing = size * 0.42;
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, value) => sum + value, 0) + spacing * (chars.length - 1);
  let x = width / 2 - total / 2;
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], x + widths[i] / 2, height * 0.54);
    x += widths[i] + spacing;
  }
}

/**
 * Case badge texture (nameplate on the front of the chassis).
 * @param {{trimColor: string, badgeLegend: string, name: string}} caseDef
 * @returns {THREE.CanvasTexture}
 */
export function createBadgeTexture(caseDef) {
  const width = 640;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.fillStyle = caseDef.trimColor;
  roundRect(ctx, 4, 4, width - 8, height - 8, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  roundRect(ctx, 12, 12, width - 24, height - 24, 12);
  ctx.stroke();

  ctx.fillStyle = caseDef.badgeLegend;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 42px ${SANS}`;
  const text = 'LUMEN 68';
  const spacing = 9;
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, value) => sum + value, 0) + spacing * (chars.length - 1);
  let x = width / 2 - total / 2;
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], x + widths[i] / 2, height / 2 + 1);
    x += widths[i] + spacing;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * White alpha-mask wordmark used as a subtle etched decal on the case top.
 * @param {string} [text]
 * @returns {THREE.CanvasTexture}
 */
export function createDecalTexture(text = 'LUMEN 68') {
  const width = 512;
  const height = 96;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 40px ${SANS}`;
  const spacing = 13;
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, value) => sum + value, 0) + spacing * (chars.length - 1);
  let x = width / 2 - total / 2;
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], x + widths[i] / 2, height / 2);
    x += widths[i] + spacing;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Soft radial glow for the "studio floor" light pool under the keyboard.
 * @returns {THREE.CanvasTexture}
 */
export function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(0.68, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Soft contact shadow blob used to ground the keyboard on the studio floor.
 * @returns {THREE.CanvasTexture}
 */
export function createContactShadowTexture() {
  const width = 256;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    width * 0.02,
    width / 2,
    height / 2,
    width * 0.48,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
  gradient.addColorStop(0.42, 'rgba(0,0,0,0.6)');
  gradient.addColorStop(0.74, 'rgba(0,0,0,0.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(1, height / width);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, width * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
