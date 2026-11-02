#!/usr/bin/env node
/*
 * Deterministic MP4 render for a Screenwords player page.
 *
 *   node tools/render-mp4.mjs --html <player.html> --out <out.mp4>
 *        [--fps 30] [--max-frames N] [--quality 90] [--encoder auto|hw|x264]
 *
 * The story is drawn frame by frame at t = i / fps — not captured from
 * playback — in ONE headless Chrome whose viewport is exactly the project's
 * frame, and each frame is streamed straight into ffmpeg (no frame files on
 * disk). ffmpeg encodes with the Mac's hardware H.264 encoder
 * (h264_videotoolbox) when it has one, else libx264 on two threads; Chrome
 * and ffmpeg run at a lowered priority. The machine stays usable while a
 * render runs: one browser, a bounded pipe, no CPU-bound software encode.
 *
 * DOM overlays (captions, titles) are rendered with reduced motion, so a CSS
 * transition never leaves a frame half-faded depending on how fast the
 * capture happened to be: the same page gives the same frames.
 *
 * Requires Chrome and ffmpeg (CHROME_PATH / FFMPEG_PATH override them).
 * --workers is accepted for older callers and ignored.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, setPriority } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const htmlPath = arg('html');
const outPath = arg('out');
const fps = Number(arg('fps', '30'));
const maxFrames = Number(arg('max-frames', '0'));
const quality = Math.max(50, Math.min(100, Number(arg('quality', '90'))));
const encoderPick = arg('encoder', 'auto');
if (!htmlPath || !outPath || !(fps > 0)) {
  console.error('usage: render-mp4.mjs --html FILE --out FILE [--fps 30] [--max-frames N] [--quality 90] [--encoder auto|hw|x264]');
  process.exit(2);
}

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const PORT = Number(process.env.CDP_PORT || 9360);
const NICE = 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lower = pid => { try { setPriority(pid, NICE); } catch {} };

const tmp = mkdtempSync(join(tmpdir(), 'sw-mp4-'));
const children = [];
const cleanup = () => {
  for (const c of children) { try { c.kill('SIGKILL'); } catch {} }
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
};
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

async function cdpTargets(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome did not expose a debugging endpoint on ' + port);
}

/* Which encoder: the hardware one when ffmpeg has it (and it works here). */
function hasHardwareEncoder() {
  return new Promise(res => {
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.1',
      '-c:v', 'h264_videotoolbox', '-f', 'null', '-'], { stdio: 'ignore' });
    p.on('error', () => res(false));
    p.on('close', code => res(code === 0));
  });
}

/* A page sized to the frame, with the player's own chrome hidden and the
   stage pinned to the top-left corner. */
async function openPage() {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=800,600',
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-sync',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--user-data-dir=${join(tmp, 'profile')}`, 'about:blank'
  ], { stdio: 'ignore' });
  children.push(chrome);
  lower(chrome.pid);

  const target = (await cdpTargets(PORT)).find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, m => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const loaded = new Promise(res => {
    ws.addEventListener('message', function on(ev) {
      const m = JSON.parse(ev.data);
      if (m.method === 'Page.loadEventFired') { ws.removeEventListener('message', on); res(); }
    });
  });
  await send('Page.navigate', { url: pathToFileURL(resolve(htmlPath)).href });
  await Promise.race([loaded, sleep(15000)]);

  const dims = JSON.parse(await evaluate(`JSON.stringify({ w: D.width || 1080, h: D.height || 1920 })`));
  await send('Emulation.setDeviceMetricsOverride', { width: dims.w, height: dims.h, deviceScaleFactor: 1, mobile: false });

  const info = JSON.parse(await evaluate(`(() => {
    const W = D.width || 1080, H = D.height || 1920;
    const box = document.getElementById('stage-box');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';
    Object.assign(box.style, { position: 'fixed', left: '0', top: '0', width: W + 'px', height: H + 'px',
      borderRadius: '0', boxShadow: 'none', zIndex: '2147483647' });
    /* exactly the ratio fit() uses, WITHOUT its clamp, so the DOM overlays
       scale with the short side of the frame */
    box.style.setProperty('--sx', Math.min(W / 340, H / 604).toFixed(4));
    box.style.setProperty('--sy', (H / 604).toFixed(4));
    ['play-overlay', 'hint', 'bar', 'hdr'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    resizeCanvas();
    safeDraw();
    return JSON.stringify({ width: W, height: H, duration: D.duration || 0, audio: D.audioData || '' });
  })()`));

  /* Webfonts must be in before the first frame, or early captions are set
     in the fallback face. */
  await evaluate(`(async () => {
    t = 12; safeDraw();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return true;
  })()`);
  return { ws, send, evaluate, info };
}

