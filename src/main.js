/**
 * LUMEN 68 / 光屿 — application entry point.
 *
 * Boot order:
 *   1. mount the DOM interface (product page + configurator)
 *   2. build the procedural Three.js keyboard and studio stage
 *   3. wire experience mode / explode view / camera controls
 *   4. render, keep the store and the 3D model in sync
 */
import { mountUI } from './ui/panel.js';
import { getConfig, subscribe } from './state.js';
import { createKeyboard } from './scene/keyboard.js';
import { Stage } from './scene/stage.js';
import { createInteraction } from './interaction.js';
import { exposeTestApi } from './test-api.js';

const viewport = document.getElementById('viewport');

mountUI();

let keyboard = null;
let stage = null;
let interaction = null;
let ready = false;
let frames = 0;
let lastTime = performance.now();

function markReady() {
  if (ready) return;
  ready = true;
  document.body.dataset.appReady = 'true';
  if (keyboard && stage && interaction) {
    exposeTestApi({ keyboard, stage, interaction });
  }
  window.__LUMEN_READY__ = true;
}

function showSceneFallback(error) {
  console.error('[LUMEN] The Three.js scene could not start.', error);
  document.body.dataset.appError = 'true';
  if (!viewport) return;
  const fallback = document.createElement('div');
  fallback.className = 'scene-fallback';
  fallback.innerHTML =
    '<strong>三维预览不可用</strong><span>当前浏览器未能创建 WebGL 上下文，配置面板仍可正常使用。</span>';
  viewport.appendChild(fallback);
}

try {
  keyboard = createKeyboard();
  stage = new Stage(viewport);
  stage.scene.add(keyboard.root);
  keyboard.applyConfig(getConfig(), true);
  interaction = createInteraction({ keyboard, stage });

  subscribe((config) => {
    keyboard.applyConfig(config);
    document.body.dataset.case = config.caseId;
    document.body.dataset.keycap = config.keycapId;
  });
  document.body.dataset.case = getConfig().caseId;
  document.body.dataset.keycap = getConfig().keycapId;

  const resizeObserver = new ResizeObserver(() => stage.resize());
  resizeObserver.observe(viewport);
  window.addEventListener('resize', () => stage.resize());
} catch (error) {
  showSceneFallback(error);
}

function animate(now) {
  requestAnimationFrame(animate);
  if (!stage || !keyboard || !interaction) return;

  const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  interaction.update(dt);
  stage.setExplodeProgress(interaction.getExplodeState().progress);
  keyboard.updateColors(dt);
  stage.update(dt);
  stage.render();

  frames += 1;
  if (frames === 2) markReady();
}

requestAnimationFrame(animate);
