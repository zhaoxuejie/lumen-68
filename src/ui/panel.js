/**
 * LUMEN 68 / 光屿 — DOM interface.
 *
 * This module owns everything that is not Three.js: the hero copy, the
 * configuration panel, the viewport overlays and the footer. It renders the
 * case and keycap options from `src/state.js`, keeps every visible label in
 * sync with the store and surfaces `lumen:toast` events as a small toast.
 *
 * `mountUI()` is called once by `src/main.js` after the DOM is parsed.
 */

import {
  CASES,
  KEYCAPS,
  getConfig,
  subscribe,
  setCase,
  setKeycap,
  setProfileName,
  restoreDefaults,
  announceInitial,
  getDisplayName,
  isStorageAvailable,
} from '../state.js';
import { on } from '../bus.js';

const TOAST_HOLD_MS = 2800;
const TOAST_HOLD_ERROR_MS = 4200;
const SAVE_PULSE_MS = 800;

let api = null;
let storageOk = true;
let toastTimer = 0;
let savePulseTimer = 0;

/** @param {string} id */
function byId(id) {
  return document.getElementById(id);
}

/**
 * Collect every DOM node the interface writes to. Returns `null` (after
 * logging) when the static skeleton in `index.html` is missing, so the rest of
 * the application can still boot.
 * @returns {Record<string, HTMLElement | null> | null}
 */
function collectRefs() {
  /** @type {Record<string, HTMLElement | null>} */
  const refs = {
    caseOptions: byId('case-options'),
    keycapOptions: byId('keycap-options'),
    profileName: /** @type {HTMLInputElement | null} */ (byId('profile-name')),
    summaryName: byId('summary-name'),
    summaryCase: byId('summary-case'),
    summaryCaseMeta: byId('summary-case-meta'),
    summaryKeycap: byId('summary-keycap'),
    summaryKeycapMeta: byId('summary-keycap-meta'),
    saveLine: document.querySelector('.save-line'),
    saveStatus: byId('save-status'),
    restoreButton: byId('btn-restore'),
    proxyReset: document.querySelector('[data-proxy-target="btn-reset-view"]'),
    caseRow: document.querySelector('.summary-row--case'),
    keycapRow: document.querySelector('.summary-row--keycap'),
    toast: byId('toast'),
  };

  const essential = [
    refs.caseOptions,
    refs.keycapOptions,
    refs.profileName,
    refs.summaryName,
    refs.saveStatus,
    refs.restoreButton,
    refs.toast,
  ];

  if (essential.some((node) => !node)) {
    console.error('[LUMEN] UI skeleton is incomplete in index.html — skipping panel mount.');
    return null;
  }

  return refs;
}

/* -------------------------------------------------------------------------- */
/* Option card factories                                                       */
/* -------------------------------------------------------------------------- */

/** @returns {HTMLElement} */
function createCheckMark() {
  const mark = document.createElement('span');
  mark.className = 'option-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2 5 8.7l4.5-5"/></svg>';
  return mark;
}

/**
 * @param {(typeof CASES)[number]} item
 * @returns {HTMLButtonElement}
 */
function createCaseOption(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option option--case';
  button.dataset.case = item.id;
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `${item.name} ${item.en}，${item.finish}`);
  if (item.blurb) button.title = item.blurb;
  button.style.setProperty('--swatch', item.swatch);

  const swatch = document.createElement('span');
  swatch.className = 'option-swatch';
  swatch.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'option-text';

  const name = document.createElement('span');
  name.className = 'option-name';
  name.textContent = item.name;

  const en = document.createElement('span');
  en.className = 'option-en';
  en.textContent = item.en;

  text.append(name, en);
  button.append(swatch, text, createCheckMark());
  button.addEventListener('click', () => setCase(item.id));
  return button;
}

/**
 * Three mini keycaps tinted with the swatches declared in `state.js`.
 * @param {(typeof KEYCAPS)[number]} item
 * @returns {HTMLElement}
 */
function createKeycapMini(item) {
  const mini = document.createElement('span');
  mini.className = 'keycap-mini';
  mini.setAttribute('aria-hidden', 'true');
  for (const color of item.swatches.slice(0, 3)) {
    const keycap = document.createElement('span');
    keycap.className = 'kc';
    keycap.style.setProperty('--kc', color);
    mini.append(keycap);
  }
  return mini;
}

