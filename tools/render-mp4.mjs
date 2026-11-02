#!/usr/bin/env node
/*
 * Deterministic MP4 render for a Screenwords player page.
 *
 *   node tools/render-mp4.mjs --html <player.html> --out <out.mp4>
 *        [--fps 30] [--max-frames N] [--quality 90] [--encoder auto|hw|x264]
 *        [--mode auto|fast|screenshot]
 *
 * The story is drawn frame by frame at t = i / fps — not captured from
 * playback — in ONE headless Chrome whose viewport is exactly the project's
 * frame. Chrome and ffmpeg run at a lowered priority, so the machine stays
 * usable while a render runs.
 *
 * fast (the default where Chrome has WebCodecs): the page encodes H.264
 * itself. Each frame's canvas is composited with the DOM overlays (captions,
 * titles, lower thirds) and handed to a VideoEncoder; the overlays are
 * snapshotted — a transparent screenshot — only when the DOM actually
 * changes (a caption word lights up), not every frame. ffmpeg only muxes the
 * stream with the narration.
 *
 * screenshot (the fallback): every frame is a screenshot streamed into
 * ffmpeg, which encodes with the hardware H.264 encoder (h264_videotoolbox)
 * where it has one, else libx264 on two threads.
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
const mode = arg('mode', 'auto');
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

  /* The player's fit() resizes the stage to the window on every resize
     (leaving room for its controls); the render sizes it itself. */
  const dims = JSON.parse(await evaluate(`removeEventListener('resize', fit); JSON.stringify({ w: D.width || 1080, h: D.height || 1920 })`));
  await send('Emulation.setDeviceMetricsOverride', { width: dims.w, height: dims.h, deviceScaleFactor: 1, mobile: false });

  const info = JSON.parse(await evaluate(`(() => {
    /* The player redraws on every animation frame; here frames are drawn
       only when asked, so stop its loop (it would redraw the whole scene
       60 times a second behind the render's back). */
    cancelAnimationFrame(raf);
    window.requestAnimationFrame = () => 0;
    const W = D.width || 1080, H = D.height || 1920;
    const box = document.getElementById('stage-box');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.margin = '0';
    /* no CSS transitions: one would carry the stage from its old size, and
       a caption mid-fade would depend on capture timing */
    const still = document.createElement('style');
    still.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(still);
    for (const [k, v] of [['position', 'fixed'], ['left', '0'], ['top', '0'], ['width', W + 'px'], ['height', H + 'px'],
      ['max-width', 'none'], ['max-height', 'none'], ['transform', 'none'], ['border-radius', '0'], ['box-shadow', 'none'], ['z-index', '2147483647']])
      box.style.setProperty(k, v, 'important');
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
    const r = box.getBoundingClientRect();
    if (Math.round(r.width) !== W || Math.round(r.height) !== H || r.left !== 0 || r.top !== 0 || canvas.width !== W || canvas.height !== H)
      throw new Error('stage is ' + r.width + 'x' + r.height + ' at ' + r.left + ',' + r.top + ', canvas ' + canvas.width + 'x' + canvas.height + ', not the ' + W + 'x' + H + ' frame');
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
function startEncoder(info, audioPath, hw, h264In, frames) {
  const a = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (h264In) a.push('-f', 'h264', '-r', String(fps), '-i', 'pipe:0');
  else a.push('-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0');
  if (audioPath) a.push('-i', audioPath, '-map', '0:v', '-map', '1:a');
  if (h264In) {
    /* raw H.264 carries no timestamps: stamp frame N at N / fps (the
       in-page encoder makes no B-frames, so decode order is display
       order). Without them the muxer dropped the narration. */
    a.push('-c:v', 'copy', '-bsf:v', `setts=ts=N/(${fps}*TB)`);
  } else if (hw) {
    const kbps = Math.round(info.width * info.height * fps * 0.12 / 1000);
    a.push('-c:v', 'h264_videotoolbox', '-b:v', kbps + 'k', '-maxrate', Math.round(kbps * 1.5) + 'k', '-bufsize', kbps * 2 + 'k',
      '-profile:v', 'high');
  } else {
    a.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '2');
  }
  if (!h264In) a.push('-pix_fmt', 'yuv420p');
  /* the video's own length, not -shortest: the narration is cut to it */
  if (audioPath) a.push('-c:a', 'aac', '-b:a', '192k', '-t', (frames / fps).toFixed(4));
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

/* In-page encoder for the fast path. The canvas is hidden and every page
   background made transparent, so a screenshot holds only the DOM
   overlays; the stage's own markup is the key that says when they change. */
const PAGE_FAST = `(() => {
  const W = D.width || 1080, H = D.height || 1920;
  const box = document.getElementById('stage-box'), stageEl = document.getElementById('stage');
  const voidColor = getComputedStyle(box).backgroundColor;
  for (const el of [document.documentElement, document.body, box, stageEl]) el.style.background = 'transparent';
  canvas.style.visibility = 'hidden';
  const out = new OffscreenCanvas(W, H), o = out.getContext('2d');
  let overlay = null, key = null, chunks = [], err = null, fps = 30, encoder = null;
  const ms = { draw: 0, key: 0, compose: 0, wait: 0, overlay: 0 };
  const clock = (k, f) => { const a = performance.now(); const r = f(); ms[k] += performance.now() - a; return r; };
  const compose = i => {
    o.fillStyle = voidColor; o.fillRect(0, 0, W, H);
    o.drawImage(canvas, 0, 0, W, H);
    if (overlay) o.drawImage(overlay, 0, 0, W, H);
    const f = new VideoFrame(out, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(f, { keyFrame: i % (fps * 2) === 0 });
    f.close();
  };
  const settle = async () => { while (encoder.encodeQueueSize > 24) await new Promise(r => setTimeout(r, 1)); };
  const check = () => { if (err) throw new Error('VideoEncoder: ' + err); };
  return {
    async init(rate, kbps) {
      if (typeof VideoEncoder !== 'function' || typeof OffscreenCanvas !== 'function') return null;
      fps = rate;
      const base = { width: W, height: H, bitrate: kbps * 1000, framerate: rate, avc: { format: 'annexb' }, latencyMode: 'quality' };
      for (const codec of ['avc1.640033', 'avc1.4d0033', 'avc1.420033'])
        for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
          const cfg = Object.assign({ codec, hardwareAcceleration }, base);
          const r = await VideoEncoder.isConfigSupported(cfg).catch(() => null);
          if (!r || !r.supported) continue;
          encoder = new VideoEncoder({
            output: ch => { const b = new Uint8Array(ch.byteLength); ch.copyTo(b); chunks.push(b); },
            error: e => { err = String(e && e.message || e); }
          });
          encoder.configure(cfg);
          return codec + ' ' + hardwareAcceleration;
        }
      return null;
    },
    /* frames from..to-1: stops early at a frame whose overlays changed */
    async run(from, to) {
      for (let i = from; i < to; i++) {
        check();
        clock('draw', () => { t = i / fps; safeDraw(); });
        const k = clock('key', () => stageEl.innerHTML);
        if (k !== key) {
          /* nothing on show over the canvas: no snapshot needed */
          const kin = document.getElementById('kinetic');
          if (!stageEl.querySelector('.show') && !(kin && kin.childElementCount && kin.style.display !== 'none')) {
            if (overlay && overlay.close) overlay.close();
            overlay = null; key = k;
          } else return { next: i, need: true };
        }
        clock('compose', () => compose(i));
        const a = performance.now(); await settle(); ms.wait += performance.now() - a;
      }
      return { next: to, need: false };
    },
    async overlay(i, png) {
      const blob = await (await fetch('data:image/png;base64,' + png)).blob();
      if (overlay && overlay.close) overlay.close();
      overlay = await createImageBitmap(blob);
      key = stageEl.innerHTML;
      compose(i);
      await settle();
    },
    take() {
      check();
      if (!chunks.length) return '';
      let n = 0; for (const c of chunks) n += c.length;
      const all = new Uint8Array(n); let p = 0;
      for (const c of chunks) { all.set(c, p); p += c.length; }
      chunks = [];
      let s = '';
      for (let i = 0; i < all.length; i += 0x8000) s += String.fromCharCode.apply(null, all.subarray(i, i + 0x8000));
      return btoa(s);
    },
    stats() { return ms; },
    async finish() { await encoder.flush(); check(); encoder.close(); }
  };
})()`;

async function renderFast(page, info, frames, audioPath, started) {
  const kbps = Math.round(info.width * info.height * fps * 0.12 / 1000);
  const how = await page.evaluate(`window.__fast = ${PAGE_FAST}; __fast.init(${fps}, ${kbps})`);
  if (!how) return false;
  console.log(`rendering ${frames} frames at ${info.width}x${info.height} ${fps}fps (in-page ${how})`);
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const clip = { x: 0, y: 0, width: info.width, height: info.height, scale: 1 };
  const enc = startEncoder(info, audioPath, false, true, frames);
  enc.done.catch(() => {});
  let i = 0, snaps = 0, shown = 0;
  const flush = async () => { const b = await page.evaluate('__fast.take()'); if (b) await enc.write(Buffer.from(b, 'base64')); };
  while (i < frames) {
    const r = await page.evaluate(`__fast.run(${i}, ${Math.min(frames, i + 90)})`);
    if (r.need) {
      const shot = await page.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip });
      await page.evaluate(`__fast.overlay(${r.next}, '${shot.data}')`);
      snaps++;
      i = r.next + 1;
    } else i = r.next;
    await flush();
    if (i - shown >= 300 || i === frames) {
      shown = i;
      const s = (Date.now() - started) / 1000;
      console.log(`frame ${i}/${frames} (${(i / s).toFixed(1)} fps, ${snaps} overlay snapshots)`);
    }
  }
  await page.evaluate('__fast.finish()');
  if (process.env.SW_RENDER_STATS) console.log('page ms:', JSON.stringify(await page.evaluate('__fast.stats()')));
  await flush();
  page.ws.close();
  await enc.end();
  return true;
}

/* The output must hold what was asked for: every frame and, when the page
   has narration, the sound. */
function verify(frames, wantAudio) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG.replace(/ffmpeg$/, 'ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_type,nb_frames', '-of', 'csv=p=0', outPath]);
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('error', () => res());
    p.on('close', () => {
      const rows = out.trim().split('\n').map(l => l.split(','));
      const v = rows.find(r => r[0] === 'video'), a = rows.find(r => r[0] === 'audio');
      if (!v) return rej(new Error('the video has no picture stream'));
      if (v[1] && Number(v[1]) !== frames) return rej(new Error(`the video has ${v[1]} frames, not ${frames}`));
      if (wantAudio && !a) return rej(new Error('the narration is missing from the video'));
      res();
    });
  });
}

try {
  const started = Date.now();
  const page = await openPage();
  const info = page.info;
  /* Round UP: the audio can run a hair past the last whole frame, and a
     rounded-down count left the video shorter than the audio. */
  const frames = maxFrames > 0 ? maxFrames : Math.ceil(info.duration * fps - 1e-9);

  let audioPath = null;
  if (info.audio.startsWith('data:')) {
    const comma = info.audio.indexOf(',');
    audioPath = join(tmp, 'narration.wav');
    writeFileSync(audioPath, Buffer.from(info.audio.slice(comma + 1), 'base64'));
  }

  if (mode !== 'screenshot' && await renderFast(page, info, frames, audioPath, started)) {
    await verify(frames, !!audioPath);
    console.log(`done ${outPath} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    cleanup();
    process.exit(0);
  }
  if (mode === 'fast') throw new Error('this Chrome has no usable H.264 VideoEncoder (try --mode screenshot)');
  const hw = encoderPick === 'x264' ? false : encoderPick === 'hw' ? true : await hasHardwareEncoder();
  console.log(`rendering ${frames} frames at ${info.width}x${info.height} ${fps}fps (screenshots, ${hw ? 'hardware H.264' : 'libx264'})`);

  const enc = startEncoder(info, audioPath, hw, false, frames);
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
  await verify(frames, !!audioPath);
  console.log(`done ${outPath} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  cleanup();
} catch (e) {
  console.error('render failed: ' + (e && e.message ? e.message : e));
  cleanup();
  process.exit(1);
}
