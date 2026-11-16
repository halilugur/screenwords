#!/usr/bin/env node
/*
 * A few frames of a Screenwords player page, as pictures and as measurements.
 *
 *   node tools/preview-frames.mjs --html <player.html> --out-dir <dir>
 *        --times 0.8,3.2,6 [--scale 0.5] [--name preview]
 *
 * Each time is drawn exactly as the MP4 render draws it (same page, same
 * deterministic t), captured with its DOM overlays, and written as
 * <name>-<ms>.png; all of them also go side by side into <name>-sheet.png,
 * each labelled with its time, so one look shows the whole film.
 *
 * Every component on screen at that time is also drawn ALONE on a canvas
 * with a margin around the frame, and the box of the pixels it really
 * painted is reported — measured, not estimated from its params — so a
 * caller can tell what runs off the frame, what covers what, and what
 * painted nothing. The report is one JSON object on stdout:
 *
 *   { width, height, duration, sheet, frames: [{ time, path, components:
 *     [{ id, componentId, box: {x, y, w, h} | null, cover, start, end,
 *        bleed, error? }] }] }
 *
 * box is in 0-1 of the frame (it goes below 0 or above 1 where the component
 * leaves the frame); cover is the share of the frame its box takes.
 *
 * Requires Chrome (CHROME_PATH overrides it).
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStage } from './stage-page.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const htmlPath = arg('html');
const outDir = arg('out-dir');
const name = arg('name', 'preview');
const scale = Math.max(0.1, Math.min(1, Number(arg('scale', '0.5'))));
const times = String(arg('times', '')).split(',').map(Number).filter(n => Number.isFinite(n) && n >= 0);
if (!htmlPath || !outDir || !times.length) {
  console.error('usage: preview-frames.mjs --html FILE --out-dir DIR --times 0.8,3.2 [--scale 0.5] [--name preview]');
  process.exit(2);
}
const PORT = Number(process.env.CDP_PORT || 9361);

const tmp = mkdtempSync(join(tmpdir(), 'sw-preview-'));
const children = [];
const cleanup = () => {
  for (const c of children) { try { c.kill('SIGKILL'); } catch {} }
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
};
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

/* In the page: the painted box of each component active at time `at`. */
const PAGE_MEASURE = `(() => {
  const DOM = { titleCard: 'title', numberCounter: 'counter', lowerThird: 'lower', kineticWords: 'kinetic', captions: 'kinetic', subtitleBar: 'subbar' };
  const S = 4;                       /* measured at a quarter of the drawing space */
  return at => {
    const W = 1080, H = 1080 * (D.height || 1920) / (D.width || 1080);
    const M = Math.round(W * 0.3);   /* margin, so what leaves the frame is still seen */
    const cw = Math.ceil((W + 2 * M) / S), ch = Math.ceil((H + 2 * M) / S);
    const off = new OffscreenCanvas(cw, ch), o = off.getContext('2d', { willReadFrequently: true });
    const stage = document.getElementById('stage-box').getBoundingClientRect();
    const out = [];
    for (const c of (D.components || [])) {
      if (!(at >= c.start && at <= c.end)) continue;
      const row = { id: c.id || '', componentId: c.componentId, box: null, cover: 0, start: c.start, end: c.end, bleed: !!(c.params && c.params.bleed) };
      const domId = DOM[c.componentId];
      const scene = String(c.componentId).startsWith('htmlOverlay_') ? document.querySelector('[data-html-overlay="' + c.id + '"]') : null;
      if (scene) {
        /* an HTML scene: the boxes of what it shows, leaf by leaf */
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        for (const el of scene.shadowRoot.querySelectorAll('*')) {
          if (el.tagName === 'STYLE' || el.firstElementChild) continue;
          const look = getComputedStyle(el);
          if (look.visibility === 'hidden' || look.display === 'none' || Number(look.opacity) < 0.05) continue;
          const q = el.getBoundingClientRect();
          if (!q.width || !q.height) continue;
          l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
        }
        if (r > l && b > t) row.box = { x: (l - stage.left) / stage.width, y: (t - stage.top) / stage.height, w: (r - l) / stage.width, h: (b - t) / stage.height };
      } else if (domId) {
        const el = document.getElementById(domId);
        const shown = el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden'
          && (el.classList.contains('show') || domId === 'kinetic') && (el.textContent || '').trim();
        if (shown) {
          /* the text itself, not the full-width strip that holds it */
          let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
          const range = document.createRange();
          range.selectNodeContents(el);
          for (const q of range.getClientRects()) {
            if (!q.width || !q.height) continue;
            l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
          }
          if (r > l && b > t) row.box = { x: (l - stage.left) / stage.width, y: (t - stage.top) / stage.height, w: (r - l) / stage.width, h: (b - t) / stage.height };
        }
      } else {
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.globalAlpha = 1; o.globalCompositeOperation = 'source-over'; o.filter = 'none';
        o.clearRect(0, 0, cw, ch);
        o.save();
        o.scale(1 / S, 1 / S);
        o.translate(M, M);
        try { drawSharedComponents(o, W, H, at, [c], { canvas: off, docName: D.name, words: D.words || [], cast: D.cast || {} }); } catch (e) { row.error = String(e && e.message || e); }
        o.restore();
        const px = o.getImageData(0, 0, cw, ch).data;
        let l = cw, t = ch, r = -1, b = -1;
        for (let y = 0; y < ch; y++) for (let x = 0, i = y * cw * 4 + 3; x < cw; x++, i += 4) {
          if (px[i] > 48) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
        }
        if (r >= l && b >= t) row.box = { x: (l * S - M) / W, y: (t * S - M) / H, w: (r - l + 1) * S / W, h: (b - t + 1) * S / H };
      }
      if (row.box) {
        for (const k of ['x', 'y', 'w', 'h']) row.box[k] = Math.round(row.box[k] * 1000) / 1000;
        const ix = Math.max(0, Math.min(1, row.box.x + row.box.w) - Math.max(0, row.box.x));
        const iy = Math.max(0, Math.min(1, row.box.y + row.box.h) - Math.max(0, row.box.y));
        row.cover = Math.round(ix * iy * 1000) / 1000;
      }
      out.push(row);
    }
    return out;
  };
})()`;

