/**
 * Automated verification interface.
 *
 * Exposes a small, deliberately non-visual API on `window.__LUMEN__` so the QA
 * suite can assert real scene state (explode progress, key press springs,
 * projected keycap positions, camera state) rather than only DOM text.
 *
 * See docs/TEST-API.md for the contract.
 */
import * as THREE from 'three';
import {
  STORAGE_KEY,
  CASES,
  KEYCAPS,
  getConfig,
  setCase,
  setKeycap,
} from './state.js';

const PRESS_DEPTH = 0.16;
const vector = new THREE.Vector3();

const round = (value, digits = 4) => Number(value.toFixed(digits));

/**
 * @param {{
 *   keyboard: ReturnType<typeof import('./scene/keyboard.js').createKeyboard>,
 *   stage: import('./scene/stage.js').Stage,
 *   interaction: ReturnType<typeof import('./interaction.js').createInteraction>,
 * }} context
 */
export function exposeTestApi({ keyboard, stage, interaction }) {
  /** @param {string} code */
  function getKeyInfo(code) {
    const key = keyboard.keysByCode[code];
    if (!key) return null;

    vector.set(0, key.height + 0.02, 0);
    key.capMesh.localToWorld(vector);
    const world = { x: vector.x, y: vector.y, z: vector.z };
    const screen = stage.projectToPage(vector);

    const press = Math.min(1, Math.max(0, key.press));
    return {
      code: key.code,
      label: key.label,
      pressed: Boolean(key.pressed),
      press: round(press, 4),
      offset: round(-press * PRESS_DEPTH, 5),
      worldPosition: [round(world.x, 3), round(world.y, 3), round(world.z, 3)],
      screen: { x: round(screen.x, 1), y: round(screen.y, 1) },
      inView: screen.visible,
    };
  }

  function whenSettled(timeoutMs = 4000) {
    const start = performance.now();
    return new Promise((resolve) => {
      const check = () => {
        const settled = interaction.isSettled() && stage.isCameraSettled();
        if (settled) {
          resolve(true);
          return;
        }
        if (performance.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  /**
   * Wait until the eased material colours have reached the requested theme.
   * Useful in software-rendered CI where the colour ease runs at a low FPS.
   */
  function waitForTheme(caseId, keycapId, timeoutMs = 6000) {
    const expectedCase = CASES.find((item) => item.id === (caseId ?? getConfig().caseId)) ?? CASES[0];
    const expectedCaps =
      KEYCAPS.find((item) => item.id === (keycapId ?? getConfig().keycapId)) ?? KEYCAPS[0];
    const start = performance.now();
    const matches = () => {
      const mats = keyboard.materials;
      const near = (color, hex) => color.getHexString() === hex.replace('#', '').toLowerCase();
      return (
        near(mats.caseMat.color, expectedCase.caseColor) &&
        near(mats.plateMat.color, expectedCase.plateColor) &&
        near(mats.capAlphaMat.color, expectedCaps.colors.alpha) &&
        near(mats.capAccentMat.color, expectedCaps.colors.accent)
      );
    };
    return new Promise((resolve) => {
      const check = () => {
        if (matches()) {
          resolve(true);
          return;
        }
        if (performance.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  const api = {
    version: '1.0.0',
    storageKey: STORAGE_KEY,

    getState() {
      const config = getConfig();
      const explode = interaction.getExplodeState();
      return {
        ...config,
        experience: interaction.getExperience(),
        exploded: interaction.getExploded(),
        explodeTarget: explode.target,
        explodeProgress: round(explode.progress, 5),
        camera: stage.getCameraState(),
        layers: {
          caps: round(explode.offsets.caps, 4),
          plate: round(explode.offsets.plate, 4),
          case_: round(explode.offsets.case_, 4),
        },
        keys: keyboard.keyCount,
        ready: Boolean(window.__LUMEN_READY__),
      };
    },

    setCase,
    setKeycap,
    setExperience: (enabled) => interaction.setExperience(Boolean(enabled)),
    toggleExplode: () => interaction.toggleExplode(),
    setExploded: (enabled) => interaction.setExploded(Boolean(enabled)),

    resetCamera: () => interaction.resetView(),
    getCamera: () => stage.getCameraState(),
    whenSettled,
    waitForTheme,

    getKey: getKeyInfo,
    pressVirtual: (code) => interaction.pressVirtual(code),
    releaseVirtual: (code) => interaction.releaseVirtual(code),

    getSceneInfo() {
      const canvas = stage.renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      return {
        renderer: stage.renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl1',
        pixelRatio: stage.renderer.getPixelRatio(),
        canvas: {
          width: canvas.width,
          height: canvas.height,
          clientWidth: Math.round(rect.width),
          clientHeight: Math.round(rect.height),
        },
        keyCount: keyboard.keyCount,
        rows: [...keyboard.rowCounts],
        theme: (() => {
          const ids = keyboard.getThemeIds();
          return { case: ids.caseId, keycap: ids.keycapId };
        })(),
        labelsVisible: interaction.getLabelsVisible(),
      };
    },

    /** Material colours actually applied to the 3D model (hex strings). */
    getRenderTheme() {
      const mats = keyboard.materials;
      return {
        case: `#${mats.caseMat.color.getHexString()}`,
        plate: `#${mats.plateMat.color.getHexString()}`,
        capAlpha: `#${mats.capAlphaMat.color.getHexString()}`,
        capMod: `#${mats.capModMat.color.getHexString()}`,
        capAccent: `#${mats.capAccentMat.color.getHexString()}`,
        legend: `#${mats.normalLegendMaterials[0]?.color.getHexString() ?? 'ffffff'}`,
      };
    },

    getEcho: () => interaction.getEcho(),
  };

  window.__LUMEN__ = api;
  return api;
}
