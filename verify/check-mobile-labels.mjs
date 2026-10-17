/**
 * LUMEN 68 — focused check: mobile exploded layer labels on the latest layout.
 * Captures the real screenshot and prints label/product geometry.
 * Run: node verify/check-mobile-labels.mjs
 */
import { chromium } from 'playwright-core';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.env.LUMEN_URL ?? 'http://127.0.0.1:5173/';
const CODES = [
  'Escape', 'Digit1', 'Digit3', 'Digit6', 'Digit9', 'KeyQ', 'KeyE', 'KeyT', 'KeyU', 'KeyO', 'KeyP',
  'KeyA', 'KeyF', 'KeyJ', 'KeyL', 'KeyZ', 'KeyV', 'KeyN', 'KeyM', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Enter',
];

const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--hide-scrollbars', '--no-first-run'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__LUMEN_READY__ === true, null, { timeout: 90000 });
await sleep(500);
await page.evaluate(() => window.scrollTo(0, 0));

await page.click('#btn-explode');
const settled = await page.evaluate(() => window.__LUMEN__.whenSettled(8000));
await sleep(400);
await page.evaluate(() => document.querySelector('#viewport').scrollIntoView({ block: 'center', inline: 'nearest' }));
await sleep(400);

const metrics = await page.evaluate((codes) => {
  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const viewport = rectOf(document.querySelector('#viewport'));
  const labels = [...document.querySelectorAll('#layer-labels .layer-label')].map((el) => ({
    layer: el.dataset.layer,
    text: el.textContent.trim(),
    opacity: Number(getComputedStyle(el).opacity),
    rect: rectOf(el),
  }));
  const screens = codes
    .map((code) => window.__LUMEN__.getKey(code))
    .filter(Boolean)
    .filter((key) => key.inView)
    .map((key) => ({ code: key.code, x: key.screen.x, y: key.screen.y }));
  const keysBBox = screens.length
    ? screens.reduce(
        (box, point) => ({
          left: Math.min(box.left, point.x - 10),
          right: Math.max(box.right, point.x + 10),
          top: Math.min(box.top, point.y - 10),
          bottom: Math.max(box.bottom, point.y + 10),
        }),
        { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
      )
    : null;
  const overlap = (a, b) => {
    if (!a || !b) return 0;
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return w * h;
  };
  return {
    viewport,
    labels,
    keysBBox,
    screenSamples: screens,
    overlaps: labels.map((label) => ({
      layer: label.layer,
      productOverlapRatio: Math.round((overlap(label.rect, keysBBox) / Math.max(1, label.rect.width * label.rect.height)) * 100) / 100,
    })),
    scrollY: window.scrollY,
    innerHeight: window.innerHeight,
  };
}, CODES);

await page.screenshot({ path: 'verify/shots/02d-exploded-labels-390x844.png' });
console.log(JSON.stringify({ errors, settled, ...metrics }, null, 2));
await browser.close();