/* ffmpeg reads JPEG frames from stdin; the writer waits on the pipe so a
   slow encoder never piles frames up in memory. */
function startEncoder(info, audioPath, hw) {
  const a = ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0'];
  if (audioPath) a.push('-i', audioPath);
  if (hw) {
    const kbps = Math.round(info.width * info.height * fps * 0.12 / 1000);
    a.push('-c:v', 'h264_videotoolbox', '-b:v', kbps + 'k', '-maxrate', Math.round(kbps * 1.5) + 'k', '-bufsize', kbps * 2 + 'k',
      '-profile:v', 'high');
  } else {
    a.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '2');
  }
  a.push('-pix_fmt', 'yuv420p');
  if (audioPath) a.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  a.push('-movflags', '+faststart', outPath);
  const ff = spawn(FFMPEG, a, { stdio: ['pipe', 'ignore', 'pipe'] });
  children.push(ff);
  lower(ff.pid);
  let err = '';
  ff.stderr.on('data', d => { err += d; });
  const done = new Promise((res, rej) => {
    ff.on('error', rej);
    ff.on('close', code => (code === 0 ? res() : rej(new Error('ffmpeg exited ' + code + ': ' + err.slice(-600)))));
  });
  const write = buf => new Promise((res, rej) => {
    if (ff.stdin.destroyed) return rej(new Error('ffmpeg closed its input: ' + err.slice(-600)));
    if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res);
  });
  return { write, end: () => { ff.stdin.end(); return done; }, done };
}

try {
  const started = Date.now();
  const hw = encoderPick === 'x264' ? false : encoderPick === 'hw' ? true : await hasHardwareEncoder();
  const page = await openPage();
  const info = page.info;
  /* Round UP: the audio can run a hair past the last whole frame, and a
     rounded-down count left the video shorter than the audio. */
  const frames = maxFrames > 0 ? maxFrames : Math.ceil(info.duration * fps - 1e-9);
  console.log(`rendering ${frames} frames at ${info.width}x${info.height} ${fps}fps (${hw ? 'hardware H.264' : 'libx264'})`);

  let audioPath = null;
  if (info.audio.startsWith('data:')) {
    const comma = info.audio.indexOf(',');
    audioPath = join(tmp, 'narration.wav');
    writeFileSync(audioPath, Buffer.from(info.audio.slice(comma + 1), 'base64'));
  }

  const enc = startEncoder(info, audioPath, hw);
  enc.done.catch(() => {});
  const clip = { x: 0, y: 0, width: info.width, height: info.height, scale: 1 };
  for (let i = 0; i < frames; i++) {
    await page.evaluate(`t = ${(i / fps).toFixed(5)}; safeDraw();`);
    const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality, optimizeForSpeed: true, clip });
    await enc.write(Buffer.from(shot.data, 'base64'));
    if ((i + 1) % 150 === 0 || i + 1 === frames) {
      const s = (Date.now() - started) / 1000;
      console.log(`frame ${i + 1}/${frames} (${((i + 1) / s).toFixed(1)} fps)`);
    }
  }
  page.ws.close();
  await enc.end();
  console.log(`done ${outPath} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  cleanup();
} catch (e) {
  console.error('render failed: ' + (e && e.message ? e.message : e));
  cleanup();
  process.exit(1);
}