/* In the page: the captured frames side by side, each under its time. */
const PAGE_SHEET = `(async shots => {
  const imgs = await Promise.all(shots.map(async s => createImageBitmap(await (await fetch('data:image/png;base64,' + s.png)).blob())));
  const gap = 12, label = 34, w = imgs[0].width, h = imgs[0].height;
  const perRow = Math.min(imgs.length, w > h ? 3 : 6), rows = Math.ceil(imgs.length / perRow);
  const c = document.createElement('canvas');
  c.width = perRow * w + (perRow + 1) * gap; c.height = rows * (h + label + gap) + gap;
  const x = c.getContext('2d');
  x.fillStyle = '#111418'; x.fillRect(0, 0, c.width, c.height);
  x.font = '600 22px -apple-system, Helvetica, Arial, sans-serif'; x.textBaseline = 'middle';
  imgs.forEach((img, i) => {
    const px = gap + (i % perRow) * (w + gap), py = gap + Math.floor(i / perRow) * (h + label + gap);
    x.fillStyle = '#E6EDF3'; x.fillText(shots[i].label, px + 2, py + label / 2);
    x.drawImage(img, px, py + label);
  });
  return c.toDataURL('image/png').split(',')[1];
})`;

try {
  mkdirSync(outDir, { recursive: true });
  const page = await openStage({ htmlPath, port: PORT, profileDir: join(tmp, 'profile'), onChild: c => children.push(c) });
  const info = page.info;
  await page.evaluate(`window.__measure = ${PAGE_MEASURE}; true`);
  const clip = { x: 0, y: 0, width: info.width, height: info.height, scale };
  const frames = [], shots = [];
  for (const raw of times) {
    const at = Math.min(raw, Math.max(0, info.duration - 0.001));
    await page.evaluate(`t = ${at.toFixed(5)}; safeDraw(); true`);
    /* images a component asked for load after its first draw */
    await page.evaluate(`(async () => {
      const pending = Object.values(typeof imgCache === 'object' ? imgCache : {}).filter(i => !i.complete);
      if (pending.length) { await Promise.race([Promise.all(pending.map(i => new Promise(r => { i.onload = i.onerror = r; }))), new Promise(r => setTimeout(r, 4000))]); safeDraw(); }
      return true;
    })()`);
    const components = JSON.parse(await page.evaluate(`JSON.stringify(__measure(${at.toFixed(5)}))`));
    const shot = await page.send('Page.captureScreenshot', { format: 'png', clip });
    const file = join(outDir, `${name}-${String(Math.round(at * 1000)).padStart(6, '0')}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    frames.push({ time: Math.round(at * 1000) / 1000, path: file, components });
    shots.push({ png: shot.data, label: at.toFixed(2) + ' s' });
  }
  const sheetData = await page.evaluate(`(${PAGE_SHEET})(${JSON.stringify(shots)})`);
  const sheet = join(outDir, `${name}-sheet.png`);
  writeFileSync(sheet, Buffer.from(sheetData, 'base64'));
  page.ws.close();
  console.log(JSON.stringify({ width: info.width, height: info.height, duration: info.duration, sheet, frames }));
  cleanup();
  process.exit(0);
} catch (e) {
  console.error('preview failed: ' + (e && e.message ? e.message : e));
  cleanup();
  process.exit(1);
}
