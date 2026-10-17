/**
 * Interaction layer for LUMEN 68.
 *
 * Owns:
 *  - the exploded-view state machine (a critically stable spring, so rapid
 *    clicking always settles on the last requested state)
 *  - per-keycap press/release springs for the "typing experience" mode
 *  - physical keyboard + pointer input with strict focus guarding
 *  - the projected layer annotations shown in exploded view
 *  - view reset / auto-rotate wiring
 */
import * as THREE from 'three';
import { emit } from './bus.js';

const EXPLODE_CAPS = 3.0;
const EXPLODE_PLATE = 1.35;
const EXPLODE_STAGGER = 0.26;
const PRESS_DEPTH = 0.16;
const EXPLODE_RATE = 8.5;

const LETTER_PRESSABLE = /^Key[A-Z]$/;
const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a[href], [contenteditable="true"], [contenteditable=""]';

/** @param {EventTarget | null} target */
function isInteractive(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

/**
 * @param {{keyboard: ReturnType<typeof import('./scene/keyboard.js').createKeyboard>, stage: import('./scene/stage.js').Stage}} options
 */
export function createInteraction({ keyboard, stage }) {
  const body = document.body;
  const explodeButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-explode'));
  const explodeLabel = document.getElementById('btn-explode-label');
  const resetButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-reset-view'));
  const autoRotateToggle = /** @type {HTMLInputElement | null} */ (document.getElementById('toggle-autorotate'));
  const experienceToggle = /** @type {HTMLInputElement | null} */ (document.getElementById('toggle-experience'));
  const experienceStatus = document.getElementById('experience-status');
  const experienceHint = document.getElementById('experience-hint');
  const keyEcho = document.getElementById('key-echo');
  const labelsContainer = document.getElementById('layer-labels');
  const canvas = stage.renderer.domElement;

  let explodedTarget = 0;
  let explodedProgress = 0;
  let experienceOn = false;
  let echoBuffer = [];
  let echoTimer = 0;
  /** @type {Map<number, string>} */
  const pointerHolds = new Map();
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const worldPosition = new THREE.Vector3();
  const ndcOut = new THREE.Vector3();

  for (const key of keyboard.keys) {
    key.press = 0;
    key.pressVelocity = 0;
    key.pressTarget = 0;
    key.pressed = false;
  }

  // ------------------------------------------------------------- layer labels
  /** @type {Array<{layer: string, el: HTMLElement, anchor: THREE.Object3D}>} */
  const layerLabels = [];
  if (labelsContainer) {
    const defs = [
      { layer: 'caps', text: '01 · 键帽 / KEYCAPS', short: '01 · 键帽', y: 0.9, z: -2.0, x: 4.0, group: keyboard.capLayer },
      { layer: 'plate', text: '02 · 定位板 / PLATE', short: '02 · 定位板', y: 0.55, z: -2.0, x: 4.0, group: keyboard.plateGroup },
      { layer: 'case', text: '03 · 底壳 / CASE', short: '03 · 底壳', y: 1.4, z: -2.0, x: 4.0, group: keyboard.caseGroup },
    ];
    for (const def of defs) {
      const anchor = new THREE.Object3D();
      anchor.position.set(def.x, def.y, def.z);
      def.group.add(anchor);
      const el = document.createElement('div');
      el.className = 'layer-label';
      el.dataset.layer = def.layer;
      el.textContent = def.text;
      labelsContainer.appendChild(el);
      layerLabels.push({ layer: def.layer, el, anchor, fullText: def.text, shortText: def.short });
    }
  }

  // ------------------------------------------------------------- visual state
  function updateExplodeUI() {
    if (explodeLabel) {
      explodeLabel.textContent = explodedTarget ? '组装还原' : '拆解视图';
    }
    if (explodeButton) {
      explodeButton.setAttribute('aria-pressed', String(Boolean(explodedTarget)));
      explodeButton.classList.toggle('is-open', Boolean(explodedTarget));
    }
    body.dataset.exploded = explodedTarget ? 'open' : 'closed';
  }

  /**
   * @param {boolean} [force]
   * @returns {boolean} The new target state.
   */
  function setExploded(force) {
    explodedTarget = force ? 1 : 0;
    updateExplodeUI();
    return Boolean(explodedTarget);
  }

  function toggleExplode() {
    return setExploded(explodedTarget !== 1);
  }

  // ------------------------------------------------------------- key press
  function echoKey(key) {
    const char =
      key.code === 'Space'
        ? '␣'
        : (key.main && key.main.length <= 2 ? key.main.toUpperCase() : key.label ?? '');
    echoBuffer = [...echoBuffer, char].slice(-18);
    if (keyEcho) {
      keyEcho.textContent = echoBuffer.join(' ');
      keyEcho.classList.add('is-active');
    }
    window.clearTimeout(echoTimer);
    echoTimer = window.setTimeout(() => {
      echoBuffer = [];
      if (keyEcho) {
        keyEcho.textContent = '—';
        keyEcho.classList.remove('is-active');
      }
    }, 2600);
  }

  /** @param {string} code */
  function pressKey(code, { echo = true } = {}) {
    const key = keyboard.keysByCode[code];
    if (!key) return false;
    key.pressTarget = 1;
    key.pressed = true;
    if (echo) echoKey(key);
    return true;
  }

  /** @param {string} code */
  function releaseKey(code) {
    const key = keyboard.keysByCode[code];
    if (!key) return false;
    key.pressTarget = 0;
    key.pressed = false;
    return true;
  }

  function releaseAll() {
    for (const key of keyboard.keys) {
      key.pressTarget = 0;
      key.pressed = false;
    }
    pointerHolds.clear();
  }

  // ------------------------------------------------------------- experience
  /** @param {boolean} enabled */
  function setExperience(enabled) {
    experienceOn = Boolean(enabled);
    body.dataset.experience = experienceOn ? 'on' : 'off';
    if (experienceToggle) experienceToggle.checked = experienceOn;
    if (experienceStatus) {
      experienceStatus.textContent = experienceOn
        ? '已开启 · 直接敲击 A–Z / 空格，或点击键帽'
        : '开启后可敲击 A–Z / 空格，或点按键帽';
    }
    if (experienceHint) {
      experienceHint.hidden = !experienceOn;
      if (experienceOn) experienceHint.textContent = '体验模式 · 按下 A–Z / 空格，或直接点按键帽';
    }
    if (!experienceOn) {
      releaseAll();
      echoBuffer = [];
      if (keyEcho) {
        keyEcho.textContent = '—';
        keyEcho.classList.remove('is-active');
      }
    }
  }

  // ------------------------------------------------------------- physical keys
  function isTypingContext(event) {
    return isInteractive(event.target) || isInteractive(document.activeElement);
  }

  function onKeyDown(event) {
    if (!experienceOn) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingContext(event)) return;
    const { code } = event;
    const pressable = LETTER_PRESSABLE.test(code) || code === 'Space';
    if (!pressable) return;
    if (!event.repeat) pressKey(code);
    event.preventDefault();
  }

  function onKeyUp(event) {
    if (!experienceOn) return;
    if (isTypingContext(event)) return;
    const { code } = event;
    if (LETTER_PRESSABLE.test(code) || code === 'Space') releaseKey(code);
  }

  function onBlur() {
    releaseAll();
  }

  // ------------------------------------------------------------- pointer input
  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {object | null}
   */
  function pickKey(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, stage.camera);
    const hits = raycaster.intersectObjects(keyboard.hitMeshes, false);
    return hits.length ? hits[0].object.userData.key ?? null : null;
  }

  function onPointerDown(event) {
    if (!experienceOn) return;
    if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
    const key = pickKey(event.clientX, event.clientY);
    if (!key) return;
    pressKey(key.code);
    pointerHolds.set(event.pointerId, key.code);
  }

  function releasePointerHold(event) {
    const code = pointerHolds.get(event.pointerId);
    if (code) {
      releaseKey(code);
      pointerHolds.delete(event.pointerId);
    }
  }

  let lastHoverCheck = 0;
  function onPointerMove(event) {
    if (!experienceOn || event.pointerType === 'touch') return;
    const now = performance.now();
    if (now - lastHoverCheck < 90) return;
    lastHoverCheck = now;
    canvas.style.cursor = pickKey(event.clientX, event.clientY) ? 'pointer' : '';
  }

  function onPointerLeave() {
    canvas.style.cursor = '';
  }

  function onDoubleClick() {
    resetView();
  }

  function resetView() {
    stage.resetView();
    emit('lumen:toast', { message: '视角已复位' });
  }

  // ------------------------------------------------------------- wiring
  if (explodeButton) explodeButton.addEventListener('click', () => toggleExplode());
  if (resetButton) resetButton.addEventListener('click', resetView);
  if (autoRotateToggle) {
    autoRotateToggle.addEventListener('change', () => {
      stage.setAutoRotate(autoRotateToggle.checked);
    });
  }
  if (experienceToggle) {
    experienceToggle.addEventListener('change', () => {
      setExperience(experienceToggle.checked);
    });
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onBlur();
  });
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', releasePointerHold);
  window.addEventListener('pointercancel', releasePointerHold);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('dblclick', onDoubleClick);

  // ------------------------------------------------------------- per-frame
  function update(dt) {
    // Exploded view: exponential smoothing towards the target. The target can
    // flip at any moment and the value always converges to it, which makes the
    // interaction immune to rapid repeated clicks.
    const explodeGain = 1 - Math.exp(-Math.min(dt, 0.08) * EXPLODE_RATE);
    explodedProgress += (explodedTarget - explodedProgress) * explodeGain;
    if (Math.abs(explodedTarget - explodedProgress) < 0.0004) {
      explodedProgress = explodedTarget;
    }

    keyboard.capLayer.position.y = explodedProgress * EXPLODE_CAPS;
    keyboard.plateGroup.position.y = explodedProgress * EXPLODE_PLATE;

    // Fixed-timestep spring integration: keeps the keycap rebound feel the same
    // on high-refresh displays and on slow/software-rendered machines.
    const steps = Math.min(4, Math.max(1, Math.ceil(dt / 0.033)));
    const subDt = dt / steps;
    for (const key of keyboard.keys) {
      const stiffness = 460;
      const damping = 21;
      for (let step = 0; step < steps; step += 1) {
        key.pressVelocity +=
          ((key.pressTarget - key.press) * stiffness - key.pressVelocity * damping) * subDt;
        key.press += key.pressVelocity * subDt;
        if (key.press < -0.2) {
          key.press = -0.2;
          key.pressVelocity = 0;
        }
        if (key.press > 1.25) {
          key.press = 1.25;
          key.pressVelocity = 0;
        }
      }
      if (Math.abs(key.pressTarget - key.press) < 0.0015 && Math.abs(key.pressVelocity) < 0.002) {
        key.press = key.pressTarget;
        key.pressVelocity = 0;
      }
      key.group.position.y =
        key.baseY + explodedProgress * key.stagger * EXPLODE_STAGGER - key.press * PRESS_DEPTH;
    }

    updateLayerLabels();
  }

  function updateLayerLabels() {
    if (!layerLabels.length) return;
    const visible = explodedProgress > 0.035;
    if (!visible) {
      for (const label of layerLabels) {
        if (label.el.style.display !== 'none') label.el.style.display = 'none';
      }
      return;
    }
    const opacity = Math.min(1, (explodedProgress - 0.035) * 3.2);
    const containerRect = labelsContainer.getBoundingClientRect();
    const compact = containerRect.width < 640;
    let compactCursor = 12;
    const compactY = 34;
    layerLabels.forEach((label, index) => {
      const text = compact ? label.shortText : label.fullText;
      if (label.el.textContent !== text) label.el.textContent = text;

      label.anchor.getWorldPosition(worldPosition);
      const projected = stage.projectToPage(worldPosition, ndcOut);
      if (!projected.visible) {
        label.el.style.display = 'none';
        return;
      }
      label.el.style.display = 'block';
      label.el.style.opacity = String(Number((opacity * 0.96).toFixed(3)));

      if (compact) {
        // Narrow screens: a single compact row above the product, so the
        // annotations never cover the keycaps themselves.
        if (!label.widths) label.widths = {};
        const cacheKey = 'compact';
        if (!label.widths[cacheKey]) {
          label.widths[cacheKey] = label.el.offsetWidth || 70;
        }
        label.el.style.transform = `translate3d(${compactCursor}px, ${compactY}px, 0) translate(0, -50%)`;
        compactCursor += label.widths[cacheKey] + 8;
      } else {
        // Desktop: annotations live in the empty left margin, vertically
        // aligned with the layer they describe.
        const y = Math.min(
          Math.max(projected.y - containerRect.top, 56),
          Math.max(120, containerRect.height - 116),
        );
        label.el.style.transform = `translate3d(18px, ${y.toFixed(1)}px, 0) translate(0, -50%)`;
      }
    });
  }

  setExperience(false);
  updateExplodeUI();

  return {
    update,
    toggleExplode,
    setExploded,
    getExploded: () => Boolean(explodedTarget),
    getExplodeState: () => ({
      target: explodedTarget,
      progress: explodedProgress,
      offsets: {
        caps: keyboard.capLayer.position.y,
        plate: keyboard.plateGroup.position.y,
        case_: 0,
      },
    }),
    setExperience,
    getExperience: () => experienceOn,
    pressVirtual: (code) => (experienceOn ? pressKey(code) : false),
    releaseVirtual: (code) => releaseKey(code),
    isSettled: () =>
      Math.abs(explodedTarget - explodedProgress) < 0.0011 &&
      keyboard.keys.every((key) => Math.abs(key.press) < 0.0025 && Math.abs(key.pressVelocity) < 0.003),
    getKeyPress: (code) => keyboard.keysByCode[code]?.press ?? null,
    getLabelsVisible: () => explodedProgress > 0.05,
    getEcho: () => echoBuffer.join(' '),
    resetView,
    // Exposed for automated verification.
    __layers: { keyboard, stage },
  };
}
