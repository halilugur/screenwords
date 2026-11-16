/*
 * One headless Chrome page holding a Screenwords player, sized to the
 * project's frame and drawn only when asked. Shared by render-mp4.mjs (every
 * frame, encoded) and preview-frames.mjs (a few frames, measured); the plain
 * Chrome underneath also serves capture-page.mjs.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

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

/* One headless Chrome with its first page attached over CDP: `send` a
   protocol method, `evaluate` an expression, `navigate` and wait for load. */
export async function openChrome({ port, profileDir, onChild }) {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, '--window-size=800,600',
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-sync',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    /* a screenshot is the finished frame: animations stay on the main thread
       and every compositor stage has run before it is taken, so the same
       frame is the same pixels on every run */
    '--disable-threaded-animation', '--run-all-compositor-stages-before-draw', '--disable-checker-imaging',
    `--user-data-dir=${profileDir}`, 'about:blank'
  ], { stdio: 'ignore' });
  if (onChild) onChild(chrome);

  const target = (await cdpTargets(port)).find(t => t.type === 'page');
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
  const navigate = async (url, timeoutMs = 15000) => {
    const loaded = new Promise(res => {
      ws.addEventListener('message', function on(ev) {
        const m = JSON.parse(ev.data);
        if (m.method === 'Page.loadEventFired') { ws.removeEventListener('message', on); res(true); }
      });
    });
    const r = await send('Page.navigate', { url });
    if (r && r.errorText) throw new Error('cannot open ' + url + ': ' + r.errorText);
    return Promise.race([loaded, sleep(timeoutMs).then(() => false)]);
  };
  return { ws, send, evaluate, navigate };
}

/* A page sized to the frame, with the player's own chrome hidden and the
   stage pinned to the top-left corner. */
export async function openStage({ htmlPath, port, profileDir, onChild }) {
  const { ws, send, evaluate, navigate } = await openChrome({ port, profileDir, onChild });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate(pathToFileURL(resolve(htmlPath)).href);

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
    /* the player's own overlay scale, for the frame's size */
    const scale = swOverlayScale(W, H, 340, 604);
    box.style.setProperty('--sx', scale.sx.toFixed(4));
    box.style.setProperty('--sy', scale.sy.toFixed(4));
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
  /* Pictures load after the first draw that asks for them; a frame drawn
     before that would show an empty box. Ask for every image a component's
     params name and wait for them (a broken one is not waited on for long). */
  await evaluate(`(async () => {
    const found = new Set();
    const walk = v => {
      if (typeof v === 'string') { if (/^data:image\\//.test(v) || (v.length < 2000 && /\\.(png|jpe?g|webp|gif|svg)([?#].*)?$/i.test(v))) found.add(v); }
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    (D.components || []).forEach(c => walk(c.params));
    if (typeof getImage !== 'function' || typeof imgCache !== 'object') return 0;
    found.forEach(src => getImage(src));
    const pending = Object.values(imgCache).filter(i => !i.complete);
    await Promise.race([Promise.all(pending.map(i => new Promise(r => { i.addEventListener('load', r); i.addEventListener('error', r); }))), new Promise(r => setTimeout(r, 8000))]);
    safeDraw();
    return found.size;
  })()`);
  return { ws, send, evaluate, info };
}

