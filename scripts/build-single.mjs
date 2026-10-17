/**
 * Build the production bundle and inline every asset into a single, fully
 * offline HTML file: `LUMEN-68.html` at the project root.
 *
 * No CDN, no external fonts, no separate CSS/JS files — the deliverable can be
 * opened directly from disk (file://) or hosted anywhere as one file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

console.log('[LUMEN] running Vite production build…');
execFileSync(process.execPath, [viteBin, 'build'], { cwd: root, stdio: 'inherit' });

const htmlPath = join(dist, 'index.html');
if (!existsSync(htmlPath)) {
  throw new Error(`[LUMEN] build output not found: ${htmlPath}`);
}
let html = readFileSync(htmlPath, 'utf8');

const resolveAsset = (reference) => {
  const clean = reference.replace(/^\.\//, '').replace(/^\//, '');
  const file = join(dist, clean);
  return existsSync(file) ? file : null;
};

/** Inline stylesheets. */
html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
  const match = tag.match(/href="([^"]+)"/);
  if (!match) return tag;
  const file = resolveAsset(match[1]);
  if (!file) return tag;
  return `<style>\n${readFileSync(file, 'utf8').trim()}\n</style>`;
});

/** Inline the entry module (the bundle is a single file by config). */
html = html.replace(/<script\b[^>]*type="module"[^>]*><\/script>/g, (tag) => {
  const match = tag.match(/src="([^"]+)"/);
  if (!match) return tag;
  const file = resolveAsset(match[1]);
  if (!file) return tag;
  const js = readFileSync(file, 'utf8')
    .replace(/<\/script/gi, '<\\/script')
    .trim();
  return `<script type="module">\n${js}\n</script>`;
});

/** Module preload tags are pointless once everything is inline. */
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>/g, '');

const outPath = join(root, 'LUMEN-68.html');
writeFileSync(outPath, html, 'utf8');

const leftover = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((url) => !/^(data:|#|mailto:|javascript:)/i.test(url));

const bytes = statSync(outPath).size;
console.log(`[LUMEN] wrote ${outPath} (${(bytes / 1024).toFixed(1)} KB)`);
if (leftover.length) {
  console.warn('[LUMEN] remaining external asset references:', leftover);
} else {
  console.log('[LUMEN] self-contained: no external asset references.');
}
