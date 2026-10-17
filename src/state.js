/**
 * LUMEN 68 configuration state.
 *
 * This module is the single source of truth for everything the user can
 * persist: case finish, keycap set and the custom build name. It owns
 * localStorage persistence and notifies subscribers on every change.
 *
 * The 3D scene imports the colour data from here so that the rendered product
 * and the DOM configuration panel can never drift apart.
 */

export const STORAGE_KEY = 'lumen68.config.v1';
export const PROFILE_NAME_MAX = 24;

/** @typedef {'lunar' | 'obsidian' | 'copper'} CaseId */
/** @typedef {'alabaster' | 'graphite' | 'harvest'} KeycapId */

export const CASES = [
  {
    id: 'lunar',
    name: '月银',
    en: 'Lunar Silver',
    finish: '喷砂阳极氧化',
    blurb: '冷冽细砂银，像落了一层月光',
    swatch: '#c9cdd2',
    caseColor: '#b3b8be',
    caseMetalness: 1.0,
    caseRoughness: 0.34,
    plateColor: '#6d737a',
    plateRoughness: 0.44,
    trimColor: '#dfe2e5',
    badgeLegend: '#40444a',
    glowColor: '#ffd9a8',
  },
  {
    id: 'obsidian',
    name: '曜石黑',
    en: 'Obsidian',
    finish: '细砂阳极氧化',
    blurb: '近乎无光的黑，安静而锋利',
    swatch: '#2a2c30',
    caseColor: '#1e2024',
    caseMetalness: 0.94,
    caseRoughness: 0.44,
    plateColor: '#0f1012',
    plateRoughness: 0.5,
    trimColor: '#c9a86d',
    badgeLegend: '#241c0e',
    glowColor: '#ffc98a',
  },
  {
    id: 'copper',
    name: '暮铜',
    en: 'Sienna Copper',
    finish: 'PVD 拉丝镀铜',
    blurb: '拉丝铜色，留住一束夕阳',
    swatch: '#b27a5a',
    caseColor: '#a26a49',
    caseMetalness: 0.96,
    caseRoughness: 0.3,
    plateColor: '#4e3527',
    plateRoughness: 0.46,
    trimColor: '#e9c9a1',
    badgeLegend: '#3a2214',
    glowColor: '#ffd7a6',
  },
];

export const KEYCAPS = [
  {
    id: 'alabaster',
    name: '雾白',
    en: 'Alabaster',
    material: 'PBT · 热升华',
    mood: '暖白与陶土橙',
    swatches: ['#ece7dd', '#cec6b7', '#b96a41'],
    colors: {
      alpha: '#ece7dd',
      mod: '#cec6b7',
      accent: '#b96a41',
      legend: '#423d35',
      accentLegend: '#fff4e8',
    },
  },
  {
    id: 'graphite',
    name: '石墨',
    en: 'Graphite',
    material: 'PBT · 双色成型',
    mood: '炭灰与黄铜',
    swatches: ['#3a3c41', '#2b2d31', '#c9a35f'],
    colors: {
      alpha: '#3a3c41',
      mod: '#2b2d31',
      accent: '#c9a35f',
      legend: '#e7e2d8',
      accentLegend: '#2a2213',
    },
  },
  {
    id: 'harvest',
    name: '麦田',
    en: 'Harvest',
    material: 'PBT · 热升华',
    mood: '麦穗米与橄榄绿',
    swatches: ['#d9ceb4', '#ab9d80', '#6f7d58'],
    colors: {
      alpha: '#d9ceb4',
      mod: '#ab9d80',
      accent: '#6f7d58',
      legend: '#3e372b',
      accentLegend: '#f4efe2',
    },
  },
];

export const DEFAULT_CONFIG = Object.freeze({
  caseId: /** @type {CaseId} */ ('lunar'),
  keycapId: /** @type {KeycapId} */ ('alabaster'),
  profileName: '我的 LUMEN 68',
});

export const DEFAULT_DISPLAY_NAME = '未命名配置';

const listeners = new Set();

/** @returns {{caseId: CaseId, keycapId: KeycapId, profileName: string}} */
function defaults() {
  return { ...DEFAULT_CONFIG };
}

/**
 * @param {unknown} raw
 * @returns {{caseId: CaseId, keycapId: KeycapId, profileName: string} | null}
 */
