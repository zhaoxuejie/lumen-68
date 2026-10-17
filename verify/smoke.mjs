/**
 * LUMEN 68 — Playwright / Edge / WebGL environment self-check (QA owned).
 *
 * Verifies, in this exact order:
 *   1. playwright-core can launch the locally installed Microsoft Edge.
 *   2. A headless page can render a WebGL2 (or WebGL1) context.
 *   3. A local temporary HTML file can be loaded through file:// and rendered.
 *   4. Screenshots can be written to disk.
 *
 * Run:  node verify/smoke.mjs
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TMP = path.join(HERE, 'tmp');
const SHOTS = path.join(HERE, 'shots');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const LAUNCH_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--disable-dev-shm-usage',
  '--no-first-run',
];

const result = {
  edgeExists: existsSync(EDGE),
  launched: false,
  browserVersion: null,
  webgl: { webgl2: false, webgl1: false, renderer: null, error: null },
  localFile: { loaded: false, title: null },
  screenshot: { written: false, bytes: 0, path: null },
  errors: [],
};

await mkdir(TMP, { recursive: true });
await mkdir(SHOTS, { recursive: true });

let browser;
try {
  browser = await chromium.launch({
    executablePath: EDGE,
    headless: true,
    args: LAUNCH_ARGS,
    timeout: 30000,
  });
  result.launched = true;
  result.browserVersion = browser.version();
} catch (error) {
  result.errors.push(`launch failed: ${error.message}`);
}

if (browser) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') result.errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (error) => result.errors.push(`pageerror: ${error.message}`));

  try {
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:#111">
         <canvas id="c" width="320" height="200"></canvas>
       </body></html>`,
      { waitUntil: 'load' }
    );

    result.webgl = await page.evaluate(() => {
      const canvas = document.getElementById('c');
      const info = { webgl2: false, webgl1: false, renderer: null, error: null };
      try {
        const gl2 = canvas.getContext('webgl2');
        if (gl2) {
          info.webgl2 = true;
          const ext = gl2.getExtension('WEBGL_debug_renderer_info');
          info.renderer = ext ? gl2.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl2.getParameter(gl2.RENDERER);
          return info;
        }
        const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl1) {
          info.webgl1 = true;
          const ext = gl1.getExtension('WEBGL_debug_renderer_info');
          info.renderer = ext ? gl1.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl1.getParameter(gl1.RENDERER);
          return info;
        }
        info.error = 'no webgl context';
      } catch (error) {
        info.error = String(error && error.message ? error.message : error);
      }
      return info;
    });

    // Load a local file through file:// to prove local file navigation works.
    const smokeFile = path.join(TMP, 'smoke-local.html');
    await writeFile(
      smokeFile,
      '<!doctype html><html><head><title>local-ok</title></head><body><h1 id="h">local file ok</h1></body></html>',
      'utf8'
    );
    const fileUrl = new URL(`file:///${smokeFile.replace(/\\/g, '/')}`).href;
    await page.goto(fileUrl, { waitUntil: 'load' });
    const loaded = await page.evaluate(() => ({
      title: document.title,
      h: document.getElementById('h')?.textContent ?? null,
    }));
    result.localFile = { loaded: loaded.title === 'local-ok', title: loaded.title };

    const shot = path.join(SHOTS, 'smoke-webgl.png');
    await page.screenshot({ path: shot });
    const { stat } = await import('node:fs/promises');
    result.screenshot = { written: true, bytes: (await stat(shot)).size, path: shot };
  } catch (error) {
    result.errors.push(`page check failed: ${error.message}`);
  }

  await browser.close();
}

const ok =
  result.launched &&
  (result.webgl.webgl2 || result.webgl.webgl1) &&
  result.localFile.loaded &&
  result.screenshot.written &&
  result.errors.length === 0;

result.ok = ok;
result.workspaceRoot = ROOT;
console.log(JSON.stringify(result, null, 2));
process.exitCode = ok ? 0 : 1;
