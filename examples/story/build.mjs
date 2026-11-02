/*
 * Builds examples/story: a short two-scene story — a narrator, two friends,
 * a handshake in the park and a gift in a café at night.
 *
 *   cargo build --release && node examples/story/build.mjs
 *
 * Project data only: the cast (examples/cast), the lines as turns, one voice
 * per speaker, and one `story` component listing the scenes.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 47894;
const BASE = `http://127.0.0.1:${PORT}`;
const PROJECT_DIR = resolve('examples/story');
mkdirSync(PROJECT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}
async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

const VOICES = { narrator: 'M3', ada: 'F1', kaan: 'M1' };
const TURNS = [
  ['narrator', 'Bir sabah, parkta iki eski dost yıllar sonra karşılaştı.'],
  ['ada', 'Kaan? Gerçekten sen misin? Seni burada görmek ne güzel!'],
  ['kaan', 'Ada! Merhaba! Ne kadar zaman oldu böyle?', 0.2],
  ['narrator', 'O akşam, köşedeki küçük kafede yeniden buluştular.'],
  ['ada', 'Bak, sana bir şey getirdim. Eski fotoğraflarımız bu telefonda.'],
  ['kaan', 'İnanamıyorum! Hepsini saklamışsın.', -0.2],
  ['ada', 'Tabii ki. Bazı dostluklar hiç eskimez.']
];

async function main() {
  const srv = spawn('./target/release/screenwords', ['app', PROJECT_DIR, '--create', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', d => process.stderr.write(d));
  for (let i = 0; i < 50; i++) { try { await get('/api/summary'); break; } catch { await sleep(150); } }
  try {
    await post('/api/frame', { width: 1920, height: 1080, fps: 30 });
    for (const tr of (await get('/api/timeline')).tracks || []) {
      for (const it of tr.items || []) if (it.kind === 'component') await post('/api/edit', { tool: 'remove_component', arguments: { id: it.id } });
    }
    const cast = { ada: JSON.parse(readFileSync(resolve('examples/cast/ada.json'), 'utf8')), kaan: JSON.parse(readFileSync(resolve('examples/cast/kaan.json'), 'utf8')) };
    await post('/api/edit', { tool: 'set_project_settings', arguments: { name: 'Eski Dostlar', cast } });
    await post('/api/edit', { tool: 'author_transcript', arguments: { turns: TURNS.map(([speaker, text, gap]) => (gap == null ? { speaker, text } : { speaker, text, gap })), language: 'tr', replace: true } });
    const synth = await post('/api/synthesize', { lang: 'tr', voice: 'M3', voices: VOICES, bed: 'ambient' });
    console.log('speech:', synth.durationSeconds.toFixed(2) + 's');
    const words = (await get('/api/words')).words || [];
    const total = Math.ceil(Math.max(...words.map(w => w.end)) + 1.5);
    await post('/api/edit', {
      label: 'story',
      edits: [
        {
          tool: 'add_component',
          arguments: {
            componentId: 'story', start: 0, end: total, zIndex: 5,
            params: {
              scenes: [
                { set: 'park', title: 'Bir sabah', cast: [{ cast: 'ada', x: 0.3, enter: 'left' }, { cast: 'kaan', x: 0.72, enter: 'right' }], actions: [{ line: 2, type: 'handshake', a: 'ada', b: 'kaan' }] },
                { startLine: 3, set: 'cafe', night: true, title: 'O akşam', cast: [{ cast: 'ada', x: 0.3 }, { cast: 'kaan', x: 0.68, seated: true }], actions: [{ line: 4, type: 'give', a: 'ada', b: 'kaan', prop: 'phone' }, { line: 6, type: 'hug', a: 'ada', b: 'kaan' }] }
              ]
            }
          }
        },
        { tool: 'add_component', arguments: { componentId: 'kineticWords', start: 0, end: total, zIndex: 20, position: { x: 0.5, y: 0.9 }, params: { fontFamily: "'Space Grotesk', sans-serif", speakerColors: { ada: '#60A5FA', kaan: '#34D399', narrator: '#F8FAFC' } } } }
      ]
    });
    const exp = await post('/api/export', {});
    console.log('HTML:', exp.path);
    const mp4 = await post('/api/render-mp4', {});
    console.log('MP4:', mp4.path, `(${(mp4.bytes / 1048576).toFixed(2)} MB)`);
  } finally {
    srv.kill('SIGTERM');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
