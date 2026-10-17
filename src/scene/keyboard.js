/**
 * The procedural LUMEN 68 keyboard model.
 *
 * Structure (all sizes in keyboard units, 1u = 19.05 mm):
 *
 *   root
 *   ├─ caseGroup       — CNC-style wedge chassis, seam, badge, LED, feet, glow
 *   └─ tiltRoot        — the assembly rests on a 4.2° inclined deck
 *       ├─ plateGroup  — gasket + anodised plate + switches + stabilisers
 *       └─ capLayer    — 66 individually addressable keycap groups
 *
 * The interaction layer moves `plateGroup` and `capLayer` vertically to create
 * the exploded view, and nudges individual keycap groups down when pressed.
 */
import * as THREE from 'three';
import { CASES, KEYCAPS } from '../state.js';
import { createLoftGeometry, createSlabGeometry, createKeycapGeometry } from './geometry.js';
import {
  createLegendTexture,
  createBadgeTexture,
  createDecalTexture,
  createGlowTexture,
} from './legend.js';

export const GAP = 0.09;
export const TILT = THREE.MathUtils.degToRad(4.2);
export const PLATE_Y = 1.19;
export const CAP_BASE_Y = 0.4;
export const CASE_TOP_CENTER = 1.16;
export const CASE_WIDTH = 16.8;
export const CASE_DEPTH = 5.88;
export const PLATE_WIDTH = 16;
export const PLATE_DEPTH = 5.32;

export const ROW_HEIGHTS = [0.52, 0.5, 0.48, 0.5, 0.52];
export const ROW_TILTS = [-0.036, -0.018, 0, 0.018, 0.036];

const letterKeys = (letters) =>
  [...letters].map((char) => ({ code: `Key${char}`, main: char, kind: 'alpha' }));

const digitKeys = () =>
  '1234567890'.split('').map((digit, index) => ({
    code: `Digit${digit}`,
    main: digit,
    sub: '!@#$%^&*()'[index],
    kind: 'alpha',
  }));

/**
 * Row definitions, top (number row) to bottom (space row).
 * Every row totals exactly 15.75u, matching the 16.9u chassis with a 0.225u
 * bezel on each side. 66 keys in total: [15, 15, 14, 13, 9].
 */
export const KEY_ROWS = [
  [
    { code: 'Escape', main: 'Esc', kind: 'accent' },
    ...digitKeys(),
    { code: 'Minus', main: '-', sub: '_', kind: 'alpha' },
    { code: 'Equal', main: '=', sub: '+', kind: 'alpha' },
    { code: 'Backspace', main: 'Backspace', kind: 'mod', w: 1.75 },
    { code: 'Delete', main: 'Del', kind: 'mod' },
  ],
  [
    { code: 'Tab', main: 'Tab', kind: 'mod', w: 1.5 },
    ...letterKeys('QWERTYUIOP'),
    { code: 'BracketLeft', main: '[', sub: '{', kind: 'alpha' },
    { code: 'BracketRight', main: ']', sub: '}', kind: 'alpha' },
    { code: 'Backslash', main: '\\', sub: '|', kind: 'alpha', w: 1.25 },
    { code: 'PageUp', main: 'PgUp', kind: 'mod' },
  ],
  [
    { code: 'CapsLock', main: 'Caps', kind: 'mod', w: 1.75 },
    ...letterKeys('ASDFGHJKL'),
    { code: 'Semicolon', main: ';', sub: ':', kind: 'alpha' },
    { code: 'Quote', main: "'", sub: '"', kind: 'alpha' },
    { code: 'Enter', main: 'Enter', kind: 'accent', w: 2 },
    { code: 'PageDown', main: 'PgDn', kind: 'mod' },
  ],
  [
    { code: 'ShiftLeft', main: 'Shift', kind: 'mod', w: 2.25 },
    ...letterKeys('ZXCVBNM'),
    { code: 'Comma', main: ',', sub: '<', kind: 'alpha' },
    { code: 'Period', main: '.', sub: '>', kind: 'alpha' },
    { code: 'Slash', main: '/', sub: '?', kind: 'alpha' },
    { code: 'ShiftRight', main: 'Shift', kind: 'mod', w: 2.5 },
    { code: 'ArrowUp', arrows: 'up', kind: 'accent' },
  ],
  [
    { code: 'ControlLeft', main: 'Ctrl', kind: 'mod', w: 1.25 },
    { code: 'MetaLeft', main: 'Win', kind: 'mod', w: 1.25 },
    { code: 'AltLeft', main: 'Alt', kind: 'mod', w: 1.25 },
    { code: 'Space', main: 'Space', kind: 'mod', w: 7, space: true },
    { code: 'AltRight', main: 'Alt', kind: 'mod' },
    { code: 'Fn', main: 'Fn', kind: 'mod' },
    { code: 'ArrowLeft', arrows: 'left', kind: 'accent' },
    { code: 'ArrowDown', arrows: 'down', kind: 'accent' },
    { code: 'ArrowRight', arrows: 'right', kind: 'accent' },
  ],
];