/**
 * @param {(typeof KEYCAPS)[number]} item
 * @returns {HTMLButtonElement}
 */
function createKeycapOption(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option option--keycap';
  button.dataset.keycap = item.id;
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', `${item.name} ${item.en}，${item.material}`);
  if (item.mood) button.title = item.mood;

  const text = document.createElement('span');
  text.className = 'option-text';

  const name = document.createElement('span');
  name.className = 'option-name';
  name.textContent = item.name;

  const en = document.createElement('span');
  en.className = 'option-en';
  en.textContent = item.en;

  text.append(name, en);
  button.append(createKeycapMini(item), text, createCheckMark());
  button.addEventListener('click', () => setKeycap(item.id));
  return button;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @param {Record<string, any>} refs
 * @param {string} attribute
 * @param {string} activeId
 */
function updateOptions(refs, attribute, activeId) {
  const container = attribute === 'case' ? refs.caseOptions : refs.keycapOptions;
  if (!container) return;
  for (const button of container.querySelectorAll(`button[data-${attribute}]`)) {
    const selected = button.dataset[attribute] === activeId;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

/**
 * @param {Record<string, any>} refs
 * @param {ReturnType<typeof getConfig>} config
 * @param {{ displayName?: string } | undefined} detail
 */
function updateSummary(refs, config, detail) {
  const caseItem = CASES.find((item) => item.id === config.caseId) ?? CASES[0];
  const keycapItem = KEYCAPS.find((item) => item.id === config.keycapId) ?? KEYCAPS[0];

  if (refs.summaryName) refs.summaryName.textContent = detail?.displayName ?? getDisplayName();
  if (refs.summaryCase) refs.summaryCase.textContent = caseItem.name;
  if (refs.summaryCaseMeta) refs.summaryCaseMeta.textContent = caseItem.finish;
  if (refs.summaryKeycap) refs.summaryKeycap.textContent = keycapItem.name;
  if (refs.summaryKeycapMeta) refs.summaryKeycapMeta.textContent = keycapItem.material;

  if (refs.caseRow) {
    refs.caseRow.style.setProperty('--swatch', caseItem.swatch);
  }
  if (refs.keycapRow) {
    const [alpha, mod, accent] = keycapItem.swatches;
    refs.keycapRow.style.setProperty(
      '--swatch',
      `linear-gradient(90deg, ${alpha} 0 33%, ${mod} 33% 66%, ${accent} 66%)`,
    );
  }
}

/**
 * Keep the controlled input in sync without disturbing the caret while typing.
 * @param {Record<string, any>} refs
 * @param {ReturnType<typeof getConfig>} config
 */
function syncNameInput(refs, config) {
  const input = refs.profileName;
  if (!input) return;
  if (document.activeElement === input) return;
  if (input.value !== config.profileName) input.value = config.profileName;
}

/** @param {Record<string, any>} refs */
function pulseSaveIndicator(refs) {
  const line = refs.saveLine;
  if (!line) return;
  line.classList.remove('is-pulse');
  // Force a reflow so the animation restarts on rapid changes.
  void line.offsetWidth;
  line.classList.add('is-pulse');
  window.clearTimeout(savePulseTimer);
  savePulseTimer = window.setTimeout(() => line.classList.remove('is-pulse'), SAVE_PULSE_MS);
}

/**
 * @param {Record<string, any>} refs
 * @param {{ reason?: string, saved?: boolean } | undefined} detail
 */
function updateSaveStatus(refs, detail) {
  const line = refs.saveLine;
  const status = refs.saveStatus;
  if (!status) return;

  if (!storageOk) {
    if (line) line.dataset.state = 'warn';
    status.textContent = '仅本次会话 · 存储不可用';
    return;
  }

  // Nothing persisted yet (fresh visit): saving is available but idle.
  if (detail?.reason === 'init' && detail.saved === false) {
    if (line) line.dataset.state = 'idle';
    status.textContent = '自动保存已开启 · 本机';
    return;
  }

  // A change happened but the store could not write it.
  if (detail && detail.saved === false) {
    if (line) line.dataset.state = 'warn';
    status.textContent = '保存失败 · 仅本次会话';
    return;
  }

  // Restoring removes the saved entry, so "已自动保存" would be misleading.
  if (detail?.reason === 'restore') {
    if (line) line.dataset.state = 'idle';
    status.textContent = '已恢复默认 · 本机';
    pulseSaveIndicator(refs);
    return;
  }

  if (line) line.dataset.state = 'saved';
  status.textContent = '已自动保存 · 本机';

  if (detail && (detail.reason === 'case' || detail.reason === 'keycap')) {
    pulseSaveIndicator(refs);
  }
}

/**
 * @param {Record<string, any>} refs
 * @param {ReturnType<typeof getConfig>} config
 * @param {{ reason?: string, saved?: boolean, displayName?: string } | undefined} detail
 */
function handleStateChange(refs, config, detail) {
  updateOptions(refs, 'case', config.caseId);
  updateOptions(refs, 'keycap', config.keycapId);
  updateSummary(refs, config, detail);
  syncNameInput(refs, config);
  updateSaveStatus(refs, detail);
}

/**
 * @param {Record<string, any>} refs
 * @param {string} message
 * @param {'default' | 'success' | 'error'} [tone]
 */
function showToast(refs, message, tone = 'default') {
  const toast = refs.toast;
  if (!toast || !message) return;
  const safeTone = tone === 'success' || tone === 'error' ? tone : 'default';
  toast.textContent = String(message);
  toast.dataset.tone = safeTone;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => toast.classList.remove('is-visible'),
    safeTone === 'error' ? TOAST_HOLD_ERROR_MS : TOAST_HOLD_MS,
  );
}

/* -------------------------------------------------------------------------- */
/* Mounting                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Render dynamic content, bind listeners and announce the initial state.
 * Safe to call multiple times; only the first call wires anything.
 * @returns {{ showToast: (message: string, tone?: 'default' | 'success' | 'error') => void, destroy: () => void } | null}
 */
export function mountUI() {
  if (api) return api;

  const refs = collectRefs();
  if (!refs) {
    // Even without the skeleton, announce the state so the 3D scene can read it.
    try {
      announceInitial();
    } catch (error) {
      console.error('[LUMEN] announceInitial failed', error);
    }
    return null;
  }

  storageOk = isStorageAvailable();

  refs.caseOptions.replaceChildren(...CASES.map(createCaseOption));
  refs.keycapOptions.replaceChildren(...KEYCAPS.map(createKeycapOption));

  refs.profileName.addEventListener('input', (event) => {
    setProfileName(/** @type {HTMLInputElement} */ (event.currentTarget).value);
  });
  refs.profileName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      /** @type {HTMLInputElement} */ (refs.profileName).blur();
    }
  });

  refs.restoreButton.addEventListener('click', () => {
    restoreDefaults();
    showToast(
      refs,
      storageOk
        ? `已恢复默认配置 · ${CASES[0].name} / ${KEYCAPS[0].name}`
        : '已恢复默认配置（仅本次会话）',
      'success',
    );
  });

  // Convenience duplicate of the viewport reset, kept as a plain proxy click so
  // the 3D scene only ever needs one listener (on #btn-reset-view).
  refs.proxyReset?.addEventListener('click', () => {
    byId('btn-reset-view')?.click();
  });

  const unsubscribe = subscribe((config, detail) => handleStateChange(refs, config, detail));
  const offToast = on('lumen:toast', (event) => {
    const detail = event.detail;
    if (detail && typeof detail.message === 'string') {
      showToast(refs, detail.message, detail.tone);
    }
  });

  // Must be the very last step: it notifies every state listener (including the
  // Three.js scene) about the restored / stored configuration.
  announceInitial();
  document.body.classList.add('ui-ready');

  api = {
    showToast: (message, tone) => showToast(refs, message, tone),
    destroy() {
      unsubscribe();
      offToast();
      window.clearTimeout(toastTimer);
      window.clearTimeout(savePulseTimer);
      refs.toast?.classList.remove('is-visible');
      document.body.classList.remove('ui-ready');
      api = null;
    },
  };

  return api;
}
