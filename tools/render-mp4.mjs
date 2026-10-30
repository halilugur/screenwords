#!/usr/bin/env node
/*
 * Deterministic MP4 render for a Screenwords player page.
 *
 *   node tools/render-mp4.mjs --html <player.html> --out <out.mp4>
 *        [--fps 30] [--max-frames N] [--crf 18]
 *
 * The story is drawn frame by frame at t = i / fps — not captured from
 * playback — by driving headless Chrome over CDP, then muxed with the
 * narration that is embedded in the page. Requires Chrome and ffmpeg on PATH
 * (set CHROME_PATH to point at a different binary).
 *
 * The page is laid out at the project's own resolution, so a 1080x1920 project
 * yields a 1080x1920 video with no scaling.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const crf = Number(arg('crf', '18'));
/* Frames are independent: render them from several Chrome instances at once.
   The capture round trip, not encoding, is the bottleneck. */
const workers = Math.max(1, Math.min(8, Number(arg('workers', '4'))));
if (!htmlPath || !outPath) {
  console.error('usage: render-mp4.mjs --html FILE --out FILE [--fps 30] [--max-frames N] [--crf 18]');
  process.exit(2);
}

const CHROME = process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT || 9360);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tmp = mkdtempSync(join(tmpdir(), 'sw-mp4-'));
const framesDir = join(tmp, 'frames');
mkdirSync(framesDir, { recursive: true });

const browsers = [];
const cleanup = () => {
  for (const b of browsers) { try { b.kill('SIGKILL'); } catch {} }
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
};

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

function run(cmd, argv) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stdout.on('data', d => process.stdout.write(d));
    p.stderr.on('data', d => { err += d; });
    p.on('error', rej);
    p.on('close', code => code === 0 ? res() : rej(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`)));
  });
}

/* One page per worker: its own Chrome, its own profile, its own port. */
async function openPage(workerPort) {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${workerPort}`, '--window-size=1600,2400',
    '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--no-first-run',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--user-data-dir=${join(tmp, 'profile-' + workerPort)}`, 'about:blank'
  ], { stdio: 'ignore' });
  browsers.push(chrome);

  const target = (await cdpTargets(workerPort)).find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise(res => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 2400, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pathToFileURL(resolve(htmlPath)).href });
  await sleep(1200);

  const info = JSON.parse(await evaluate(`(() => {
    const box = document.getElementById('stage-box');
    const W = D.width || 1080, H = D.height || 1920;
    box.style.width = W + 'px';
    box.style.height = H + 'px';
    /* exactly the ratio fit() uses, WITHOUT its 2.2 clamp: at project
       resolution the clamp would shrink every DOM overlay by ~30% */
    box.style.setProperty('--sx', (W / 340).toFixed(4));
    box.style.setProperty('--sy', (H / 604).toFixed(4));
    /* the player's own chrome must not end up in the video */
    ['play-overlay', 'hint', 'bar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    resizeCanvas();
    safeDraw();
    const r = box.getBoundingClientRect();
    return JSON.stringify({
      name: D.name || 'story', width: W, height: H, duration: D.duration || 0,
      audio: (D.audioData || ''), rect: { x: r.x, y: r.y, width: r.width, height: r.height }
    });
  })()`));

  /* Webfonts arrive over the network: without this the first frames render
     in the fallback face (different widths, captions wrap differently). */
  await evaluate(`(async () => {
    t = 12; safeDraw();                 /* touch the caption face so it loads */
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return document.fonts ? document.fonts.size : 0;
  })()`);
  await sleep(150);
  return { ws, send, evaluate, info };
}

try {
  const first = await openPage(PORT);
  const info = first.info;
  /* Round UP: the audio can run a hair past the last whole frame
     (23.36 s * 30 fps = 700.8) and a rounded-down count left the video
     stream shorter than the audio — players showed a black tail there. */
  const frames = maxFrames > 0 ? maxFrames : Math.ceil(info.duration * fps - 1e-9);
  const clip = { x: info.rect.x, y: info.rect.y, width: info.width, height: info.height, scale: 1 };
  console.log(`rendering ${frames} frames at ${info.width}x${info.height} ${fps}fps with ${workers} workers`);

  let audioPath = null;
  if (info.audio.startsWith('data:')) {
    const comma = info.audio.indexOf(',');
    audioPath = join(tmp, 'narration.wav');
    writeFileSync(audioPath, Buffer.from(info.audio.slice(comma + 1), 'base64'));
  }

  let doneCount = 0;
  const chunk = Math.ceil(frames / workers);
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const from = w * chunk;
    const to = Math.min(frames, from + chunk);
    if (from >= to) break;
    jobs.push((async () => {
      const page = w === 0 ? first : await openPage(PORT + w);
      for (let i = from; i < to; i++) {
        await page.evaluate(`t = ${(i / fps).toFixed(5)}; safeDraw();`);
        const shot = await page.send('Page.captureScreenshot', {
          format: 'jpeg', quality: 82, optimizeForSpeed: true, clip
        });
        if (shot.result && shot.result.data) {
          writeFileSync(join(framesDir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(shot.result.data, 'base64'));
        }
        doneCount++;
        if (doneCount % 120 === 0) console.log(`frame ${doneCount}/${frames}`);
      }
      if (w > 0) page.ws.close();
    })());
  }
  await Promise.all(jobs);
  first.ws.close();
  console.log('encoding…');

  const ffArgs = ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(framesDir, 'f%05d.jpg')];
  if (audioPath) ffArgs.push('-i', audioPath);
  ffArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p');
  if (audioPath) ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  ffArgs.push('-movflags', '+faststart', outPath);
  await run('ffmpeg', ffArgs);

  console.log('done ' + outPath);
  cleanup();
} catch (e) {
  console.error('render failed: ' + (e && e.message ? e.message : e));
  cleanup();
  process.exit(1);
}
