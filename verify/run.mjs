#!/usr/bin/env node
/**
 * LUMEN 68 — end-to-end verification harness (QA owned).
 *
 * Runs the real page in the locally installed Microsoft Edge (headless) through
 * playwright-core and verifies every acceptance item from docs/CONTRACT.md and
 * docs/TEST-API.md. It never starts a server and never touches app sources.
 *
 * Usage:
 *   node verify/run.mjs                              # dev server at 127.0.0.1:5173
 *   $env:LUMEN_URL='file:///D:/.../LUMEN-68.html'; node verify/run.mjs   # single file
 *
 * Outputs:
 *   verify/shots/*.png     screenshots
 *   verify/last-run.json   machine readable report
 *   exit code 0 = all PASS, 1 = at least one FAIL
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS_DIR = path.join(HERE, 'shots');
const REPORT_JSON = path.join(HERE, 'last-run.json');

const EDGE =
  process.env.LUMEN_EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = process.env.LUMEN_URL ?? 'http://127.0.0.1:5173/';
const MODE = TARGET_URL.startsWith('file:') ? 'file' : 'dev';

const DESKTOP = { width: 1440, height: 900 };
const DESKTOP_SMALL = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

// GL backend: "auto" (default) lets headless Edge use the real hardware GPU
// through ANGLE/D3D11 (≈60 FPS on this machine, representative of the product
// page). LUMEN_GL=swiftshader forces software WebGL (≈1 FPS) as a fallback for
// machines without a usable GPU.
const GL_MODE = process.env.LUMEN_GL ?? 'auto';
const GL_ARGS = {
  auto: [],
  d3d11: ['--use-angle=d3d11'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
}[GL_MODE] ?? [];
const LAUNCH_ARGS = [
  ...GL_ARGS,
  '--hide-scrollbars',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--mute-audio',
];

const WATCHDOG_MS = Number(process.env.LUMEN_WATCHDOG_MS ?? 15 * 60 * 1000);
// Prefix lets the standalone (file://) run write 08-standalone-*.png without
// overwriting the dev screenshots 01-07.
const SHOT_PREFIX = process.env.LUMEN_SHOT_PREFIX ?? '';

// Camera reset tolerance used by the view tests: absolute 0.02 world units or
// 1% of the initial camera distance, whichever is larger. Documented in report.
const CAMERA_TOL_FRACTION = 0.01;
const CAMERA_TOL_ABS = 0.02;
// whenSettled() only guarantees |progress - target| < 0.001, therefore layer
// offsets derived from progress can legitimately keep a small residue after
// settling; exact-0 assertions allow this documented slack.
const EXPLODE_TOL = 0.001 + 1e-9;
const LAYER_ZERO_TOL = 0.005;

const COLLECT_KEYS = [
  'KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyI', 'KeyJ',
  'KeyK', 'KeyL', 'KeyM', 'KeyN', 'KeyO', 'KeyP', 'KeyQ', 'KeyR', 'KeyS', 'KeyT',
  'KeyU', 'KeyV', 'KeyW', 'KeyX', 'KeyY', 'KeyZ', 'Space',
];
const TYPED_CODES = ['KeyH', 'KeyE', 'KeyL', 'KeyO', 'KeyK', 'KeyB', 'KeyA', 'KeyR', 'KeyD', 'Space'];

// Expected copy/colours, used when importing src/state.js in Node is not possible.
let CASES = [
  { id: 'lunar', name: '月银', en: 'Lunar Silver', finish: '喷砂阳极氧化', caseColor: '#c4c8cd', plateColor: '#8d939a' },
  { id: 'obsidian', name: '曜石黑', en: 'Obsidian', finish: '细砂阳极氧化', caseColor: '#212327', plateColor: '#141519' },
  { id: 'copper', name: '暮铜', en: 'Sienna Copper', finish: 'PVD 拉丝镀铜', caseColor: '#a9704f', plateColor: '#5c3f31' },
];
let KEYCAPS = [
  {
    id: 'alabaster', name: '雾白', en: 'Alabaster', material: 'PBT · 热升华', mood: '暖白与陶土橙',
    colors: { alpha: '#eae5da', mod: '#d5cec1', accent: '#c8784c', legend: '#5b544a', accentLegend: '#fff3e6' },
  },
  {
    id: 'graphite', name: '石墨', en: 'Graphite', material: 'PBT · 双色成型', mood: '炭灰与黄铜',
    colors: { alpha: '#3a3c41', mod: '#2b2d31', accent: '#c9a35f', legend: '#e7e2d8', accentLegend: '#2a2213' },
  },
  {
    id: 'harvest', name: '麦田', en: 'Harvest', material: 'PBT · 热升华', mood: '麦穗米与橄榄绿',
    colors: { alpha: '#d8cdb4', mod: '#b9ac90', accent: '#7d8b64', legend: '#4a4235', accentLegend: '#f4efe2' },
  },
];
let STORAGE_KEY = 'lumen68.config.v1';
let DEFAULT_NAME = '我的 LUMEN 68';
let UNSAVED_NAME = '未命名配置';
let DATA_SOURCE = 'fallback';

try {
  const state = await import(new URL('../src/state.js', import.meta.url).href);
  if (Array.isArray(state.CASES) && state.CASES.length === 3) CASES = state.CASES;
  if (Array.isArray(state.KEYCAPS) && state.KEYCAPS.length === 3) KEYCAPS = state.KEYCAPS;
  if (typeof state.STORAGE_KEY === 'string') STORAGE_KEY = state.STORAGE_KEY;
  if (state.DEFAULT_CONFIG && typeof state.DEFAULT_CONFIG.profileName === 'string') {
    DEFAULT_NAME = state.DEFAULT_CONFIG.profileName;
  }
  if (typeof state.DEFAULT_DISPLAY_NAME === 'string') UNSAVED_NAME = state.DEFAULT_DISPLAY_NAME;
  DATA_SOURCE = 'src/state.js';
} catch (error) {
  console.warn(`[warn] could not import src/state.js in Node (${error.message}); using fallback copy`);
}

const CASE_BY_ID = Object.fromEntries(CASES.map((item) => [item.id, item]));
const KEYCAP_BY_ID = Object.fromEntries(KEYCAPS.map((item) => [item.id, item]));

const results = [];
let preTestHook = null;
const consoleErrors = [];
const consoleWarnings = [];
const pageErrors = [];
const failedRequests = [];
const allRequests = [];
const mainFrameNavigations = [];
const screenshots = [];
const runStartedAt = new Date().toISOString();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertClose = (actual, expected, tolerance, message) => {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`${message} (actual=${actual}, expected=${expected}, tolerance=${tolerance})`);
  }
};

async function test(name, fn) {
  const started = Date.now();
  try {
    if (preTestHook) await preTestHook();
    const detail = await fn();
    const ms = Date.now() - started;
    results.push({ name, status: 'PASS', detail: detail ?? '', ms });
    console.log(`[PASS] ${name} (${(ms / 1000).toFixed(1)}s)`);
    return true;
  } catch (error) {
    const ms = Date.now() - started;
    const message = error && error.message ? error.message : String(error);
    results.push({ name, status: 'FAIL', detail: message, ms });
    console.log(`[FAIL] ${name} (${(ms / 1000).toFixed(1)}s)\n       ${message.split('\n')[0]}`);
    return false;
  }
}

function info(name, detail) {
  results.push({ name, status: 'INFO', detail, ms: 0 });
  console.log(`[INFO] ${name}: ${detail}`);
}
function skip(name, reason) {
  results.push({ name, status: 'SKIP', detail: reason, ms: 0 });
  console.log(`[SKIP] ${name}: ${reason}`);
}

const arr = (value) => (Array.isArray(value) ? value : []);
const round = (value) => (typeof value === 'number' ? Math.round(value * 1000) / 1000 : value);

async function pngInfo(filePath) {
  const buffer = await readFile(filePath);
  assert(
    buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47,
    '不是有效 PNG'
  );
  return {
    bytes: buffer.length,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function main() {
  await mkdir(SHOTS_DIR, { recursive: true });

  const report = {
    app: 'LUMEN 68',
    mode: MODE,
    url: TARGET_URL,
    startedAt: runStartedAt,
    node: process.version,
    edgePath: EDGE,
    edgeExists: existsSync(EDGE),
    dataSource: DATA_SOURCE,
    results: [],
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    externalRequests: [],
    requestCount: 0,
    screenshots: [],
    notes: [
      `GL backend: ${GL_MODE} (auto = headless Edge hardware GPU through ANGLE/D3D11; LUMEN_GL=swiftshader forces software WebGL).`,
      'Renderer/backend info is captured from the page and stored in report.rendererInfo.',
      `Camera reset tolerance: max(${CAMERA_TOL_ABS}, ${CAMERA_TOL_FRACTION * 100}% of initial camera distance).`,
      'whenSettled() guarantees |progress-target| < 0.001, so layer-offset zero checks allow 0.005 slack.',
    ],
  };

  if (!existsSync(EDGE)) {
    report.verdict = 'FAIL';
    report.results = [
      {
        name: '浏览器可用',
        status: 'FAIL',
        detail: `找不到 Edge: ${EDGE}（可用 LUMEN_EDGE 环境变量覆盖）`,
        ms: 0,
      },
    ];
    await writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
    printReport(report);
    process.exitCode = 1;
    return;
  }

  let browser = null;
  let context = null;
  let page = null;
  let loadError = null;

  console.log(`\nLUMEN 68 QA — ${MODE} — ${TARGET_URL} (GL=${GL_MODE}, Edge=${EDGE})`);

  const watchdog = setTimeout(async () => {
    console.error(`[WATCHDOG] 套件运行超过 ${WATCHDOG_MS}ms，输出部分结果并终止`);
    const partial = {
      ...report,
      verdict: 'FAIL',
      watchdog: true,
      results,
      consoleErrors,
      pageErrors,
      summary: {
        pass: results.filter((item) => item.status === 'PASS').length,
        fail: results.filter((item) => item.status === 'FAIL').length,
        skip: results.filter((item) => item.status === 'SKIP').length,
      },
    };
    try {
      await writeFile(REPORT_JSON, JSON.stringify(partial, null, 2), 'utf8');
    } catch {
      /* ignore */
    }
    console.log(`WATCHDOG: 已运行 ${results.length} 项，详见 ${REPORT_JSON}`);
    process.exit(2);
  }, WATCHDOG_MS);
  watchdog.unref();

  try {
    browser = await chromium.launch({
      executablePath: EDGE,
      headless: true,
      args: LAUNCH_ARGS,
      timeout: 60000,
    });
    report.browserVersion = browser.version();

    context = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: 1,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    page = await context.newPage();

    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error') consoleErrors.push(text);
      else if (message.type() === 'warning') consoleWarnings.push(text);
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: request.url(),
        error: request.failure() ? request.failure().errorText : 'unknown',
      });
    });
    page.on('request', (request) => allRequests.push(request.url()));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) mainFrameNavigations.push(frame.url());
    });

    try {
      await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => window.__LUMEN_READY__ === true, null, { timeout: 90000 });
    } catch (error) {
      loadError = error;
    }

    const loadOk = await test('初始加载：页面可访问，window.__LUMEN_READY__ === true', async () => {
      if (loadError) throw new Error(`加载失败：${loadError.message}`);
      const probe = await page.evaluate(() => ({
        ready: window.__LUMEN_READY__ === true,
        hasApi: typeof window.__LUMEN__ === 'object' && window.__LUMEN__ !== null,
        appError: document.body.dataset.appError === 'true',
        fallbackText: document.querySelector('.scene-fallback')?.textContent ?? null,
      }));
      assert(probe.ready, '__LUMEN_READY__ 不为 true');
      assert(probe.hasApi, 'window.__LUMEN__ 未暴露');
      assert(!probe.appError, `场景启动失败（body[data-app-error]）：${probe.fallbackText ?? ''}`);
      const info = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return { renderer: 'none', vendor: 'none' };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        };
      });
      report.rendererInfo = info;
      console.log(`       renderer: ${info.renderer}`);
      return `ready=true，测试 API 已暴露（renderer: ${info.renderer}）`;
    });

    if (!loadOk) {
      skip('其余测试', '页面未能加载或 ready，跳过全部后续用例');
    } else {
      await runAllChecks(page, report);
    }
  } catch (error) {
    results.push({ name: 'harness', status: 'FAIL', detail: error.message, ms: 0 });
  } finally {
    if (page) {
      try {
        report.localStorageDump = await page.evaluate(() => {
          try {
            return Object.keys(localStorage).map((key) => ({
              key,
              value: `${localStorage.getItem(key)}`.slice(0, 300),
            }));
          } catch (error) {
            return `unavailable: ${error.message}`;
          }
        });
      } catch {
        /* page may be closed */
      }
    }
    if (browser) await browser.close();
  }

  clearTimeout(watchdog);

  // ---- assemble report -------------------------------------------------
  report.glMode = GL_MODE;
  report.results = results;
  report.consoleErrors = consoleErrors;
  report.consoleWarnings = consoleWarnings;
  report.pageErrors = pageErrors;
  report.failedRequests = failedRequests;
  report.requestCount = allRequests.length;
  report.externalRequests = allRequests.filter((url) => !isAllowedUrl(url));
  report.mainFrameNavigations = mainFrameNavigations;
  report.metaNavigations = mainFrameNavigations.length;
  report.screenshots = screenshots;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.parse(report.finishedAt) - Date.parse(runStartedAt);

  const failures = results.filter((item) => item.status === 'FAIL');
  const passes = results.filter((item) => item.status === 'PASS');
  const skips = results.filter((item) => item.status === 'SKIP');
  report.summary = { pass: passes.length, fail: failures.length, skip: skips.length };
  report.verdict = failures.length === 0 && skips.length === 0 ? 'PASS' : failures.length > 0 ? 'FAIL' : 'PASS_WITH_SKIPS';

  await writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  printReport(report);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

