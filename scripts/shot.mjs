/**
 * Lead-side visual check harness: loads the running dev server in headless
 * Edge, reports console errors and takes a screenshot. Not part of the shipped
 * product — QA owns the full verification suite in verify/run.mjs.
 *
 * Usage:
 *   node scripts/shot.mjs [url] [outfile] [width] [height]
 *   node scripts/shot.mjs --explode --case=copper --keycap=graphite
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const url =
  args.find((a) => a.startsWith('http') || a.startsWith('file:')) ??
  'http://127.0.0.1:5173/';
const shot = resolve(flags.out ?? 'verify/shots/lead-check.png');
const width = Number(flags.width ?? 1440);
const height = Number(flags.height ?? 900);

mkdirSync(dirname(shot), { recursive: true });

const launchArgs = flags.gpu
  ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--hide-scrollbars', '--mute-audio']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio'];
const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: launchArgs,
});

const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const messages = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') messages.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => messages.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => messages.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`));

const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
try {
  await page.waitForFunction(() => window.__LUMEN_READY__ === true, null, { timeout: 30000 });
  await page.waitForTimeout(700);
  if (flags.case || flags.keycap) {
    await page.evaluate(
      ({ caseId, keycapId }) => {
        if (caseId) window.__LUMEN__.setCase(caseId);
        if (keycapId) window.__LUMEN__.setKeycap(keycapId);
      },
      { caseId: flags.case, keycapId: flags.keycap },
    );
  }
  if (flags.explode) {
    await page.evaluate(() => window.__LUMEN__.setExploded(true));
  }
  if (flags.experience) {
    await page.evaluate(() => window.__LUMEN__.setExperience(true));
  }
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames += 1;
          if (performance.now() - start >= 1000) resolve(frames);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const settleStarted = Date.now();
  const settled = await page.evaluate(() => window.__LUMEN__.whenSettled(20000));
  const settleMs = Date.now() - settleStarted;
  const themeSettled = await page.evaluate(() => window.__LUMEN__.waitForTheme().catch(() => false));
  messages.push(`[harness] fps≈${fps}, settled=${settled} in ${settleMs}ms, themeSettled=${themeSettled}`);
} catch (error) {
  messages.push(`[harness] ${error.message}`);
}

const info = await page.evaluate(() => {
  const api = window.__LUMEN__;
  const state = api?.getState?.() ?? null;
  return {
    ready: Boolean(window.__LUMEN_READY__),
    appError: document.body.dataset.appError ?? null,
    state,
    scene: api?.getSceneInfo?.() ?? null,
    renderTheme: api?.getRenderTheme?.() ?? null,
    title: document.title,
    size: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    },
    viewportRect: (() => {
      const el = document.getElementById('viewport');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    })(),
    canvas: (() => {
      const el = document.querySelector('canvas.scene-canvas');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })(),
  };
});

await page.screenshot({ path: shot, fullPage: false });
await browser.close();

console.log(JSON.stringify({ url, status: response?.status(), shot, info, messages }, null, 2));