export const ROW_COUNTS = KEY_ROWS.map((row) => row.length);
export const KEY_COUNT = ROW_COUNTS.reduce((sum, value) => sum + value, 0);

const ARROW_LABEL = { up: '↑', down: '↓', left: '←', right: '→' };

const caseTopY = (z) => CASE_TOP_CENTER - Math.tan(TILT) * z;

/** @returns {THREE.MeshPhysicalMaterial} */
function makeKeycapMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.02,
    roughness: 0.62,
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.5,
  });
}

/**
 * Build the keyboard and return its public model API.
 * @returns {object}
 */
export function createKeyboard() {
  const root = new THREE.Group();
  root.name = 'LUMEN 68';

  const caseGroup = new THREE.Group();
  caseGroup.name = 'case';
  root.add(caseGroup);

  const tiltRoot = new THREE.Group();
  tiltRoot.name = 'tiltRoot';
  tiltRoot.position.y = PLATE_Y;
  tiltRoot.rotation.x = TILT;
  root.add(tiltRoot);

  const plateGroup = new THREE.Group();
  plateGroup.name = 'plate';
  tiltRoot.add(plateGroup);

  const capLayer = new THREE.Group();
  capLayer.name = 'keycaps';
  tiltRoot.add(capLayer);

  // ---------------------------------------------------------------- materials
  const caseMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.34,
    clearcoat: 0.28,
    clearcoatRoughness: 0.3,
    envMapIntensity: 1.5,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.92,
    roughness: 0.42,
    envMapIntensity: 0.9,
  });
  const trimMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.24,
    clearcoat: 0.3,
    envMapIntensity: 1.5,
  });
  const gasketMat = new THREE.MeshStandardMaterial({
    color: 0x101113,
    metalness: 0.1,
    roughness: 0.85,
  });
  const switchMat = new THREE.MeshStandardMaterial({
    color: 0x17181a,
    metalness: 0.25,
    roughness: 0.5,
  });
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0xe7d9bd,
    metalness: 0.05,
    roughness: 0.42,
  });
  const footMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 });
  const capAlphaMat = makeKeycapMaterial();
  const capModMat = makeKeycapMaterial();
  const capAccentMat = makeKeycapMaterial();
  capAccentMat.clearcoat = 0.12;
  /** @type {THREE.MeshBasicMaterial[]} Every key needs its own legend texture. */
  const normalLegendMaterials = [];
  /** @type {THREE.MeshBasicMaterial[]} */
  const accentLegendMaterials = [];
  const badgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: null,
    metalness: 0.35,
    roughness: 0.38,
    transparent: true,
    alphaTest: 0.35,
  });
  const decalMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: createDecalTexture('LUMEN 68'),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0xffd9a8,
    emissive: 0xffb877,
    emissiveIntensity: 2.2,
    roughness: 0.3,
    metalness: 0.2,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    map: createGlowTexture(),
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  // ---------------------------------------------------------------- chassis
  const caseGeo = createLoftGeometry([
    { hw: (CASE_WIDTH / 2) * 0.968, hd: (CASE_DEPTH / 2) * 0.968, r: 0.28, y: 0.045, cornerSeg: 10, edgeSeg: 7 },
    { hw: CASE_WIDTH / 2, hd: CASE_DEPTH / 2, r: 0.34, y: 0.1, cornerSeg: 10, edgeSeg: 7 },
    { hw: CASE_WIDTH / 2, hd: CASE_DEPTH / 2, r: 0.34, y: (z) => caseTopY(z) - 0.1, cornerSeg: 10, edgeSeg: 7 },
    { hw: CASE_WIDTH / 2, hd: CASE_DEPTH / 2, r: 0.34, y: (z) => caseTopY(z) - 0.01, cornerSeg: 10, edgeSeg: 7 },
    { hw: (CASE_WIDTH / 2) * 0.995, hd: (CASE_DEPTH / 2) * 0.995, r: 0.34, y: (z) => caseTopY(z) + 0.005, cornerSeg: 10, edgeSeg: 7 },
    { hw: (CASE_WIDTH / 2) * 0.975, hd: (CASE_DEPTH / 2) * 0.975, r: 0.33, y: (z) => caseTopY(z) + 0.012, cornerSeg: 10, edgeSeg: 7 },
  ]);
  const caseMesh = new THREE.Mesh(caseGeo, caseMat);
  caseMesh.castShadow = true;
  caseMesh.receiveShadow = true;
  caseGroup.add(caseMesh);

  // Fine trim seam around the chassis for a machined, anodised feel.
  const seamGeo = createLoftGeometry(
    [
      { hw: (CASE_WIDTH / 2) * 1.005, hd: (CASE_DEPTH / 2) * 1.005, r: 0.344, y: 0.142, cornerSeg: 10, edgeSeg: 7 },
      { hw: (CASE_WIDTH / 2) * 1.0075, hd: (CASE_DEPTH / 2) * 1.0075, r: 0.345, y: 0.168, cornerSeg: 10, edgeSeg: 7 },
      { hw: (CASE_WIDTH / 2) * 1.005, hd: (CASE_DEPTH / 2) * 1.005, r: 0.344, y: 0.194, cornerSeg: 10, edgeSeg: 7 },
    ],
    { capTop: false, capBottom: false },
  );
  const seamMesh = new THREE.Mesh(seamGeo, trimMat);
  seamMesh.castShadow = false;
  seamMesh.receiveShadow = false;
  caseGroup.add(seamMesh);

  // Machined trim line along the top rim: defines the silhouette in low light.
  const rimGeo = createLoftGeometry(
    [
      { hw: (CASE_WIDTH / 2) * 1.0015, hd: (CASE_DEPTH / 2) * 1.0015, r: 0.343, y: (z) => caseTopY(z) - 0.024, cornerSeg: 10, edgeSeg: 7 },
      { hw: (CASE_WIDTH / 2) * 1.0035, hd: (CASE_DEPTH / 2) * 1.0035, r: 0.3435, y: (z) => caseTopY(z) - 0.013, cornerSeg: 10, edgeSeg: 7 },
      { hw: (CASE_WIDTH / 2) * 1.0015, hd: (CASE_DEPTH / 2) * 1.0015, r: 0.343, y: (z) => caseTopY(z) - 0.004, cornerSeg: 10, edgeSeg: 7 },
    ],
    { capTop: false, capBottom: false },
  );
  const rimMesh = new THREE.Mesh(rimGeo, trimMat);
  rimMesh.castShadow = false;
  rimMesh.receiveShadow = false;
  caseGroup.add(rimMesh);

  // Front nameplate badge.
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 0.33), badgeMat);
  badge.position.set(0, 0.54, CASE_DEPTH / 2 + 0.006);
  caseGroup.add(badge);
  const badgeBack = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.41),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.6, metalness: 0.4 }),
  );
  badgeBack.position.set(0, 0.54, CASE_DEPTH / 2 + 0.003);
  caseGroup.add(badgeBack);

  // Power LED on the front-right corner.
  const led = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 18), ledMat);
  led.rotation.x = Math.PI / 2;
  led.position.set(7.55, 0.8, CASE_DEPTH / 2 + 0.008);
  caseGroup.add(led);
  const ledRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.008, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.5, metalness: 0.6 }),
  );
  ledRing.position.copy(led.position);
  caseGroup.add(ledRing);

  // Etched wordmark on the front bezel of the top plate.
  const decalGroup = new THREE.Group();
  decalGroup.rotation.x = TILT;
  decalGroup.position.set(0, caseTopY(2.55) + 0.016, 2.55);
  const decalMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), decalMat);
  decalMesh.rotation.x = -Math.PI / 2;
  decalGroup.add(decalMesh);
  caseGroup.add(decalGroup);

  // Rubber feet.
  const footGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.045, 20);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.position.set(sx * CASE_WIDTH * 0.39, 0.0225, sz * CASE_DEPTH * 0.3);
      caseGroup.add(foot);
    }
  }

  // Studio floor glow, tinted by the chassis finish.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.004;
  glow.renderOrder = 2;
  root.add(glow);

  // ---------------------------------------------------------------- plate
  const gasketGeo = createSlabGeometry({
    width: PLATE_WIDTH + 0.07,
    depth: PLATE_DEPTH + 0.07,
    height: 0.03,
    radius: 0.18,
    bevel: 0.008,
  });
  const gasket = new THREE.Mesh(gasketGeo, gasketMat);
  gasket.position.y = -0.032;
  gasket.receiveShadow = true;
  plateGroup.add(gasket);

  const plateGeo = createSlabGeometry({
    width: PLATE_WIDTH,
    depth: PLATE_DEPTH,
    height: 0.08,
    radius: 0.16,
    bevel: 0.012,
  });
  const plateMesh = new THREE.Mesh(plateGeo, plateMat);
  plateMesh.castShadow = true;
  plateMesh.receiveShadow = true;
  plateGroup.add(plateMesh);

  // ---------------------------------------------------------------- keycaps
  const capGeometryCache = new Map();
  const getCapGeometry = (width, depth, height) => {
    const key = `${width.toFixed(3)}:${depth.toFixed(3)}:${height.toFixed(3)}`;
    let geometry = capGeometryCache.get(key);
    if (!geometry) {
      geometry = createKeycapGeometry({ width, depth, height });
      capGeometryCache.set(key, geometry);
    }
    return geometry;
  };

  /** @type {Array<object>} */
  const keys = [];
  /** @type {Record<string, object>} */
  const keysByCode = {};
  /** @type {THREE.Mesh[]} */
  const hitMeshes = [];

  KEY_ROWS.forEach((rowDefs, rowIndex) => {
    const rowWidth = rowDefs.reduce((sum, def) => sum + (def.w ?? 1), 0);
    let cursor = -rowWidth / 2;
    const z = (rowIndex - 2) * 1.0;

    rowDefs.forEach((def) => {
      const widthUnits = def.w ?? 1;
      const x = cursor + widthUnits / 2;
      cursor += widthUnits;

      const capWidth = widthUnits - GAP;
      const capDepth = 1 - GAP;
      const capHeight = ROW_HEIGHTS[rowIndex];
      const kind = def.kind ?? 'alpha';
      const material =
        kind === 'mod' ? capModMat : kind === 'accent' ? capAccentMat : capAlphaMat;

      const capMesh = new THREE.Mesh(getCapGeometry(capWidth, capDepth, capHeight), material);
      capMesh.castShadow = true;
      capMesh.receiveShadow = true;

      const group = new THREE.Group();
      group.position.set(x, CAP_BASE_Y, z);
      group.rotation.x = ROW_TILTS[rowIndex];
      group.add(capMesh);

      const topScale = 0.735;
      const planeWidth = capWidth * topScale * 0.92;
      const planeDepth = capDepth * topScale * 0.92;
      const labelSpec = {
        main: def.main,
        sub: def.sub,
        arrows: def.arrows ?? null,
        space: Boolean(def.space),
        isMod: kind === 'mod',
        width: planeWidth,
        height: planeDepth,
      };
      const labelTexture = createLegendTexture(labelSpec);
      const legendMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: labelTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.FrontSide,
      });
      if (kind === 'accent') accentLegendMaterials.push(legendMaterial);
      else normalLegendMaterials.push(legendMaterial);
      const labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(planeWidth, planeDepth),
        legendMaterial,
      );
      labelMesh.rotation.x = -Math.PI / 2;
      labelMesh.position.y = capHeight + 0.006;
      labelMesh.renderOrder = 1;
      group.add(labelMesh);

      const label = def.arrows ? ARROW_LABEL[def.arrows] : def.main;
      const record = {
        code: def.code,
        label,
        main: def.main,
        rowIndex,
        index: keys.length,
        widthUnits,
        kind,
        group,
        capMesh,
        labelMesh,
        baseX: x,
        baseY: CAP_BASE_Y,
        baseZ: z,
        height: capHeight,
        // Used by the explode animation for a gentle cascading lift.
        stagger: Math.min(
          1,
          Math.max(0, (x + rowWidth / 2) / rowWidth * 0.55 + (rowIndex / 4) * 0.45),
        ),
      };
      capMesh.userData.key = record;
      labelMesh.userData.key = record;
      hitMeshes.push(capMesh, labelMesh);
      keys.push(record);
      keysByCode[def.code] = record;
      capLayer.add(group);
    });
  });

  // ---------------------------------------------------------------- switches
  const switchDummy = new THREE.Object3D();
  const housingGeo = new THREE.BoxGeometry(0.66, 0.27, 0.66);
  housingGeo.translate(0, 0.27 / 2, 0);
  const housings = new THREE.InstancedMesh(housingGeo, switchMat, keys.length);
  housings.castShadow = false;
  housings.receiveShadow = false;
  const stemGeoA = new THREE.BoxGeometry(0.32, 0.05, 0.1);
  const stemGeoB = new THREE.BoxGeometry(0.1, 0.05, 0.32);
  stemGeoA.translate(0, 0.025, 0);
  stemGeoB.translate(0, 0.025, 0);
  const stemsA = new THREE.InstancedMesh(stemGeoA, stemMat, keys.length);
  const stemsB = new THREE.InstancedMesh(stemGeoB, stemMat, keys.length);
  stemsA.castShadow = false;
  stemsB.castShadow = false;

  keys.forEach((key, index) => {
    switchDummy.position.set(key.baseX, 0.08, key.baseZ);
    switchDummy.rotation.set(0, 0, 0);
    switchDummy.updateMatrix();
    housings.setMatrixAt(index, switchDummy.matrix);

    switchDummy.position.set(key.baseX, 0.36, key.baseZ);
    switchDummy.updateMatrix();
    stemsA.setMatrixAt(index, switchDummy.matrix);
    stemsB.setMatrixAt(index, switchDummy.matrix);
  });
  housings.instanceMatrix.needsUpdate = true;
  stemsA.instanceMatrix.needsUpdate = true;
  stemsB.instanceMatrix.needsUpdate = true;
  plateGroup.add(housings, stemsA, stemsB);

  // Stabilisers under the wide keys.
  const stabGeo = new THREE.BoxGeometry(0.2, 0.16, 0.52);
  const stabMat = new THREE.MeshStandardMaterial({
    color: 0x1b1c1f,
    metalness: 0.35,
    roughness: 0.45,
  });
  const wireMat = new THREE.MeshStandardMaterial({
    color: 0x8f9296,
    metalness: 0.9,
    roughness: 0.28,
  });
  const stableKeys = keys.filter((key) => key.widthUnits >= 2);
  for (const key of stableKeys) {
    const span = (key.widthUnits - GAP) / 2 - 0.5;
    for (const dir of [-1, 1]) {
      const stab = new THREE.Mesh(stabGeo, stabMat);
      stab.position.set(key.baseX + dir * span, 0.08, key.baseZ);
      plateGroup.add(stab);
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, Math.abs(span) * 1.75, 8), wireMat);
      wire.rotation.z = Math.PI / 2;
      wire.position.set(key.baseX, 0.075, key.baseZ + 0.24);
      plateGroup.add(wire);
    }
  }

  // Plate switch cut-outs: a thin dark seam around each switch makes the plate
  // read as a machined sheet instead of a solid slab in the exploded view.
  const cutoutGeo = new THREE.BoxGeometry(0.82, 0.006, 0.82);
  const cutoutMat = new THREE.MeshStandardMaterial({
    color: 0x08090a,
    roughness: 0.72,
    metalness: 0.2,
  });
  const cutouts = new THREE.InstancedMesh(cutoutGeo, cutoutMat, keys.length);
  keys.forEach((key, index) => {
    switchDummy.position.set(key.baseX, 0.081, key.baseZ);
    switchDummy.rotation.set(0, 0, 0);
    switchDummy.updateMatrix();
    cutouts.setMatrixAt(index, switchDummy.matrix);
  });
  cutouts.instanceMatrix.needsUpdate = true;
  cutouts.receiveShadow = true;
  plateGroup.add(cutouts);

  // Corner screws of the plate (visible once the assembly is opened up).
  const screwGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.018, 16);
  const screwMat = new THREE.MeshStandardMaterial({
    color: 0x8d9196,
    metalness: 0.95,
    roughness: 0.3,
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.position.set(sx * (PLATE_WIDTH / 2 - 0.22), 0.089, sz * (PLATE_DEPTH / 2 - 0.22));
      plateGroup.add(screw);
    }
  }

  // ---------------------------------------------------------------- theming
  const badgeCache = new Map();
  const targets = {
    case: new THREE.Color(),
    plate: new THREE.Color(),
    trim: new THREE.Color(),
    capAlpha: new THREE.Color(),
    capMod: new THREE.Color(),
    capAccent: new THREE.Color(),
    legend: new THREE.Color(),
    accentLegend: new THREE.Color(),
    led: new THREE.Color(),
    glow: new THREE.Color(),
    decal: new THREE.Color(),
  };
  const currentTheme = { caseId: '', keycapId: '' };

  const getBadgeTexture = (caseDef) => {
    let texture = badgeCache.get(caseDef.id);
    if (!texture) {
      texture = createBadgeTexture(caseDef);
      badgeCache.set(caseDef.id, texture);
    }
    return texture;
  };

  /**
   * Apply a persisted configuration to the model.
   * @param {{caseId: string, keycapId: string}} config
   * @param {boolean} [immediate] Snap instead of easing.
   */
  function applyConfig(config, immediate = false) {
    const caseDef = CASES.find((item) => item.id === config.caseId) ?? CASES[0];
    const keycapDef = KEYCAPS.find((item) => item.id === config.keycapId) ?? KEYCAPS[0];

    targets.case.set(caseDef.caseColor);
    targets.plate.set(caseDef.plateColor);
    targets.trim.set(caseDef.trimColor);
    targets.capAlpha.set(keycapDef.colors.alpha);
    targets.capMod.set(keycapDef.colors.mod);
    targets.capAccent.set(keycapDef.colors.accent);
    targets.legend.set(keycapDef.colors.legend);
    targets.accentLegend.set(keycapDef.colors.accentLegend);
    targets.led.set(caseDef.glowColor);
    targets.glow.set(caseDef.glowColor);
    targets.decal.set(caseDef.badgeLegend);

    caseMat.roughness = caseDef.caseRoughness;
    caseMat.metalness = caseDef.caseMetalness;
    plateMat.roughness = caseDef.plateRoughness;

    if (currentTheme.caseId !== caseDef.id) {
      badgeMat.map = getBadgeTexture(caseDef);
      badgeMat.needsUpdate = true;
      currentTheme.caseId = caseDef.id;
    }
    currentTheme.keycapId = keycapDef.id;

    if (immediate) snapColors();
  }

  function snapColors() {
    caseMat.color.copy(targets.case);
    plateMat.color.copy(targets.plate);
    trimMat.color.copy(targets.trim);
    capAlphaMat.color.copy(targets.capAlpha);
    capModMat.color.copy(targets.capMod);
    capAccentMat.color.copy(targets.capAccent);
    for (const material of normalLegendMaterials) material.color.copy(targets.legend);
    for (const material of accentLegendMaterials) material.color.copy(targets.accentLegend);
    decalMat.color.copy(targets.decal);
    glowMat.color.copy(targets.glow);
    ledMat.color.copy(targets.led);
    ledMat.emissive.copy(targets.led);
  }

  /** Smoothly ease material colours towards the active configuration. */
  function updateColors(dt) {
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 10);
    caseMat.color.lerp(targets.case, k);
    plateMat.color.lerp(targets.plate, k);
    trimMat.color.lerp(targets.trim, k);
    capAlphaMat.color.lerp(targets.capAlpha, k);
    capModMat.color.lerp(targets.capMod, k);
    capAccentMat.color.lerp(targets.capAccent, k);
    for (const material of normalLegendMaterials) material.color.lerp(targets.legend, k);
    for (const material of accentLegendMaterials) material.color.lerp(targets.accentLegend, k);
    decalMat.color.lerp(targets.decal, k);
    glowMat.color.lerp(targets.glow, k);
    ledMat.color.lerp(targets.led, k);
    ledMat.emissive.lerp(targets.led, k);
  }

  return {
    root,
    tiltRoot,
    caseGroup,
    plateGroup,
    capLayer,
    caseMesh,
    plateMesh,
    materials: {
      caseMat,
      plateMat,
      trimMat,
      gasketMat,
      switchMat,
      stemMat,
      capAlphaMat,
      capModMat,
      capAccentMat,
      badgeMat,
      decalMat,
      ledMat,
      glowMat,
      normalLegendMaterials,
      accentLegendMaterials,
    },
    keys,
    keysByCode,
    hitMeshes,
    rowCounts: ROW_COUNTS,
    keyCount: KEY_COUNT,
    applyConfig,
    updateColors,
    getThemeIds: () => ({ ...currentTheme }),
    caseTopY,
  };
}