function isAllowedUrl(url) {
  if (MODE === 'file') {
    return /^(file:|data:|blob:|about:)/i.test(url) || /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(url);
  }
  return (
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url) ||
    /^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url) ||
    /^(data:|blob:|about:)/i.test(url)
  );
}

// ---------------------------------------------------------------------------
// All page checks. `page` is already loaded and __LUMEN_READY__ is true.
// ---------------------------------------------------------------------------
async function runAllChecks(page, report) {
  const api = {
    state: () => page.evaluate(() => window.__LUMEN__.getState()),
    scene: () => page.evaluate(() => window.__LUMEN__.getSceneInfo()),
    camera: () => page.evaluate(() => window.__LUMEN__.getCamera()),
    settled: (timeout = 8000) => page.evaluate((ms) => window.__LUMEN__.whenSettled(ms), timeout),
    key: (code) => page.evaluate((c) => window.__LUMEN__.getKey(c), code),
    keys: (codes) =>
      page.evaluate((list) => Object.fromEntries(list.map((c) => [c, window.__LUMEN__.getKey(c)])), codes),
    resetCamera: () => page.evaluate(() => window.__LUMEN__.resetCamera()),
    setExploded: (on) => page.evaluate((value) => window.__LUMEN__.setExploded(value), on),
    setExperience: (on) => page.evaluate((value) => window.__LUMEN__.setExperience(value), on),
  };

  // Before every test, make sure the page is (still) ready. If a Vite HMR
  // full-reload happens while the suite is running, this waits for the new
  // document instead of failing with "execution context destroyed".
  preTestHook = async () => {
    await page.waitForFunction(
      () => window.__LUMEN_READY__ === true && typeof window.__LUMEN__?.getState === 'function',
      null,
      { timeout: 45000 }
    );
  };

  async function waitAfterSettle(label, timeout = 8000) {
    const ok = await api.settled(timeout);
    assert(ok === true, `${label}：whenSettled() 在 ${timeout}ms 内未返回 true`);
  }

  async function waitUntil(fn, timeout = 3000, interval = 40) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      last = await fn();
      if (last) return last;
      await sleep(interval);
    }
    return last;
  }

  async function waitPress(code, predicate, timeout = 2500) {
    return waitUntil(async () => {
      const key = await api.key(code);
      return key && predicate(key.press) ? key : null;
    }, timeout, 25);
  }

  async function waitSettledKeys() {
    return waitUntil(async () => {
      const keys = await api.keys(COLLECT_KEYS);
      return Object.values(keys).every((key) => !key || Math.abs(key.press) < 0.002);
    }, 4000, 50);
  }

  // Enabling experience mode also plays the short "LUMEN␣" demo wave
  // (interaction.js playDemoWave). Wait for it to finish so subsequent tests
  // measure only the interaction they intend to test.
  async function waitDemoWaveSettled(timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const keys = await api.keys(['KeyL', 'KeyU', 'KeyM', 'KeyE', 'KeyN', 'Space']);
      if (Object.values(keys).every((key) => !key || Math.abs(key.press) < 0.002)) {
        return true;
      }
      await sleep(100);
    }
    return false;
  }

  async function capture(fileName) {
    const shotName = `${SHOT_PREFIX}${fileName}`;
    const filePath = path.join(SHOTS_DIR, shotName);
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.screenshot({ path: filePath, timeout: 30000 });
        const meta = await pngInfo(filePath);
        const shot = { name: shotName, path: `verify/shots/${shotName}`, ...meta };
        screenshots.push(shot);
        return shot;
      } catch (error) {
        lastError = error;
        console.log(`       [warn] screenshot ${shotName} attempt ${attempt} failed: ${error.message.split('\n')[0]}`);
        await sleep(1000);
      }
    }
    throw new Error(`截图失败 ${shotName}：${lastError && lastError.message}`);
  }

  async function captureClip(fileName, clip) {
    const shotName = `${SHOT_PREFIX}${fileName}`;
    const filePath = path.join(SHOTS_DIR, shotName);
    await page.screenshot({ path: filePath, clip, timeout: 30000 });
    const meta = await pngInfo(filePath);
    const shot = { name: shotName, path: `verify/shots/${shotName}`, ...meta };
    screenshots.push(shot);
    return shot;
  }

  // Expected real material colours (from src/state.js data) for the 3D model.
  function expectedRenderTheme(caseItem, keycapItem) {
    return {
      case: caseItem.caseColor,
      plate: caseItem.plateColor,
      capAlpha: keycapItem.colors.alpha,
      capMod: keycapItem.colors.mod,
      capAccent: keycapItem.colors.accent,
      legend: keycapItem.colors.legend,
    };
  }

  // The 3D colours are lerped over a short transition, so poll until they match
  // the state data (this also proves the model really received the new theme).
  async function waitRenderTheme(caseItem, keycapItem, timeout = 5000) {
    const expected = expectedRenderTheme(caseItem, keycapItem);
    const deadline = Date.now() + timeout;
    let actual = null;
    while (Date.now() < deadline) {
      actual = await page.evaluate(() =>
        typeof window.__LUMEN__.getRenderTheme === 'function' ? window.__LUMEN__.getRenderTheme() : null
      );
      if (actual) {
        const mismatched = Object.entries(expected).filter(
          ([key, value]) => !actual[key] || actual[key].toLowerCase() !== value.toLowerCase()
        );
        if (mismatched.length === 0) return { matched: true, actual, expected };
      }
      await sleep(60);
    }
    return { matched: false, actual, expected };
  }

  async function readOptions(groupSelector, attr, ids) {
    return page.$$eval(
      `${groupSelector} button`,
      (buttons, dataAttr) =>
        buttons.map((button) => ({
          id: button.getAttribute(dataAttr),
          tag: button.tagName,
          pressed: button.getAttribute('aria-pressed'),
          selected: button.classList.contains('is-selected'),
          disabled: button.disabled === true,
        })),
      attr
    );
  }

  async function readSummary() {
    return page.evaluate(() => {
      const text = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.textContent.trim() : null;
      };
      const input = document.querySelector('#profile-name');
      return {
        name: text('#summary-name'),
        caseText: text('#summary-case'),
        caseMeta: text('#summary-case-meta'),
        keycapText: text('#summary-keycap'),
        keycapMeta: text('#summary-keycap-meta'),
        saveStatus: text('#save-status'),
        profileValue: input ? input.value : null,
        storeConfig: JSON.parse(localStorage.getItem('lumen68.config.v1') || 'null'),
      };
    });
  }

  async function selectCombo(caseId, keycapId) {
    await page.click(`#case-options [data-case="${caseId}"]`);
    await page.click(`#keycap-options [data-keycap="${keycapId}"]`);
  }

  async function readStorage() {
    return page.evaluate((key) => {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        return `ERROR:${error.message}`;
      }
    }, STORAGE_KEY);
  }

  const overlapArea = (a, b) => {
    if (!a || !b) return 0;
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return w * h;
  };

  // =======================================================================
  // 1. Initial load
  // =======================================================================
  await test('初始加载：无 console error / pageerror', async () => {
    // Give the first frames a moment to flush any deferred errors.
    await sleep(300);
    assert(consoleErrors.length === 0, `console.error: ${consoleErrors.join(' | ')}`);
    assert(pageErrors.length === 0, `pageerror: ${pageErrors.join(' | ')}`);
    return `consoleErrors=0, pageErrors=0（console warning ${consoleWarnings.length} 条）`;
  });

  await test('测试 API 契约：方法齐全 / storageKey / version', async () => {
    const probe = await page.evaluate(() => {
      const api = window.__LUMEN__ || {};
      const methods = [
        'getState', 'setCase', 'setKeycap', 'setExperience', 'toggleExplode', 'setExploded',
        'resetCamera', 'getCamera', 'getKey', 'pressVirtual', 'releaseVirtual', 'whenSettled',
        'getSceneInfo', 'getRenderTheme',
      ];
      return {
        version: api.version,
        storageKey: api.storageKey,
        missing: methods.filter((name) => typeof api[name] !== 'function'),
        sceneTheme: typeof api.getSceneInfo === 'function' ? api.getSceneInfo().theme : null,
      };
    });
    assert(probe.missing.length === 0, `缺少方法：${probe.missing.join(', ')}`);
    assert(
      typeof probe.sceneTheme === 'object' &&
        typeof probe.sceneTheme.case === 'string' &&
        typeof probe.sceneTheme.keycap === 'string',
      `getSceneInfo().theme 形状不符合 TEST-API 契约（要求 { case, keycap }），实际：${JSON.stringify(probe.sceneTheme)}`
    );
    assert(typeof probe.version === 'string' && probe.version.length > 0, 'version 非字符串');
    assert(probe.storageKey === STORAGE_KEY, `storageKey=${probe.storageKey}，期望 ${STORAGE_KEY}`);
    return `version=${probe.version}, storageKey=${probe.storageKey}`;
  });

  await test('场景信息：66 键 / WebGL / canvas 尺寸 / 层标签', async () => {
    const scene = await api.scene();
    const state = await api.state();
    assert(scene.keyCount === 66, `getSceneInfo().keyCount=${scene.keyCount}，期望 66`);
    assert(state.keys === 66, `getState().keys=${state.keys}，期望 66`);
    assert(scene.renderer === 'webgl2' || scene.renderer === 'webgl1', `renderer=${scene.renderer}`);
    assert(arr(scene.rows).reduce((sum, n) => sum + n, 0) === 66, `rows=${JSON.stringify(scene.rows)} 之和不等于 66`);
    assert(scene.canvas.clientWidth > 100 && scene.canvas.clientHeight > 100,
      `canvas client=${scene.canvas.clientWidth}x${scene.canvas.clientHeight} 过小`);
    assert(
      scene.canvas.width >= scene.canvas.clientWidth && scene.canvas.height >= scene.canvas.clientHeight,
      `canvas 缓冲区 ${scene.canvas.width}x${scene.canvas.height} 小于 CSS 尺寸`
    );
    const dom = await page.evaluate(() => ({
      canvas: !!document.querySelector('#viewport canvas.scene-canvas'),
      layerLabels: document.querySelectorAll('#layer-labels .layer-label').length,
      layers: [...document.querySelectorAll('#layer-labels .layer-label')].map((el) => el.dataset.layer),
      viewportRect: (() => {
        const r = document.querySelector('#viewport').getBoundingClientRect();
        return { width: r.width, height: r.height };
      })(),
      canvasRect: (() => {
        const c = document.querySelector('#viewport canvas.scene-canvas');
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return { width: r.width, height: r.height };
      })(),
    }));
    assert(dom.canvas, '缺少 #viewport canvas.scene-canvas');
    assert(dom.viewportRect.height > 150, `#viewport 高度 ${dom.viewportRect.height}px 过小`);
    assert(
      dom.canvasRect && dom.canvasRect.width >= dom.viewportRect.width - 4,
      `canvas 宽度 ${dom.canvasRect && dom.canvasRect.width} 未铺满 #viewport ${dom.viewportRect.width}`
    );
    assert(dom.layerLabels === 3, `#layer-labels 内 .layer-label 数量=${dom.layerLabels}，期望 3`);
    assert(
      JSON.stringify([...dom.layers].sort()) === JSON.stringify(['caps', 'case', 'plate']),
      `layer-label data-layer=${JSON.stringify(dom.layers)}`
    );
    return `renderer=${scene.renderer}, pixelRatio=${scene.pixelRatio}, canvas=${
      scene.canvas.clientWidth
    }x${scene.canvas.clientHeight}, rows=${JSON.stringify(scene.rows)}`;
  });

  await test('初始状态为默认配置（lunar/alabaster）', async () => {
    const state = await api.state();
    const scene = await api.scene();
    const summary = await readSummary();
    const themeCase = scene.theme.case ?? scene.theme.caseId;
    const themeKeycap = scene.theme.keycap ?? scene.theme.keycapId;
    assert(state.caseId === 'lunar', `caseId=${state.caseId}`);
    assert(state.keycapId === 'alabaster', `keycapId=${state.keycapId}`);
    assert(state.profileName === DEFAULT_NAME, `profileName=${state.profileName}，期望 ${DEFAULT_NAME}`);
    assert(state.experience === false, 'experience 默认应为 false');
    assert(state.exploded === false, 'exploded 默认应为 false');
    assert(state.explodeTarget === 0, `explodeTarget=${state.explodeTarget}`);
    assert(themeCase === 'lunar' && themeKeycap === 'alabaster', `theme=${JSON.stringify(scene.theme)}`);
    const initialTheme = await waitRenderTheme(CASE_BY_ID.lunar, KEYCAP_BY_ID.alabaster, 5000);
    assert(
      initialTheme.matched,
      `初始 getRenderTheme 与 state 数据不一致：actual=${JSON.stringify(initialTheme.actual)} expected=${JSON.stringify(initialTheme.expected)}`
    );
    assert(summary.name === DEFAULT_NAME, `#summary-name=${summary.name}`);
    assert((summary.caseText || '').includes(CASE_BY_ID.lunar.name), `#summary-case=${summary.caseText}`);
    assert((summary.keycapText || '').includes(KEYCAP_BY_ID.alabaster.name), `#summary-keycap=${summary.keycapText}`);
    assert(summary.profileValue === DEFAULT_NAME, `#profile-name.value=${summary.profileValue}`);
    assert((summary.saveStatus || '').length > 0, '#save-status 为空');
    const body = await page.evaluate(() => ({
      appReady: document.body.dataset.appReady,
      experience: document.body.dataset.experience,
      exploded: document.body.dataset.exploded,
      experienceChecked: document.querySelector('#toggle-experience').checked,
      explodeLabel: document.querySelector('#btn-explode-label').textContent.trim(),
      explodePressed: document.querySelector('#btn-explode').getAttribute('aria-pressed'),
      hintHidden: document.querySelector('#experience-hint').hasAttribute('hidden'),
    }));
    assert(body.appReady === 'true', `body[data-app-ready]=${body.appReady}`);
    assert(body.experience === 'off', `body[data-experience]=${body.experience}`);
    assert(body.exploded === 'closed', `body[data-exploded]=${body.exploded}`);
    assert(body.experienceChecked === false, '#toggle-experience 默认应未勾选');
    assert(body.explodeLabel === '拆解视图', `#btn-explode-label="${body.explodeLabel}"`);
    assert(body.explodePressed === 'false', `#btn-explode aria-pressed=${body.explodePressed}`);
    assert(body.hintHidden === true, '#experience-hint 默认应 hidden');
    return `默认 case/keycap/name/experience/exploded/摘要/DOM 状态均一致；初始 renderTheme 与 state 配色数据一致`;
  });

  await test('DOM 契约：必需节点、属性、内联 favicon', async () => {
    const dom = await page.evaluate(() => {
      const ids = [
        'viewport', 'layer-labels', 'btn-explode', 'btn-explode-label', 'btn-reset-view',
        'toggle-autorotate', 'toggle-experience', 'experience-status', 'experience-hint',
        'key-echo', 'case-options', 'keycap-options', 'profile-name', 'summary-name',
        'summary-case', 'summary-keycap', 'summary-case-meta', 'summary-keycap-meta',
        'save-status', 'btn-restore', 'toast',
      ];
      const missing = ids.filter((id) => !document.getElementById(id));
      const cases = [...document.querySelectorAll('#case-options button')].map((b) => b.dataset.case);
      const keycaps = [...document.querySelectorAll('#keycap-options button')].map((b) => b.dataset.keycap);
      const toggle = document.querySelector('#toggle-experience');
      const toast = document.querySelector('#toast');
      const nameInput = document.querySelector('#profile-name');
      const explode = document.querySelector('#btn-explode');
      const favicon = document.querySelector('link[rel~="icon"]');
      const labelled =
        !!document.querySelector('label[for="toggle-experience"]') ||
        !!(toggle && toggle.closest('label')) ||
        !!(toggle && (toggle.getAttribute('aria-label') || toggle.getAttribute('aria-labelledby')));
      return {
        title: document.title,
        lang: document.documentElement.lang,
        missing,
        cases,
        keycaps,
        casesTag: [...document.querySelectorAll('#case-options button')].every((b) => b.tagName === 'BUTTON'),
        keycapsTag: [...document.querySelectorAll('#keycap-options button')].every((b) => b.tagName === 'BUTTON'),
        nameMaxLength: nameInput ? nameInput.getAttribute('maxlength') : null,
        explodeType: explode ? explode.getAttribute('type') : null,
        explodePressed: explode ? explode.getAttribute('aria-pressed') : null,
        toastRole: toast ? toast.getAttribute('role') : null,
        toastLive: toast ? toast.getAttribute('aria-live') : null,
        toggleLabelled: labelled,
        favicon: favicon ? favicon.getAttribute('href') : null,
        hasHero: !!document.querySelector('.hero'),
        hasHeader: !!document.querySelector('.site-header'),
        hasPanel: !!document.querySelector('.panel'),
        hasFooter: !!document.querySelector('.site-footer'),
        pageText: document.body.innerText,
      };
    });
    assert(dom.missing.length === 0, `缺少节点：#${dom.missing.join(', #')}`);
    assert(dom.title === 'LUMEN 68 · 光屿 — 68 键机械键盘', `title="${dom.title}"`);
    assert(JSON.stringify([...dom.cases].sort()) === JSON.stringify(['copper', 'lunar', 'obsidian']),
      `#case-options data-case=${JSON.stringify(dom.cases)}`);
    assert(JSON.stringify([...dom.keycaps].sort()) === JSON.stringify(['alabaster', 'graphite', 'harvest']),
      `#keycap-options data-keycap=${JSON.stringify(dom.keycaps)}`);
    assert(dom.casesTag && dom.keycapsTag, '配色选项必须是 <button>');
    assert(dom.nameMaxLength === '24', `#profile-name maxlength=${dom.nameMaxLength}`);
    assert(dom.explodeType === 'button', `#btn-explode type=${dom.explodeType}`);
    assert(dom.explodePressed === 'false', `#btn-explode aria-pressed=${dom.explodePressed}`);
    assert(dom.toastRole === 'status', `#toast role=${dom.toastRole}`);
    assert(dom.toastLive === 'polite', `#toast aria-live=${dom.toastLive}`);
    assert(dom.toggleLabelled, '#toggle-experience 缺少关联 label');
    assert(dom.favicon && dom.favicon.startsWith('data:'), `favicon=${dom.favicon}`);
    assert(dom.hasHero && dom.hasHeader && dom.hasPanel && dom.hasFooter, '缺少 .hero/.site-header/.panel/.site-footer');
    for (const chip of ['68 KEYS', 'CNC ALUMINUM', 'GASKET', 'HOT-SWAP']) {
      assert(dom.pageText.includes(chip), `页面文本缺少参数标签 ${chip}`);
    }
    return `21 个契约节点齐全；title/lang=${dom.lang}；favicon 为 data URI；参数 chips 文案齐全`;
  });

  await test('初始桌面截图 1440×900', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(400);
    const shot = await capture('01-initial-desktop-1440x900.png');
    assert(shot.width === 1440 && shot.height === 900, `截图尺寸 ${shot.width}x${shot.height}`);
    assert(shot.bytes > 12000, `截图仅 ${shot.bytes} bytes，疑似空白`);
    return `${shot.path} (${shot.width}x${shot.height}, ${shot.bytes} bytes)`;
  });

  await test('布局 1440×900：无纵向滚动，标题/视口/主要控件在首屏', async () => {
    const metrics = await measureLayout(page);
    assert(metrics.innerWidth === 1440 && metrics.innerHeight === 900, '视口尺寸异常');
    assert(metrics.deScrollWidth <= 1441, `横向溢出 ${metrics.deScrollWidth - metrics.innerWidth}px`);
    assert(metrics.deScrollHeight <= 901, `纵向溢出 ${metrics.deScrollHeight - metrics.innerHeight}px`);
    assert(metrics.heroTitle && metrics.heroTitle.text.includes('LUMEN 68'), '首屏找不到 LUMEN 68 标题');
    assert(metrics.heroTitle.inView, `LUMEN 68 标题不在首屏（rect=${JSON.stringify(metrics.heroTitle.rect)}）`);
    assert(metrics.viewport && metrics.viewport.inView, '#viewport 不在首屏');
    assert(metrics.viewport.height >= 200, `#viewport 高度 ${metrics.viewport.height}px`);
    for (const [label, selector] of [
      ['#case-options', 'caseOptions'], ['#keycap-options', 'keycapOptions'],
      ['#btn-explode', 'explode'], ['#toggle-experience', 'experience'],
    ]) {
      assert(metrics[selector] && metrics[selector].inView, `${label} 不在首屏内`);
    }
    assert(metrics.canvas && metrics.canvas.clientWidth > 100 && metrics.canvas.clientHeight > 100,
      'canvas 尺寸异常');
    assert(
      metrics.panelScroll && metrics.panelScroll.overflow <= 1,
      `桌面 1440 面板内部滚动溢出 ${metrics.panelScroll && metrics.panelScroll.overflow}px（期望 0）`
    );
    assert(metrics.panelBottom && metrics.panelBottom.insidePanel, '1440 下 .panel-bottom 不在面板内');
    assert(
      metrics.panelBottom && metrics.panelBottom.gapToPanelBottom <= 24,
      `1440 下 .panel-bottom 距面板底部 ${metrics.panelBottom && metrics.panelBottom.gapToPanelBottom}px（应贴底）`
    );
    return `scroll=${metrics.deScrollWidth}x${metrics.deScrollHeight}（无滚动），viewport=${
      Math.round(metrics.viewport.width)}x${Math.round(metrics.viewport.height)}，panelOverflow=${
      metrics.panelScroll.overflow}，主要控件均在首屏`;
  });

  // =======================================================================
  // 2. 3 × 3 colour combinations
  // =======================================================================
  const themeShots = {
    'obsidian+graphite': '03-theme-obsidian-graphite.png',
    'lunar+harvest': '04-theme-lunar-harvest.png',
    'copper+alabaster': '05-theme-copper-alabaster.png',
  };

  for (const caseItem of CASES) {
    for (const keycapItem of KEYCAPS) {
      await test(`配色组合 ${caseItem.id} + ${keycapItem.id}：3D/选项/摘要/存储同步`, async () => {
        await page.click(`#case-options [data-case="${caseItem.id}"]`);
        await page.click(`#keycap-options [data-keycap="${keycapItem.id}"]`);
        // Allow the UI's own reactive update to flush.
        await waitUntil(async () => {
          const state = await api.state();
          return state.caseId === caseItem.id && state.keycapId === keycapItem.id;
        }, 2000);
        const state = await api.state();
        const scene = await api.scene();
        const summary = await readSummary();
        const cases = await readOptions('#case-options', 'data-case', CASES.map((c) => c.id));
        const keycaps = await readOptions('#keycap-options', 'data-keycap', KEYCAPS.map((k) => k.id));
        const stored = await readStorage();

        assert(state.caseId === caseItem.id, `getState().caseId=${state.caseId}`);
        assert(state.keycapId === keycapItem.id, `getState().keycapId=${state.keycapId}`);
        const themeCase = scene.theme.case ?? scene.theme.caseId;
        const themeKeycap = scene.theme.keycap ?? scene.theme.keycapId;
        assert(themeCase === caseItem.id, `scene.theme=${JSON.stringify(scene.theme)}`);
        assert(themeKeycap === keycapItem.id, `scene.theme=${JSON.stringify(scene.theme)}`);
        // Real material colours must follow state.js data (not just DOM/store).
        const renderTheme = await waitRenderTheme(caseItem, keycapItem, 5000);
        assert(
          renderTheme.matched,
          `getRenderTheme 与 state 配色数据不一致：actual=${JSON.stringify(renderTheme.actual)} expected=${JSON.stringify(renderTheme.expected)}`
        );

        const selectedCase = cases.find((item) => item.id === caseItem.id);
        const selectedKeycap = keycaps.find((item) => item.id === keycapItem.id);
        assert(selectedCase && selectedCase.pressed === 'true', `外壳 ${caseItem.id} aria-pressed=${selectedCase && selectedCase.pressed}`);
        assert(selectedKeycap && selectedKeycap.pressed === 'true', `键帽 ${keycapItem.id} aria-pressed=${selectedKeycap && selectedKeycap.pressed}`);
        for (const item of cases) {
          assert(item.pressed === (item.id === caseItem.id ? 'true' : 'false'), `外壳选项 ${item.id} aria-pressed=${item.pressed}`);
          assert(item.selected === (item.id === caseItem.id), `外壳选项 ${item.id} .is-selected=${item.selected}`);
        }
        for (const item of keycaps) {
          assert(item.pressed === (item.id === keycapItem.id ? 'true' : 'false'), `键帽选项 ${item.id} aria-pressed=${item.pressed}`);
          assert(item.selected === (item.id === keycapItem.id), `键帽选项 ${item.id} .is-selected=${item.selected}`);
        }

        assert((summary.caseText || '').includes(caseItem.name), `#summary-case="${summary.caseText}" 不含 ${caseItem.name}`);
        assert((summary.caseMeta || '').includes(caseItem.finish), `#summary-case-meta="${summary.caseMeta}" 不含 ${caseItem.finish}`);
        assert((summary.keycapText || '').includes(keycapItem.name), `#summary-keycap="${summary.keycapText}" 不含 ${keycapItem.name}`);
        assert((summary.keycapMeta || '').includes(keycapItem.material), `#summary-keycap-meta="${summary.keycapMeta}" 不含 ${keycapItem.material}`);
        assert(summary.name === DEFAULT_NAME, `#summary-name=${summary.name}`);

        // A no-op click on the default build does not persist anything (state.js
        // early-returns when the value is unchanged); that is consistent because
        // a reload without a stored config still resolves to the defaults.
        let storageNote = '';
        assert(stored === null || !stored.startsWith('ERROR:'), `localStorage 读取失败：${stored}`);
        if (stored === null) {
          const isDefaultCombo = caseItem.id === 'lunar' && keycapItem.id === 'alabaster';
          assert(
            isDefaultCombo && state.profileName === DEFAULT_NAME,
            `localStorage 缺少配置，但当前并非默认组合（${caseItem.id}/${keycapItem.id}）`
          );
          storageNote = '；默认配置无变更故不落盘（reload 仍为默认）';
        } else {
          const saved = JSON.parse(stored);
          assert(saved.caseId === caseItem.id && saved.keycapId === keycapItem.id,
            `localStorage=${stored} 与界面不一致`);
          storageNote = '；localStorage 已同步';
        }

        const shotName = themeShots[`${caseItem.id}+${keycapItem.id}`];
        let shotNote = '';
        if (shotName) {
          await sleep(500);
          const shot = await capture(shotName);
          assert(shot.width === 1440 && shot.height === 900, `截图尺寸 ${shot.width}x${shot.height}`);
          assert(shot.bytes > 12000, `截图仅 ${shot.bytes} bytes`);
          shotNote = `，截图 ${shot.path}`;
        }
        return `state/theme/renderTheme/aria-pressed/.is-selected/摘要/存储 全部一致（case=${renderTheme.actual.case}, capAlpha=${renderTheme.actual.capAlpha}, capAccent=${renderTheme.actual.capAccent}）${shotNote}`;
      });
    }
  }

  await test('重复点击已选外壳不产生状态变化', async () => {
    const before = await api.state();
    await page.click(`#case-options [data-case="${before.caseId}"]`);
    await sleep(120);
    const after = await api.state();
    assert(after.caseId === before.caseId && after.keycapId === before.keycapId, '重复点击后状态漂移');
    return `保持 ${after.caseId}/${after.keycapId}`;
  });

  // =======================================================================
  // 3. Explode / assemble
  // =======================================================================
  await page.evaluate(() => window.__LUMEN__.setExploded(false));
  await waitAfterSettle('拆解测试前置复位');
  // Reset to the factory theme so the exploded screenshot is representative.
  await page.evaluate(() => {
    window.__LUMEN__.setCase('lunar');
    window.__LUMEN__.setKeycap('alabaster');
  });
  await waitRenderTheme(CASE_BY_ID.lunar, KEYCAP_BY_ID.alabaster, 4000);

  await test('拆解：点击后 layers.caps > layers.plate > 0，按钮/标签/body 状态正确', async () => {
    await page.click('#btn-explode');
    const immediate = await api.state();
    assert(immediate.exploded === true, `点击后 exploded=${immediate.exploded}，逻辑目标应立即翻转`);
    assert(immediate.explodeTarget === 1, `explodeTarget=${immediate.explodeTarget}`);
    await waitAfterSettle('拆解展开');
    await sleep(250); // let spring-based layers snap to their targets
    const state = await api.state();
    const scene = await api.scene();
    const ui = await page.evaluate(() => ({
      label: document.querySelector('#btn-explode-label').textContent.trim(),
      pressed: document.querySelector('#btn-explode').getAttribute('aria-pressed'),
      bodyExploded: document.body.dataset.exploded,
      labelsVisible: [...document.querySelectorAll('#layer-labels .layer-label')].map((el) => ({
        layer: el.dataset.layer,
        opacity: getComputedStyle(el).opacity,
        hidden: el.hasAttribute('hidden'),
      })),
    }));
    const layers = state.layers;
    assertClose(state.explodeProgress, 1, EXPLODE_TOL, 'explodeProgress 未达到 1');
    assert(layers.caps > layers.plate, `layers=${JSON.stringify(layers)}，caps 未高于 plate`);
    assert(layers.plate > 0.01, `layers.plate=${layers.plate} 未分离`);
    assert(Math.abs(layers.case_) < Math.max(0.01, layers.plate * 0.1),
      `layers.case_=${layers.case_} 应接近 0（plate=${layers.plate}）`);
    assert(scene.labelsVisible === true, 'getSceneInfo().labelsVisible 应为 true');
    assert(ui.label === '组装还原', `#btn-explode-label="${ui.label}"`);
    assert(ui.pressed === 'true', `#btn-explode aria-pressed=${ui.pressed}`);
    assert(ui.bodyExploded === 'open', `body[data-exploded]=${ui.bodyExploded}`);
    assert(ui.labelsVisible.length === 3, `层标签数量=${ui.labelsVisible.length}`);
    return `caps=${round(layers.caps)}, plate=${round(layers.plate)}, case_=${round(layers.case_)}`;
  });

  await test('拆解截图', async () => {
    await sleep(350);
    const shot = await capture('02-exploded-1440x900.png');
    assert(shot.bytes > 12000, `截图仅 ${shot.bytes} bytes`);
    return `${shot.path} (${shot.bytes} bytes)`;
  });

  await test('组装：回到 0，标签隐藏，按钮文案恢复', async () => {
    await page.click('#btn-explode');
    await waitAfterSettle('组装还原');
    await sleep(250);
    const state = await api.state();
    const scene = await api.scene();
    const ui = await page.evaluate(() => ({
      label: document.querySelector('#btn-explode-label').textContent.trim(),
      pressed: document.querySelector('#btn-explode').getAttribute('aria-pressed'),
      bodyExploded: document.body.dataset.exploded,
    }));
    assert(state.exploded === false && state.explodeTarget === 0, `exploded=${state.exploded}/${state.explodeTarget}`);
    assertClose(state.explodeProgress, 0, EXPLODE_TOL, 'explodeProgress 未回到 0');
    for (const layer of ['caps', 'plate', 'case_']) {
      assert(Math.abs(state.layers[layer]) < LAYER_ZERO_TOL, `layers.${layer}=${state.layers[layer]}`);
    }
    assert(scene.labelsVisible === false, '组装后 labelsVisible 应为 false');
    assert(ui.label === '拆解视图', `#btn-explode-label="${ui.label}"`);
    assert(ui.pressed === 'false', `#btn-explode aria-pressed=${ui.pressed}`);
    assert(ui.bodyExploded === 'closed', `body[data-exploded]=${ui.bodyExploded}`);
    return 'layers 全部归零，labelsVisible=false，文案/aria/body 均恢复';
  });

  await test('快速连续点击 11 次：whenSettled 后目标与进度一致（open）', async () => {
    await page.evaluate(() => {
      const button = document.querySelector('#btn-explode');
      for (let i = 0; i < 11; i += 1) button.click();
    });
    const immediate = await api.state();
    assert(immediate.exploded === true && immediate.explodeTarget === 1,
      `11 次点击后 exploded=${immediate.exploded}, target=${immediate.explodeTarget}`);
    await waitAfterSettle('11 次快速点击', 8000);
    await sleep(250);
    const state = await api.state();
    const label = await page.textContent('#btn-explode-label');
    assertClose(state.explodeProgress, state.explodeTarget, EXPLODE_TOL, 'explodeProgress 与目标不一致');
    assert(state.explodeTarget === 1, `explodeTarget=${state.explodeTarget}`);
    assert(label.trim() === '组装还原', `#btn-explode-label="${label.trim()}"`);
    assert(state.layers.caps > state.layers.plate && state.layers.plate > 0.01,
      `layers=${JSON.stringify(state.layers)}`);
    return `11 次点击 → open，progress=${round(state.explodeProgress)}，文案=组装还原`;
  });

  await test('再点击 1 次（共 12 次）：whenSettled 后回到 closed，进度误差 < 0.001', async () => {
    await page.click('#btn-explode');
    await waitAfterSettle('第 12 次点击', 8000);
    await sleep(250);
    const state = await api.state();
    const label = await page.textContent('#btn-explode-label');
    assert(state.exploded === false && state.explodeTarget === 0, `exploded=${state.exploded}, target=${state.explodeTarget}`);
    assertClose(state.explodeProgress, 0, EXPLODE_TOL, 'explodeProgress 未回到 0');
    assert(label.trim() === '拆解视图', `#btn-explode-label="${label.trim()}"`);
    for (const layer of ['caps', 'plate', 'case_']) {
      assert(Math.abs(state.layers[layer]) < LAYER_ZERO_TOL, `layers.${layer}=${state.layers[layer]}`);
    }
    return `12 次点击 → closed，progress=${round(state.explodeProgress)}，layers 全部归零`;
  });

  // =======================================================================
  // 4. Experience mode
  // =======================================================================
  await page.evaluate(() => {
    document.activeElement && document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => window.__LUMEN__.setExperience(false));
  await sleep(200);

  await test('体验模式：默认关闭时物理按键不产生按压', async () => {
    const state = await api.state();
    assert(state.experience === false, 'experience 应为 false');
    await page.keyboard.down('a');
    await sleep(150);
    const key = await api.key('KeyA');
    await page.keyboard.up('a');
    assert(!key || key.press < 0.002, `关闭体验模式时 KeyA.press=${key && key.press}`);
    await waitSettledKeys();
    return '关闭状态下 A 键无按压';
  });

  await test('体验模式：开启后开关/状态/提示联动', async () => {
    await page.click('#toggle-experience');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await waitUntil(async () => (await api.state()).experience === true, 2000);
    const state = await api.state();
    const ui = await page.evaluate(() => ({
      checked: document.querySelector('#toggle-experience').checked,
      body: document.body.dataset.experience,
      status: document.querySelector('#experience-status').textContent.trim(),
      hintHidden: document.querySelector('#experience-hint').hasAttribute('hidden'),
      hintText: document.querySelector('#experience-hint').textContent.trim(),
    }));
    assert(state.experience === true, 'getState().experience 未变为 true');
    assert(ui.checked === true, '#toggle-experience 未勾选');
    assert(ui.body === 'on', `body[data-experience]=${ui.body}`);
    assert(ui.status.length > 0, '#experience-status 为空');
    assert(ui.hintHidden === false, '开启体验模式后 #experience-hint 仍 hidden');
    return `experience=on，状态文案="${ui.status}"`;
  });

  await test('体验模式：物理按住 A 键键帽下压，释放后回落', async () => {
    const demoDone = await waitDemoWaveSettled();
    assert(demoDone, '开启体验模式后的 LUMEN demo wave 未在 5s 内结束');
    await page.keyboard.down('a');
    const pressed = await waitPress('KeyA', (value) => value > 0.05, 2000);
    assert(pressed, '按下 A 后 getKey(KeyA).press 未 > 0.05');
    assert(pressed.pressed === true, 'getKey(KeyA).pressed 应为 true');
    const echo = await page.evaluate(() => {
      const el = document.querySelector('#key-echo');
      return { text: el.textContent.trim(), active: el.classList.contains('is-active') };
    });
    assert(echo.text.length > 0 && /a/i.test(echo.text), `#key-echo="${echo.text}" 未反映 A 键`);
    assert(echo.active === true, '#key-echo 未添加 .is-active');
    assert(pressed.offset < 0, `键帽下压 offset=${pressed.offset} 应为负`);
    await page.keyboard.up('a');
    const settled = await waitPress('KeyA', (value) => value < 0.002, 2500);
    assert(settled, '释放后 KeyA.press 未回落');
    if (pressed.press > 1.02) {
      info(
        'getKey().press 轻微超调（契约标注 0..1）',
        `按住 A 时 press 峰值 ${pressed.press} > 1，为弹簧超调；不影响视觉/交互，但 TEST-API 标注为 0..1`
      );
    }
    return `按住 press=${round(pressed.press)}，offset=${round(pressed.offset)}，echo="${echo.text}"，释放后回落`;
  });

  await test('体验模式：空格键触发且页面不滚动', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.down('Space');
    const pressed = await waitPress('Space', (value) => value > 0.05, 2000);
    assert(pressed, '按下空格后 Space.press 未 > 0.05');
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.keyboard.up('Space');
    await waitPress('Space', (value) => value < 0.002, 2500);
    assert(scrollY === 0, `空格导致页面滚动 scrollY=${scrollY}`);
    return `Space press=${round(pressed.press)}，释放回落，scrollY=0`;
  });

  await test('体验模式：pressVirtual/releaseVirtual 与物理路径等效', async () => {
    await page.evaluate(() => window.__LUMEN__.pressVirtual('KeyA'));
    const pressed = await waitPress('KeyA', (value) => value > 0.05, 2000);
    assert(pressed, 'pressVirtual 未产生按压');
    await page.evaluate(() => window.__LUMEN__.releaseVirtual('KeyA'));
    const released = await waitPress('KeyA', (value) => value < 0.002, 2500);
    assert(released, 'releaseVirtual 后未回落');
    return 'pressVirtual/releaseVirtual 生效';
  });

  await test('体验模式：用 getKey().screen 坐标鼠标点击 KeyF 触发', async () => {
    const key = await api.key('KeyF');
    assert(key, 'getKey(KeyF) 返回 null');
    assert(key.inView === true, 'KeyF 不在视野内');
    assert(Number.isFinite(key.screen.x) && Number.isFinite(key.screen.y), `screen=${JSON.stringify(key.screen)}`);
    const canvasRect = await page.evaluate(() => {
      const rect = document.querySelector('#viewport canvas.scene-canvas').getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    });
    assert(
      key.screen.x >= canvasRect.left && key.screen.x <= canvasRect.right &&
        key.screen.y >= canvasRect.top && key.screen.y <= canvasRect.bottom,
      `screen=${JSON.stringify(key.screen)} 不在 canvas rect=${JSON.stringify(canvasRect)} 内`
    );
    await page.mouse.move(key.screen.x, key.screen.y);
    await page.mouse.down();
    const pressed = await waitPress('KeyF', (value) => value > 0.02, 2000);
    await page.mouse.up();
    assert(pressed, '鼠标按下 KeyF 未产生按压');
    await waitPress('KeyF', (value) => value < 0.002, 2500);
    // The contract explicitly allows page.mouse.click at this coordinate.
    await page.mouse.click(key.screen.x, key.screen.y);
    await sleep(120);
    const echo = await page.evaluate(() => document.querySelector('#key-echo').textContent.trim());
    return `screen=(${round(key.screen.x)}, ${round(key.screen.y)})，鼠标按压成功，click 后 echo="${echo}"`;
  });

  await test('体验模式：输入框聚焦键入不触发键帽、文本正常、页面不滚动', async () => {
    await page.click('#profile-name');
    await page.keyboard.press('Control+A');
    // Guard: everything must be at rest before the sampler starts, otherwise a
    // residual spring (e.g. from the demo wave) would be misread as a press.
    const typedBaseline = await api.keys(TYPED_CODES);
    const noisy = Object.entries(typedBaseline)
      .filter(([, key]) => key && Math.abs(key.press) >= 0.002)
      .map(([code]) => code);
    assert(noisy.length === 0, `键入前仍有键帽未回弹：${noisy.join(',')}`);
    await page.evaluate((codes) => {
      window.__QA_MAXPRESS__ = 0;
      window.__QA_MAXPRESS_CODES__ = [];
      window.__QA_PRESS_TIMER__ = setInterval(() => {
        for (const code of codes) {
          const key = window.__LUMEN__.getKey(code);
          if (key && key.press > window.__QA_MAXPRESS__) {
            window.__QA_MAXPRESS__ = key.press;
            window.__QA_MAXPRESS_CODES__.push(code);
          }
        }
      }, 16);
    }, TYPED_CODES);
    await page.keyboard.type('hello keyboard', { delay: 35 });
    await sleep(200);
    const sampler = await page.evaluate(() => {
      clearInterval(window.__QA_PRESS_TIMER__);
      return { max: window.__QA_MAXPRESS__, codes: [...new Set(window.__QA_MAXPRESS_CODES__)] };
    });
    const value = await page.inputValue('#profile-name');
    const state = await waitUntil(async () => {
      const current = await api.state();
      return current.profileName === 'hello keyboard' ? current : null;
    }, 2000);
    const scrollY = await page.evaluate(() => window.scrollY);
    assert(value === 'hello keyboard', `#profile-name.value="${value}"`);
    assert(state && state.profileName === 'hello keyboard', `store profileName=${state && state.profileName}`);
    assert(sampler.max < 0.01, `键入时键帽被触发：max press=${sampler.max}（${sampler.codes.join(',')}）`);
    assert(scrollY === 0, `键入导致页面滚动 scrollY=${scrollY}`);
    return `输入值="hello keyboard" 已同步 store；采样最大 press=${round(sampler.max)}；scrollY=0`;
  });

  await test('命名清空：摘要显示“未命名配置”', async () => {
    await page.click('#profile-name');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    const summary = await waitUntil(async () => {
      const current = await readSummary();
      return current.name === UNSAVED_NAME ? current : null;
    }, 2000);
    const state = await api.state();
    assert(summary, `清空后 #summary-name=${JSON.stringify((await readSummary()).name)}，期望 ${UNSAVED_NAME}`);
    assert(state.profileName === '', `store profileName=${JSON.stringify(state.profileName)}`);
    return `#summary-name="${UNSAVED_NAME}"，store profileName 为空`;
  });

  await test('体验模式：关闭后物理按键不再触发', async () => {
    await page.click('#toggle-experience');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await waitUntil(async () => (await api.state()).experience === false, 2000);
    await page.keyboard.down('a');
    await sleep(150);
    const key = await api.key('KeyA');
    await page.keyboard.up('a');
    const ui = await page.evaluate(() => ({
      checked: document.querySelector('#toggle-experience').checked,
      body: document.body.dataset.experience,
    }));
    assert(key.press < 0.002, `关闭后 A 仍被触发 press=${key.press}`);
    assert(ui.checked === false && ui.body === 'off', `checked=${ui.checked}, body=${ui.body}`);
    await waitSettledKeys();
    return '关闭后 A 键无按压，checkbox/body 状态正确';
  });

  // =======================================================================
  // 5. Camera
  // =======================================================================
  await test('视角：自动旋转开关存在且默认关闭（相机测试前置）', async () => {
    const checked = await page.evaluate(() => document.querySelector('#toggle-autorotate').checked);
    if (checked) {
      await page.click('#toggle-autorotate');
      await sleep(100);
    }
    return checked ? '默认开启（已关闭以便测试）' : '默认关闭';
  });

  await api.resetCamera();
  await sleep(100);
  await waitAfterSettle('相机复位');
  const initialCamera = await api.camera();

  await test('视角：canvas 拖拽后相机 position 变化', async () => {
    const box = await page.locator('#viewport').boundingBox();
    assert(box && box.width > 100 && box.height > 100, '拿不到 #viewport 尺寸');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx - 130, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 130, cy + 10, { steps: 12 });
    await page.mouse.up();
    await sleep(500);
    const after = await api.camera();
    const moved = Math.hypot(
      after.position[0] - initialCamera.position[0],
      after.position[1] - initialCamera.position[1],
      after.position[2] - initialCamera.position[2]
    );
    const threshold = Math.max(0.01, initialCamera.distance * 0.01);
    assert(moved > threshold, `拖拽后相机位移 ${round(moved)} 未超过阈值 ${round(threshold)}`);
    return `位移 ${round(moved)} > 阈值 ${round(threshold)}；position=${JSON.stringify(after.position.map(round))}`;
  });

  await test('视角：滚轮改变相机距离', async () => {
    const box = await page.locator('#viewport').boundingBox();
    const before = await api.camera();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await sleep(500);
    const after = await api.camera();
    const delta = Math.abs(after.distance - before.distance);
    const threshold = Math.max(0.005, before.distance * 0.002);
    assert(delta > threshold, `滚轮后距离变化 ${round(delta)} 未超过阈值 ${round(threshold)}（${round(before.distance)} → ${round(after.distance)}）`);
    return `distance ${round(before.distance)} → ${round(after.distance)}（Δ=${round(delta)}）`;
  });

  await test('视角：点击 #btn-reset-view 回到初始相机（容差已注明）', async () => {
    await page.click('#btn-reset-view');
    await sleep(100);
    const settled = await api.settled(8000);
    assert(settled === true, '复位相机 whenSettled 超时');
    await sleep(300);
    const restored = await api.camera();
    const tol = Math.max(CAMERA_TOL_ABS, initialCamera.distance * CAMERA_TOL_FRACTION);
    const positionDelta = Math.hypot(
      restored.position[0] - initialCamera.position[0],
      restored.position[1] - initialCamera.position[1],
      restored.position[2] - initialCamera.position[2]
    );
    const targetDelta = Math.hypot(
      restored.target[0] - initialCamera.target[0],
      restored.target[1] - initialCamera.target[1],
      restored.target[2] - initialCamera.target[2]
    );
    const distanceDelta = Math.abs(restored.distance - initialCamera.distance);
    assert(positionDelta <= tol, `复位后 position 偏差 ${round(positionDelta)} > 容差 ${round(tol)}`);
    assert(targetDelta <= tol, `复位后 target 偏差 ${round(targetDelta)} > 容差 ${round(tol)}`);
    assert(distanceDelta <= tol, `复位后 distance 偏差 ${round(distanceDelta)} > 容差 ${round(tol)}`);
    return `positionΔ=${round(positionDelta)}, targetΔ=${round(targetDelta)}, distanceΔ=${round(distanceDelta)}，容差=${round(tol)}`;
  });

  // =======================================================================
  // 6. Persistence & restore defaults
  // =======================================================================
  // file:// pages may be denied localStorage by the browser; record honestly
  // and skip persistence assertions instead of reporting a false failure.
  const storageAvailable = await page.evaluate(() => {
    try {
      localStorage.setItem('__qa_probe__', '1');
      localStorage.removeItem('__qa_probe__');
      return true;
    } catch {
      return false;
    }
  });
  report.storageAvailable = storageAvailable;
  async function testPersist(name, fn) {
    if (!storageAvailable) {
      skip(name, 'localStorage 不可用（file:// 或浏览器隐私策略），按契约仅本次会话');
      return false;
    }
    return test(name, fn);
  }

  await testPersist('持久化前置：清空存储并 reload 回到默认', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__LUMEN_READY__ === true, null, { timeout: 90000 });
    const state = await api.state();
    assert(state.caseId === 'lunar' && state.keycapId === 'alabaster', `state=${state.caseId}/${state.keycapId}`);
    return '存储清空后为默认配置';
  });

  await testPersist('持久化：设置铜色 + 麦田 + 命名，reload 后状态与摘要恢复', async () => {
    await page.click('#case-options [data-case="copper"]');
    await page.click('#keycap-options [data-keycap="harvest"]');
    await page.click('#profile-name');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('QA BUILD 68', { delay: 20 });
    const saved = await waitUntil(async () => {
      const raw = await readStorage();
      return raw && raw.includes('QA BUILD 68') ? raw : null;
    }, 2000);
    assert(saved, 'localStorage 未保存命名');
    await page.evaluate(() => {
      localStorage.setItem('qa.sentinel.1', 'keep-me');
      localStorage.setItem('qa.sentinel.2', JSON.stringify({ n: 2 }));
    });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__LUMEN_READY__ === true, null, { timeout: 90000 });
    const state = await api.state();
    const summary = await readSummary();
    const scene = await api.scene();
    const options = {
      cases: await readOptions('#case-options', 'data-case'),
      keycaps: await readOptions('#keycap-options', 'data-keycap'),
    };
    const storage = await page.evaluate(() => ({
      config: localStorage.getItem('lumen68.config.v1'),
      sentinel1: localStorage.getItem('qa.sentinel.1'),
      sentinel2: localStorage.getItem('qa.sentinel.2'),
    }));

    assert(state.caseId === 'copper' && state.keycapId === 'harvest', `state=${state.caseId}/${state.keycapId}`);
    assert(state.profileName === 'QA BUILD 68', `profileName=${state.profileName}`);
    const persistedThemeCase = scene.theme.case ?? scene.theme.caseId;
    const persistedThemeKeycap = scene.theme.keycap ?? scene.theme.keycapId;
    assert(persistedThemeCase === 'copper' && persistedThemeKeycap === 'harvest', `theme=${JSON.stringify(scene.theme)}`);
    const restoredRenderTheme = await waitRenderTheme(CASE_BY_ID.copper, KEYCAP_BY_ID.harvest, 5000);
    assert(
      restoredRenderTheme.matched,
      `reload 后 getRenderTheme 与恢复的 state 数据不一致：actual=${JSON.stringify(restoredRenderTheme.actual)}`
    );
    assert((summary.caseText || '').includes(CASE_BY_ID.copper.name), `#summary-case="${summary.caseText}"`);
    assert((summary.keycapText || '').includes(KEYCAP_BY_ID.harvest.name), `#summary-keycap="${summary.keycapText}"`);
    assert(summary.name === 'QA BUILD 68', `#summary-name=${summary.name}`);
    assert(summary.profileValue === 'QA BUILD 68', `#profile-name.value=${summary.profileValue}`);
    assert(options.cases.find((item) => item.id === 'copper').pressed === 'true', 'reload 后铜色未选中');
    assert(options.keycaps.find((item) => item.id === 'harvest').pressed === 'true', 'reload 后麦田未选中');
    assert(storage.sentinel1 === 'keep-me' && storage.sentinel2 === JSON.stringify({ n: 2 }), '预埋 localStorage key 丢失');
    return `reload 后恢复 copper/harvest/QA BUILD 68；预埋 key 保留`;
  });

  await testPersist('持久化：恢复默认只移除本页 key，保留其它 localStorage，刷新后为默认', async () => {
    await page.click('#btn-restore');
    const toast = await waitUntil(async () => {
      const text = await page.evaluate(() => document.querySelector('#toast').textContent.trim());
      return text.length > 0 ? text : null;
    }, 1500);
    const afterRestore = await page.evaluate(() => ({
      config: localStorage.getItem('lumen68.config.v1'),
      keys: Object.keys(localStorage),
      sentinel1: localStorage.getItem('qa.sentinel.1'),
      sentinel2: localStorage.getItem('qa.sentinel.2'),
    }));
    // Wait for the UI/state to settle back to defaults.
    await waitUntil(async () => {
      const state = await api.state();
      return state.caseId === 'lunar' && state.keycapId === 'alabaster';
    }, 2000);
    const state = await api.state();
    const summary = await readSummary();
    assert(afterRestore.config === null, `恢复默认后 localStorage[${STORAGE_KEY}]=${afterRestore.config}`);
    assert(afterRestore.sentinel1 === 'keep-me' && afterRestore.sentinel2 === JSON.stringify({ n: 2 }),
      `其它 key 被误删：keys=${JSON.stringify(afterRestore.keys)}`);
    assert(state.caseId === 'lunar' && state.keycapId === 'alabaster', `恢复后 state=${state.caseId}/${state.keycapId}`);
    assert(state.profileName === DEFAULT_NAME, `恢复后 profileName=${state.profileName}`);
    assert(summary.name === DEFAULT_NAME, `恢复后 #summary-name=${summary.name}`);
    assert(toast && toast.length > 0, '#toast 未显示恢复提示');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__LUMEN_READY__ === true, null, { timeout: 90000 });
    const reloaded = await api.state();
    assert(reloaded.caseId === 'lunar' && reloaded.keycapId === 'alabaster', `刷新后 state=${reloaded.caseId}/${reloaded.keycapId}`);
    assert(reloaded.profileName === DEFAULT_NAME, `刷新后 profileName=${reloaded.profileName}`);
    return `本页 key 已移除、sentinel 保留、toast="${toast}"、刷新后默认`;
  });

  await test('命名 maxlength=24：键盘输入超长文本被截断', async () => {
    await page.click('#profile-name');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', { delay: 5 });
    const value = await page.inputValue('#profile-name');
    await sleep(200);
    const state = await api.state();
    assert(value.length <= 24, `输入框值长度 ${value.length} > 24`);
    assert(state.profileName.length <= 24, `store 名称长度 ${state.profileName.length} > 24`);
    return `输入 36 字符后 value 长度=${value.length}，store 长度=${state.profileName.length}`;
  });

  // Reset to defaults for the remaining layout screenshots.
  try {
    await page.evaluate(() => localStorage.clear());
  } catch {
    /* storage unavailable on file:// — defaults already apply after reload */
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__LUMEN_READY__ === true, null, { timeout: 90000 });
  await page.evaluate(() => window.scrollTo(0, 0));

  // =======================================================================
  // 7. Layout 1280×800 and mobile 390×844
  // =======================================================================
  await test('布局 1280×800：无滚动，标题/视口/主要控件在首屏', async () => {
    await page.setViewportSize(DESKTOP_SMALL);
    await sleep(700);
    await page.evaluate(() => window.scrollTo(0, 0));
    const metrics = await measureLayout(page);
    assert(metrics.deScrollHeight <= 801, `纵向溢出 ${metrics.deScrollHeight - metrics.innerHeight}px`);
    assert(metrics.deScrollWidth <= 1281, `横向溢出 ${metrics.deScrollWidth - metrics.innerWidth}px`);
    assert(metrics.heroTitle && metrics.heroTitle.text.includes('LUMEN 68'), '首屏找不到 LUMEN 68 标题');
    assert(metrics.heroTitle.inView, 'LUMEN 68 标题不在首屏');
    assert(metrics.viewport && metrics.viewport.inView, '#viewport 不在首屏');
    for (const [label, selector] of [
      ['#case-options', 'caseOptions'], ['#keycap-options', 'keycapOptions'],
      ['#btn-explode', 'explode'], ['#toggle-experience', 'experience'],
    ]) {
      assert(metrics[selector] && metrics[selector].inView, `${label} 不在首屏内`);
    }
    assert(
      metrics.panelScroll && metrics.panelScroll.overflow <= 1,
      `桌面 1280 面板内部滚动溢出 ${metrics.panelScroll && metrics.panelScroll.overflow}px（期望 0）`
    );
    assert(metrics.panelBottom && metrics.panelBottom.insidePanel, '1280 下 .panel-bottom 不在面板内');
    assert(
      metrics.panelBottom && metrics.panelBottom.gapToPanelBottom <= 24,
      `1280 下 .panel-bottom 距面板底部 ${metrics.panelBottom && metrics.panelBottom.gapToPanelBottom}px（应贴底）`
    );
    const shot = await capture('07-desktop-1280x800.png');
    assert(shot.width === 1280 && shot.height === 800, `截图尺寸 ${shot.width}x${shot.height}`);
    return `无滚动，viewport=${Math.round(metrics.viewport.width)}x${Math.round(metrics.viewport.height)}，panelOverflow=${
      metrics.panelScroll.overflow}，截图 ${shot.path}`;
  });

  await test('移动端 390×844：无横向滚动，键盘在视口内，面板起始可见', async () => {
    await page.setViewportSize(MOBILE);
    await sleep(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    const metrics = await measureLayout(page);
    const keys = await api.keys(['Escape', 'KeyA', 'KeyF', 'Space', 'KeyP']);
    const keyState = Object.fromEntries(
      Object.entries(keys).map(([code, key]) => [code, key ? { inView: key.inView, screen: key.screen } : null])
    );
    const visibleKeys = Object.values(keyState).filter((key) => key && key.inView).length;
    assert(metrics.deScrollWidth <= 391, `横向溢出 ${metrics.deScrollWidth - metrics.innerWidth}px`);
    assert(metrics.heroTitle && metrics.heroTitle.text.includes('LUMEN 68'), '移动端首屏找不到产品名');
    assert(metrics.heroTitle.inView, '移动端产品名不在首屏');
    assert(metrics.viewport && metrics.viewport.inView, '移动端 #viewport 不在首屏');
    assert(metrics.viewport.height >= 200, `移动端 #viewport 高度 ${metrics.viewport.height}px`);
    assert(metrics.panel && metrics.panel.top < 844, `移动端面板未在首屏起始（top=${metrics.panel && metrics.panel.top}）`);
    assert(visibleKeys >= 3, `仅 ${visibleKeys}/5 个采样键 inView`);
    const shot = await capture('06-mobile-390x844.png');
    assert(shot.width === 390 && shot.height === 844, `截图尺寸 ${shot.width}x${shot.height}`);
    return `无横向滚动，viewport 高 ${Math.round(metrics.viewport.height)}px，采样键 ${visibleKeys}/5 inView，截图 ${shot.path}`;
  });

  // =======================================================================
  // 7b. Exploded layer labels across viewports + exploded button contrast
  // =======================================================================
  const labelReport = [];
  const labelViewports = [
    { label: '1440x900', viewport: DESKTOP, shot: '02b-exploded-labels-1440x900.png', captureButton: true },
    { label: '1280x800', viewport: DESKTOP_SMALL, shot: '02c-exploded-labels-1280x800.png' },
    { label: '390x844', viewport: MOBILE, shot: '02d-exploded-labels-390x844.png' },
  ];
  for (const item of labelViewports) {
    await test(`拆解态层标签 ${item.label}：在 #viewport 内、不遮工具条、不压产品`, async () => {
      await page.setViewportSize(item.viewport);
      await sleep(700);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => window.__LUMEN__.setExploded(false));
      await waitAfterSettle(`层标签 ${item.label} 复位`);
      await page.click('#btn-explode');
      await waitAfterSettle(`层标签 ${item.label} 展开`);
      await sleep(400);
      // On narrow screens the button lives below the fold, so the click above
      // auto-scrolled the page. Re-centre #viewport before measuring/shooting.
      await page.evaluate(() => {
        const viewport = document.querySelector('#viewport');
        if (viewport) viewport.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
      await sleep(350);
      const metrics = await page.evaluate(() => {
        const rectOf = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        const viewport = rectOf(document.querySelector('#viewport'));
        const toolbar = rectOf(document.querySelector('.viewport-toolbar'));
        const labels = [...document.querySelectorAll('#layer-labels .layer-label')].map((el) => ({
          layer: el.dataset.layer,
          text: el.textContent.trim(),
          opacity: Number(getComputedStyle(el).opacity),
          display: getComputedStyle(el).display,
          rect: rectOf(el),
        }));
        const codes = ['Escape', 'Digit1', 'Digit6', 'KeyQ', 'KeyA', 'KeyF', 'KeyJ', 'KeyZ', 'KeyM', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter'];
        const screens = codes
          .map((code) => window.__LUMEN__.getKey(code))
          .filter(Boolean)
          .filter((key) => key.inView)
          .map((key) => key.screen);
        const keysBBox = screens.length
          ? screens.reduce(
              (box, point) => ({
                left: Math.min(box.left, point.x - 8),
                right: Math.max(box.right, point.x + 8),
                top: Math.min(box.top, point.y - 8),
                bottom: Math.max(box.bottom, point.y + 8),
              }),
              { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
            )
          : null;
        const button = document.querySelector('#btn-explode');
        const computed = button ? getComputedStyle(button) : null;
        const buttonRect = button ? rectOf(button) : null;
        const canvas = document.querySelector('#viewport canvas.scene-canvas');
        return {
          viewport,
          toolbar,
          labels,
          keysBBox,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          scrollY: window.scrollY,
          canvasClient: canvas ? { width: canvas.clientWidth, height: canvas.clientHeight } : null,
          buttonStyle: computed
            ? {
                color: computed.color,
                backgroundColor: computed.backgroundColor,
                backgroundImage: computed.backgroundImage,
                borderColor: computed.borderColor,
                label: document.querySelector('#btn-explode-label')?.textContent.trim() ?? null,
                rect: buttonRect,
              }
            : null,
        };
      });

      assert(metrics.viewport, '#viewport 不存在');
      assert(metrics.labels.length === 3, `层标签数量=${metrics.labels.length}`);
      for (const label of metrics.labels) {
        assert(
          label.rect && label.rect.width > 10 && label.rect.height > 8,
          `${label.layer} 标签尺寸异常：${JSON.stringify(label.rect)}`
        );
        assert(label.opacity > 0.1, `${label.layer} 标签 opacity=${label.opacity}，拆解态应可见`);
        const inside =
          label.rect.left >= metrics.viewport.left - 1 &&
          label.rect.right <= metrics.viewport.right + 1 &&
          label.rect.top >= metrics.viewport.top - 1 &&
          label.rect.bottom <= metrics.viewport.bottom + 1;
        assert(
          inside,
          `${label.layer} 标签不在 #viewport 内：label=${JSON.stringify(label.rect)} viewport=${JSON.stringify(metrics.viewport)}`
        );
        const toolbarOverlap = overlapArea(label.rect, metrics.toolbar);
        assert(toolbarOverlap <= 1, `${label.layer} 标签遮挡视口工具条（重叠 ${Math.round(toolbarOverlap)}px²）`);
      }
      const overlaps = metrics.labels.map((label) => ({
        layer: label.layer,
        productOverlapRatio: Math.round((overlapArea(label.rect, metrics.keysBBox) / Math.max(1, label.rect.width * label.rect.height)) * 100) / 100,
        toolbarOverlapPx: Math.round(overlapArea(label.rect, metrics.toolbar)),
        rect: label.rect,
      }));
      const bad = overlaps.filter((entry) => entry.productOverlapRatio > 0.35);
      assert(bad.length === 0, `层标签与产品投影区域严重重叠：${JSON.stringify(overlaps)}`);

      const shot = await capture(item.shot);
      assert(shot.width === item.viewport.width && shot.height === item.viewport.height, `截图尺寸 ${shot.width}x${shot.height}`);
      let buttonNote = '';
      if (item.captureButton && metrics.buttonStyle && metrics.buttonStyle.rect) {
        const rect = metrics.buttonStyle.rect;
        const clip = {
          x: Math.max(0, Math.round(rect.left)),
          y: Math.max(0, Math.round(rect.top)),
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
        };
        const clipped = await captureClip('02e-btn-explode-contrast.png', clip);
        buttonNote = `；拆解按钮截图 ${clipped.path}，文字色 ${metrics.buttonStyle.color}，背景 ${metrics.buttonStyle.backgroundColor}`;
      }
      labelReport.push({ viewport: item.label, viewportRect: metrics.viewport, labels: metrics.labels, overlaps, shot: shot.path });
      return `标签 3/3 均在 #viewport 内、不遮工具条；产品投影重叠=${overlaps
        .map((entry) => `${entry.layer}:${Math.round(entry.productOverlapRatio * 100)}%`)
        .join('/')}；截图 ${shot.path}${buttonNote}`;
    });
  }
  info('拆解态层标签详细测量（按 viewport）', JSON.stringify(labelReport));
  // Restore desktop viewport + assembled state for the remaining checks.
  await page.setViewportSize(DESKTOP);
  await sleep(600);
  await page.evaluate(() => window.__LUMEN__.setExploded(false));
  await waitAfterSettle('层标签检查后复位');
  await page.evaluate(() => window.scrollTo(0, 0));

  // =======================================================================
  // 8. Network & console cleanliness (whole session)
  // =======================================================================
  await test(
    MODE === 'file'
      ? '网络：单文件无任何外部请求（仅 file:// 与内联资源）'
      : '网络：除本机 dev server 外无任何外部请求',
    async () => {
      const external = allRequests.filter((url) => !isAllowedUrl(url));
      assert(external.length === 0, `发现外部请求：${external.slice(0, 10).join(' | ')}`);
      const domExternal = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('link[href], script[src], img[src], source[src], iframe[src]')) {
          const url = el.getAttribute('href') || el.getAttribute('src') || '';
          if (/^https?:\/\//i.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(url)) {
            out.push(`${el.tagName}:${url}`);
          }
        }
        return out;
      });
      assert(domExternal.length === 0, `DOM 中残留外链资源：${domExternal.join(' | ')}`);
      const localCount = allRequests.filter((url) => /^https?:\/\/(127\.0\.0\.1|localhost)/i.test(url)).length;
      const fileCount = allRequests.filter((url) => /^file:/i.test(url)).length;
      return MODE === 'file'
        ? `共 ${allRequests.length} 个请求（file:// ${fileCount} 个、无 http(s) 外链）；DOM 无外链资源`
        : `共 ${allRequests.length} 个请求，全部本机/内联（http 本机 ${localCount} 个）；无外链 DOM 资源`;
    }
  );

  await test('全程无 console error / pageerror / 失败请求', async () => {
    await sleep(400);
    assert(consoleErrors.length === 0, `console.error：${consoleErrors.join(' | ')}`);
    assert(pageErrors.length === 0, `pageerror：${pageErrors.join(' | ')}`);
    const meaningfulFailures = failedRequests.filter((item) => !/ERR_ABORTED/.test(item.error));
    assert(meaningfulFailures.length === 0, `请求失败：${meaningfulFailures.map((f) => `${f.url} ${f.error}`).join(' | ')}`);
    return `consoleError=0，pageError=0，失败请求=0（console warning ${consoleWarnings.length} 条）`;
  });

  // Initial goto + 4 intentional reloads are expected; anything extra means the
  // page was reloaded underneath the harness (e.g. Vite HMR while files change).
  await test('测试期间页面未被额外重载（HMR 稳定性）', async () => {
    const expected = 5;
    if (mainFrameNavigations.length !== expected) {
      return `注意：主框架导航 ${mainFrameNavigations.length} 次（预期 ${expected} 次）；如多出则可能是测试期间源码被修改触发 Vite HMR 重载，相关用例可能受影响`;
    }
    return `主框架导航 ${mainFrameNavigations.length} 次（初始 1 + 主动 reload 4），无 HMR 重载`;
  });

  preTestHook = null;
}

