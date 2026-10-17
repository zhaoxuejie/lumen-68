/**
 * LUMEN 68 — diagnostic: does the experience-mode "demo wave" interfere with
 * typing / focus protection? (QA evidence script)
 *
 * Findings are printed as JSON. Run: node verify/diag-demo.mjs
 */
import { chromium } from 'playwright-core';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.env.LUMEN_URL ?? 'http://127.0.0.1:5173/';
const CODES = ['KeyL', 'KeyU', 'KeyM', 'KeyE', 'KeyN', 'Space', 'KeyA', 'KeyH', 'KeyK', 'KeyB', 'KeyR', 'KeyD', 'KeyO'];

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--hide-scrollbars', '--no-first-run'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__LUMEN_READY__ === true, null, { timeout: 90000 });
await sleep(500);

// Recorder: log every key whose press goes above 0.01 with timestamps.
async function startRecorder() {
  await page.evaluate((codes) => {
    window.__DIAG__ = { samples: [], startedAt: performance.now() };
    window.__DIAG_TIMER__ = setInterval(() => {
      const now = Math.round(performance.now() - window.__DIAG__.startedAt);
      for (const code of codes) {
        const key = window.__LUMEN__.getKey(code);
        if (key && key.press > 0.01) window.__DIAG__.samples.push({ t: now, code, press: Number(key.press.toFixed(3)) });
      }
    }, 10);
  }, CODES);
}
async function stopRecorder() {
  return page.evaluate(() => {
    clearInterval(window.__DIAG_TIMER__);
    // collapse to per-key first/last/max
    const map = {};
    for (const sample of window.__DIAG__.samples) {
      if (!map[sample.code]) map[sample.code] = { first: sample.t, last: sample.t, max: sample.press, count: 1 };
      else {
        map[sample.code].last = sample.t;
        map[sample.code].max = Math.max(map[sample.code].max, sample.press);
        map[sample.code].count += 1;
      }
    }
    return map;
  });
}

const out = {};

// 1) Enable experience mode and immediately record what the page presses by itself.
await startRecorder();
await page.click('#toggle-experience');
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await sleep(1800);
out.demoWave = await stopRecorder();
out.demoEcho = await page.evaluate(() => window.__LUMEN__.getEcho());

// 2) Wait until everything is quiet, then focus the name input and type.
await sleep(600);
await page.evaluate(() => document.querySelector('#toggle-experience').checked); // no-op
await page.click('#profile-name');
await sleep(200);
const baseline = await page.evaluate((codes) =>
  Object.fromEntries(codes.map((code) => [code, window.__LUMEN__.getKey(code)?.press ?? null])), CODES);
out.baselinePressBeforeTyping = baseline;
await startRecorder();
await page.keyboard.type('hello keyboard', { delay: 40 });
await sleep(150);
out.typingPresses = await stopRecorder();
out.inputValue = await page.inputValue('#profile-name');
out.storeName = await page.evaluate(() => window.__LUMEN__.getState().profileName);
out.scrollY = await page.evaluate(() => window.scrollY);

// 3) Focus the input DURING the demo wave (re-enable experience while focused).
await page.evaluate(() => window.__LUMEN__.setExperience(false));
await sleep(300);
await page.evaluate(() => document.querySelector('#profile-name').focus());
await startRecorder();
await page.evaluate(() => window.__LUMEN__.setExperience(true));
await sleep(1600);
out.demoWhileInputFocused = await stopRecorder();
out.activeElementWhileFocused = await page.evaluate(() => document.activeElement?.id ?? null);

out.consoleErrors = [];
await browser.close();
console.log(JSON.stringify(out, null, 2));
