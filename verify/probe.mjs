/**
 * LUMEN 68 — quick real-page probe (QA diagnostic, not part of the suite).
 * Measures load/ready time, render FPS, getRenderTheme, console errors and
 * screenshot cost so the full verification run can be sized properly.
 */
import { chromium } from 'playwright-core';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.env.LUMEN_URL ?? 'http://127.0.0.1:5173/';
const GL_MODE = process.env.LUMEN_GL ?? 'swiftshader';
const GL_ARGS = {
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  auto: [],
  d3d11: ['--use-angle=d3d11'],
  gpu: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
}[GL_MODE] ?? [];

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: [...GL_ARGS, '--hide-scrollbars', '--no-first-run'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => pageErrors.push(e.message));

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
const tDom = Date.now() - t0;
await page.waitForFunction(() => window.__LUMEN_READY__ === true, null, { timeout: 60000 });
const tReady = Date.now() - t0;
await sleep(1000);

const state = await page.evaluate(() => window.__LUMEN__.getState());
const rendererInfo = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return { renderer: 'none' };
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
  };
});
const scene = await page.evaluate(() => window.__LUMEN__.getSceneInfo());
const renderTheme = await page.evaluate(() =>
  typeof window.__LUMEN__.getRenderTheme === 'function' ? window.__LUMEN__.getRenderTheme() : null
);
const dom = await page.evaluate(() => ({
  title: document.title,
  missing: [
    'viewport', 'layer-labels', 'btn-explode', 'btn-explode-label', 'btn-reset-view',
    'toggle-autorotate', 'toggle-experience', 'experience-status', 'experience-hint',
    'key-echo', 'case-options', 'keycap-options', 'profile-name', 'summary-name',
    'summary-case', 'summary-keycap', 'summary-case-meta', 'summary-keycap-meta',
    'save-status', 'btn-restore', 'toast',
  ].filter((id) => !document.getElementById(id)),
  cases: [...document.querySelectorAll('#case-options [data-case]')].map((el) => el.dataset.case),
  keycaps: [...document.querySelectorAll('#keycap-options [data-keycap]')].map((el) => el.dataset.keycap),
  layerLabels: document.querySelectorAll('#layer-labels .layer-label').length,
  chipsText: document.body.innerText.includes('CNC ALUMINUM'),
}));

// FPS sample over ~1.2s
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      const tick = (now) => {
        frames += 1;
        if (now - start >= 1200) resolve(Math.round((frames * 1000) / (now - start)));
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })
);

const tShot = Date.now();
await page.screenshot({ path: 'verify/shots/probe-initial.png' });
const shotMs = Date.now() - tShot;

const tSwitch = Date.now();
await page.click('#case-options [data-case="copper"]');
await page.click('#keycap-options [data-keycap="harvest"]');
await sleep(400);
const themeAfter = await page.evaluate(() =>
  typeof window.__LUMEN__.getRenderTheme === 'function' ? window.__LUMEN__.getRenderTheme() : null
);
const switchMs = Date.now() - tSwitch;

const tSettle = Date.now();
const settled = await page.evaluate(() => window.__LUMEN__.whenSettled(4000));
const settleMs = Date.now() - tSettle;

console.log(
  JSON.stringify(
    {
      url: URL,
      glMode: GL_MODE,
      browser: browser.version(),
      rendererInfo,
      tDomMs: tDom,
      tReadyMs: tReady,
      fps,
      screenshotMs: shotMs,
      themeSwitchMs: switchMs,
      whenSettledMs: settleMs,
      settled,
      state: {
        caseId: state.caseId,
        keycapId: state.keycapId,
        profileName: state.profileName,
        experience: state.experience,
        exploded: state.exploded,
        explodeProgress: state.explodeProgress,
        layers: state.layers,
        keys: state.keys,
        camera: state.camera,
      },
      scene,
      renderTheme,
      themeAfter,
      dom,
      consoleErrors,
      pageErrors,
    },
    null,
    2
  )
);

await browser.close();