async function measureLayout(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const rectOf = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        inView:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= -1 &&
          rect.bottom <= window.innerHeight + 1 &&
          rect.left >= -1 &&
          rect.right <= window.innerWidth + 1,
      };
    };
    const heroTitleEl = document.querySelector('.hero h1') || document.querySelector('.hero');
    const heroTitleRect = heroTitleEl ? heroTitleEl.getBoundingClientRect() : null;
    const canvas = document.querySelector('#viewport canvas.scene-canvas');
    const panelEl = document.querySelector('.panel');
    const panelRect = panelEl ? panelEl.getBoundingClientRect() : null;
    const panelBottomEl = document.querySelector('.panel-bottom');
    const panelBottomRect = panelBottomEl ? panelBottomEl.getBoundingClientRect() : null;
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      deScrollWidth: de.scrollWidth,
      deScrollHeight: de.scrollHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      heroTitle: {
        text: heroTitleEl ? heroTitleEl.textContent.trim() : null,
        rect: heroTitleRect
          ? { top: heroTitleRect.top, bottom: heroTitleRect.bottom, width: heroTitleRect.width }
          : null,
        inView: heroTitleRect
          ? heroTitleRect.top >= -1 && heroTitleRect.bottom <= window.innerHeight + 1
          : false,
      },
      viewport: rectOf('#viewport'),
      hero: rectOf('.hero'),
      panel: rectOf('.panel'),
      header: rectOf('.site-header'),
      footer: rectOf('.site-footer'),
      caseOptions: rectOf('#case-options'),
      keycapOptions: rectOf('#keycap-options'),
      explode: rectOf('#btn-explode'),
      experience: rectOf('#toggle-experience'),
      profile: rectOf('#profile-name'),
      restore: rectOf('#btn-restore'),
      canvas: canvas
        ? {
            width: canvas.width,
            height: canvas.height,
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
          }
        : null,
      panel: rectOf('.panel'),
      panelScroll: panelEl
        ? {
            scrollHeight: panelEl.scrollHeight,
            clientHeight: panelEl.clientHeight,
            overflow: panelEl.scrollHeight - panelEl.clientHeight,
          }
        : null,
      panelBottom:
        panelBottomRect && panelRect
          ? {
              top: panelBottomRect.top,
              bottom: panelBottomRect.bottom,
              height: panelBottomRect.height,
              insidePanel:
                panelBottomRect.top >= panelRect.top - 1 && panelBottomRect.bottom <= panelRect.bottom + 1,
              gapToPanelBottom: Math.max(0, panelRect.bottom - panelBottomRect.bottom),
            }
          : null,
    };
  });
}

