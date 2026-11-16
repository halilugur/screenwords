#!/usr/bin/env node
/*
 * A picture of a web page, for a video that shows the real thing.
 *
 *   node tools/capture-page.mjs --url <http(s) or file URL> --out <file.png>
 *        [--width 1280] [--height 800] [--scale 2] [--wait 1200] [--full]
 *
 * One headless Chrome loads the page at width x height CSS pixels, waits for
 * load plus --wait ms for late content, and writes a PNG at --scale device
 * pixels per CSS pixel (2 = crisp when the video zooms in). --full captures
 * the whole page height instead of the first screen. Prints one JSON line:
 * { path, width, height, title }.
 *
 * Requires Chrome (CHROME_PATH overrides it).
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openChrome, sleep } from './stage-page.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = arg('url');
const outPath = arg('out');
const width = Math.max(320, Math.min(3840, Number(arg('width', '1280')) || 1280));
const height = Math.max(240, Math.min(3840, Number(arg('height', '800')) || 800));
const scale = Math.max(1, Math.min(3, Number(arg('scale', '2')) || 2));
const wait = Math.max(0, Math.min(15000, Number(arg('wait', '1200')) || 0));
const full = args.includes('--full');
if (!url || !outPath || !/^(https?|file):\/\//.test(url)) {
  console.error('usage: capture-page.mjs --url http(s)://... --out FILE.png [--width 1280] [--height 800] [--scale 2] [--wait 1200] [--full]');
  process.exit(2);
}
const PORT = Number(process.env.CDP_PORT || 9362);

const tmp = mkdtempSync(join(tmpdir(), 'sw-capture-'));
const children = [];
const cleanup = () => {
  for (const c of children) { try { c.kill('SIGKILL'); } catch {} }
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
};
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

try {
  const page = await openChrome({ port: PORT, profileDir: join(tmp, 'profile'), onChild: c => children.push(c) });
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await page.navigate(url, 30000);
  await sleep(wait);
  const title = await page.evaluate('document.title || ""');
  let h = height;
  if (full) {
    /* at most 4 screens: a longer page is a strip nobody can read in a frame */
    h = Math.min(height * 4, Math.max(height, Number(await page.evaluate('Math.ceil(document.documentElement.scrollHeight)')) || height));
    await page.send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: scale, mobile: false });
    await sleep(200);
  }
  const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height: h, scale: 1 } });
  const png = Buffer.from(shot.data, 'base64');
  if (png.length < 200) throw new Error('the page gave an empty picture');
  writeFileSync(outPath, png);
  page.ws.close();
  console.log(JSON.stringify({ path: outPath, width: Math.round(width * scale), height: Math.round(h * scale), title }));
  cleanup();
  process.exit(0);
} catch (e) {
  console.error('capture failed: ' + (e && e.message ? e.message : e));
  cleanup();
  process.exit(1);
}