function sanitise(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = /** @type {Record<string, unknown>} */ (raw);
  const caseId = CASES.some((item) => item.id === candidate.caseId)
    ? /** @type {CaseId} */ (candidate.caseId)
    : DEFAULT_CONFIG.caseId;
  const keycapId = KEYCAPS.some((item) => item.id === candidate.keycapId)
    ? /** @type {KeycapId} */ (candidate.keycapId)
    : DEFAULT_CONFIG.keycapId;
  const profileName =
    typeof candidate.profileName === 'string'
      ? candidate.profileName.replace(/[\u0000-\u001f]/g, '').slice(0, PROFILE_NAME_MAX)
      : DEFAULT_CONFIG.profileName;
  return { caseId, keycapId, profileName };
}

/** @returns {boolean} Whether localStorage is usable in this browsing context. */
export function isStorageAvailable() {
  try {
    const probe = `${STORAGE_KEY}.probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** @returns {{caseId: CaseId, keycapId: KeycapId, profileName: string} | null} */
function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitise(JSON.parse(raw));
  } catch {
    return null;
  }
}

const hasStoredConfig =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
    ? window.localStorage.getItem(STORAGE_KEY) !== null
    : false;

/** @type {{caseId: CaseId, keycapId: KeycapId, profileName: string}} */
let config = readStored() ?? defaults();

/** @returns {{caseId: CaseId, keycapId: KeycapId, profileName: string}} */
export function getConfig() {
  return { ...config };
}

export function getCase() {
  return CASES.find((item) => item.id === config.caseId) ?? CASES[0];
}

export function getKeycap() {
  return KEYCAPS.find((item) => item.id === config.keycapId) ?? KEYCAPS[0];
}

/** @param {string} id */
export function caseById(id) {
  return CASES.find((item) => item.id === id) ?? null;
}

/** @param {string} id */
export function keycapById(id) {
  return KEYCAPS.find((item) => item.id === id) ?? null;
}

/** @returns {string} A non-empty label for the current build. */
export function getDisplayName() {
  const trimmed = config.profileName.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_DISPLAY_NAME;
}

/** @returns {boolean} True when the current configuration equals the factory setup. */
export function isDefaultConfig() {
  return (
    config.caseId === DEFAULT_CONFIG.caseId &&
    config.keycapId === DEFAULT_CONFIG.keycapId &&
    config.profileName === DEFAULT_CONFIG.profileName
  );
}

/** @returns {boolean} True when this page has a stored configuration. */
export function hasSavedConfig() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** @returns {boolean} */
function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {'case' | 'keycap' | 'name' | 'restore' | 'init'} reason
 * @param {boolean} saved
 */
function notify(reason, saved) {
  const snapshot = getConfig();
  const detail = {
    reason,
    saved,
    config: snapshot,
    displayName: getDisplayName(),
    isDefault: isDefaultConfig(),
  };
  for (const listener of listeners) {
    try {
      listener(snapshot, detail);
    } catch (error) {
      console.error('[LUMEN] state listener failed', error);
    }
  }
}

/**
 * Subscribe to configuration changes. The listener is called with the new
 * configuration snapshot and a detail object describing the change.
 * @param {(config: ReturnType<typeof getConfig>, detail: {reason: string, saved: boolean, config: ReturnType<typeof getConfig>, displayName: string, isDefault: boolean}) => void} listener
 * @returns {() => void}
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {CaseId | string} id */
export function setCase(id) {
  if (!caseById(id)) return;
  if (config.caseId === id) {
    // Keep the page's own config persisted even when the user re-selects the
    // default finish (no visible state change, but the auto-save stays honest).
    persist();
    return;
  }
  config = { ...config, caseId: /** @type {CaseId} */ (id) };
  notify('case', persist());
}

/** @param {KeycapId | string} id */
export function setKeycap(id) {
  if (!keycapById(id)) return;
  if (config.keycapId === id) {
    persist();
    return;
  }
  config = { ...config, keycapId: /** @type {KeycapId} */ (id) };
  notify('keycap', persist());
}

/** @param {string} name */
export function setProfileName(name) {
  const clean = String(name)
    .replace(/[\u0000-\u001f]/g, '')
    .slice(0, PROFILE_NAME_MAX);
  if (clean === config.profileName) return;
  config = { ...config, profileName: clean };
  notify('name', persist());
}

/**
 * Remove only this page's own localStorage entry and return to factory setup.
 * Other localStorage keys are never touched.
 */
export function restoreDefaults() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — in-memory reset still applies */
  }
  config = defaults();
  notify('restore', true);
}

/**
 * Announce the initial state once the UI has bound its listeners.
 */
export function announceInitial() {
  notify('init', hasStoredConfig);
}

export { hasStoredConfig };