function printReport(report) {
  const lines = [];
  lines.push('');
  lines.push('================ LUMEN 68 QA REPORT ================');
  lines.push(`mode        : ${report.mode}`);
  lines.push(`url         : ${report.url}`);
  lines.push(`edge        : ${report.edgePath}${report.edgeExists ? '' : ' (MISSING)'} ${report.browserVersion ?? ''}`);
  lines.push(`node        : ${report.node}`);
  lines.push(`data source : ${report.dataSource}`);
  lines.push(`duration    : ${report.durationMs != null ? `${(report.durationMs / 1000).toFixed(1)}s` : 'n/a'}`);
  lines.push('---------------------------------------------------');
  for (const item of report.results) {
    const tag = item.status.padEnd(4, ' ');
    lines.push(`[${tag}] ${item.name}${item.detail ? `\n       ${item.detail}` : ''}`);
  }
  lines.push('---------------------------------------------------');
  if (report.consoleErrors.length) {
    lines.push(`console.error (${report.consoleErrors.length}): ${report.consoleErrors.join(' | ')}`);
  }
  if (report.pageErrors.length) {
    lines.push(`pageerror   (${report.pageErrors.length}): ${report.pageErrors.join(' | ')}`);
  }
  if (report.failedRequests.length) {
    lines.push(`failed req  : ${report.failedRequests.map((item) => `${item.url} ${item.error}`).join(' | ')}`);
  }
  if (report.externalRequests.length) {
    lines.push(`external req: ${report.externalRequests.join(' | ')}`);
  }
  if (report.screenshots.length) {
    lines.push('screenshots:');
    for (const shot of report.screenshots) {
      lines.push(`  - ${shot.path} (${shot.width}x${shot.height}, ${shot.bytes} bytes)`);
    }
  }
  lines.push('---------------------------------------------------');
  lines.push(
    `VERDICT: ${report.verdict}  (pass=${report.summary ? report.summary.pass : 'n/a'}, fail=${
      report.summary ? report.summary.fail : 'n/a'
    }, skip=${report.summary ? report.summary.skip : 'n/a'})`
  );
  lines.push(`report json : ${path.relative(process.cwd(), REPORT_JSON)}`);
  lines.push('===================================================');
  console.log(lines.join('\n'));
}

await main();
